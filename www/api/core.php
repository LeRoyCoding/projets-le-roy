<?php
// Noyau : erreurs, outils, configuration, base de données MySQL, journal des opérations sensibles.
declare(strict_types=1);

class HttpError extends Exception {
    public int $status;
    public ?string $errCode;
    public function __construct(int $status, string $msg, ?string $code = null) { parent::__construct($msg); $this->status = $status; $this->errCode = $code; }
}
function fail(int $status, string $msg, ?string $code = null): never { throw new HttpError($status, $msg, $code); }

/* ---------- Petits outils ---------- */
function now(): string { return gmdate('Y-m-d H:i:s'); }
function newId(): string { return bin2hex(random_bytes(6)); }
function newToken(): string { return bin2hex(random_bytes(32)); }
function hashToken(string $t): string { return hash('sha256', $t); }
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

function isHttps(): bool {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    // Un en-tête de proxy n'est cru que si l'administrateur l'a explicitement autorisé dans config.php.
    return !empty(config_optional()['trust_proxy']) && strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}
function clientIp(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }

function path_inside(string $path, string $root): bool {
    $p = realpath($path); $r = realpath($root);
    return $p && $r && ($p === $r || str_starts_with($p, $r . DIRECTORY_SEPARATOR));
}

/* ---------- Configuration (hors du dossier public) ----------
 * Disposition conseillée sur l'hébergement :
 *   ~/config/config.php   identifiants et secrets (jamais dans Git, jamais accessible par le web)
 *   ~/data/               sauvegardes, fichiers, journaux (jamais accessible par le web)
 *   ~/www/ (ou releases/) le code, remplaçable à tout moment sans toucher au reste
 */
function config_file(): ?string {
    $candidats = [
        getenv('LR_CONFIG_FILE') ?: null,
        dirname(__DIR__, 2) . '/config/config.php',   // ~/config/config.php quand le code est dans ~/www/api
        dirname(__DIR__, 4) . '/config/config.php',   // disposition par versions : ~/projets/releases/ID/www/api
        dirname(__DIR__) . '/config.php',             // ancien emplacement (dans le dossier public) : toléré, déconseillé
    ];
    foreach ($candidats as $f) if ($f && is_file($f)) return $f;
    return null;
}

function config_optional(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    // Tests automatiques uniquement (jamais en production) : la base est donnée par l'environnement.
    if (getenv('LR_TESTING') === '1' && getenv('LR_DB_NAME')) {
        return $cfg = ['db_host' => getenv('LR_DB_HOST') ?: '127.0.0.1', 'db_port' => getenv('LR_DB_PORT') ?: null,
            'db_name' => getenv('LR_DB_NAME'), 'db_user' => getenv('LR_DB_USER') ?: 'root', 'db_pass' => getenv('LR_DB_PASS') ?: '',
            'maintenance_key' => getenv('LR_TEST_MAINTENANCE_KEY') ?: null, 'data_dir' => getenv('LR_DATA_DIR') ?: null,
            'backup_public_key' => getenv('LR_TEST_BACKUP_PUBKEY') ?: null, 'env' => 'test'];
    }
    $f = config_file();
    $cfg = $f ? (array)(require $f) : [];
    if ($f) $cfg['_file'] = $f;
    return $cfg;
}

function config(): array {
    $c = config_optional();
    if (!$c || empty($c['db_name'])) fail(500, "L'application n'est pas encore configurée : créez le fichier config/config.php (voir config.exemple.php).", 'config');
    return $c;
}

// Dossier des données (sauvegardes, journaux, fichiers) : toujours hors du dossier public.
function data_dir(string $sub = ''): string {
    $c = config_optional();
    $base = $c['data_dir'] ?? null;
    if (!$base) $base = isset($c['_file']) ? dirname($c['_file'], 2) . '/data' : dirname(__DIR__, 2) . '/data';
    $dir = $sub === '' ? $base : $base . '/' . $sub;
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) fail(500, "Dossier de données inaccessible en écriture : $dir", 'data');
    return $dir;
}

/* ---------- Base de données ---------- */
function db_connect(array $c): PDO {
    $dsn = 'mysql:host=' . ($c['db_host'] ?? 'localhost') . ';dbname=' . ($c['db_name'] ?? '') . ';charset=utf8mb4';
    if (!empty($c['db_port'])) $dsn .= ';port=' . (int)$c['db_port'];
    $pdo = new PDO($dsn, $c['db_user'] ?? '', $c['db_pass'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ]);
    $pdo->exec("SET NAMES utf8mb4, time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    return $pdo;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    try { $pdo = db_connect(config()); }
    catch (PDOException $e) {
        error_log('Connexion base : ' . $e->getMessage());
        fail(500, 'Connexion à la base de données impossible. Vérifiez les identifiants dans config.php.', 'db');
    }
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

/* ---------- Journal des opérations sensibles ----------
 * Écrit seulement (jamais modifié ni effacé par l'application). Un échec d'écriture ne bloque pas l'action. */
function actor(?array $set = null): ?array {
    static $a = null;
    if ($set !== null) $a = $set;
    return $a;
}
function audit(string $action, ?string $targetType = null, ?string $targetId = null, string $detail = '', ?array $user = null): void {
    try {
        $u = $user ?? actor();
        q('INSERT INTO audit_log (at, user_id, user_name, ip, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [now(), $u['id'] ?? null, $u['name'] ?? null, mb_substr(clientIp(), 0, 45), $action, $targetType, $targetId, mb_substr($detail, 0, 500)]);
    } catch (Throwable $e) { error_log('Journal : ' . $e->getMessage()); }
}
