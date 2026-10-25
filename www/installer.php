<?php
// Page d'installation : vérifie l'hébergement, prépare la base de données et crée le compte administrateur.
// À ouvrir une seule fois dans le navigateur (https://votre-site/installer.php), puis à SUPPRIMER de l'hébergement.
declare(strict_types=1);
require __DIR__ . '/api/lib.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

$etapes = [];   // [ok(bool), texte]
$stop = false;
$etapes[] = [version_compare(PHP_VERSION, '8.1.0', '>='), 'Version de PHP : ' . PHP_VERSION . (version_compare(PHP_VERSION, '8.1.0', '>=') ? '' : ' — il faut PHP 8.1 ou plus (Manager OVH → Hébergement → Configuration → Version de PHP).')];
foreach (['pdo_mysql', 'mbstring', 'json'] as $ext) $etapes[] = [extension_loaded($ext), "Extension PHP « $ext »"];
$stop = in_array(false, array_column($etapes, 0), true);

$message = ''; $admin = null; $pret = false; $dejaInstalle = false;
if (!$stop) {
    if (!is_file(__DIR__ . '/config.php')) {
        $etapes[] = [false, "Le fichier config.php est absent. Copiez config.exemple.php en config.php, remplissez-le (voir le guide), puis rechargez cette page."];
        $stop = true;
    } else {
        try {
            db();
            $etapes[] = [true, 'Connexion à la base de données'];
            migrer();
            $etapes[] = [true, 'Tables de la base prêtes'];
        } catch (Throwable $e) {
            $msg = $e instanceof HttpError ? $e->getMessage() : 'Erreur : ' . $e->getMessage();
            $etapes[] = [false, $msg];
            $stop = true;
        }
    }
}

if (!$stop) {
    $dejaInstalle = (int)val('SELECT COUNT(*) FROM users') > 0;
    if (!$dejaInstalle && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $nom = trim((string)($_POST['nom'] ?? ''));
        $mdp = (string)($_POST['mdp'] ?? '');
        if ($nom === '' || mb_strlen($nom) > 60) $message = 'Indiquez un nom (60 caractères maximum).';
        elseif (mb_strlen($mdp) < 8) $message = 'Choisissez un mot de passe d\'au moins 8 caractères.';
        elseif ($mdp !== (string)($_POST['mdp2'] ?? '')) $message = 'Les deux mots de passe ne sont pas identiques.';
        else {
            q('INSERT INTO users (id, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', [newId(), $nom, hashPwd($mdp), 'admin', now()]);
            setSetting('default_admin_password', '0');
            $dejaInstalle = true; $pret = true;
        }
    }
}
?><!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Installation — Projets Le Roy</title>
<style>
body{font-family:Arial,sans-serif;background:#F2F0EF;color:#232120;margin:0;padding:24px}
main{max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
h1{color:#C4122F;margin-top:0}ul{list-style:none;padding:0}li{padding:6px 0}.ok::before{content:"✅ "}.ko::before{content:"❌ "}
label{display:block;margin:12px 0 4px;font-weight:bold}input{width:100%;box-sizing:border-box;padding:10px;font-size:16px;border:1px solid #bbb;border-radius:6px}
button{margin-top:18px;background:#C4122F;color:#fff;border:0;border-radius:6px;padding:12px 20px;font-size:16px;cursor:pointer}
.err{background:#fdecec;border:1px solid #C4122F;padding:10px;border-radius:6px;margin-top:14px}.bon{background:#e8f5ee;border:1px solid #2E8C76;padding:12px;border-radius:6px;margin-top:14px}
</style></head><body><main>
<h1>Projets Le Roy — installation</h1>
<ul><?php foreach ($etapes as [$ok, $txt]): ?><li class="<?= $ok ? 'ok' : 'ko' ?>"><?= $h($txt) ?></li><?php endforeach; ?></ul>
<?php if ($stop): ?>
  <p class="err">Corrigez le point ci-dessus, puis rechargez cette page.</p>
<?php elseif ($pret): ?>
  <p class="bon"><b>Installation terminée.</b> Le compte administrateur « <?= $h($nom) ?> » est créé.<br>
  <b>Dernière étape importante :</b> supprimez le fichier <code>installer.php</code> de l'hébergement, puis <a href="/">ouvrez l'application</a>.</p>
<?php elseif ($dejaInstalle): ?>
  <p class="bon">Tout est prêt : l'application est déjà installée. Supprimez le fichier <code>installer.php</code> de l'hébergement, puis <a href="/">ouvrez l'application</a>.</p>
<?php else: ?>
  <p>Dernière étape : créez le compte de l'administrateur (vous).</p>
  <?php if ($message): ?><p class="err"><?= $h($message) ?></p><?php endif; ?>
  <form method="post" autocomplete="off">
    <label for="nom">Votre nom</label><input id="nom" name="nom" required maxlength="60" value="<?= $h($_POST['nom'] ?? '') ?>">
    <label for="mdp">Mot de passe (8 caractères minimum)</label><input id="mdp" name="mdp" type="password" required minlength="8">
    <label for="mdp2">Mot de passe, une seconde fois</label><input id="mdp2" name="mdp2" type="password" required minlength="8">
    <button type="submit">Créer le compte et terminer</button>
  </form>
<?php endif; ?>
</main></body></html>
