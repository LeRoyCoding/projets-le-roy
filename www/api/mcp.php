<?php
// Connecteur MCP en ligne (Claude, ChatGPT…) : https://votre-site/mcp/lr_VOTRE_CLE
// Désactivé tant que l'administrateur ne l'a pas activé (page Compte). Chaque appel exige une clé d'accès personnelle ;
// les outils ont exactement les droits de la personne propriétaire de la clé.
declare(strict_types=1);
ini_set('display_errors', '0');   // jamais d'erreur PHP au milieu des réponses : elles vont dans le journal de l'hébergement
require __DIR__ . '/lib.php';
require __DIR__ . '/routes.php';
require __DIR__ . '/mcp-tools.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function mcpRepondre(int $status, mixed $data = null): never {
    http_response_code($status);
    if ($data !== null) echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

try {
    $path = rtrim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
    if (!preg_match('#^/mcp(?:/(lr_[0-9a-f]{64}))?$#', $path, $m)) mcpRepondre(404, ['error' => 'Adresse inconnue.']);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); mcpRepondre(405, ['error' => 'Méthode non prise en charge.']); }

    migrer();
    if (getSetting('connecteur_internet') !== '1') mcpRepondre(403, ['error' => "Le connecteur est désactivé : l'administrateur doit l'activer dans la page Compte."]);

    $ip = 'mcp:' . clientIp();
    if (limiteEssais($ip, 20, 600)) mcpRepondre(429, ['error' => "Trop d'essais. Réessayez plus tard."]);

    $key = $m[1] ?? null;
    if ($key === null && preg_match('/^Bearer\s+(\S+)$/i', authorizationHeader(), $b)) $key = $b[1];
    $me = ($key && preg_match('/^lr_[0-9a-f]{64}$/', $key)) ? currentUser($key) : null;
    if (!$me) {
        noterEchec($ip, 600);
        mcpRepondre(401, ['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32001, 'message' => "Clé d'accès absente ou refusée."]]);
    }
    q('DELETE FROM login_failures WHERE k = ?', [$ip]);

    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 1_000_000) mcpRepondre(413, ['error' => 'Message trop long.']);
    $msg = json_decode($raw, true);
    if ($msg === null) mcpRepondre(400, ['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32700, 'message' => 'Message illisible']]);

    $tools = mcpTools(mcpApi($me));
    $batch = array_is_list($msg) && $msg !== [] ? $msg : [$msg];
    $out = [];
    foreach ($batch as $one) { $r = mcpTraiter($one, $tools); if ($r !== null) $out[] = $r; }
    if (!$out) mcpRepondre(202);
    mcpRepondre(200, (array_is_list($msg) && $msg !== []) ? $out : $out[0]);
} catch (Throwable $e) {
    error_log('Connecteur MCP : ' . $e);
    mcpRepondre(500, ['error' => 'Erreur inattendue.']);
}
