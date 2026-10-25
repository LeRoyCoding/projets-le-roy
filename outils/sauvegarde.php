<?php
// Sauvegarde vérifiée de la base (à lancer chaque jour par la tâche planifiée CRON de l'hébergement).
//   php outils/sauvegarde.php [--raison=quotidienne] [--garder=10]
// Écrit dans le dossier « data/sauvegardes » (hors du site public), chiffre si backup_public_key est configurée,
// vérifie le fichier, supprime les plus anciens fichiers locaux (le serveur interne garde l'historique long)
// et envoie un e-mail d'alerte (alert_email) en cas d'échec. Code de sortie 0 = succès.
require __DIR__ . '/_cli.php';
[$o] = cli_args($argv);
try {
    $m = backup_create((string)($o['raison'] ?? 'quotidienne'));
    $removed = backup_prune(max(3, (int)($o['garder'] ?? 10)));
    audit('sauvegarde.ok', 'backup', null, $m['file'] . ' (' . array_sum($m['tables']) . ' lignes' . ($m['encrypted'] ? ', chiffrée' : ', NON chiffrée') . ')', ['id' => null, 'name' => 'cron']);
    echo date('c') . " OK {$m['file']} " . $m['bytes'] . " octets, " . array_sum($m['tables']) . " lignes" . ($removed ? ', anciens fichiers supprimés : ' . count($removed) : '') . "\n";
} catch (Throwable $e) {
    alert_mail('ÉCHEC de la sauvegarde', $e->getMessage() . "\nLa base n'a pas été modifiée. Voir docs/sauvegardes.md.");
    audit('sauvegarde.echec', 'backup', null, mb_substr($e->getMessage(), 0, 400), ['id' => null, 'name' => 'cron']);
    cli_die(date('c') . ' ECHEC ' . $e->getMessage());
}
