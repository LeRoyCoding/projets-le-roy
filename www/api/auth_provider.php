<?php
// Fournisseurs d'identité. Aujourd'hui : « local » (nom + mot de passe de Projets Le Roy).
// Demain : l'authentification de l'intranet LE ROY, SANS toucher aux données de Projets :
//   - un nouveau fournisseur renvoie une identité {source, external_id, name, email, admin} ;
//   - user_from_identity() la rattache à une ligne de la table « users » (clé : auth_source + external_id) ;
//   - groupes, tâches, droits par groupe, historique restent exactement les mêmes.
// Rien n'est branché sur l'intranet pour l'instant (volontairement).
declare(strict_types=1);

interface AuthProvider {
    public function name(): string;
    // Renvoie l'utilisateur de la requête en cours (même format que currentUser()) ou null.
    public function authenticate(): ?array;
}

final class LocalAuthProvider implements AuthProvider {
    public function name(): string { return 'local'; }
    public function authenticate(?string $apiKey = null): ?array { return currentUser($apiKey); }
}

function auth_provider(): AuthProvider {
    $n = (string)(config_optional()['auth_provider'] ?? 'local');
    if ($n === 'local') return new LocalAuthProvider();
    fail(500, "Fournisseur d'authentification inconnu : $n (seul « local » est disponible pour l'instant).");
}

// Crée un compte et, pour un utilisateur ordinaire, son groupe privé « Perso » (dont il est responsable).
function provision_user(string $name, string $role, string $passwordHash, ?string $email = null, string $source = 'local', ?string $externalId = null, bool $mustChange = true): string {
    $id = newId();
    q('INSERT INTO users (id, name, password_hash, role, email, must_change, auth_source, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [$id, $name, $passwordHash, $role, $email, $mustChange ? 1 : 0, $source, $externalId, now()]);
    if ($role === 'user') {
        $n = (int)val('SELECT COUNT(*) FROM groupes');
        $gid = newId();
        $pos = (int)val('SELECT COALESCE(MAX(position), 0) + 1 FROM groupes');
        q('INSERT INTO groupes (id, name, icon, color, position, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [$gid, 'Perso', '🏡', GROUP_COLORS[2 + ($n % 4)], $pos, now(), $id]);
        q("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'responsable')", [$gid, $id]);
    }
    return $id;
}

// Rattache une identité externe à un compte Projets (le crée à la première connexion). Un compte local existant n'est jamais « volé ».
// $identity : ['source' => 'intranet', 'external_id' => '…', 'name' => '…', 'email' => '…', 'admin' => bool]
function user_from_identity(array $identity, bool $allowAdmin = false): array {
    $source = (string)($identity['source'] ?? ''); $ext = (string)($identity['external_id'] ?? '');
    if ($source === '' || $source === 'local' || $ext === '') fail(400, 'Identité externe invalide.');
    $u = row('SELECT id, name, role, active FROM users WHERE auth_source = ? AND external_id = ?', [$source, $ext]);
    $email = ($identity['email'] ?? '') !== '' ? (string)$identity['email'] : null;
    if ($u) {
        if ($email !== null) q('UPDATE users SET email = ? WHERE id = ?', [$email, $u['id']]);
        return ['id' => $u['id'], 'name' => $u['name'], 'role' => $u['role'], 'active' => (bool)$u['active']];
    }
    $name = mb_substr(trim((string)($identity['name'] ?? '')), 0, 60) ?: "Utilisateur $ext";
    if (val('SELECT 1 FROM users WHERE name = ?', [$name]) !== null) $name = mb_substr($name, 0, 50) . " ($source)";
    $role = ($allowAdmin && !empty($identity['admin'])) ? 'admin' : 'user';
    $id = provision_user($name, $role, hashPwd(bin2hex(random_bytes(24))), $email, $source, $ext, false);   // mot de passe local inutilisable : l'accès passe par l'intranet
    audit('compte.cree', 'user', $id, "$name ($role, via $source)", ['id' => null, 'name' => $source]);
    return ['id' => $id, 'name' => $name, 'role' => $role, 'active' => true];
}
