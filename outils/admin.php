<?php
// Création / récupération d'un compte administrateur, en ligne de commande (accès SSH ou poste de développement).
//   php outils/admin.php creer "Nom"          → crée un administrateur avec un mot de passe provisoire aléatoire (affiché une seule fois)
//   php outils/admin.php reinitialiser "Nom"  → nouveau mot de passe provisoire pour un compte existant (et le réactive)
// Le mot de passe provisoire doit être changé à la première connexion. Toute action est inscrite dans le journal.
require __DIR__ . '/_cli.php';
[, $pos] = cli_args($argv);
$cmd = $pos[0] ?? ''; $nom = trim($pos[1] ?? '');
if (!in_array($cmd, ['creer', 'reinitialiser'], true) || $nom === '') cli_die("Usage : php outils/admin.php creer|reinitialiser \"Nom\"");
if (schema_state()['state'] !== 'ok') cli_die('La base n\'est pas à jour : lancez d\'abord php outils/migrer.php --appliquer');
$tmp = bin2hex(random_bytes(9));
if ($cmd === 'creer') {
    if (val('SELECT 1 FROM users WHERE name = ?', [$nom])) cli_die('Ce nom existe déjà.');
    $id = newId();
    q("INSERT INTO users (id, name, password_hash, role, must_change, created_at) VALUES (?, ?, ?, 'admin', 1, ?)", [$id, $nom, hashPwd($tmp), now()]);
    audit('compte.cree', 'user', $id, "$nom (admin, via ligne de commande)", ['id' => null, 'name' => 'cli']);
} else {
    $u = row('SELECT id FROM users WHERE name = ?', [$nom]);
    if (!$u) cli_die('Compte introuvable.');
    q('UPDATE users SET password_hash = ?, must_change = 1, active = 1, password_changed_at = ? WHERE id = ?', [hashPwd($tmp), now(), $u['id']]);
    q('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
    throttle_reset('u:' . hash('sha256', mb_strtolower($nom)));
    audit('compte.mot_de_passe_reinitialise', 'user', $u['id'], 'via ligne de commande', ['id' => null, 'name' => 'cli']);
}
echo "Mot de passe provisoire de « $nom » : $tmp\n(à changer dès la première connexion)\n";
