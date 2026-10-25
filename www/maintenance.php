<?php
// Maintenance : mise à jour VOLONTAIRE de la base de données, sauvegarde immédiate, récupération d'un accès administrateur.
// Protégée par la clé de maintenance de config.php. Une mise à jour de la base est toujours précédée d'une sauvegarde vérifiée :
// si la sauvegarde échoue, la base n'est pas modifiée.
declare(strict_types=1);
require __DIR__ . '/api/lib.php';
require __DIR__ . '/api/webtool.php';

$erreur = webtool_check_key();
webtool_page_start('Maintenance');
if ($erreur !== null) { webtool_key_form($erreur); webtool_page_end(); exit; }

$cle = (string)$_POST['cle'];
$action = (string)($_POST['action'] ?? '');
$resultat = null; $erreurAction = null;
try {
    db();
    if ($action === 'migrer') {
        $r = run_migrations('maintenance');
        $resultat = $r['from'] === $r['to'] ? 'La base est déjà à jour.' : 'Base mise à jour : version ' . $r['from'] . ' → ' . $r['to'] . '. Sauvegarde faite juste avant : ' . ($r['backup']['file'] ?? '(base vide, rien à sauvegarder)') . '.';
    } elseif ($action === 'sauvegarder') {
        $m = backup_create('manuelle');
        $resultat = 'Sauvegarde vérifiée : ' . $m['file'] . ' (' . number_format((int)$m['bytes'] / 1024, 0, ',', ' ') . ' Ko, ' . array_sum($m['tables']) . ' lignes, ' . ($m['encrypted'] ? 'chiffrée' : 'non chiffrée') . ').';
    } elseif ($action === 'reinitialiser' && schema_state()['state'] === 'ok') {
        $u = row("SELECT id, name FROM users WHERE id = ? AND role = 'admin'", [(string)($_POST['admin'] ?? '')]);
        if (!$u) throw new RuntimeException('Administrateur introuvable.');
        $tmp = bin2hex(random_bytes(9));   // 18 caractères aléatoires, affichés une seule fois
        q('UPDATE users SET password_hash = ?, must_change = 1, active = 1, password_changed_at = ? WHERE id = ?', [hashPwd($tmp), now(), $u['id']]);
        q('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
        throttle_reset('u:' . hash('sha256', mb_strtolower($u['name']))); throttle_reset('u:' . hash('sha256', mb_strtolower($u['id'])));
        audit('admin.mot_de_passe_reinitialise', 'user', $u['id'], 'via maintenance.php', ['id' => null, 'name' => 'maintenance']);
        $resultat = "Mot de passe provisoire de « {$u['name']} » : " . $tmp . " — notez-le maintenant (il ne sera plus affiché) ; il devra être changé à la prochaine connexion.";
    }
} catch (Throwable $e) { $erreurAction = $e instanceof HttpError ? $e->getMessage() : 'Erreur : ' . $e->getMessage(); }

$s = schema_state();
$etat = ['absent' => ['ko', "La base n'est pas installée : ouvrez installer.php."], 'ancien' => ['w', 'La base est en retard sur le code : une mise à jour est nécessaire.'],
    'ok' => ['ok', 'La base est à jour.'], 'recent' => ['w', 'La base est plus récente que ce code, mais compatible.'], 'incompatible' => ['ko', 'La base est plus récente que ce code et incompatible : redéployez le code le plus récent.']][$s['state']];
if ($resultat) echo '<p class="bon">' . h($resultat) . '</p>';
if ($erreurAction) echo '<p class="err">' . h($erreurAction) . '</p>';
echo '<ul><li class="' . $etat[0] . '">' . h($etat[1]) . ' (version ' . $s['version'] . ' sur ' . $s['target'] . ')</li>';
$b = backup_status();
echo '<li class="' . (empty($b['dernier_ok']) ? 'w' : 'ok') . '">Dernière sauvegarde réussie : ' . h($b['dernier_ok'] ?? 'aucune') . (!empty($b['dernier_fichier']) ? ' (' . h($b['dernier_fichier']) . ')' : '') . '</li>';
if (!empty($b['dernier_echec'])) echo '<li class="ko">Dernier échec : ' . h($b['dernier_echec']) . ' — ' . h($b['message'] ?? '') . '</li>';
echo '</ul>';
$f = fn(string $a, string $label, string $cls = '') => '<form method="post" style="display:inline"><input type="hidden" name="cle" value="' . h($cle) . '"><input type="hidden" name="action" value="' . $a . '"><button class="' . $cls . '" type="submit">' . h($label) . '</button></form>';
if ($s['state'] === 'ancien') echo '<p>Cliquer sur le bouton ci-dessous fait d\'abord une <b>sauvegarde vérifiée</b>, puis met la base à jour. Si la sauvegarde échoue, rien n\'est modifié.</p>' . $f('migrer', 'Sauvegarder puis mettre à jour la base');
if ($s['state'] === 'ok' || $s['state'] === 'recent') echo $f('sauvegarder', 'Faire une sauvegarde maintenant', 's');
if ($s['state'] === 'ok') {
    echo '<hr><h2 style="font-size:17px">Retrouver un accès administrateur</h2><p>Génère un mot de passe provisoire (affiché une seule fois) pour un administrateur qui n\'arrive plus à se connecter.</p>'
       . '<form method="post"><input type="hidden" name="cle" value="' . h($cle) . '"><input type="hidden" name="action" value="reinitialiser"><label for="admin">Administrateur</label><select id="admin" name="admin" style="padding:9px;font-size:15px">';
    foreach (rows("SELECT id, name FROM users WHERE role = 'admin' ORDER BY name") as $a) echo '<option value="' . h($a['id']) . '">' . h($a['name']) . '</option>';
    echo '</select><br><button class="s" type="submit">Réinitialiser son mot de passe</button></form>';
}
webtool_page_end();
