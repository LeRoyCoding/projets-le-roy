<?php
// Entretien quotidien (tâche planifiée) : vide la corbeille au-delà de 90 jours, efface les sessions et essais périmés,
// et prévient les personnes qui l'ont demandé des tâches en retard (voir outils/notifier.php).
//   php outils/entretien.php [--simulation]
require __DIR__ . '/_cli.php';
[$o] = cli_args($argv);
if (schema_state()['state'] !== 'ok') cli_die('Base non prête.');
$limite = gmdate('Y-m-d H:i:s', time() - (defined('CORBEILLE_JOURS') ? CORBEILLE_JOURS : 90) * 86400);
require_once dirname(__DIR__) . '/www/api/routes.php';
$old = rows('SELECT * FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?', [$limite]);
if (empty($o['simulation'])) foreach ($old as $t) purge_task($t);
$ses = empty($o['simulation']) ? q('DELETE FROM sessions WHERE expires_at < ?', [now()])->rowCount() : 0;
if (empty($o['simulation'])) throttle_purge();
echo date('c') . ' OK : ' . count($old) . ' tâche(s) ' . (empty($o['simulation']) ? 'purgée(s)' : 'à purger') . ", $ses session(s) expirée(s)\n";
