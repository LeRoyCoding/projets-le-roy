<?php
// Versions de la base de données. Les migrations ne s'exécutent JAMAIS pendant une requête ordinaire :
// seulement à la demande explicite de l'administrateur (installer.php, maintenance.php ou outils/migrer.php),
// et toujours après une sauvegarde vérifiée.
declare(strict_types=1);

// Liste normalisée : chaque migration = ['sql' => [instructions ou fonctions], 'breaking' => bool].
// « breaking » = l'ancien code ne fonctionne plus avec ce schéma (retour arrière du code impossible sans restaurer la base).
function migrations_list(): array {
    static $list = null;
    if ($list !== null) return $list;
    $list = [];
    foreach (require __DIR__ . '/migrations.php' as $m) {
        $list[] = isset($m['sql']) ? ['sql' => $m['sql'], 'breaking' => !empty($m['breaking'])] : ['sql' => $m, 'breaking' => false];
    }
    return $list;
}

function schema_table_exists(string $t): bool {
    return val('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [$t]) > 0;
}
function schema_column_exists(string $t, string $c): bool {
    return val('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [$t, $c]) > 0;
}

// Ajoute une colonne seulement si elle n'existe pas (une migration relancée après un échec partiel ne casse rien).
function schema_add_column(PDO $pdo, string $table, string $col, string $ddl): void {
    if (!schema_column_exists($table, $col)) $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$col` $ddl");
}
function schema_add_index(PDO $pdo, string $table, string $name, string $ddl): void {
    if (val('SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [$table, $name]) == 0) $pdo->exec("ALTER TABLE `$table` ADD $ddl");
}

// État de la base par rapport au code : absent | ancien | ok | recent (base plus récente que le code, mais compatible) | incompatible
function schema_state(): array {
    $target = count(migrations_list());
    if (!schema_table_exists('settings')) return ['state' => 'absent', 'version' => 0, 'target' => $target, 'min_code' => 0];
    $version = (int)(getSetting('schema_version') ?? 0);
    $minCode = (int)(getSetting('schema_min_code') ?? 0);
    if ($version === 0) $state = 'absent';
    elseif ($version < $target) $state = 'ancien';
    elseif ($version === $target) $state = 'ok';
    else $state = $minCode > $target ? 'incompatible' : 'recent';
    return ['state' => $state, 'version' => $version, 'target' => $target, 'min_code' => $minCode];
}

// Appelé au début de chaque requête de l'application : refuse de fonctionner si la base n'est pas prête.
function schema_gate(): void {
    $s = schema_state();
    if ($s['state'] === 'ok' || $s['state'] === 'recent') return;
    if ($s['state'] === 'absent') fail(503, "L'application n'est pas encore installée. L'administrateur doit ouvrir installer.php.", 'schema');
    if ($s['state'] === 'ancien') fail(503, "Mise à jour en attente : l'administrateur doit lancer la mise à jour de la base de données (maintenance.php).", 'schema');
    fail(503, "Ce code est plus ancien que la base de données : redéployez la version la plus récente ou restaurez la sauvegarde.", 'schema');
}

// Applique les migrations en attente. $source : « installation », « maintenance », « cli ».
// Si la base contient déjà des données, une sauvegarde vérifiée est faite d'abord (sinon : refus).
function run_migrations(string $source): array {
    $pdo = db();
    $pdo->exec('CREATE TABLE IF NOT EXISTS settings (k VARCHAR(64) NOT NULL PRIMARY KEY, v TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $lock = (int)val("SELECT GET_LOCK('lr_migration', 30)");
    if (!$lock) fail(409, 'Une autre mise à jour est déjà en cours.');
    try {
        $list = migrations_list();
        $from = (int)(getSetting('schema_version') ?? 0);
        if ($from > count($list)) fail(409, 'La base est plus récente que ce code : migration impossible.');
        if ($from === count($list)) return ['from' => $from, 'to' => $from, 'backup' => null, 'appliquees' => []];
        $backup = null;
        if ($from > 0) {
            try { $backup = backup_create('avant-migration', true); }
            catch (Throwable $e) { fail(500, 'Sauvegarde avant mise à jour impossible : la base n\'a PAS été modifiée. (' . $e->getMessage() . ')'); }
        }
        $done = [];
        for ($i = $from; $i < count($list); $i++) {
            try {
                foreach ($list[$i]['sql'] as $step) { if (is_callable($step)) $step($pdo); else $pdo->exec($step); }
            } catch (Throwable $e) {
                audit('migration.echec', 'schema', (string)($i + 1), mb_substr($e->getMessage(), 0, 400));
                fail(500, 'La migration ' . ($i + 1) . ' a échoué : ' . $e->getMessage() . ($backup ? ' — une sauvegarde faite juste avant existe : ' . $backup['file'] : ''));
            }
            setSetting('schema_version', (string)($i + 1));
            if ($list[$i]['breaking']) setSetting('schema_min_code', (string)($i + 1));
            $done[] = $i + 1;
        }
        audit('migration.ok', 'schema', (string)count($list), "de $from à " . count($list) . " ($source)" . ($backup ? ', sauvegarde ' . $backup['file'] : ''));
        return ['from' => $from, 'to' => count($list), 'backup' => $backup, 'appliquees' => $done];
    } finally {
        q("SELECT RELEASE_LOCK('lr_migration')");
    }
}
