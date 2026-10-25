<?php
// Aiguillage de l'API, connexion et état général. Les autres routes sont dans routes_*.php.
declare(strict_types=1);

const APP_VERSION = '3.0.0';
const GROUP_COLORS = ['#C4122F', '#666A6F', '#2E8C76', '#D08A1E', '#3F7CC0', '#7A5AB5'];
const PRIORITES = [1 => 'urgente', 2 => 'haute', 3 => 'normale', 4 => 'basse'];

require_once __DIR__ . '/routes_taches.php';
require_once __DIR__ . '/routes_groupes.php';
require_once __DIR__ . '/routes_admin.php';

/* ---------- Aiguillage ----------
 * $auth    : 'none' (ouvert), 'user' (connecté), 'admin' (administrateur)
 * $opt     : 'notify' => prévient les autres postes ; 'nokey' => interdit aux clés d'accès (Claude, ChatGPT) ; 'free' => permis même si le mot de passe doit être changé
 * Un handler reçoit ['me' => …, 'p' => paramètres d'adresse, 'q' => ?paramètres, 'b' => corps JSON]. */
function table_routes(): array {
    static $R = null;
    if ($R !== null) return $R;
    $R = [];
    $add = function (string $m, string $pattern, string $auth, callable $fn, array $opt = []) use (&$R) {
        $R[] = [$m, '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#', $auth, $fn, $opt];
    };

    /* ----- Connexion ----- */
    $add('GET', '/api/comptes', 'none', 'r_comptes');
    $add('POST', '/api/login', 'none', 'r_login');
    $add('POST', '/api/logout', 'none', 'r_logout', ['free']);
    $add('GET', '/api/rev', 'user', fn($c) => ['rev' => (int)(getSetting('rev') ?? 0)]);
    $add('GET', '/api/state', 'user', 'r_state', ['free']);

    routes_taches($add);
    routes_groupes($add);
    routes_admin($add);
    return $R;
}

// Exécute une route. Renvoie les données (ou ['__raw' => …] pour un fichier). Lève HttpError.
function dispatch(string $method, string $path, array $query, array $body, ?array $me): mixed {
    foreach (table_routes() as [$m, $re, $auth, $fn, $opt]) {
        if ($m !== $method || !preg_match($re, $path, $mm)) continue;
        if ($auth !== 'none' && !$me) fail(401, 'Session expirée, reconnectez-vous.', 'auth');
        if ($me) {
            actor($me);
            if (!empty($me['mustChange']) && !in_array('free', $opt, true)) fail(403, 'Vous devez d\'abord choisir un nouveau mot de passe.', 'must_change');
            $key = !empty($me['viaToken']);
            if ($key && ($auth === 'admin' || in_array('nokey', $opt, true))) fail(403, 'Cette action n\'est pas permise avec une clé d\'accès.');
            if ($key && $method !== 'GET' && ($me['scope'] ?? '') === 'lecture') fail(403, 'Cette clé d\'accès est en lecture seule.');
        }
        if ($auth === 'admin' && $me['role'] !== 'admin') fail(403, "Réservé à l'administrateur.");
        $params = array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY);
        $out = $fn(['me' => $me, 'p' => array_map('urldecode', $params), 'q' => $query, 'b' => $body]);
        if (in_array('notify', $opt, true)) bump();
        return $out ?? ['ok' => true];
    }
    foreach (table_routes() as [$m, $re]) if (preg_match($re, $path)) fail(405, 'Méthode non autorisée.');
    fail(404, 'Adresse inconnue.');
}

/* =====================  CONNEXION  ===================== */
// La liste des comptes n'est montrée sur l'écran de connexion que si l'administrateur l'a choisi (désactivé par défaut).
function r_comptes(array $c): array {
    $liste = getSetting('login_liste_comptes') === '1';
    return [
        'listing' => $liste,
        'users' => $liste ? rows("SELECT id, name, role FROM users WHERE active = 1 AND auth_source = 'local' ORDER BY role = 'admin' DESC, name") : [],
        'demo' => false,
    ];
}

function r_login(array $c): array {
    login_must_https();
    $b = $c['b'];
    $pwd = $b['password'] ?? null;
    if (!is_string($pwd) || $pwd === '' || strlen($pwd) > 1000) fail(400, 'Indiquez votre mot de passe.');
    $name = is_string($b['name'] ?? null) ? $b['name'] : '';
    $id = is_string($b['userId'] ?? null) ? $b['userId'] : null;
    if ($name === '' && !$id) fail(400, 'Indiquez votre nom.');
    login_local($name, $pwd, $id);
    return ['ok' => true];
}

function r_logout(array $c): array {
    $t = $_COOKIE[cookie_name()] ?? '';
    if (is_string($t) && $t !== '') q('DELETE FROM sessions WHERE token = ?', [hashToken($t)]);
    set_session_cookie('', 0);
    if ($c['me']) audit('deconnexion', 'user', $c['me']['id']);
    return ['ok' => true];
}

/* =====================  ÉTAT  ===================== */
function steps_of(array $taskIds): array {
    $out = [];
    if (!$taskIds) return $out;
    foreach (rows('SELECT * FROM steps WHERE task_id IN (' . in($taskIds) . ') ORDER BY position, seq', $taskIds) as $s) {
        $out[$s['task_id']][] = ['id' => $s['id'], 'label' => $s['label'], 'desc' => $s['description'], 'done' => (bool)$s['done'], 'doneBy' => $s['done_by'], 'doneAt' => $s['done_at']];
    }
    return $out;
}

// Rôles de l'utilisateur dans chaque groupe : [groupe => rôle].
function my_roles(array $me): array {
    return array_column(rows('SELECT group_id, role FROM group_members WHERE user_id = ?', [$me['id']]), 'role', 'group_id');
}

function r_state(array $c): array {
    $me = $c['me']; $admin = $me['role'] === 'admin';
    if (!empty($me['mustChange'])) return ['me' => $me['id'], 'mustChange' => true, 'name' => $me['name']];
    $seuil = seuilArchive();
    $users = array_map(fn($u) => ['id' => $u['id'], 'name' => $u['name'], 'role' => $u['role'], 'active' => (bool)$u['active']]
        + ($admin ? ['email' => $u['email'], 'source' => $u['auth_source']] : []),
        rows("SELECT id, name, role, active, email, auth_source FROM users ORDER BY role = 'admin' DESC, created_at, name"));
    $membersByGroup = []; $rolesByGroup = [];
    foreach (rows('SELECT group_id, user_id, role FROM group_members') as $r) { $membersByGroup[$r['group_id']][] = $r['user_id']; $rolesByGroup[$r['group_id']][$r['user_id']] = $r['role']; }
    $mine = my_roles($me);

    $tasks = $admin
        ? rows('SELECT t.* FROM tasks t JOIN groupes g ON g.id = t.group_id WHERE t.deleted_at IS NULL AND g.deleted_at IS NULL AND (t.done_at IS NULL OR t.done_at > ?) ORDER BY t.end_date, t.created_at', [$seuil])
        : rows('SELECT t.* FROM tasks t JOIN groupes g ON g.id = t.group_id WHERE t.deleted_at IS NULL AND g.deleted_at IS NULL AND (t.done_at IS NULL OR t.done_at > ?)
                AND (t.owner_id = ? OR t.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)) ORDER BY t.end_date, t.created_at', [$seuil, $me['id'], $me['id']]);

    $taskGroupIds = array_flip(array_column($tasks, 'group_id'));
    $groups = [];
    foreach (rows('SELECT * FROM groupes WHERE deleted_at IS NULL ORDER BY position, created_at, name') as $g) {
        $mem = $membersByGroup[$g['id']] ?? [];
        if ($admin || isset($mine[$g['id']]) || isset($taskGroupIds[$g['id']])) {
            $role = $admin ? 'admin' : ($mine[$g['id']] ?? null);
            $groups[] = ['id' => $g['id'], 'name' => $g['name'], 'icon' => $g['icon'], 'color' => $g['color'], 'members' => $mem, 'roles' => (object)($rolesByGroup[$g['id']] ?? []),
                'myRole' => $role, 'canEdit' => in_array($role, ['admin', 'responsable'], true), 'canCreate' => in_array($role, ['admin', 'responsable', 'membre'], true)];
        }
    }
    $ids = array_column($tasks, 'id');
    $steps = steps_of($ids);
    $commentCounts = [];
    if ($ids) foreach (rows('SELECT task_id, COUNT(*) AS n FROM comments WHERE task_id IN (' . in($ids) . ') GROUP BY task_id', $ids) as $r) $commentCounts[$r['task_id']] = (int)$r['n'];

    $usage = [];
    foreach (rows('SELECT type, COUNT(*) AS n FROM tasks GROUP BY type') as $r) $usage[$r['type']] = (int)$r['n'];
    $categories = array_map(fn($k) => ['id' => $k['id'], 'label' => $k['label'], 'emoji' => $k['emoji'], 'hidden' => (bool)$k['hidden'], 'count' => $usage[$k['id']] ?? 0],
        rows('SELECT id, label, emoji, hidden FROM categories ORDER BY position, label'));
    $taskCounts = [];
    if ($admin) foreach (rows('SELECT owner_id, COUNT(*) AS n FROM tasks WHERE owner_id IS NOT NULL AND deleted_at IS NULL GROUP BY owner_id') as $r) $taskCounts[$r['owner_id']] = (int)$r['n'];

    return [
        'me' => $me['id'], 'myRole' => $me['role'], 'version' => APP_VERSION, 'users' => $users, 'groups' => $groups, 'categories' => $categories,
        'taskCounts' => (object)$taskCounts,
        'archiveJours' => ARCHIVE_JOURS,
        'connecteur' => ['actif' => getSetting('connecteur_internet') === '1'],
        'corbeille' => trash_count($me),
        'tasks' => array_map(function ($t) use ($me, $admin, $mine, $commentCounts, $steps) {
            $role = $admin ? 'admin' : ($mine[$t['group_id']] ?? null);
            $manager = in_array($role, ['admin', 'responsable'], true);
            return [
                'id' => $t['id'], 'groupId' => $t['group_id'], 'ownerId' => $t['owner_id'], 'type' => $t['type'], 'title' => $t['title'],
                'desc' => $t['description'], 'start' => $t['start_date'], 'end' => $t['end_date'], 'completed' => (bool)$t['completed'],
                'doneAt' => $t['done_at'], 'doneBy' => $t['done_by'], 'createdBy' => $t['created_by'], 'priority' => (int)$t['priority'],
                'comments' => $commentCounts[$t['id']] ?? 0, 'createdAt' => $t['created_at'], 'updatedAt' => $t['updated_at'],
                'steps' => $steps[$t['id']] ?? [],
                'can' => ['edit' => task_can('edit', $me, $t), 'delete' => task_can('delete', $me, $t), 'step' => task_can('step', $me, $t), 'history' => $manager],
            ];
        }, $tasks),
    ];
}
