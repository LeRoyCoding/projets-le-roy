<?php
// Outils communs : erreurs, base de données MySQL, sessions, droits.
declare(strict_types=1);

class HttpError extends Exception {
    public int $status;
    public function __construct(int $status, string $msg) { parent::__construct($msg); $this->status = $status; }
}
function fail(int $status, string $msg): never { throw new HttpError($status, $msg); }

/* ---------- Petits outils ---------- */
function now(): string { return gmdate('Y-m-d H:i:s'); }
function newId(): string { return bin2hex(random_bytes(6)); }
function newToken(): string { return bin2hex(random_bytes(32)); }
function hashToken(string $t): string { return hash('sha256', $t); }
function hashPwd(string $p): string { return password_hash($p, PASSWORD_BCRYPT, ['cost' => 10]); }
function todayIso(): string { return date('Y-m-d'); }

// Texte nettoyé avec longueur maximale (et obligatoire si demandé).
function str(mixed $v, int $max, string $label, bool $required = false): string {
    $s = is_string($v) ? trim($v) : '';
    if ($required && $s === '') fail(400, "$label est obligatoire.");
    if (mb_strlen($s) > $max) fail(400, "$label est trop long ($max caractères maximum).");
    return $s;
}

// Date AAAA-MM-JJ réellement existante (refuse le 31 février).
function isDate(mixed $s): bool {
    if (!is_string($s) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) && (int)$m[1] >= 2000 && (int)$m[1] <= 2100;
}

function bodyGet(array $b, string $k, mixed $default = null): mixed { return array_key_exists($k, $b) ? $b[$k] : $default; }

/* ---------- Base de données ---------- */
function config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    // Tests automatiques : la base est donnée par l'environnement (jamais utilisé en production).
    if (getenv('LR_DB_NAME') !== false && getenv('LR_DB_NAME') !== '') {
        return $cfg = ['db_host' => getenv('LR_DB_HOST') ?: '127.0.0.1', 'db_port' => getenv('LR_DB_PORT') ?: null,
                       'db_name' => getenv('LR_DB_NAME'), 'db_user' => getenv('LR_DB_USER') ?: 'root', 'db_pass' => getenv('LR_DB_PASS') ?: ''];
    }
    $file = dirname(__DIR__) . '/config.php';
    if (!is_file($file)) fail(500, "L'application n'est pas encore configurée : copiez config.exemple.php en config.php et remplissez les identifiants de la base de données.");
    $cfg = require $file;
    return $cfg;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config();
    $dsn = 'mysql:host=' . ($c['db_host'] ?? 'localhost') . ';dbname=' . ($c['db_name'] ?? '') . ';charset=utf8mb4';
    if (!empty($c['db_port'])) $dsn .= ';port=' . (int)$c['db_port'];
    try {
        $pdo = new PDO($dsn, $c['db_user'] ?? '', $c['db_pass'] ?? '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
    } catch (PDOException $e) {
        error_log('Connexion base : ' . $e->getMessage());
        fail(500, "Connexion à la base de données impossible. Vérifiez les identifiants dans config.php.");
    }
    $pdo->exec("SET NAMES utf8mb4, time_zone = '+00:00'");
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}
function rows(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function row(string $sql, array $p = []): ?array { $r = q($sql, $p)->fetch(); return $r === false ? null : $r; }
function val(string $sql, array $p = []): mixed { $r = q($sql, $p)->fetch(PDO::FETCH_NUM); return $r === false ? null : $r[0]; }
function in(array $ids): string { return implode(',', array_fill(0, count($ids), '?')); }

function tx(callable $fn): mixed {
    $pdo = db();
    $pdo->beginTransaction();
    try { $r = $fn(); $pdo->commit(); return $r; }
    catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

function getSetting(string $k): ?string { $v = val('SELECT v FROM settings WHERE k = ?', [$k]); return $v === null ? null : (string)$v; }
function setSetting(string $k, string $v): void {
    q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [$k, $v]);
}
// Compteur de modifications : les postes le consultent régulièrement pour savoir s'il faut se rafraîchir.
function bump(): void {
    q("INSERT INTO settings (k, v) VALUES ('rev', '1') ON DUPLICATE KEY UPDATE v = CAST(v AS UNSIGNED) + 1");
}

/* ---------- Mise à jour automatique de la base ---------- */
function migrer(): void {
    static $fait = false;
    if ($fait) return;
    $fait = true;
    $pdo = db();
    $pdo->exec('CREATE TABLE IF NOT EXISTS settings (k VARCHAR(64) NOT NULL PRIMARY KEY, v TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $version = (int)(val("SELECT v FROM settings WHERE k = 'schema_version'") ?? 0);
    $migrations = require __DIR__ . '/migrations.php';
    if ($version >= count($migrations)) return;
    // Un seul visiteur à la fois fait la mise à jour.
    $lock = (int)val("SELECT GET_LOCK('lr_migration', 20)");
    try {
        $version = (int)(val("SELECT v FROM settings WHERE k = 'schema_version'") ?? 0);
        for ($i = $version; $i < count($migrations); $i++) {
            foreach ($migrations[$i] as $sql) $pdo->exec($sql);   // MySQL valide chaque ordre tout seul
            setSetting('schema_version', (string)($i + 1));
        }
    } finally {
        if ($lock) q("SELECT RELEASE_LOCK('lr_migration')");
    }
}

/* ---------- Connexion, sessions, droits ---------- */
const COOKIE = 'lr_session';
const SESSION_DAYS = 60;
const ARCHIVE_JOURS = 7;

function isHttps(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}
function clientIp(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }

function setCookieValue(string $value, int $maxAge): void {
    setcookie(COOKIE, $value, [
        'expires' => $maxAge > 0 ? time() + $maxAge : time() - 3600, 'path' => '/',
        'secure' => isHttps(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

function authorizationHeader(): string {
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $k) if (!empty($_SERVER[$k])) return (string)$_SERVER[$k];
    if (function_exists('getallheaders')) foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') return (string)$v;
    return '';
}

// Qui fait la demande ? Clé d'accès (Bearer) ou cookie de session. Renvoie null si personne.
function currentUser(?string $bearerKey = null): ?array {
    $bearer = $bearerKey;
    if ($bearer === null && preg_match('/^Bearer\s+(\S+)$/i', authorizationHeader(), $m)) $bearer = $m[1];
    if ($bearer !== null) {
        $r = row('SELECT u.id, u.name, u.role, t.id AS token_id FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND u.active = 1', [hashToken($bearer)]);
        if (!$r) return null;
        q('UPDATE api_tokens SET last_used = ? WHERE id = ?', [now(), $r['token_id']]);
        return ['id' => $r['id'], 'name' => $r['name'], 'role' => $r['role'], 'viaToken' => true, 'sessionHash' => ''];
    }
    $token = $_COOKIE[COOKIE] ?? '';
    if (!is_string($token) || $token === '') return null;
    $hash = hashToken($token);
    $limit = gmdate('Y-m-d H:i:s', time() - SESSION_DAYS * 86400);
    $r = row('SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1 AND s.last_seen > ?', [$hash, $limit]);
    if (!$r) return null;
    q('UPDATE sessions SET last_seen = ? WHERE token = ? AND last_seen < ?', [now(), $hash, gmdate('Y-m-d H:i:s', time() - 3600)]);
    return ['id' => $r['id'], 'name' => $r['name'], 'role' => $r['role'], 'viaToken' => false, 'sessionHash' => $hash];
}

/* ---------- Règles d'accès ---------- */
function getUser(mixed $id): ?array { return row('SELECT id, name, role, active FROM users WHERE id = ?', [(string)($id ?? '')]); }
function getActiveUser(mixed $id): ?array { return row('SELECT id, name, role, active FROM users WHERE id = ? AND active = 1', [(string)($id ?? '')]); }
function getGroup(mixed $id): ?array { return row('SELECT * FROM groupes WHERE id = ?', [(string)($id ?? '')]); }
function getTask(mixed $id): ?array { return row('SELECT * FROM tasks WHERE id = ?', [(string)($id ?? '')]); }
function membersOf(string $gid): array { return array_column(rows('SELECT user_id FROM group_members WHERE group_id = ?', [$gid]), 'user_id'); }
function isMember(string $gid, string $uid): bool { return val('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', [$gid, $uid]) !== null; }

// Voir / modifier une tâche : admin, responsable de la tâche ou membre du groupe.
function canSeeTask(array $me, array $t): bool { return $me['role'] === 'admin' || $t['owner_id'] === $me['id'] || isMember($t['group_id'], $me['id']); }

function editableTask(array $me, mixed $id): array {
    $t = getTask($id);
    if (!$t) fail(404, "Cette tâche n'existe plus.");
    if (!canSeeTask($me, $t)) fail(403, 'Vous ne pouvez pas modifier cette tâche.');
    return $t;
}
function editableStep(array $me, mixed $id): array {
    $s = row('SELECT * FROM steps WHERE id = ?', [(string)($id ?? '')]);
    if (!$s) fail(404, "Cette étape n'existe plus.");
    $t = editableTask($me, $s['task_id']);
    return ['step' => $s, 'task' => $t];
}
function editableGroup(array $me, mixed $id): array {
    $g = getGroup($id);
    if (!$g) fail(404, "Ce groupe n'existe plus.");
    if ($me['role'] !== 'admin' && !isMember($g['id'], $me['id'])) fail(403, 'Vous ne faites pas partie de ce groupe.');
    return $g;
}

// Une tâche est terminée quand toutes ses étapes sont cochées (ou, sans étape, quand on l'a marquée terminée).
function majTerminee(string $taskId, string $userId): void {
    $t = row('SELECT completed, done_at FROM tasks WHERE id = ?', [$taskId]);
    if (!$t) return;
    $n = row('SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS faites FROM steps WHERE task_id = ?', [$taskId]);
    $fini = (int)$n['total'] > 0 ? (int)$n['faites'] === (int)$n['total'] : (bool)$t['completed'];
    if ($fini && !$t['done_at']) q('UPDATE tasks SET done_at = ?, done_by = ? WHERE id = ?', [now(), $userId, $taskId]);
    elseif (!$fini && $t['done_at']) q('UPDATE tasks SET done_at = NULL, done_by = NULL WHERE id = ?', [$taskId]);
}
// Les tâches terminées depuis plus de 7 jours quittent l'écran (elles restent dans l'historique de l'admin).
function seuilArchive(): string { return gmdate('Y-m-d H:i:s', time() - ARCHIVE_JOURS * 86400); }
function touchTask(string $id): void { q('UPDATE tasks SET updated_at = ? WHERE id = ?', [now(), $id]); }
