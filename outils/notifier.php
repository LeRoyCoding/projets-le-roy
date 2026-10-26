<?php
// Résumé quotidien par e-mail (tâche planifiée, chaque matin) pour les personnes qui l'ont demandé dans « Compte ».
//   php outils/notifier.php [--simulation]
// Contenu : tâches en retard, échéances sous 3 jours, retards dans les groupes dont la personne est responsable, notifications non lues.
// Aucun e-mail n'est envoyé s'il n'y a rien à signaler. Réglages dans config.php : base_url (adresse du site), mail_from (expéditeur).
require __DIR__ . '/_cli.php';
[$o] = cli_args($argv);
if (schema_state()['state'] !== 'ok') cli_die('Base non prête.');
$cfg = config_optional(); $base = rtrim((string)($cfg['base_url'] ?? 'https://'), '/') ?: 'https://';
$from = (string)($cfg['mail_from'] ?? 'no-reply@' . (parse_url($base, PHP_URL_HOST) ?: 'localhost'));
$n = 0; $env = 0;
foreach (rows("SELECT id, name, email FROM users WHERE active = 1 AND notify_daily = 1 AND email IS NOT NULL AND email <> '' ORDER BY name") as $u) {
    $n++;
    $txt = digest_text($u, $base);
    if ($txt === null) continue;
    if (!empty($o['simulation'])) { echo "--- {$u['name']} <{$u['email']}>\n$txt\n"; $env++; continue; }
    $ok = function_exists('mail') && @mail($u['email'], '[Projets Le Roy] Votre résumé du ' . frd(todayIso()), $txt, "From: Projets Le Roy <$from>\r\nContent-Type: text/plain; charset=utf-8\r\n");
    if ($ok) $env++; else error_log("Résumé quotidien non envoyé à {$u['email']}");
}
echo date('c') . " OK : $n abonné(s), $env résumé(s) " . (empty($o['simulation']) ? 'envoyé(s)' : 'simulé(s)') . "\n";
