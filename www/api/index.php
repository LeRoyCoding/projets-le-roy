<?php
// Point d'entrée de l'API : /api/…
declare(strict_types=1);
ini_set('display_errors', '0');   // jamais d'erreur PHP au milieu des réponses : elles vont dans le journal de l'hébergement
require __DIR__ . '/lib.php';
require __DIR__ . '/routes.php';

function entetes(): void {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    header('Cache-Control: no-store');
}
function repondre(int $status, mixed $data): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

entetes();
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = rtrim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/') ?: '/';

    // Les modifications doivent arriver en JSON (empêche un autre site de les déclencher).
    $ctype = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
    if ($method !== 'GET' && !str_starts_with($ctype, 'application/json')) fail(415, 'Requête refusée.');

    $body = [];
    if ($method !== 'GET') {
        $raw = file_get_contents('php://input') ?: '';
        if (strlen($raw) > 1_000_000) fail(413, 'Message trop long.');
        if (trim($raw) !== '') {
            $body = json_decode($raw, true);
            if (!is_array($body)) fail(400, 'Données reçues illisibles.');
        }
    }

    migrer();
    $me = currentUser();
    $out = dispatch($method, $path, $_GET, $body, $me);

    if (is_array($out) && isset($out['__raw'])) {
        $f = $out['__raw'];
        header('Content-Type: ' . $f['type']);
        header('Content-Disposition: attachment; filename="' . $f['filename'] . '"');
        echo $f['content'];
        exit;
    }
    repondre(200, $out);
} catch (HttpError $e) {
    repondre($e->status, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('Projets Le Roy : ' . $e);
    repondre(500, ['error' => 'Erreur inattendue du serveur.']);
}
