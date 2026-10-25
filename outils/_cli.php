<?php
// Préparation commune des outils en ligne de commande (SSH sur l'hébergement, ou serveur de test).
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Ligne de commande uniquement.\n"); }
ini_set('display_errors', '1');
require dirname(__DIR__) . '/www/api/lib.php';
if (!defined('APP_VERSION')) define('APP_VERSION', '3.0.0');

function cli_args(array $argv): array {
    $o = []; $pos = [];
    foreach (array_slice($argv, 1) as $a) {
        if (preg_match('/^--([a-z0-9-]+)(?:=(.*))?$/i', $a, $m)) $o[$m[1]] = $m[2] ?? true; else $pos[] = $a;
    }
    return [$o, $pos];
}
function cli_die(string $msg, int $code = 1): never { fwrite(STDERR, $msg . "\n"); exit($code); }
