<?php
// Installation initiale : vérifie l'hébergement, crée les tables, crée le compte administrateur. UNE SEULE FOIS.
// Protégée par la clé de maintenance de config.php (voir api/webtool.php). Une fois l'application installée, cette page ne fait plus rien :
// supprimez-la quand même de l'hébergement. Pour retrouver un accès administrateur ensuite : maintenance.php ou outils/admin.php.
declare(strict_types=1);
require __DIR__ . '/api/lib.php';
require __DIR__ . '/api/webtool.php';

$erreur = webtool_check_key();
webtool_page_start('Installation');
if ($erreur !== null) { webtool_key_form($erreur); webtool_page_end(); exit; }

$etapes = [];
$etapes[] = [version_compare(PHP_VERSION, '8.1.0', '>='), 'Version de PHP : ' . PHP_VERSION . (version_compare(PHP_VERSION, '8.1.0', '>=') ? '' : ' — il faut PHP 8.1 ou plus.')];
foreach (['pdo_mysql', 'mbstring', 'json', 'openssl', 'zlib', 'ctype'] as $ext) $etapes[] = [extension_loaded($ext), "Extension PHP « $ext »"];
$stop = in_array(false, array_column($etapes, 0), true);
$cle = (string)$_POST['cle'];
$message = ''; $fini = false; $dejaInstalle = false;

if (!$stop) {
    try {
        db();
        $etapes[] = [true, 'Connexion à la base de données'];
        $etapes[] = [!path_inside(data_dir(), __DIR__), 'Dossier des données et sauvegardes hors du site public : ' . data_dir()];
        $etapes[] = [!isset(config_optional()['_file']) || !path_inside(config_optional()['_file'], __DIR__), 'Fichier config.php hors du site public' . (isset(config_optional()['_file']) && path_inside(config_optional()['_file'], __DIR__) ? ' (déplacez-le dans le dossier « config », voir le guide)' : '')];
    } catch (Throwable $e) {
        $etapes[] = [false, $e instanceof HttpError ? $e->getMessage() : 'Erreur : ' . $e->getMessage()]; $stop = true;
    }
}
if (!$stop) {
    $s = schema_state();
    $dejaInstalle = $s['state'] !== 'absent' && getSetting('installed_at') !== null;
    if (!$dejaInstalle && $s['state'] !== 'absent' && (int)val('SELECT COUNT(*) FROM users') > 0) $dejaInstalle = true;   // base déjà utilisée (reprise de données)
    if (!$dejaInstalle) {
        try { run_migrations('installation'); $etapes[] = [true, 'Tables de la base prêtes (version ' . schema_state()['version'] . ')']; }
        catch (Throwable $e) { $etapes[] = [false, $e->getMessage()]; $stop = true; }
    }
}
if (!$stop && !$dejaInstalle && ($_POST['action'] ?? '') === 'creer') {
    $nom = trim((string)($_POST['nom'] ?? ''));
    $mdp = (string)($_POST['mdp'] ?? '');
    if ($nom === '' || mb_strlen($nom) > 60) $message = 'Indiquez un nom (60 caractères maximum).';
    elseif (($p = password_problem($mdp, $nom)) !== null) $message = $p;
    elseif ($mdp !== (string)($_POST['mdp2'] ?? '')) $message = 'Les deux mots de passe ne sont pas identiques.';
    else {
        $id = newId();
        q("INSERT INTO users (id, name, password_hash, role, must_change, password_changed_at, created_at) VALUES (?, ?, ?, 'admin', 0, ?, ?)", [$id, $nom, hashPwd($mdp), now(), now()]);
        setSetting('installed_at', now());
        audit('installation.admin_cree', 'user', $id, $nom, ['id' => $id, 'name' => $nom]);
        $dejaInstalle = true; $fini = true;
    }
}

echo '<ul>';
foreach ($etapes as [$ok, $txt]) echo '<li class="' . ($ok ? 'ok' : 'ko') . '">' . h($txt) . '</li>';
echo '</ul>';
if ($stop) echo '<p class="err">Corrigez le point ci-dessus, puis rechargez cette page (et ressaisissez la clé).</p>';
elseif ($fini) echo '<p class="bon"><b>Installation terminée.</b> Le compte administrateur « ' . h($nom) . ' » est créé.<br><b>Dernière étape :</b> supprimez le fichier <code>installer.php</code> de l\'hébergement, puis ouvrez le site.</p>';
elseif ($dejaInstalle) echo '<p class="bon">L\'application est déjà installée : cette page ne peut plus rien créer. Supprimez le fichier <code>installer.php</code> de l\'hébergement.<br>Pour une mise à jour de la base : <code>maintenance.php</code>.</p>';
else {
    echo '<p>Dernière étape : créez le compte de l\'administrateur (vous). Le mot de passe doit faire <b>' . PASSWORD_MIN . ' caractères minimum</b> : une phrase facile à retenir convient très bien.</p>';
    if ($message) echo '<p class="err">' . h($message) . '</p>';
    echo '<form method="post" autocomplete="off"><input type="hidden" name="cle" value="' . h($cle) . '"><input type="hidden" name="action" value="creer">'
       . '<label for="nom">Votre nom</label><input id="nom" name="nom" type="text" required maxlength="60" value="' . h($_POST['nom'] ?? '') . '">'
       . '<label for="mdp">Mot de passe</label><input id="mdp" name="mdp" type="password" required minlength="' . PASSWORD_MIN . '" autocomplete="new-password">'
       . '<label for="mdp2">Mot de passe, une seconde fois</label><input id="mdp2" name="mdp2" type="password" required minlength="' . PASSWORD_MIN . '" autocomplete="new-password">'
       . '<button type="submit">Créer le compte et terminer</button></form>';
}
webtool_page_end();
