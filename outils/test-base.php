<?php
// Aide pour les tests automatiques (jamais utilisée en production).
//   php outils/test-base.php create <base>   crée une base vide
//   php outils/test-base.php drop <base>     la supprime
//   php outils/test-base.php admin           prépare la base LR_DB_NAME (migrations) et y crée « Administrateur »
//   php outils/test-base.php migrate         applique les migrations (avec sauvegarde si la base contient déjà des données)
//   php outils/test-base.php sql "<ordre>"   exécute un ordre SQL sur la base LR_DB_NAME
declare(strict_types=1);
putenv('LR_TESTING=1');
require dirname(__DIR__) . '/www/api/lib.php';

const TEST_ADMIN_PASSWORD = 'Gardien-du-site-2026';
$cmd = $argv[1] ?? '';
$host = getenv('LR_DB_HOST') ?: '127.0.0.1';
$dsn = 'mysql:host=' . $host . (getenv('LR_DB_PORT') ? ';port=' . getenv('LR_DB_PORT') : '') . ';charset=utf8mb4';
if ($cmd === 'create' || $cmd === 'drop') {
    $name = preg_replace('/[^a-zA-Z0-9_]/', '', $argv[2] ?? '');
    $pdo = new PDO($dsn, getenv('LR_DB_USER') ?: 'root', getenv('LR_DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec($cmd === 'create' ? "CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" : "DROP DATABASE IF EXISTS `$name`");
} elseif ($cmd === 'admin') {
    run_migrations('test');
    q("INSERT INTO users (id, name, password_hash, role, must_change, created_at) VALUES (?, ?, ?, 'admin', 0, ?)", [newId(), 'Administrateur', password_hash(TEST_ADMIN_PASSWORD, PASSWORD_BCRYPT, ['cost' => 4]), now()]);
    setSetting('installed_at', now());
} elseif ($cmd === 'migrate') {
    $r = run_migrations('test'); echo json_encode(['from' => $r['from'], 'to' => $r['to'], 'backup' => $r['backup']['file'] ?? null]) . "\n";
} elseif ($cmd === 'sql') {
    db()->exec($argv[2] ?? '');
} else {
    fwrite(STDERR, "Commande inconnue\n"); exit(1);
}
