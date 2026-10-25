<?php
// Restauration d'une sauvegarde — JAMAIS dans la base de production par défaut.
//   php outils/restaurer.php FICHIER [--cle-privee=cle.pem] [--cible=test]
//     FICHIER : .sql.gz (clair) ou .sql.gz.enc (chiffré ; son .manifest.json doit être à côté, et --cle-privee est obligatoire)
//     --cible=test        (par défaut) base d'essai « restore_test » de config.php : isolée de la production
//     --cible=production  écrase la base de production : exige --confirmer=NOM_DE_LA_BASE, et fait d'abord une sauvegarde de l'état actuel
// Après restauration, le nombre de lignes de chaque table est comparé à celui noté dans la sauvegarde.
require __DIR__ . '/_cli.php';
[$o, $pos] = cli_args($argv);
$file = $pos[0] ?? null;
if (!$file || !is_file($file)) cli_die('Usage : php outils/restaurer.php FICHIER [--cle-privee=cle.pem] [--cible=test|production --confirmer=NOM_BASE]');
$cfg = config();
$cible = (string)($o['cible'] ?? 'test');

// Fichier clair : déchiffrement si besoin.
$manifestFile = preg_replace('/\.sql\.gz(\.enc)?$/', '.manifest.json', $file);
$manifest = is_file($manifestFile) ? (json_decode((string)file_get_contents($manifestFile), true) ?: []) : [];
$plain = $file; $tmp = null;
if (str_ends_with($file, '.enc')) {
    if (empty($o['cle-privee']) || !is_file((string)$o['cle-privee'])) cli_die('Fichier chiffré : indiquez la clé privée avec --cle-privee=chemin.pem');
    if (empty($manifest['encryption'])) cli_die('Manifeste introuvable à côté du fichier chiffré : ' . $manifestFile);
    $tmp = sys_get_temp_dir() . '/lr-restore-' . bin2hex(random_bytes(4)) . '.sql.gz';
    try { backup_decrypt($file, $tmp, (string)file_get_contents((string)$o['cle-privee']), $manifest['encryption']); }
    catch (Throwable $e) { @unlink($tmp); cli_die('Déchiffrement impossible : ' . $e->getMessage()); }
    $plain = $tmp;
    echo "Déchiffrement et contrôle d'intégrité : OK\n";
}
register_shutdown_function(fn() => $tmp && @unlink($tmp));

if ($cible === 'production') {
    if (($o['confirmer'] ?? '') !== $cfg['db_name']) cli_die("Restauration en PRODUCTION : ajoutez --confirmer={$cfg['db_name']} pour confirmer.");
    echo "Sauvegarde de l'état actuel avant écrasement…\n";
    $pre = backup_create('avant-restauration', true);
    echo "  → {$pre['file']}\n";
    $pdo = db();
    $target = $cfg['db_name'];
} else {
    $t = $cfg['restore_test'] ?? null;
    if (!$t || empty($t['db_name'])) cli_die("Aucune base d'essai : ajoutez « restore_test » (db_host, db_name, db_user, db_pass) dans config.php, avec une base DIFFÉRENTE de la production.");
    if (($t['db_name'] === $cfg['db_name']) && (($t['db_host'] ?? $cfg['db_host']) === $cfg['db_host'])) cli_die('La base d\'essai est la base de production : refusé.');
    $pdo = db_connect($t + ['db_host' => $cfg['db_host']]);
    $target = $t['db_name'];
}
echo "Restauration dans la base « $target »…\n";
try {
    // On vide d'abord les tables de la base cible qui ne sont pas dans la sauvegarde (état propre).
    $r = backup_restore($plain, $pdo);
} catch (Throwable $e) { cli_die('ÉCHEC de la restauration : ' . $e->getMessage()); }
echo "  {$r['statements']} instructions rejouées.\n";

// Contrôle : lignes par table = lignes notées dans le manifeste (ou, à défaut, dans le fichier lui-même).
$expected = $manifest['tables'] ?? backup_verify_gz($plain, [])['counts'];
$got = backup_count_tables($pdo, array_keys($expected));
$bad = [];
foreach ($expected as $t => $n) if (($got[$t] ?? -1) !== (int)$n) $bad[] = "$t : {$got[$t]} au lieu de $n";
if ($bad) cli_die("CONTRÔLE ÉCHOUÉ : " . implode(' ; ', $bad));
echo 'Contrôle : ' . count($expected) . ' tables, ' . array_sum($got) . " lignes — identiques à la sauvegarde.\n";
echo $cible === 'production' ? "Production restaurée. Vérifiez l'application.\n" : "Restauration d'essai réussie (production non touchée).\n";
