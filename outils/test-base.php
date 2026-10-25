<?php
// Aide pour les tests automatiques (jamais utilisée en production).
//   php outils/test-base.php create <base>   crée une base vide
//   php outils/test-base.php drop <base>     la supprime
//   php outils/test-base.php admin           prépare la base LR_DB_NAME et y crée Administrateur / admin
//   php outils/test-base.php sql "<ordre>"   exécute un ordre SQL sur la base LR_DB_NAME
declare(strict_types=1);
require dirname(__DIR__) . '/www/api/lib.php';

$cmd = $argv[1] ?? '';
$host = getenv('LR_DB_HOST') ?: '127.0.0.1';
$dsn = 'mysql:host=' . $host . (getenv('LR_DB_PORT') ? ';port=' . getenv('LR_DB_PORT') : '') . ';charset=utf8mb4';
if ($cmd === 'create' || $cmd === 'drop') {
    $name = preg_replace('/[^a-zA-Z0-9_]/', '', $argv[2] ?? '');
    $pdo = new PDO($dsn, getenv('LR_DB_USER') ?: 'root', getenv('LR_DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec($cmd === 'create' ? "CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" : "DROP DATABASE IF EXISTS `$name`");
} elseif ($cmd === 'admin') {
    migrer();
    q('INSERT INTO users (id, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', [newId(), 'Administrateur', password_hash('admin', PASSWORD_BCRYPT), 'admin', now()]);
} elseif ($cmd === 'sql') {
    db()->exec($argv[2] ?? '');
} else {
    fwrite(STDERR, "Commande inconnue\n"); exit(1);
}
