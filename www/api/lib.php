<?php
// Point d'entrée des outils communs (chargé par l'API, le connecteur, l'installateur et les outils en ligne de commande).
declare(strict_types=1);
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/backup.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/permissions.php';
