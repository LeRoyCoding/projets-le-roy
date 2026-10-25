<?php
// Authentification : mots de passe, protection contre les essais répétés, sessions, clés d'accès.
// Tout est regroupé ici pour pouvoir, plus tard, brancher l'authentification de l'intranet (voir AuthProvider).
declare(strict_types=1);

const SESSION_IDLE_DAYS = 14;       // inactif depuis 14 jours : reconnexion
const SESSION_MAX_DAYS = 30;        // 30 jours maximum, même en activité
const TOKEN_DEFAULT_DAYS = 365;

/* ---------- Mots de passe ---------- */
const PASSWORD_MIN = 12;
const PASSWORDS_FAIBLES = ['password', 'motdepasse', 'azerty', 'azertyuiop', 'qwerty', 'qwertyuiop', 'administrateur', 'administrator', 'bienvenue', 'soleil', 'doudou',
    'le-roy', 'leroy', 'projets', 'lead le roy', 'poulet', 'poulailler', 'abcdef', 'letmein', 'welcome', 'iloveyou', 'changeme', 'admin', 'passw0rd', 'p@ssw0rd', 'football', 'marseille'];

// Renvoie un message d'erreur, ou null si le mot de passe est acceptable.
function password_problem(mixed $p, string $name = ''): ?string {
    if (!is_string($p) || mb_strlen($p) < PASSWORD_MIN) return 'Le mot de passe doit faire au moins ' . PASSWORD_MIN . ' caractères (une phrase facile à retenir convient très bien).';
    if (mb_strlen($p) > 200) return 'Le mot de passe est trop long (200 caractères maximum).';
    $l = mb_strtolower($p);
    $core = preg_replace('/[^a-z]/', '', strtr($l, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '@' => 'a', '$' => 's']));
    foreach (PASSWORDS_FAIBLES as $w) if ($l === $w || ($core !== '' && strlen($core) <= strlen($w) + 4 && str_contains($core, preg_replace('/[^a-z]/', '', $w)) && strlen(preg_replace('/[^a-z]/', '', $w)) >= 5)) return 'Ce mot de passe est trop courant : choisissez-en un autre.';
    foreach (['leroy', 'projets'] as $w) if ($core !== '' && str_contains($core, $w)) return 'Évitez le nom de l\'entreprise ou de l\'application dans le mot de passe.';
    if (count(array_unique(mb_str_split($p))) < 5) return 'Ce mot de passe est trop répétitif.';
    if (preg_match('/^(?:0123456789|1234567890|abcdefghij|azertyuiop|qwertyuiop)/i', $p)) return 'Ce mot de passe est une suite trop simple.';
    $n = mb_strtolower(trim($name));
    if (mb_strlen($n) >= 3 && str_contains($l, $n)) return 'Le mot de passe ne doit pas contenir votre nom.';
    return null;
}
function check_password(mixed $p, string $name = '', string $label = 'Le mot de passe'): string {
    $e = password_problem($p, $name);
    if ($e !== null) fail(400, $e);
    return $p;
}
function hashPwd(string $p): string { return password_hash($p, PASSWORD_BCRYPT, ['cost' => 11]); }

/* ---------- Essais répétés : blocage progressif par compte et par appareil ---------- */
function throttle_locked(string $key, int $freeTries = 5): int {   // secondes restantes de blocage (0 = libre)
    $f = row('SELECT n, last_at FROM login_failures WHERE k = ?', [$key]);
    if (!$f || (int)$f['n'] < $freeTries) return 0;
    $wait = min(3600, 60 * (2 ** min(6, (int)$f['n'] - $freeTries)));   // 1 min, 2, 4… jusqu'à 1 h
    return max(0, strtotime($f['last_at'] . ' UTC') + $wait - time());
}
function throttle_fail(string $key): void {
    $f = row('SELECT n, last_at FROM login_failures WHERE k = ?', [$key]);
    $n = ($f && strtotime($f['last_at'] . ' UTC') > time() - 86400) ? (int)$f['n'] + 1 : 1;
    q('INSERT INTO login_failures (k, n, last_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE n = VALUES(n), last_at = VALUES(last_at)', [$key, $n, now()]);
}
function throttle_reset(string $key): void { q('DELETE FROM login_failures WHERE k = ?', [$key]); }
function throttle_purge(): void { q('DELETE FROM login_failures WHERE last_at < ?', [gmdate('Y-m-d H:i:s', time() - 86400)]); }

/* ---------- Sessions ---------- */
function cookie_name(): string { return isHttps() ? '__Host-lr_session' : 'lr_session'; }   // « __Host- » : le navigateur refuse tout cookie non sécurisé ou venant d'un sous-domaine

function set_session_cookie(string $value, int $maxAge): void {
    setcookie(cookie_name(), $value, [
        'expires' => $maxAge > 0 ? time() + $maxAge : time() - 3600, 'path' => '/',
        'secure' => isHttps(), 'httponly' => true, 'samesite' => 'Strict',
    ]);
}

function session_create(string $userId): string {
    $token = newToken();
    q('INSERT INTO sessions (token, user_id, created_at, last_seen, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [hashToken($token), $userId, now(), now(), gmdate('Y-m-d H:i:s', time() + SESSION_MAX_DAYS * 86400), mb_substr(clientIp(), 0, 45), mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 190)]);
    q('DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?', [now(), gmdate('Y-m-d H:i:s', time() - SESSION_IDLE_DAYS * 86400)]);
    set_session_cookie($token, SESSION_MAX_DAYS * 86400);
    return $token;
}

function authorizationHeader(): string {
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $k) if (!empty($_SERVER[$k])) return (string)$_SERVER[$k];
    if (function_exists('getallheaders')) foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') return (string)$v;
    return '';
}

// Clé d'accès présentée dans l'EN-TÊTE de la requête (jamais dans l'adresse) : « Authorization: Bearer lr_… » ou « X-API-Key: lr_… ».
function api_key_from_headers(): ?string {
    if (preg_match('/^Bearer\s+(\S+)$/i', authorizationHeader(), $m)) return $m[1];
    if (!empty($_SERVER['HTTP_X_API_KEY'])) return trim((string)$_SERVER['HTTP_X_API_KEY']);
    return null;
}

const USER_COLS = 'u.id, u.name, u.role, u.must_change, u.email, u.auth_source';

// Qui fait la demande ? Clé d'accès (en-tête) ou cookie de session. Renvoie null si personne.
function currentUser(?string $apiKey = null): ?array {
    $key = $apiKey ?? api_key_from_headers();
    if ($key !== null) {
        if (!preg_match('/^lr_[0-9a-f]{64}$/', $key)) return null;
        $r = row('SELECT ' . USER_COLS . ', t.id AS token_id, t.scope, t.expires_at FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND u.active = 1', [hashToken($key)]);
        if (!$r || ($r['expires_at'] && $r['expires_at'] < now())) return null;
        q('UPDATE api_tokens SET last_used = ?, last_ip = ? WHERE id = ?', [now(), mb_substr(clientIp(), 0, 45), $r['token_id']]);
        return ['id' => $r['id'], 'name' => $r['name'], 'role' => $r['role'], 'viaToken' => true, 'scope' => $r['scope'], 'sessionHash' => '', 'mustChange' => false, 'email' => $r['email']];
    }
    $token = $_COOKIE[cookie_name()] ?? '';
    if (!is_string($token) || $token === '') return null;
    $hash = hashToken($token);
    $r = row('SELECT ' . USER_COLS . ' FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1 AND s.expires_at > ? AND s.last_seen > ?',
             [$hash, now(), gmdate('Y-m-d H:i:s', time() - SESSION_IDLE_DAYS * 86400)]);
    if (!$r) return null;
    q('UPDATE sessions SET last_seen = ? WHERE token = ? AND last_seen < ?', [now(), $hash, gmdate('Y-m-d H:i:s', time() - 3600)]);
    return ['id' => $r['id'], 'name' => $r['name'], 'role' => $r['role'], 'viaToken' => false, 'scope' => 'ecriture', 'sessionHash' => $hash, 'mustChange' => (bool)$r['must_change'], 'email' => $r['email']];
}

/* ---------- Connexion par mot de passe local ----------
 * Point d'entrée unique de la vérification d'identité. Pour brancher l'intranet LE ROY plus tard, il suffira d'ajouter un autre
 * fournisseur (jeton SSO signé → utilisateur identifié par users.auth_source + users.external_id) : les données de Projets,
 * les groupes et les droits ne changent pas. */
function login_local(string $name, string $password, ?string $userId = null): array {
    $name = trim($name);
    $ip = 'ip:' . clientIp();
    $uk = 'u:' . hash('sha256', mb_strtolower($userId ?? $name));
    foreach ([$ip, $uk] as $k) {
        $s = throttle_locked($k, $k === $ip ? 20 : 5);
        if ($s > 0) { audit('connexion.bloquee', 'user', null, "essais répétés ($name)", ['id' => null, 'name' => $name]); fail(429, 'Trop d\'essais. Patientez ' . ($s > 90 ? ceil($s / 60) . ' minutes' : $s . ' secondes') . ' avant de réessayer.'); }
    }
    $u = $userId !== null && $userId !== ''
        ? row("SELECT id, name, password_hash, auth_source FROM users WHERE id = ? AND active = 1", [$userId])
        : row("SELECT id, name, password_hash, auth_source FROM users WHERE name = ? AND active = 1", [$name]);
    // Même durée de calcul si le compte n'existe pas : on ne révèle pas quels noms existent.
    $hash = $u['password_hash'] ?? hashPwd('inconnu-' . $name);
    $ok = password_verify($password, $hash) && $u && $u['auth_source'] === 'local';
    if (!$ok) {
        throttle_fail($uk); throttle_fail($ip);
        audit('connexion.echec', 'user', $u['id'] ?? null, 'mot de passe ou compte incorrect', ['id' => $u['id'] ?? null, 'name' => $u['name'] ?? $name]);
        fail(401, 'Nom ou mot de passe incorrect.');
    }
    throttle_reset($uk);
    if (password_needs_rehash($u['password_hash'], PASSWORD_BCRYPT, ['cost' => 11])) q('UPDATE users SET password_hash = ? WHERE id = ?', [hashPwd($password), $u['id']]);
    q('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), $u['id']]);
    throttle_purge();
    session_create($u['id']);
    audit('connexion.ok', 'user', $u['id'], '', ['id' => $u['id'], 'name' => $u['name']]);
    return ['id' => $u['id'], 'name' => $u['name']];
}

function login_must_https(): void {
    if (!isHttps() && !in_array(clientIp(), ['127.0.0.1', '::1'], true)) fail(403, 'Connexion refusée : utilisez la version sécurisée (https) du site.', 'https');
}
