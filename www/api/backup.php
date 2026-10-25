<?php
// Sauvegardes : export SQL en flux (jamais entièrement en mémoire), vérification, chiffrement, restauration.
// Utilisé par : outils/sauvegarde.php (tâche CRON), la mise à jour de la base, le téléchargement par l'administrateur.
declare(strict_types=1);

const BACKUP_FORMAT = 1;
const BACKUP_EXCLUDED = ['sessions', 'login_failures'];   // données éphémères : inutiles à sauvegarder

function backup_dir(): string { return data_dir('sauvegardes'); }

function backup_tables(PDO $pdo): array {
    $out = [];
    foreach ($pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_NUM) as $r) {
        if (!in_array($r[0], BACKUP_EXCLUDED, true)) $out[] = $r[0];
    }
    sort($out);
    return $out;
}

// Écrit l'export complet via la fonction $w(string) (fichier gzip, ou envoi direct au navigateur). Renvoie le nombre de lignes par table.
function backup_write_dump(PDO $pdo, callable $w, array $meta): array {
    $counts = [];
    $w("-- LRBACKUP " . BACKUP_FORMAT . " " . json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    $w("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET time_zone = '+00:00';\n");
    $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');   // toutes les tables sont lues au même instant
    try {
        $tables = backup_tables($pdo);
        foreach ($tables as $t) {
            $create = $pdo->query("SHOW CREATE TABLE `$t`")->fetch(PDO::FETCH_NUM)[1];
            $w("\nDROP TABLE IF EXISTS `$t`;\n$create;\n");
            $counts[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
        }
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);   // lecture ligne à ligne
        foreach ($tables as $t) {
            $st = $pdo->query("SELECT * FROM `$t`");
            $cols = null; $batch = 0; $n = 0;
            while (($r = $st->fetch(PDO::FETCH_ASSOC)) !== false) {
                if ($cols === null) $cols = '`' . implode('`,`', array_keys($r)) . '`';
                $vals = array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote((string)$v), array_values($r));
                $w(($batch === 0 ? "INSERT INTO `$t` ($cols) VALUES\n" : ",\n") . '(' . implode(',', $vals) . ')');
                $n++;
                if (++$batch >= 100) { $w(";\n"); $batch = 0; }
            }
            if ($batch > 0) $w(";\n");
            $st->closeCursor();
            if ($n !== $counts[$t]) throw new RuntimeException("Table $t : $n lignes lues au lieu de {$counts[$t]}.");
        }
    } finally {
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
        try { $pdo->exec('COMMIT'); } catch (Throwable $e) { /* transaction déjà terminée */ }
    }
    $w("\nSET FOREIGN_KEY_CHECKS=1;\n-- LRBACKUP END\n");
    return $counts;
}

// Relit un fichier .sql.gz et compare, table par table, le nombre de lignes avec ce qui était attendu.
function backup_verify_gz(string $file, array $expected): array {
    $errors = []; $found = []; $cur = null; $end = false;
    $h = @gzopen($file, 'rb');
    if (!$h) return ['ok' => false, 'errors' => ['Fichier illisible.'], 'counts' => []];
    while (($line = gzgets($h)) !== false) {
        if (str_starts_with($line, 'INSERT INTO `')) { $cur = substr($line, 13, strpos($line, '`', 13) - 13); $found[$cur] = ($found[$cur] ?? 0); }
        elseif ($line !== '' && $line[0] === '(' && $cur !== null) $found[$cur]++;
        elseif (str_starts_with($line, '-- LRBACKUP END')) $end = true;
    }
    gzclose($h);
    if (!$end) $errors[] = 'Fin de fichier absente (export incomplet).';
    foreach ($expected as $t => $n) {
        $got = $found[$t] ?? 0;
        if ($got !== $n) $errors[] = "Table $t : $got lignes dans le fichier, $n attendues.";
    }
    return ['ok' => !$errors, 'errors' => $errors, 'counts' => $found];
}

// Envoie l'export directement, compressé en gzip, vers la sortie (téléchargement) sans jamais le garder en mémoire.
function backup_stream_gzip(PDO $pdo, array $meta): void {
    $ctx = deflate_init(ZLIB_ENCODING_GZIP, ['level' => 6]);
    $out = function (string $s) use ($ctx) { echo deflate_add($ctx, $s, ZLIB_NO_FLUSH); };
    backup_write_dump($pdo, $out, $meta);
    echo deflate_add($ctx, '', ZLIB_FINISH);
}

function backup_slug(string $s): string { return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($s)) ?? '', '-') ?: 'manuelle'; }

function backup_state_file(): string { return data_dir('etat') . '/sauvegarde.json'; }
function backup_status(): array {
    $f = backup_state_file();
    return is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
}
function backup_status_write(array $patch): void {
    $s = array_merge(backup_status(), $patch);
    file_put_contents(backup_state_file(), json_encode($s, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    @chmod(backup_state_file(), 0600);
}

// Crée une sauvegarde vérifiée. $reason : « quotidienne », « avant-migration », « manuelle »…
// Lève une exception si la sauvegarde n'a pas pu être créée ET vérifiée.
function backup_create(string $reason = 'manuelle', bool $keepPlain = false): array {
    $pdo = db();
    $dir = backup_dir();
    $name = 'projets-' . gmdate('Ymd-His') . '-' . backup_slug($reason);
    $part = "$dir/$name.sql.gz.part";
    $final = "$dir/$name.sql.gz";
    $c = config_optional();
    $meta = ['created_at' => now() . ' UTC', 'reason' => $reason, 'schema_version' => (int)(getSetting('schema_version') ?? 0), 'app_version' => defined('APP_VERSION') ? APP_VERSION : null];
    try {
        $gz = gzopen($part, 'wb6');
        if (!$gz) throw new RuntimeException("Impossible d'écrire dans $dir.");
        @chmod($part, 0600);
        $counts = backup_write_dump($pdo, fn(string $s) => gzwrite($gz, $s), $meta);
        gzclose($gz);
        $v = backup_verify_gz($part, $counts);
        if (!$v['ok']) throw new RuntimeException('Vérification échouée : ' . implode(' ', $v['errors']));
        rename($part, $final);
        $manifest = $meta + ['format' => BACKUP_FORMAT, 'file' => basename($final), 'bytes' => filesize($final), 'sha256' => hash_file('sha256', $final),
            'tables' => $counts, 'verified' => true, 'encrypted' => false];

        $pub = backup_public_key();
        if ($pub) {
            $enc = "$final.enc";
            $manifest['encryption'] = backup_encrypt($final, $enc, $pub);
            $manifest['encrypted'] = true;
            $manifest['file'] = basename($enc);
            $manifest['bytes'] = filesize($enc);
            $manifest['sha256'] = hash_file('sha256', $enc);
            $manifest['plain_sha256'] = hash_file('sha256', $final);
            if (!$keepPlain) @unlink($final);
        }
        file_put_contents("$dir/$name.manifest.json", json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        @chmod("$dir/$name.manifest.json", 0600);
        backup_status_write(['dernier_ok' => now() . ' UTC', 'dernier_fichier' => $manifest['file'], 'octets' => $manifest['bytes'], 'tables' => $counts, 'dernier_echec' => null, 'message' => null, 'raison' => $reason]);
        return $manifest + ['path' => $dir . '/' . $manifest['file'], 'manifest_path' => "$dir/$name.manifest.json", 'plain_path' => is_file($final) ? $final : null];
    } catch (Throwable $e) {
        if (isset($gz) && is_resource($gz)) @gzclose($gz);
        @unlink($part);
        backup_status_write(['dernier_echec' => now() . ' UTC', 'message' => $e->getMessage(), 'raison' => $reason]);
        throw $e;
    }
}

/* ---------- Chiffrement : AES-256-CBC + HMAC-SHA256, clé enveloppée avec la clé publique RSA du serveur interne ----------
 * Seul le serveur interne (qui détient la clé privée) peut déchiffrer : un vol des sauvegardes sur l'hébergement ne les expose pas. */
function backup_public_key(): ?string {
    $k = config_optional()['backup_public_key'] ?? null;
    if (!$k) return null;
    if (!str_contains($k, 'BEGIN') && is_file($k)) $k = (string)file_get_contents($k);
    return str_contains($k, 'BEGIN PUBLIC KEY') ? $k : null;
}

function backup_encrypt(string $in, string $out, string $pubPem): array {
    $key = random_bytes(64); $encKey = substr($key, 0, 32); $macKey = substr($key, 32);
    $iv0 = random_bytes(16); $iv = $iv0;
    $pub = openssl_pkey_get_public($pubPem);
    if (!$pub || !openssl_public_encrypt($key, $wrapped, $pub, OPENSSL_PKCS1_OAEP_PADDING)) throw new RuntimeException('Clé publique de sauvegarde invalide.');
    $fi = fopen($in, 'rb'); $fo = fopen($out, 'wb'); @chmod($out, 0600);
    $mac = hash_init('sha256', HASH_HMAC, $macKey); hash_update($mac, $iv0);
    $chunk = 1048576; $buf = fread($fi, $chunk);
    while (true) {
        $next = fread($fi, $chunk);
        $last = ($next === '' || $next === false);
        if ($last) { $pad = 16 - (strlen($buf) % 16); $buf .= str_repeat(chr($pad), $pad); }
        $ct = openssl_encrypt($buf, 'aes-256-cbc', $encKey, OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING, $iv);
        if ($ct === false) throw new RuntimeException('Chiffrement impossible.');
        $iv = substr($ct, -16);
        fwrite($fo, $ct); hash_update($mac, $ct);
        if ($last) break;
        $buf = $next;
    }
    fclose($fi); fclose($fo);
    return ['cipher' => 'aes-256-cbc', 'iv' => bin2hex($iv0), 'key_wrapped' => base64_encode($wrapped), 'wrap' => 'rsa-oaep-sha1', 'hmac_sha256' => hash_final($mac)];
}

// Déchiffre (clé privée PEM). Vérifie d'abord l'intégrité (HMAC), puis écrit le fichier .sql.gz.
function backup_decrypt(string $in, string $out, string $privPem, array $enc): void {
    $priv = openssl_pkey_get_private($privPem);
    if (!$priv || !openssl_private_decrypt(base64_decode($enc['key_wrapped']), $key, $priv, OPENSSL_PKCS1_OAEP_PADDING)) throw new RuntimeException('Clé privée refusée.');
    $encKey = substr($key, 0, 32); $macKey = substr($key, 32); $iv0 = hex2bin($enc['iv']);
    $mac = hash_init('sha256', HASH_HMAC, $macKey); hash_update($mac, $iv0);
    $fi = fopen($in, 'rb');
    while (($b = fread($fi, 1048576)) !== '' && $b !== false) hash_update($mac, $b);
    if (!hash_equals($enc['hmac_sha256'], hash_final($mac))) throw new RuntimeException('Intégrité : le fichier a été modifié ou est corrompu.');
    rewind($fi);
    $fo = fopen($out, 'wb'); @chmod($out, 0600);
    $iv = $iv0; $chunk = 1048576; $buf = fread($fi, $chunk); $pending = null;
    while ($buf !== '' && $buf !== false) {
        $next = fread($fi, $chunk);
        $pt = openssl_decrypt($buf, 'aes-256-cbc', $encKey, OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING, $iv);
        $iv = substr($buf, -16);
        if ($next === '' || $next === false) { $pad = ord(substr($pt, -1)); $pt = substr($pt, 0, -$pad); }
        fwrite($fo, $pt);
        $buf = $next;
    }
    fclose($fi); fclose($fo);
}

/* ---------- Restauration ---------- */
// Rejoue un fichier .sql.gz dans la base $target. Ne touche jamais à la base de production : c'est à l'appelant de choisir $target.
function backup_restore(string $gzFile, PDO $target): array {
    $h = gzopen($gzFile, 'rb');
    if (!$h) throw new RuntimeException('Fichier illisible.');
    $stmt = ''; $n = 0;
    while (($line = gzgets($h)) !== false) {
        if ($stmt === '' && (str_starts_with($line, '--') || trim($line) === '')) continue;
        $stmt .= $line;
        if (substr(rtrim($line, "\r\n"), -1) === ';') { $target->exec($stmt); $stmt = ''; $n++; }
    }
    gzclose($h);
    if (trim($stmt) !== '') throw new RuntimeException('Fichier tronqué : dernière instruction incomplète.');
    return ['statements' => $n];
}

function backup_count_tables(PDO $pdo, array $tables): array {
    $out = [];
    foreach ($tables as $t) $out[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
    return $out;
}

// Efface les anciens fichiers locaux (le serveur interne garde l'historique long). On garde toujours les $keep plus récents.
function backup_prune(int $keep = 10): array {
    $dir = backup_dir(); $files = glob("$dir/projets-*.manifest.json") ?: []; rsort($files);
    $removed = [];
    foreach (array_slice($files, $keep) as $m) {
        $base = substr($m, 0, -strlen('.manifest.json'));
        foreach (glob("$base*") ?: [] as $f) { if (@unlink($f)) $removed[] = basename($f); }
    }
    return $removed;
}

function alert_mail(string $subject, string $body): void {
    error_log("ALERTE Projets Le Roy : $subject — $body");
    $to = config_optional()['alert_email'] ?? null;
    if ($to && function_exists('mail')) @mail($to, '[Projets Le Roy] ' . $subject, $body, "Content-Type: text/plain; charset=utf-8\r\n");
}
