<?php
// Comptes, clés d'accès, sécurité, journal, sauvegardes.
declare(strict_types=1);

function routes_admin(callable $add): void {
    $add('POST', '/api/password', 'user', 'r_password', ['free', 'nokey']);
    $add('POST', '/api/users', 'admin', 'r_user_create', ['notify']);
    $add('PUT', '/api/users/{id}', 'admin', 'r_user_update', ['notify']);
    $add('PUT', '/api/moi', 'user', 'r_moi', ['nokey']);

    $add('GET', '/api/tokens', 'user', 'r_tokens');
    $add('POST', '/api/tokens', 'user', 'r_token_create', ['nokey']);
    $add('DELETE', '/api/tokens/{id}', 'user', 'r_token_delete', ['nokey']);

    $add('POST', '/api/connecteur', 'admin', 'r_connecteur');
    $add('GET', '/api/securite', 'admin', 'r_securite');
    $add('POST', '/api/securite/liste-comptes', 'admin', 'r_liste_comptes');
    $add('GET', '/api/securite/cles', 'admin', 'r_admin_tokens');
    $add('DELETE', '/api/securite/cles/{id}', 'admin', 'r_admin_token_revoke');
    $add('POST', '/api/securite/deconnecter/{id}', 'admin', 'r_user_logout_all');
    $add('GET', '/api/audit', 'admin', 'r_audit');
    $add('GET', '/api/sauvegardes', 'admin', 'r_backups');
    $add('POST', '/api/sauvegarde', 'admin', 'r_backup_download');
}

function activeAdmins(): int { return (int)val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1"); }
function valid_email(mixed $e): ?string {
    $e = is_string($e) ? trim($e) : '';
    if ($e === '') return null;
    if (mb_strlen($e) > 190 || !filter_var($e, FILTER_VALIDATE_EMAIL)) fail(400, 'Adresse e-mail invalide.');
    return $e;
}

/* =====================  COMPTES  ===================== */
function r_password(array $c): array {
    $me = $c['me']; $b = $c['b'];
    $u = row('SELECT password_hash, role, auth_source FROM users WHERE id = ?', [$me['id']]);
    if ($u['auth_source'] !== 'local') fail(400, 'Ce compte est géré par un autre service d\'authentification.');
    $k = 'pw:' . $me['id'];
    if (($s = throttle_locked($k, 5)) > 0) fail(429, "Trop d'essais. Patientez $s secondes.");
    if (!is_string($b['oldPassword'] ?? null) || !password_verify($b['oldPassword'], $u['password_hash'])) {
        throttle_fail($k); audit('mot_de_passe.echec', 'user', $me['id'], 'ancien mot de passe incorrect');
        fail(400, 'Le mot de passe actuel ne correspond pas.');
    }
    throttle_reset($k);
    $new = check_password($b['newPassword'] ?? null, $me['name'], 'Le nouveau mot de passe');
    if (password_verify($new, $u['password_hash'])) fail(400, "Le nouveau mot de passe doit être différent de l'ancien.");
    q('UPDATE users SET password_hash = ?, must_change = 0, password_changed_at = ? WHERE id = ?', [hashPwd($new), now(), $me['id']]);
    // Les autres appareils connectés à ce compte devront se reconnecter.
    q('DELETE FROM sessions WHERE user_id = ? AND token <> ?', [$me['id'], $me['sessionHash']]);
    audit('mot_de_passe.change', 'user', $me['id']);
    return ['ok' => true];
}

// Préférences personnelles : adresse e-mail, résumé quotidien.
function r_moi(array $c): array {
    $b = $c['b'];
    $email = array_key_exists('email', $b) ? valid_email($b['email']) : null;
    $sets = []; $p = [];
    if (array_key_exists('email', $b)) { $sets[] = 'email = ?'; $p[] = $email; }
    if (array_key_exists('notifyDaily', $b)) { $sets[] = 'notify_daily = ?'; $p[] = !empty($b['notifyDaily']) ? 1 : 0; }
    if ($sets) { $p[] = $c['me']['id']; q('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $p); }
    return ['ok' => true];
}

function r_user_create(array $c): array {
    $b = $c['b'];
    $name = str($b['name'] ?? null, 60, 'Le nom', true);
    $password = check_password($b['password'] ?? null, $name);
    $role = ($b['role'] ?? '') === 'admin' ? 'admin' : 'user';
    $email = valid_email($b['email'] ?? null);
    if (val('SELECT 1 FROM users WHERE name = ?', [$name]) !== null) fail(400, 'Ce nom est déjà utilisé.');
    $id = newId();
    tx(function () use ($id, $name, $password, $role, $email) {
        // Mot de passe provisoire : la personne devra en choisir un autre dès sa première connexion.
        q('INSERT INTO users (id, name, password_hash, role, email, must_change, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)', [$id, $name, hashPwd($password), $role, $email, now()]);
        if ($role === 'user') {
            // Chaque utilisateur reçoit son groupe privé « Perso » (dont il est responsable).
            $n = (int)val('SELECT COUNT(*) FROM groupes');
            $gid = newId();
            $pos = (int)val('SELECT COALESCE(MAX(position), 0) + 1 FROM groupes');
            q('INSERT INTO groupes (id, name, icon, color, position, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [$gid, 'Perso', '🏡', GROUP_COLORS[2 + ($n % 4)], $pos, now(), $id]);
            q("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'responsable')", [$gid, $id]);
        }
        audit('compte.cree', 'user', $id, "$name ($role)");
    });
    return ['id' => $id];
}

// Modifier un compte : nom, rôle, actif, e-mail, nouveau mot de passe (facultatif).
function r_user_update(array $c): array {
    $me = $c['me']; $b = $c['b'];
    $u = getUser($c['p']['id']);
    if (!$u) fail(404, "Ce compte n'existe plus.");
    $name = array_key_exists('name', $b) ? str($b['name'], 60, 'Le nom', true) : $u['name'];
    $role = array_key_exists('role', $b) ? ($b['role'] === 'admin' ? 'admin' : 'user') : $u['role'];
    $active = array_key_exists('active', $b) ? (empty($b['active']) ? 0 : 1) : (int)$u['active'];
    $email = array_key_exists('email', $b) ? valid_email($b['email']) : $u['email'];
    if (val('SELECT 1 FROM users WHERE name = ? AND id <> ?', [$name, $u['id']]) !== null) fail(400, 'Ce nom est déjà utilisé.');
    if ($u['id'] === $me['id'] && !$active) fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
    if ($u['id'] === $me['id'] && $role !== 'admin') fail(400, 'Vous ne pouvez pas retirer vos propres droits d\'administrateur.');
    $removesAdmin = $u['role'] === 'admin' && $u['active'] && ($role !== 'admin' || !$active);
    if ($removesAdmin && activeAdmins() <= 1) fail(400, 'Il faut garder au moins un administrateur actif.');
    $password = !empty($b['password']) ? check_password($b['password'], $name, 'Le nouveau mot de passe') : null;
    tx(function () use ($u, $name, $role, $active, $email, $password, $me) {
        q('UPDATE users SET name = ?, role = ?, active = ?, email = ? WHERE id = ?', [$name, $role, $active, $email, $u['id']]);
        if ($password) q('UPDATE users SET password_hash = ?, must_change = 1, password_changed_at = ? WHERE id = ?', [hashPwd($password), now(), $u['id']]);
        // Nouveau mot de passe ou compte désactivé : ses appareils sont déconnectés.
        if ($password || !$active) q('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
        if (!$active) q('DELETE FROM api_tokens WHERE user_id = ?', [$u['id']]);
        $d = [];
        if ($name !== $u['name']) $d[] = "nom : {$u['name']} → $name";
        if ($role !== $u['role']) $d[] = "rôle : {$u['role']} → $role";
        if ((int)$u['active'] !== $active) $d[] = $active ? 'réactivé' : 'désactivé';
        if ($password) $d[] = 'mot de passe réinitialisé';
        if (($u['email'] ?? null) !== $email) $d[] = 'e-mail modifié';
        if ($d) audit($password ? 'compte.mot_de_passe_reinitialise' : 'compte.modifie', 'user', $u['id'], implode(' ; ', $d));
    });
    return ['ok' => true];
}

function r_user_logout_all(array $c): array {
    $u = getUser($c['p']['id']);
    if (!$u) fail(404, "Ce compte n'existe plus.");
    $n = q('DELETE FROM sessions WHERE user_id = ?', [$u['id']])->rowCount();
    audit('compte.deconnecte', 'user', $u['id'], "$n session(s) fermée(s)");
    return ['sessions' => $n];
}

/* =====================  CLÉS D'ACCÈS (Claude, ChatGPT…) =====================
 * La clé ne circule que dans l'en-tête « Authorization: Bearer lr_… » (ou « X-API-Key »), jamais dans une adresse. */
function r_tokens(array $c): array {
    return ['tokens' => rows('SELECT id, name, scope, prefix, created_at AS createdAt, last_used AS lastUsed, expires_at AS expiresAt FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC', [$c['me']['id']])];
}
function r_token_create(array $c): array {
    $name = str($c['b']['name'] ?? null, 60, 'Le nom de la clé') ?: 'Claude';
    $scope = ($c['b']['scope'] ?? 'ecriture') === 'lecture' ? 'lecture' : 'ecriture';
    $days = max(1, min(TOKEN_DEFAULT_DAYS, (int)($c['b']['days'] ?? 90)));
    if ((int)val('SELECT COUNT(*) FROM api_tokens WHERE user_id = ?', [$c['me']['id']]) >= 10) fail(400, 'Vous avez déjà 10 clés : supprimez-en une.');
    $token = 'lr_' . newToken();
    $exp = gmdate('Y-m-d H:i:s', time() + $days * 86400);
    $id = newId();
    q('INSERT INTO api_tokens (id, user_id, name, token_hash, created_at, scope, expires_at, prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [$id, $c['me']['id'], $name, hashToken($token), now(), $scope, $exp, substr($token, 0, 11)]);
    audit('cle.creee', 'token', $id, "$name ($scope, $days j)");
    return ['token' => $token, 'id' => $id, 'expiresAt' => $exp, 'scope' => $scope]; // affichée une seule fois
}
function r_token_delete(array $c): array {
    $n = q('DELETE FROM api_tokens WHERE id = ? AND user_id = ?', [$c['p']['id'], $c['me']['id']])->rowCount();
    if (!$n) fail(404, "Cette clé n'existe plus.");
    audit('cle.supprimee', 'token', $c['p']['id']);
    return ['ok' => true];
}
function r_admin_tokens(array $c): array {
    return ['tokens' => rows('SELECT t.id, t.name, t.scope, t.prefix, t.created_at AS createdAt, t.last_used AS lastUsed, t.last_ip AS lastIp, t.expires_at AS expiresAt, u.name AS userName
        FROM api_tokens t JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC')];
}
function r_admin_token_revoke(array $c): array {
    $n = q('DELETE FROM api_tokens WHERE id = ?', [$c['p']['id']])->rowCount();
    if (!$n) fail(404, "Cette clé n'existe plus.");
    audit('cle.revoquee', 'token', $c['p']['id']);
    return ['ok' => true];
}

function r_connecteur(array $c): array {
    $on = !empty($c['b']['actif']);
    setSetting('connecteur_internet', $on ? '1' : '0');
    audit($on ? 'connecteur.active' : 'connecteur.desactive', 'setting', 'connecteur_internet');
    return ['actif' => $on];
}
function r_liste_comptes(array $c): array {
    $on = !empty($c['b']['actif']);
    setSetting('login_liste_comptes', $on ? '1' : '0');
    audit($on ? 'connexion.liste_visible' : 'connexion.liste_masquee', 'setting', 'login_liste_comptes');
    return ['actif' => $on];
}

/* =====================  SÉCURITÉ, JOURNAL, SAUVEGARDES  ===================== */
function webroot(): string { return realpath(dirname(__DIR__)) ?: dirname(__DIR__); }

// Points de vigilance affichés à l'administrateur.
function security_warnings(): array {
    $w = [];
    $root = webroot();
    $cfg = config_optional();
    if (is_file("$root/installer.php")) $w[] = ['niveau' => 'critique', 'texte' => "Le fichier installer.php est encore sur le site : supprimez-le."];
    if (!isHttps()) $w[] = ['niveau' => 'critique', 'texte' => "Le site est consulté sans https : les mots de passe ne sont pas protégés."];
    if (isset($cfg['_file']) && path_inside($cfg['_file'], $root)) $w[] = ['niveau' => 'important', 'texte' => "config.php est dans le dossier public : déplacez-le dans le dossier « config » à côté du site (voir le guide)."];
    if (path_inside(data_dir(), $root)) $w[] = ['niveau' => 'critique', 'texte' => "Le dossier des données et sauvegardes est dans le dossier public : déplacez-le hors du site."];
    if (empty($cfg['maintenance_key']) || strlen((string)$cfg['maintenance_key']) < 32) $w[] = ['niveau' => 'info', 'texte' => "Aucune clé de maintenance (32 caractères minimum) dans config.php : les mises à jour de la base ne seront possibles qu'en ligne de commande."];
    $b = backup_status();
    if (empty($b['dernier_ok'])) $w[] = ['niveau' => 'important', 'texte' => "Aucune sauvegarde automatique n'a encore été faite : configurez la tâche planifiée (voir le guide de sauvegarde)."];
    elseif (strtotime(str_replace(' UTC', '', $b['dernier_ok']) . ' UTC') < time() - 36 * 3600) $w[] = ['niveau' => 'important', 'texte' => 'La dernière sauvegarde réussie date de plus de 36 heures (' . $b['dernier_ok'] . ').'];
    if (!empty($b['dernier_echec'])) $w[] = ['niveau' => 'important', 'texte' => 'Dernier échec de sauvegarde : ' . $b['dernier_echec'] . ' — ' . ($b['message'] ?? '')];
    if (!backup_public_key()) $w[] = ['niveau' => 'info', 'texte' => "Les sauvegardes ne sont pas chiffrées : ajoutez la clé publique du serveur interne (backup_public_key) dans config.php."];
    return $w;
}

function r_securite(array $c): array {
    $b = backup_status();
    return [
        'listeComptes' => getSetting('login_liste_comptes') === '1',
        'https' => isHttps(),
        'schema' => schema_state(),
        'sauvegarde' => ['dernierOk' => $b['dernier_ok'] ?? null, 'dernierEchec' => $b['dernier_echec'] ?? null, 'message' => $b['message'] ?? null, 'fichier' => $b['dernier_fichier'] ?? null, 'chiffree' => backup_public_key() !== null],
        'alertes' => security_warnings(),
        'sessions' => (int)val('SELECT COUNT(*) FROM sessions WHERE expires_at > ?', [now()]),
        'echecs24h' => (int)val("SELECT COUNT(*) FROM audit_log WHERE action = 'connexion.echec' AND at > ?", [gmdate('Y-m-d H:i:s', time() - 86400)]),
    ];
}

function r_audit(array $c): array {
    $q = $c['q']; $w = ['1 = 1']; $p = [];
    if (!empty($q['action'])) { $w[] = 'action LIKE ?'; $p[] = preg_replace('/[^a-z_.]/', '', (string)$q['action']) . '%'; }
    if (!empty($q['q'])) { $w[] = '(detail LIKE ? OR user_name LIKE ?)'; $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], (string)$q['q']) . '%'; $p[] = $like; $p[] = $like; }
    if (!empty($q['avant'])) { $w[] = 'id < ?'; $p[] = (int)$q['avant']; }
    $limit = max(1, min(500, (int)($q['limite'] ?? 100)));
    return ['events' => rows('SELECT id, at, user_id AS userId, user_name AS userName, ip, action, target_type AS targetType, target_id AS targetId, detail FROM audit_log WHERE ' . implode(' AND ', $w) . ' ORDER BY id DESC LIMIT ' . $limit, $p)];
}

function r_backups(array $c): array {
    $out = [];
    foreach (array_slice(array_reverse(glob(backup_dir() . '/projets-*.manifest.json') ?: []), 0, 30) as $f) {
        $m = json_decode((string)file_get_contents($f), true) ?: [];
        $out[] = ['fichier' => $m['file'] ?? basename($f), 'date' => $m['created_at'] ?? null, 'raison' => $m['reason'] ?? null, 'octets' => $m['bytes'] ?? null, 'chiffree' => !empty($m['encrypted']), 'verifiee' => !empty($m['verified']), 'schema' => $m['schema_version'] ?? null];
    }
    return ['sauvegardes' => $out, 'statut' => backup_status()];
}

// Téléchargement d'une sauvegarde complète (.sql.gz) : l'administrateur doit retaper son mot de passe ; l'export est écrit en flux.
function r_backup_download(array $c): array {
    $me = $c['me'];
    $u = row('SELECT password_hash FROM users WHERE id = ?', [$me['id']]);
    $k = 'bk:' . $me['id'];
    if (($s = throttle_locked($k, 3)) > 0) fail(429, "Trop d'essais. Patientez $s secondes.");
    if (!is_string($c['b']['password'] ?? null) || !password_verify($c['b']['password'], $u['password_hash'])) { throttle_fail($k); audit('sauvegarde.refusee', 'backup', null, 'mot de passe incorrect'); fail(403, 'Mot de passe incorrect.'); }
    throttle_reset($k);
    audit('sauvegarde.telechargee', 'backup', null, 'export complet');
    return ['__stream' => ['type' => 'application/gzip', 'filename' => 'projets-le-roy-' . gmdate('Ymd-His') . '.sql.gz', 'fn' => function () {
        backup_stream_gzip(db(), ['created_at' => now() . ' UTC', 'reason' => 'telechargement', 'schema_version' => (int)(getSetting('schema_version') ?? 0)]);
    }]];
}
