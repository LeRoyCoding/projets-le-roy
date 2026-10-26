<?php
// Serveur de développement : php -S 127.0.0.1:8080 -t www outils/serveur-test.php
// (reproduit les règles de www/.htaccess ; sert uniquement aux tests, jamais en production)
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$www = dirname(__DIR__) . '/www';
if (preg_match('#^/api(/|$)#', $path)) { chdir($www . '/api'); require $www . '/api/index.php'; return true; }
if (preg_match('#^/mcp(/|$)#', $path)) { chdir($www . '/api'); require $www . '/api/mcp.php'; return true; }
if ($path === '/') { header('Content-Type: text/html; charset=utf-8'); readfile($www . '/index.html'); return true; }
if (preg_match('#^/(installer|maintenance)\.php$#', $path)) return false;   // servis tels quels
return false;
