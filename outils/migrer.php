<?php
// Mise à jour VOLONTAIRE de la structure de la base de données.
//   php outils/migrer.php             → affiche l'état (rien n'est modifié)
//   php outils/migrer.php --appliquer → sauvegarde vérifiée, puis migrations (refus si la sauvegarde échoue)
require __DIR__ . '/_cli.php';
[$o] = cli_args($argv);
$s = schema_state();
echo "Base : version {$s['version']} sur {$s['target']} — état : {$s['state']}\n";
if (empty($o['appliquer'])) { echo $s['state'] === 'ancien' ? "Une mise à jour est en attente. Lancez : php outils/migrer.php --appliquer\n" : "Rien à faire.\n"; exit(0); }
try {
    $r = run_migrations('cli');
    echo $r['from'] === $r['to'] ? "Déjà à jour.\n" : "OK : version {$r['from']} → {$r['to']}. Sauvegarde préalable : " . ($r['backup']['file'] ?? 'aucune (base vide)') . "\n";
} catch (Throwable $e) { cli_die('ÉCHEC : ' . $e->getMessage()); }
