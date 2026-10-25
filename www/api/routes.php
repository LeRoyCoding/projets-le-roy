<?php
// Toutes les routes de l'API (même fonctionnement que l'ancienne version Node.js).
declare(strict_types=1);

const APP_VERSION = '2.0.0';
const GROUP_COLORS = ['#C4122F', '#666A6F', '#2E8C76', '#D08A1E', '#3F7CC0', '#7A5AB5'];
const PRIORITES = [1 => 'urgente', 2 => 'haute', 3 => 'normale', 4 => 'basse'];

/* ---------- Aiguillage ----------
 * $auth : 'none' (ouvert), 'user' (connecté), 'admin' (administrateur)
 * Un handler reçoit un tableau ['me' => …, 'p' => paramètres d'adresse, 'q' => ?paramètres, 'b' => corps JSON]. */
function table_routes(): array {
    $R = [];
    $add = function (string $m, string $pattern, string $auth, callable $fn, bool $notify = false) use (&$R) {
        $R[] = [$m, '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#', $auth, $fn, $notify];
    };

    /* ----- Connexion ----- */
    $add('GET', '/api/comptes', 'none', fn($c) => [
        'users' => rows("SELECT id, name, role FROM users WHERE active = 1 ORDER BY role = 'admin' DESC, name"),
        'defaultAdminPassword' => getSetting('default_admin_password') === '1',
        'demo' => false,
    ]);
    $add('POST', '/api/login', 'none', 'r_login');
    $add('POST', '/api/logout', 'none', 'r_logout');
    $add('GET', '/api/rev', 'user', fn($c) => ['rev' => (int)(getSetting('rev') ?? 0)]);

    /* ----- État complet ----- */
    $add('GET', '/api/state', 'user', 'r_state');

    /* ----- Tâches ----- */
    $add('POST', '/api/tasks', 'user', 'r_task_create', true);
    $add('PUT', '/api/tasks/{id}', 'user', 'r_task_update', true);
    $add('DELETE', '/api/tasks/{id}', 'user', 'r_task_delete', true);
    $add('PATCH', '/api/tasks/{id}/terminee', 'user', 'r_task_done', true);
    $add('GET', '/api/tasks/{id}/details', 'user', 'r_task_details');
    $add('GET', '/api/historique', 'admin', 'r_historique');
    $add('POST', '/api/tasks/{id}/steps', 'user', 'r_step_add', true);
    $add('PATCH', '/api/steps/{id}', 'user', 'r_step_patch', true);
    $add('DELETE', '/api/steps/{id}', 'user', 'r_step_delete', true);
    $add('POST', '/api/tasks/{id}/comments', 'user', 'r_comment_add', true);
    $add('DELETE', '/api/comments/{id}', 'user', 'r_comment_delete', true);

    /* ----- Groupes ----- */
    $add('POST', '/api/groups', 'user', 'r_group_create', true);
    $add('POST', '/api/groups/ordre', 'admin', 'r_group_order', true);
    $add('PUT', '/api/groups/{id}', 'user', 'r_group_update', true);
    $add('DELETE', '/api/groups/{id}', 'user', 'r_group_delete', true);

    /* ----- Catégories ----- */
    $add('POST', '/api/categories', 'user', 'r_cat_create', true);
    $add('POST', '/api/categories/ordre', 'user', 'r_cat_order', true);
    $add('PUT', '/api/categories/{id}', 'user', 'r_cat_update', true);
    $add('DELETE', '/api/categories/{id}', 'user', 'r_cat_delete', true);

    /* ----- Comptes ----- */
    $add('POST', '/api/password', 'user', 'r_password');
    $add('POST', '/api/users', 'admin', 'r_user_create', true);
    $add('PUT', '/api/users/{id}', 'admin', 'r_user_update', true);
    $add('GET', '/api/tokens', 'user', 'r_tokens');
    $add('POST', '/api/tokens', 'user', 'r_token_create');
    $add('DELETE', '/api/tokens/{id}', 'user', 'r_token_delete');
    $add('POST', '/api/connecteur', 'admin', function ($c) {
        setSetting('connecteur_internet', !empty($c['b']['actif']) ? '1' : '0');
        return ['actif' => getSetting('connecteur_internet') === '1'];
    });
    $add('GET', '/api/sauvegarde', 'admin', 'r_backup');
    return $R;
}

// Exécute une route. Renvoie les données (ou ['__raw' => …] pour un fichier). Lève HttpError.
function dispatch(string $method, string $path, array $query, array $body, ?array $me): mixed {
    foreach (table_routes() as [$m, $re, $auth, $fn, $notify]) {
        if ($m !== $method || !preg_match($re, $path, $mm)) continue;
        if ($auth !== 'none' && !$me) fail(401, 'Session expirée, reconnectez-vous.');
        if ($auth === 'admin' && $me['role'] !== 'admin') fail(403, "Réservé à l'administrateur.");
        $params = array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY);
        $out = $fn(['me' => $me, 'p' => array_map('urldecode', $params), 'q' => $query, 'b' => $body]);
        if ($notify) bump();
        return $out ?? ['ok' => true];
    }
    foreach (table_routes() as [$m, $re]) if (preg_match($re, $path)) fail(405, 'Méthode non autorisée.');
    fail(404, 'Adresse inconnue.');
}

/* =====================  CONNEXION  ===================== */
function limiteEssais(string $key, int $max, int $secondes): bool {
    $f = row('SELECT n, last_at FROM login_failures WHERE k = ?', [$key]);
    return $f && (int)$f['n'] >= $max && strtotime($f['last_at'] . ' UTC') > time() - $secondes;
}
function noterEchec(string $key, int $secondes): void {
    $f = row('SELECT n, last_at FROM login_failures WHERE k = ?', [$key]);
    $n = ($f && strtotime($f['last_at'] . ' UTC') > time() - $secondes) ? (int)$f['n'] + 1 : 1;
    q('INSERT INTO login_failures (k, n, last_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE n = VALUES(n), last_at = VALUES(last_at)', [$key, $n, now()]);
}

function r_login(array $c): array {
    $b = $c['b'];
    $u = row('SELECT id, password_hash FROM users WHERE id = ? AND active = 1', [(string)($b['userId'] ?? '')]);
    $ip = 'ip:' . clientIp();
    if (limiteEssais($ip, 30, 600)) fail(429, 'Trop d\'essais depuis cet appareil. Patientez quelques minutes.');
    if (!$u) { noterEchec($ip, 600); fail(401, 'Compte inconnu ou désactivé.'); }
    $k = 'u:' . $u['id'];
    if (limiteEssais($k, 5, 60)) fail(429, "Trop d'essais. Patientez une minute.");
    $pwd = $b['password'] ?? null;
    if (!is_string($pwd) || !password_verify($pwd, $u['password_hash'])) {
        noterEchec($k, 60); noterEchec($ip, 600);
        fail(401, 'Mot de passe incorrect.');
    }
    q('DELETE FROM login_failures WHERE k = ?', [$k]);
    $token = newToken();
    q('INSERT INTO sessions (token, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)', [hashToken($token), $u['id'], now(), now()]);
    q('DELETE FROM sessions WHERE last_seen < ?', [gmdate('Y-m-d H:i:s', time() - SESSION_DAYS * 86400)]);
    q('DELETE FROM login_failures WHERE last_at < ?', [gmdate('Y-m-d H:i:s', time() - 86400)]);
    setCookieValue($token, SESSION_DAYS * 86400);
    return ['ok' => true];
}
function r_logout(array $c): array {
    $t = $_COOKIE[COOKIE] ?? '';
    if (is_string($t) && $t !== '') q('DELETE FROM sessions WHERE token = ?', [hashToken($t)]);
    setCookieValue('', 0);
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

function r_state(array $c): array {
    $me = $c['me']; $admin = $me['role'] === 'admin';
    $seuil = seuilArchive();
    $users = array_map(fn($u) => ['id' => $u['id'], 'name' => $u['name'], 'role' => $u['role'], 'active' => (bool)$u['active']],
        rows("SELECT id, name, role, active FROM users ORDER BY role = 'admin' DESC, created_at, name"));
    $membersByGroup = [];
    foreach (rows('SELECT group_id, user_id FROM group_members') as $r) $membersByGroup[$r['group_id']][] = $r['user_id'];

    $tasks = $admin
        ? rows('SELECT * FROM tasks WHERE (done_at IS NULL OR done_at > ?) ORDER BY end_date, created_at', [$seuil])
        : rows('SELECT * FROM tasks WHERE (done_at IS NULL OR done_at > ?) AND (owner_id = ? OR group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)) ORDER BY end_date, created_at', [$seuil, $me['id'], $me['id']]);

    $taskGroupIds = array_flip(array_column($tasks, 'group_id'));
    $groups = [];
    foreach (rows('SELECT * FROM groupes ORDER BY position, created_at, name') as $g) {
        $mem = $membersByGroup[$g['id']] ?? [];
        if ($admin || in_array($me['id'], $mem, true) || isset($taskGroupIds[$g['id']])) {
            $groups[] = ['id' => $g['id'], 'name' => $g['name'], 'icon' => $g['icon'], 'color' => $g['color'], 'members' => $mem];
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
    if ($admin) foreach (rows('SELECT owner_id, COUNT(*) AS n FROM tasks WHERE owner_id IS NOT NULL GROUP BY owner_id') as $r) $taskCounts[$r['owner_id']] = (int)$r['n'];

    return [
        'me' => $me['id'], 'version' => APP_VERSION, 'users' => $users, 'groups' => $groups, 'categories' => $categories,
        'taskCounts' => (object)$taskCounts,
        'defaultAdminPassword' => $admin && getSetting('default_admin_password') === '1',
        'archiveJours' => ARCHIVE_JOURS,
        'connecteur' => ['actif' => getSetting('connecteur_internet') === '1'],
        'tasks' => array_map(fn($t) => [
            'id' => $t['id'], 'groupId' => $t['group_id'], 'ownerId' => $t['owner_id'], 'type' => $t['type'], 'title' => $t['title'],
            'desc' => $t['description'], 'start' => $t['start_date'], 'end' => $t['end_date'], 'completed' => (bool)$t['completed'],
            'doneAt' => $t['done_at'], 'doneBy' => $t['done_by'], 'createdBy' => $t['created_by'], 'priority' => (int)$t['priority'],
            'comments' => $commentCounts[$t['id']] ?? 0, 'createdAt' => $t['created_at'], 'updatedAt' => $t['updated_at'],
            'steps' => $steps[$t['id']] ?? [],
        ], $tasks),
    ];
}

/* =====================  TÂCHES  ===================== */
function logAct(string $taskId, ?string $userId, string $action, string $detail = ''): void {
    q('INSERT INTO activity (task_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)', [$taskId, $userId, $action, mb_substr($detail, 0, 300), now()]);
}

function readCategory(mixed $value, ?array $existing): string {
    $id = (string)($value ?? '');
    $k = row('SELECT id, hidden FROM categories WHERE id = ?', [$id]);
    // Une catégorie masquée reste acceptée pour une tâche qui l'avait déjà.
    if ($k && (!$k['hidden'] || ($existing && $existing['type'] === $k['id']))) return $k['id'];
    if ($k && $k['hidden']) fail(400, 'Cette catégorie est masquée : choisissez-en une autre.');
    $first = val('SELECT id FROM categories WHERE hidden = 0 ORDER BY position, label LIMIT 1');
    if (!$first) fail(400, 'Aucune catégorie disponible.');
    return (string)$first;
}

function readTask(array $me, array $b, ?array $existing = null): array {
    $title = str($b['title'] ?? null, 200, 'Le titre', true);
    $desc = str($b['desc'] ?? null, 5000, 'La description');
    $type = readCategory($b['type'] ?? null, $existing);
    if (!isDate($b['start'] ?? null) || !isDate($b['end'] ?? null)) fail(400, 'Renseignez des dates de début et de fin valides.');
    if ($b['end'] < $b['start']) fail(400, 'La date de fin doit être après la date de début.');
    $g = getGroup($b['groupId'] ?? null);
    if (!$g) fail(400, 'Choisissez un groupe.');
    $members = membersOf($g['id']);
    // Une personne hors du groupe peut modifier une tâche qui lui est attribuée, sans la déplacer.
    $keepsOwn = $existing && $existing['group_id'] === $g['id'] && $existing['owner_id'] === $me['id'];
    if ($me['role'] !== 'admin' && !in_array($me['id'], $members, true) && !$keepsOwn) fail(403, 'Vous ne faites pas partie de ce groupe.');
    $ownerId = !empty($b['ownerId']) ? (string)$b['ownerId'] : null;
    if ($ownerId && !getUser($ownerId)) fail(400, 'Personne inconnue.');
    $unchanged = $existing && $existing['owner_id'] === $ownerId;
    if ($ownerId && !$unchanged && !getActiveUser($ownerId)) fail(400, 'Ce compte est désactivé.');
    if ($ownerId && !$unchanged && !in_array($ownerId, $members, true) && $ownerId !== $me['id']) fail(400, 'Cette personne ne fait pas partie du groupe.');
    if (!$ownerId && count($members) < 2) $ownerId = $members[0] ?? $me['id']; // groupe privé : la tâche est à son unique membre
    $rawSteps = $b['steps'] ?? [];
    if (!is_array($rawSteps)) fail(400, "Liste d'étapes illisible.");
    if (count($rawSteps) > 200) fail(400, "Trop d'étapes (200 maximum).");
    $steps = [];
    foreach ($rawSteps as $s) {
        $s = is_array($s) ? $s : [];
        $label = str($s['label'] ?? null, 300, "Le nom d'une étape");
        if ($label === '') continue;
        $steps[] = ['id' => is_string($s['id'] ?? null) ? $s['id'] : null, 'label' => $label, 'desc' => str($s['desc'] ?? null, 2000, "La description d'une étape"), 'done' => !empty($s['done'])];
    }
    // Priorité : 1 urgente, 2 haute, 3 normale, 4 basse (inchangée si absente ou illisible).
    $pr = isset($b['priority']) && is_numeric($b['priority']) ? (int)$b['priority'] : 0;
    $priority = isset(PRIORITES[$pr]) ? $pr : ($existing ? (int)$existing['priority'] : 3);
    return ['title' => $title, 'desc' => $desc, 'type' => $type, 'start' => $b['start'], 'end' => $b['end'], 'groupId' => $g['id'],
            'ownerId' => $ownerId, 'steps' => $steps, 'completed' => !empty($b['completed']) ? 1 : 0, 'priority' => $priority];
}

function writeSteps(string $taskId, array $steps, string $userId): void {
    $existing = array_flip(array_column(rows('SELECT id FROM steps WHERE task_id = ?', [$taskId]), 'id'));
    $keep = [];
    foreach ($steps as $i => $s) {
        if ($s['id'] && isset($existing[$s['id']]) && !isset($keep[$s['id']])) {
            q('UPDATE steps SET position = ?, label = ?, description = ?, done = ? WHERE id = ?', [$i, $s['label'], $s['desc'], $s['done'] ? 1 : 0, $s['id']]);
            // Coché ici : on retient qui et quand (sans écraser une validation plus ancienne).
            if ($s['done']) q('UPDATE steps SET done_by = COALESCE(done_by, ?), done_at = COALESCE(done_at, ?) WHERE id = ?', [$userId, now(), $s['id']]);
            else q('UPDATE steps SET done_by = NULL, done_at = NULL WHERE id = ?', [$s['id']]);
            $keep[$s['id']] = true;
        } else {
            q('INSERT INTO steps (id, task_id, position, label, description, done, done_by, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [newId(), $taskId, $i, $s['label'], $s['desc'], $s['done'] ? 1 : 0, $s['done'] ? $userId : null, $s['done'] ? now() : null]);
        }
    }
    foreach ($existing as $id => $_) if (!isset($keep[$id])) q('DELETE FROM steps WHERE id = ?', [$id]);
}

function describeChanges(array $before, array $d): array {
    $out = [];
    if ($before['title'] !== $d['title']) $out[] = 'titre';
    if ($before['group_id'] !== $d['groupId']) $out[] = 'groupe';
    if (($before['owner_id'] ?: null) !== ($d['ownerId'] ?: null)) {
        $u = $d['ownerId'] ? getUser($d['ownerId']) : null;
        $out[] = 'responsable → ' . ($u ? $u['name'] : 'tout le groupe');
    }
    if ($before['type'] !== $d['type']) $out[] = 'catégorie';
    if ((int)$before['priority'] !== $d['priority']) $out[] = 'priorité → ' . PRIORITES[$d['priority']];
    if ($before['start_date'] !== $d['start']) $out[] = 'début';
    if ($before['end_date'] !== $d['end']) $out[] = 'fin → ' . implode('/', array_reverse(explode('-', $d['end'])));
    if ($before['description'] !== $d['desc']) $out[] = 'description';
    return $out;
}

function r_task_create(array $c): array {
    $me = $c['me']; $d = readTask($me, $c['b']); $id = newId();
    tx(function () use ($id, $d, $me) {
        q('INSERT INTO tasks (id, group_id, owner_id, type, title, description, start_date, end_date, created_by, completed, priority, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [$id, $d['groupId'], $d['ownerId'], $d['type'], $d['title'], $d['desc'], $d['start'], $d['end'], $me['id'], $d['steps'] ? 0 : $d['completed'], $d['priority'], now(), now()]);
        writeSteps($id, $d['steps'], $me['id']);
        majTerminee($id, $me['id']);
        logAct($id, $me['id'], 'creation');
    });
    return ['id' => $id];
}

function r_task_update(array $c): array {
    $me = $c['me']; $t = editableTask($me, $c['p']['id']);
    $d = readTask($me, ['completed' => $t['completed']] + $c['b'], $t);
    $before = rows('SELECT label, done FROM steps WHERE task_id = ? ORDER BY position, seq', [$t['id']]);
    tx(function () use ($t, $d, $me, $before) {
        q('UPDATE tasks SET group_id = ?, owner_id = ?, type = ?, title = ?, description = ?, start_date = ?, end_date = ?, completed = ?, priority = ?, updated_at = ? WHERE id = ?',
          [$d['groupId'], $d['ownerId'], $d['type'], $d['title'], $d['desc'], $d['start'], $d['end'], $d['steps'] ? 0 : $d['completed'], $d['priority'], now(), $t['id']]);
        writeSteps($t['id'], $d['steps'], $me['id']);
        majTerminee($t['id'], $me['id']);
        $changes = describeChanges($t, $d);
        $diff = count($before) !== count($d['steps']);
        foreach ($before as $i => $s) if (!$diff && $s['label'] !== $d['steps'][$i]['label']) $diff = true;
        if ($diff) $changes[] = 'étapes';
        if ($changes) logAct($t['id'], $me['id'], 'modification', implode(', ', $changes));
    });
    return ['ok' => true];
}

function r_task_delete(array $c): array {
    $t = editableTask($c['me'], $c['p']['id']);
    q('DELETE FROM tasks WHERE id = ?', [$t['id']]);
    return ['ok' => true];
}

// Tâche sans étapes : terminée / pas terminée.
function r_task_done(array $c): array {
    $t = editableTask($c['me'], $c['p']['id']);
    $done = !empty($c['b']['completed']) ? 1 : 0;
    tx(function () use ($t, $done, $c) {
        q('UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?', [$done, now(), $t['id']]);
        majTerminee($t['id'], $c['me']['id']);
        logAct($t['id'], $c['me']['id'], $done ? 'terminee' : 'rouverte');
    });
    return ['ok' => true];
}

function r_task_details(array $c): array {
    $t = getTask($c['p']['id']);
    if (!$t || !canSeeTask($c['me'], $t)) fail(404, "Cette tâche n'existe plus.");
    return [
        'comments' => rows('SELECT id, body, created_at AS `at`, user_id AS userId FROM comments WHERE task_id = ? ORDER BY created_at, seq', [$t['id']]),
        // Le journal « qui a fait quoi » est réservé à l'administrateur.
        'activity' => $c['me']['role'] === 'admin'
            ? rows('SELECT action, detail, created_at AS `at`, user_id AS userId FROM activity WHERE task_id = ? ORDER BY id DESC LIMIT 100', [$t['id']])
            : [],
    ];
}

function r_historique(array $c): array {
    $tasks = rows('SELECT t.*, g.name AS group_name, g.icon AS group_icon, g.color AS group_color FROM tasks t LEFT JOIN groupes g ON g.id = t.group_id
                   WHERE t.done_at IS NOT NULL ORDER BY t.done_at DESC LIMIT 1000');
    $steps = steps_of(array_column($tasks, 'id'));
    $seuil = seuilArchive();
    return ['jours' => ARCHIVE_JOURS, 'tasks' => array_map(fn($t) => [
        'id' => $t['id'], 'title' => $t['title'], 'desc' => $t['description'], 'type' => $t['type'], 'ownerId' => $t['owner_id'], 'groupId' => $t['group_id'],
        'group' => ['name' => $t['group_name'] ?: 'Groupe supprimé', 'icon' => $t['group_icon'] ?: '📁', 'color' => $t['group_color'] ?: '#666A6F'],
        'start' => $t['start_date'], 'end' => $t['end_date'], 'doneAt' => $t['done_at'], 'doneBy' => $t['done_by'],
        'createdBy' => $t['created_by'], 'createdAt' => $t['created_at'], 'priority' => (int)$t['priority'],
        'archived' => $t['done_at'] <= $seuil, 'steps' => $steps[$t['id']] ?? [],
    ], $tasks)];
}

/* ----- Étapes ----- */
function r_step_add(array $c): array {
    $me = $c['me']; $t = editableTask($me, $c['p']['id']);
    $label = str($c['b']['label'] ?? null, 300, "Le nom de l'étape", true);
    $desc = str($c['b']['desc'] ?? null, 2000, 'La description');
    $pos = (int)val('SELECT COALESCE(MAX(position), -1) + 1 FROM steps WHERE task_id = ?', [$t['id']]);
    $id = newId();
    tx(function () use ($id, $t, $pos, $label, $desc, $me) {
        q('INSERT INTO steps (id, task_id, position, label, description) VALUES (?, ?, ?, ?, ?)', [$id, $t['id'], $pos, $label, $desc]);
        q('UPDATE tasks SET completed = 0 WHERE id = ?', [$t['id']]);
        majTerminee($t['id'], $me['id']);
        touchTask($t['id']);
        logAct($t['id'], $me['id'], 'etape_ajoutee', $label);
    });
    return ['id' => $id];
}

function r_step_patch(array $c): ?array {
    $me = $c['me']; ['step' => $s] = editableStep($me, $c['p']['id']);
    $done = !empty($c['b']['done']) ? 1 : 0;
    if ($done === (int)$s['done']) return null;
    tx(function () use ($s, $done, $me) {
        // On note qui a coché l'étape et quand (effacé si on la décoche).
        if ($done) q('UPDATE steps SET done = 1, done_by = ?, done_at = ? WHERE id = ?', [$me['id'], now(), $s['id']]);
        else q('UPDATE steps SET done = 0, done_by = NULL, done_at = NULL WHERE id = ?', [$s['id']]);
        majTerminee($s['task_id'], $me['id']);
        touchTask($s['task_id']);
        logAct($s['task_id'], $me['id'], $done ? 'etape_cochee' : 'etape_decochee', $s['label']);
    });
    return null;
}

function r_step_delete(array $c): ?array {
    $me = $c['me']; ['step' => $s] = editableStep($me, $c['p']['id']);
    tx(function () use ($s, $me) {
        q('DELETE FROM steps WHERE id = ?', [$s['id']]);
        majTerminee($s['task_id'], $me['id']);
        touchTask($s['task_id']);
        logAct($s['task_id'], $me['id'], 'etape_supprimee', $s['label']);
    });
    return null;
}

/* ----- Commentaires ----- */
function r_comment_add(array $c): array {
    $t = getTask($c['p']['id']);
    if (!$t || !canSeeTask($c['me'], $t)) fail(404, "Cette tâche n'existe plus.");
    $body = str($c['b']['body'] ?? null, 3000, 'Le commentaire', true);
    $id = newId();
    q('INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [$id, $t['id'], $c['me']['id'], $body, now()]);
    return ['id' => $id];
}
function r_comment_delete(array $c): ?array {
    $k = row('SELECT * FROM comments WHERE id = ?', [$c['p']['id']]);
    if (!$k) fail(404, "Ce commentaire n'existe plus.");
    if ($c['me']['role'] !== 'admin' && $k['user_id'] !== $c['me']['id']) fail(403, 'Vous ne pouvez supprimer que vos propres commentaires.');
    q('DELETE FROM comments WHERE id = ?', [$k['id']]);
    return null;
}

/* =====================  GROUPES  ===================== */
function readGroup(array $me, array $b): array {
    $name = str($b['name'] ?? null, 80, 'Le nom du groupe', true);
    $icon = str($b['icon'] ?? null, 20, 'Le logo') ?: '📁';
    if (str_starts_with($icon, 'img:') && !in_array($icon, ['img:lr', 'img:llc'], true)) $icon = '📁';
    $color = preg_match('/^#[0-9A-Fa-f]{6}$/', (string)($b['color'] ?? '')) ? $b['color'] : GROUP_COLORS[2];
    $members = [];
    if (is_array($b['members'] ?? null)) foreach ($b['members'] as $id) if (is_scalar($id) && getUser((string)$id) && !in_array((string)$id, $members, true)) $members[] = (string)$id;
    if ($me['role'] !== 'admin' && !in_array($me['id'], $members, true)) array_unshift($members, $me['id']);
    if (!$members) fail(400, 'Choisissez au moins une personne pour ce groupe.');
    return ['name' => $name, 'icon' => $icon, 'color' => $color, 'members' => $members];
}
function setMembers(string $gid, array $members): void {
    q('DELETE FROM group_members WHERE group_id = ?', [$gid]);
    foreach ($members as $uid) q('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [$gid, $uid]);
}
function r_group_create(array $c): array {
    $d = readGroup($c['me'], $c['b']); $id = newId();
    tx(function () use ($id, $d) {
        $pos = (int)val('SELECT COALESCE(MAX(position), 0) + 1 FROM groupes');
        q('INSERT INTO groupes (id, name, icon, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$id, $d['name'], $d['icon'], $d['color'], $pos, now()]);
        setMembers($id, $d['members']);
    });
    return ['id' => $id];
}
function r_group_update(array $c): array {
    $g = editableGroup($c['me'], $c['p']['id']);
    $d = readGroup($c['me'], $c['b']);
    tx(function () use ($g, $d) {
        q('UPDATE groupes SET name = ?, icon = ?, color = ? WHERE id = ?', [$d['name'], $d['icon'], $d['color'], $g['id']]);
        setMembers($g['id'], $d['members']);
    });
    return ['ok' => true];
}
// Ordre d'affichage des groupes (accueil, timeline, listes) : réglé par l'administrateur pour tout le monde.
function r_group_order(array $c): array {
    if (!is_array($c['b']['ids'] ?? null)) fail(400, 'Ordre illisible.');
    tx(function () use ($c) { foreach (array_values($c['b']['ids']) as $i => $id) q('UPDATE groupes SET position = ? WHERE id = ?', [$i + 1, (string)$id]); });
    return ['ok' => true];
}
function r_group_delete(array $c): array {
    $g = editableGroup($c['me'], $c['p']['id']);
    if ((int)val('SELECT COUNT(*) FROM tasks WHERE group_id = ?', [$g['id']])) fail(400, 'Ce groupe contient encore des tâches.');
    q('DELETE FROM groupes WHERE id = ?', [$g['id']]);
    return ['ok' => true];
}

/* =====================  CATÉGORIES  ===================== */
function getCat(mixed $id): ?array { return row('SELECT * FROM categories WHERE id = ?', [(string)($id ?? '')]); }
function readCat(array $b): array {
    return ['label' => str($b['label'] ?? null, 40, 'Le nom de la catégorie', true), 'emoji' => str($b['emoji'] ?? null, 16, 'Le pictogramme') ?: '📁'];
}
function sameLabel(string $label, string $exceptId = ''): bool {
    return val('SELECT 1 FROM categories WHERE LOWER(label) = LOWER(?) AND id <> ?', [$label, $exceptId]) !== null;
}
function r_cat_create(array $c): array {
    $d = readCat($c['b']);
    if (sameLabel($d['label'])) fail(400, 'Une catégorie porte déjà ce nom.');
    $id = newId();
    $pos = (int)val('SELECT COALESCE(MAX(position), -1) + 1 FROM categories');
    q('INSERT INTO categories (id, label, emoji, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$id, $d['label'], $d['emoji'], $pos, $c['me']['id'], now()]);
    return ['id' => $id];
}
function r_cat_update(array $c): array {
    $k = getCat($c['p']['id']);
    if (!$k) fail(404, "Cette catégorie n'existe plus.");
    $d = readCat($c['b']);
    if (sameLabel($d['label'], $k['id'])) fail(400, 'Une catégorie porte déjà ce nom.');
    $hidden = array_key_exists('hidden', $c['b']) ? (empty($c['b']['hidden']) ? 0 : 1) : (int)$k['hidden'];
    if ($hidden && !$k['hidden'] && (int)val('SELECT COUNT(*) FROM categories WHERE hidden = 0') <= 1) fail(400, 'Il faut garder au moins une catégorie visible.');
    q('UPDATE categories SET label = ?, emoji = ?, hidden = ? WHERE id = ?', [$d['label'], $d['emoji'], $hidden, $k['id']]);
    return ['ok' => true];
}
function r_cat_order(array $c): array {
    if (!is_array($c['b']['ids'] ?? null)) fail(400, 'Ordre illisible.');
    tx(function () use ($c) { foreach (array_values($c['b']['ids']) as $i => $id) q('UPDATE categories SET position = ? WHERE id = ?', [$i, (string)$id]); });
    return ['ok' => true];
}
function r_cat_delete(array $c): array {
    $k = getCat($c['p']['id']);
    if (!$k) fail(404, "Cette catégorie n'existe plus.");
    $n = (int)val('SELECT COUNT(*) FROM tasks WHERE type = ?', [$k['id']]);
    $rep = !empty($c['q']['remplacer']) ? getCat($c['q']['remplacer']) : null;
    if ($n && !$rep) fail(400, "Cette catégorie est utilisée par $n tâche" . ($n > 1 ? 's' : '') . '. Masquez-la plutôt, ou choisissez une catégorie de remplacement.');
    if ($n && $c['me']['role'] !== 'admin') fail(403, "Seul l'administrateur peut supprimer une catégorie utilisée.");
    if ($rep && $rep['id'] === $k['id']) fail(400, 'Choisissez une autre catégorie de remplacement.');
    if ((int)val('SELECT COUNT(*) FROM categories WHERE hidden = 0 AND id <> ?', [$k['id']]) < 1) fail(400, 'Il faut garder au moins une catégorie visible.');
    tx(function () use ($n, $rep, $k) {
        if ($n) q('UPDATE tasks SET type = ? WHERE type = ?', [$rep['id'], $k['id']]);
        q('DELETE FROM categories WHERE id = ?', [$k['id']]);
    });
    return ['moved' => $n];
}

/* =====================  COMPTES  ===================== */
function checkPassword(mixed $p, string $label = 'Le mot de passe'): string {
    if (!is_string($p) || mb_strlen($p) < 6) fail(400, "$label doit faire au moins 6 caractères.");
    if (mb_strlen($p) > 200) fail(400, "$label est trop long.");
    return $p;
}
function activeAdmins(): int { return (int)val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1"); }

function r_password(array $c): array {
    $me = $c['me']; $b = $c['b'];
    $u = row('SELECT password_hash, role FROM users WHERE id = ?', [$me['id']]);
    if (!is_string($b['oldPassword'] ?? null) || !password_verify($b['oldPassword'], $u['password_hash'])) fail(400, 'Le mot de passe actuel ne correspond pas.');
    $new = checkPassword($b['newPassword'] ?? null, 'Le nouveau mot de passe');
    q('UPDATE users SET password_hash = ? WHERE id = ?', [hashPwd($new), $me['id']]);
    // Les autres appareils connectés à ce compte devront se reconnecter.
    q('DELETE FROM sessions WHERE user_id = ? AND token <> ?', [$me['id'], $me['sessionHash']]);
    if ($u['role'] === 'admin') setSetting('default_admin_password', '0');
    return ['ok' => true];
}

function r_user_create(array $c): array {
    $b = $c['b'];
    $name = str($b['name'] ?? null, 60, 'Le nom', true);
    $password = checkPassword($b['password'] ?? null);
    $role = ($b['role'] ?? '') === 'admin' ? 'admin' : 'user';
    if (val('SELECT 1 FROM users WHERE name = ?', [$name]) !== null) fail(400, 'Ce nom est déjà utilisé.');
    $id = newId();
    tx(function () use ($id, $name, $password, $role) {
        q('INSERT INTO users (id, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', [$id, $name, hashPwd($password), $role, now()]);
        if ($role === 'user') {
            // Chaque utilisateur reçoit son groupe privé « Perso ».
            $n = (int)val('SELECT COUNT(*) FROM groupes');
            $gid = newId();
            $pos = (int)val('SELECT COALESCE(MAX(position), 0) + 1 FROM groupes');
            q('INSERT INTO groupes (id, name, icon, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$gid, 'Perso', '🏡', GROUP_COLORS[2 + ($n % 4)], $pos, now()]);
            q('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [$gid, $id]);
        }
    });
    return ['id' => $id];
}

// Modifier un compte : nom, rôle, actif, nouveau mot de passe (facultatif).
function r_user_update(array $c): array {
    $me = $c['me']; $b = $c['b'];
    $u = getUser($c['p']['id']);
    if (!$u) fail(404, "Ce compte n'existe plus.");
    $name = array_key_exists('name', $b) ? str($b['name'], 60, 'Le nom', true) : $u['name'];
    $role = array_key_exists('role', $b) ? ($b['role'] === 'admin' ? 'admin' : 'user') : $u['role'];
    $active = array_key_exists('active', $b) ? (empty($b['active']) ? 0 : 1) : (int)$u['active'];
    if (val('SELECT 1 FROM users WHERE name = ? AND id <> ?', [$name, $u['id']]) !== null) fail(400, 'Ce nom est déjà utilisé.');
    if ($u['id'] === $me['id'] && !$active) fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
    $removesAdmin = $u['role'] === 'admin' && $u['active'] && ($role !== 'admin' || !$active);
    if ($removesAdmin && activeAdmins() <= 1) fail(400, 'Il faut garder au moins un administrateur actif.');
    $password = !empty($b['password']) ? checkPassword($b['password'], 'Le nouveau mot de passe') : null;
    tx(function () use ($u, $name, $role, $active, $password, $me) {
        q('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', [$name, $role, $active, $u['id']]);
        if ($password) q('UPDATE users SET password_hash = ? WHERE id = ?', [hashPwd($password), $u['id']]);
        // Nouveau mot de passe ou compte désactivé : ses appareils sont déconnectés.
        if ($password || !$active) q('DELETE FROM sessions WHERE user_id = ? AND token <> ?', [$u['id'], $me['sessionHash']]);
        if (!$active) q('DELETE FROM api_tokens WHERE user_id = ?', [$u['id']]);
        if ($password && $role === 'admin' && $u['id'] === $me['id']) setSetting('default_admin_password', '0');
    });
    return ['ok' => true];
}

/* ----- Clés d'accès (Claude, ChatGPT) ----- */
function r_tokens(array $c): array {
    return ['tokens' => rows('SELECT id, name, created_at AS createdAt, last_used AS lastUsed FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC', [$c['me']['id']])];
}
function r_token_create(array $c): array {
    if ($c['me']['viaToken']) fail(403, "Une clé d'accès ne peut pas créer d'autres clés.");
    $name = str($c['b']['name'] ?? null, 60, 'Le nom de la clé') ?: 'Claude';
    if ((int)val('SELECT COUNT(*) FROM api_tokens WHERE user_id = ?', [$c['me']['id']]) >= 10) fail(400, 'Vous avez déjà 10 clés : supprimez-en une.');
    $token = 'lr_' . newToken();
    q('INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)', [newId(), $c['me']['id'], $name, hashToken($token), now()]);
    return ['token' => $token]; // affichée une seule fois
}
function r_token_delete(array $c): array {
    $n = q('DELETE FROM api_tokens WHERE id = ? AND user_id = ?', [$c['p']['id'], $c['me']['id']])->rowCount();
    if (!$n) fail(404, "Cette clé n'existe plus.");
    return ['ok' => true];
}

/* ----- Sauvegarde à télécharger : un fichier SQL qu'on peut réimporter (phpMyAdmin) ----- */
function r_backup(array $c): array {
    $pdo = db();
    $out = "-- Sauvegarde Projets Le Roy du " . date('d/m/Y H:i') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n";
    foreach (['users', 'groupes', 'group_members', 'categories', 'tasks', 'steps', 'comments', 'activity', 'api_tokens', 'settings'] as $t) {
        $out .= "DELETE FROM `$t`;\n";
        foreach (rows("SELECT * FROM `$t`") as $r) {
            $vals = array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote((string)$v), array_values($r));
            $out .= "INSERT INTO `$t` (`" . implode('`,`', array_keys($r)) . '`) VALUES (' . implode(',', $vals) . ");\n";
        }
    }
    $out .= "SET FOREIGN_KEY_CHECKS=1;\n";
    return ['__raw' => ['type' => 'application/sql; charset=utf-8', 'filename' => 'projets-le-roy-' . todayIso() . '.sql', 'content' => $out]];
}
