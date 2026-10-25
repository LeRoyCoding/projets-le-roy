<?php
// Aide commune aux pages d'administration technique (installer.php, maintenance.php).
// Ces pages sont protégées par une clé secrète écrite dans config.php (« maintenance_key », 32 caractères minimum) :
//  - la clé se saisit dans un formulaire (méthode POST), jamais dans l'adresse ;
//  - 5 erreurs de suite = blocage progressif (compteur dans un fichier, car la base peut ne pas exister encore) ;
//  - uniquement en https (sauf en local) ; rien n'est indexé ni mis en cache.
declare(strict_types=1);

function webtool_headers(): void {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
}
function h(mixed $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function webtool_throttle_file(): string { return data_dir('etat') . '/webtool-essais.json'; }
function webtool_locked(): int {
    $f = webtool_throttle_file();
    $s = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    $k = hash('sha256', clientIp());
    $n = (int)($s[$k]['n'] ?? 0);
    if ($n < 5) return 0;
    return max(0, (int)$s[$k]['t'] + min(3600, 60 * (2 ** min(6, $n - 5))) - time());
}
function webtool_note(bool $ok): void {
    $f = webtool_throttle_file();
    $fh = fopen($f, 'c+'); if (!$fh) return;
    flock($fh, LOCK_EX);
    $s = json_decode((string)stream_get_contents($fh), true) ?: [];
    $k = hash('sha256', clientIp());
    $s = array_filter($s, fn($e) => ($e['t'] ?? 0) > time() - 86400);
    if ($ok) unset($s[$k]); else $s[$k] = ['n' => (int)($s[$k]['n'] ?? 0) + 1, 't' => time()];
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($s)); flock($fh, LOCK_UN); fclose($fh);
    @chmod($f, 0600);
}

// Renvoie null si la clé POST est valide ; sinon un message d'erreur à afficher (ou '' si aucune clé n'a encore été saisie).
function webtool_check_key(): ?string {
    $cfg = config_optional();
    $key = (string)($cfg['maintenance_key'] ?? '');
    if (strlen($key) < 32) return "Aucune clé de maintenance valide (32 caractères minimum) dans config.php : la page est verrouillée.";
    if (!isHttps() && !in_array(clientIp(), ['127.0.0.1', '::1'], true)) return 'Cette page n\'est accessible qu\'en https.';
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !isset($_POST['cle'])) return '';
    if (($w = webtool_locked()) > 0) return "Trop d'essais : patientez " . ceil($w / 60) . ' minute(s).';
    if (!hash_equals($key, (string)$_POST['cle'])) { webtool_note(false); return 'Clé incorrecte.'; }
    webtool_note(true);
    return null;
}

function webtool_page_start(string $titre): void {
    webtool_headers();
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
       . '<title>' . h($titre) . ' — Projets Le Roy</title><style>'
       . 'body{font-family:Arial,sans-serif;background:#F2F0EF;color:#232120;margin:0;padding:24px}main{max-width:620px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;box-shadow:0 2px 10px rgba(0,0,0,.08)}'
       . 'h1{color:#C4122F;margin-top:0;font-size:24px}ul{list-style:none;padding:0}li{padding:5px 0}.ok::before{content:"✅ "}.ko::before{content:"❌ "}.w::before{content:"⚠️ "}'
       . 'label{display:block;margin:12px 0 4px;font-weight:bold}input[type=text],input[type=password]{width:100%;box-sizing:border-box;padding:10px;font-size:16px;border:1px solid #bbb;border-radius:6px}'
       . 'button{margin:14px 8px 0 0;background:#C4122F;color:#fff;border:0;border-radius:6px;padding:11px 18px;font-size:15px;cursor:pointer}button.s{background:#666A6F}'
       . '.err{background:#fdecec;border:1px solid #C4122F;padding:10px;border-radius:6px;margin-top:14px}.bon{background:#e8f5ee;border:1px solid #2E8C76;padding:12px;border-radius:6px;margin-top:14px}code{background:#eee;padding:2px 5px;border-radius:4px}'
       . '</style></head><body><main><h1>' . h($titre) . '</h1>';
}
function webtool_page_end(): void { echo '</main></body></html>'; }

function webtool_key_form(string $message = ''): void {
    if ($message !== '') echo '<p class="err">' . h($message) . '</p>';
    echo '<form method="post" autocomplete="off"><label for="cle">Clé de maintenance</label><input id="cle" name="cle" type="password" required autocomplete="off">'
       . '<p style="font-size:13px;color:#666">La clé se trouve dans le fichier <code>config.php</code> (réglage <code>maintenance_key</code>).</p><button type="submit">Continuer</button></form>';
}
