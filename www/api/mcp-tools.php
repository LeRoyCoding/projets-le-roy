<?php
// Outils proposés aux assistants (Claude, ChatGPT…) : même contenu que outils/mcp-commun.js.
// Ils passent par les mêmes règles que l'application, avec les droits de la personne propriétaire de la clé.
declare(strict_types=1);

const MCP_VERSION = '2.0.0';

function mnorm(string $s): string {
    // minuscules sans accents (comparaison de noms, recherche)
    return trim(strtr(mb_strtolower($s), ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i',
        'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ÿ' => 'y', 'œ' => 'oe', 'æ' => 'ae', 'ñ' => 'n']));
}
function frDate(?string $s): string { return $s ? implode('/', array_reverse(explode('-', $s))) : ''; }
function daysBetween(string $a, string $b): int { return (int)round((strtotime($b . ' 12:00:00 UTC') - strtotime($a . ' 12:00:00 UTC')) / 86400); }
function tPct(array $t): int {
    $n = count($t['steps']);
    if ($n) return (int)round(count(array_filter($t['steps'], fn($s) => $s['done'])) / $n * 100);
    return $t['completed'] ? 100 : 0;
}
function tStatus(array $t): string {
    if (tPct($t) === 100) return 'terminee';
    $d = daysBetween(todayIso(), $t['end']);
    return $d < 0 ? 'en_retard' : ($d <= 7 ? 'sous_7_jours' : 'en_cours');
}
const MCP_PRIO_TXT = [1 => 'urgente', 2 => 'haute', 3 => 'normale', 4 => 'basse'];
const MCP_PRIO_VAL = ['urgente' => 1, 'haute' => 2, 'normale' => 3, 'basse' => 4];
const MCP_STATUS_TXT = ['terminee' => '✅ terminée', 'en_retard' => '🚨 en retard', 'sous_7_jours' => '⚠️ échéance sous 7 jours', 'en_cours' => 'en cours'];

function mcpParseDate(mixed $v, string $label): ?string {
    if ($v === null || $v === '') return null;
    $s = trim((string)$v);
    if (preg_match('#^(\d{4})-(\d{1,2})-(\d{1,2})$#', $s, $m)) return sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3]);
    if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $s, $m)) return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
    throw new Exception("$label : date illisible « $s » (format attendu AAAA-MM-JJ ou JJ/MM/AAAA).");
}

function mcpFindOne(array $list, mixed $value, callable $labelOf, string $what): ?array {
    if ($value === null || $value === '') return null;
    $v = (string)$value;
    foreach ($list as $x) if (($x['id'] ?? null) === $v) return $x;
    $exact = array_values(array_filter($list, fn($x) => mnorm($labelOf($x)) === mnorm($v)));
    if (count($exact) === 1) return $exact[0];
    $partial = array_values(array_filter($list, fn($x) => str_contains(mnorm($labelOf($x)), mnorm($v))));
    if (count($partial) === 1) return $partial[0];
    $choices = implode(', ', array_map($labelOf, $list));
    if (count($exact) > 1 || count($partial) > 1) throw new Exception("Plusieurs $what correspondent à « $v ». Précisez parmi : $choices");
    throw new Exception("$what introuvable : « $v ». Choix possibles : $choices");
}

function mcpCtx(array $st): array {
    $users = []; foreach ($st['users'] as $u) $users[$u['id']] = $u;
    $groups = []; foreach ($st['groups'] as $g) $groups[$g['id']] = $g;
    $cats = []; foreach ($st['categories'] as $k) $cats[$k['id']] = $k;
    $userName = fn($id) => $users[$id]['name'] ?? '—';
    return [
        'st' => $st, 'me' => $users[$st['me']] ?? null,
        'userName' => $userName,
        'groupLabel' => fn($g) => (count($g['members']) === 1 && $g['name'] === 'Perso') ? 'Perso · ' . $userName($g['members'][0]) : $g['name'],
        'group' => fn($id) => $groups[$id] ?? ['name' => '?', 'members' => []],
        'cat' => fn($id) => $cats[$id] ?? ['label' => '?', 'emoji' => '📁'],
    ];
}

function mcpTaskLine(array $c, array $t): string {
    $cat = $c['cat']($t['type']);
    $who = $t['ownerId'] ? $c['userName']($t['ownerId']) : 'tout le groupe';
    $d = daysBetween(todayIso(), $t['end']);
    $st = tStatus($t);
    $when = $st === 'en_retard' ? (-$d) . ' j de retard' : ($st === 'sous_7_jours' ? ($d === 0 ? "fin aujourd'hui" : "J-$d") : '');
    $p = ($t['priority'] ?? 3) !== 3 ? 'priorité ' . MCP_PRIO_TXT[$t['priority']] . ', ' : '';
    return "- [{$t['id']}] {$cat['emoji']} {$t['title']} — " . $c['groupLabel']($c['group']($t['groupId'])) . ", pour $who, {$p}fin " . frDate($t['end']) . ', ' . tPct($t) . ' % (' . MCP_STATUS_TXT[$st] . ($when ? ", $when" : '') . ')';
}

function mcpHay(array $c, array $t): string {
    $parts = [$t['title'], $t['desc'], $c['cat']($t['type'])['label']];
    foreach ($t['steps'] as $s) $parts[] = $s['label'] . ' ' . $s['desc'];
    return mnorm(implode(' ', $parts));
}
function mcpMatchWords(array $c, array $tasks, string $query): array {
    $words = array_values(array_filter(preg_split('/\s+/', mnorm($query))));
    return array_values(array_filter($tasks, function ($t) use ($c, $words) {
        $h = mcpHay($c, $t);
        foreach ($words as $w) if (!str_contains($h, $w)) return false;
        return true;
    }));
}

// Appel interne à l'API (mêmes règles de droits que le site).
function mcpApi(array $me): callable {
    return function (string $method, string $url, ?array $body = null) use ($me) {
        $u = parse_url($url); parse_str($u['query'] ?? '', $query);
        return dispatch($method, $u['path'], $query, $body ?? [], $me);
    };
}

function mcpTools(callable $api): array {
    $S = fn(array $props, array $required = []) => ['type' => 'object', 'properties' => $props ?: (object)[], 'required' => $required, 'additionalProperties' => false];
    $s = fn(string $d) => ['type' => 'string', 'description' => $d];
    $prio = ['type' => 'string', 'enum' => ['urgente', 'haute', 'normale', 'basse'], 'description' => 'Priorité de la tâche.'];
    $T = [];

    $T[] = ['name' => 'resume_taches',
        'description' => "Résumé de la situation : tâches en retard, échéances des 7 prochains jours, nombre de tâches en cours. À utiliser pour « où en est-on ? », « qu'est-ce qui est urgent ? ».",
        'inputSchema' => $S(['seulement_les_miennes' => ['type' => 'boolean', 'description' => 'Ne garder que les tâches de la personne connectée.']]),
        'run' => function ($a) use ($api) {
            $c = mcpCtx($api('GET', '/api/state')); $me = $c['me']; $tasks = $c['st']['tasks'];
            if (!empty($a['seulement_les_miennes'])) $tasks = array_values(array_filter($tasks, fn($t) => $t['ownerId'] === $me['id'] || (!$t['ownerId'] && in_array($me['id'], $c['group']($t['groupId'])['members'], true))));
            $cmp = fn($x, $y) => strcmp($x['end'], $y['end']);
            $late = array_filter($tasks, fn($t) => tStatus($t) === 'en_retard'); usort($late, $cmp);
            $soon = array_filter($tasks, fn($t) => tStatus($t) === 'sous_7_jours'); usort($soon, $cmp);
            $open = array_filter($tasks, fn($t) => tStatus($t) !== 'terminee');
            $lines = ["Connecté en tant que {$me['name']} (" . ($me['role'] === 'admin' ? 'administrateur, voit tout' : 'utilisateur') . '). Nous sommes le ' . frDate(todayIso()) . '.',
                count($open) . ' tâche(s) en cours, ' . count($soon) . ' à échéance sous 7 jours, ' . count($late) . ' en retard.'];
            if ($late) $lines[] = "\nEn retard :\n" . implode("\n", array_map(fn($t) => mcpTaskLine($c, $t), $late));
            if ($soon) $lines[] = "\nSous 7 jours :\n" . implode("\n", array_map(fn($t) => mcpTaskLine($c, $t), $soon));
            return implode("\n", $lines);
        }];

    $T[] = ['name' => 'lister_taches',
        'description' => "Liste les tâches visibles, avec filtres facultatifs. Chaque ligne commence par l'identifiant de la tâche entre crochets.",
        'inputSchema' => $S([
            'recherche' => $s('Mots à chercher dans le titre, la description, les étapes, le client…'),
            'groupe' => $s('Nom (ou identifiant) du groupe.'), 'personne' => $s('Nom de la personne responsable.'),
            'categorie' => $s('Nom de la catégorie (Devis, Chantier…).'),
            'statut' => ['type' => 'string', 'enum' => ['en_retard', 'sous_7_jours', 'en_cours', 'terminee'], 'description' => 'Statut recherché.'],
            'inclure_terminees' => ['type' => 'boolean', 'description' => 'Inclure les tâches terminées (non par défaut).'],
        ]),
        'run' => function ($a) use ($api) {
            $c = mcpCtx($api('GET', '/api/state')); $tasks = $c['st']['tasks'];
            if (!empty($a['groupe'])) { $g = mcpFindOne($c['st']['groups'], $a['groupe'], $c['groupLabel'], 'Groupe'); $tasks = array_filter($tasks, fn($t) => $t['groupId'] === $g['id']); }
            if (!empty($a['personne'])) {
                $u = mcpFindOne($c['st']['users'], $a['personne'], fn($u) => $u['name'], 'Personne');
                $tasks = array_filter($tasks, fn($t) => $t['ownerId'] === $u['id'] || (!$t['ownerId'] && in_array($u['id'], $c['group']($t['groupId'])['members'], true)));
            }
            if (!empty($a['categorie'])) { $k = mcpFindOne($c['st']['categories'], $a['categorie'], fn($x) => $x['label'], 'Catégorie'); $tasks = array_filter($tasks, fn($t) => $t['type'] === $k['id']); }
            if (!empty($a['statut'])) $tasks = array_filter($tasks, fn($t) => tStatus($t) === $a['statut']);
            elseif (empty($a['inclure_terminees'])) $tasks = array_filter($tasks, fn($t) => tStatus($t) !== 'terminee');
            $tasks = array_values($tasks);
            if (!empty($a['recherche'])) $tasks = mcpMatchWords($c, $tasks, (string)$a['recherche']);
            usort($tasks, fn($x, $y) => strcmp($x['end'], $y['end']));
            if (!$tasks) return 'Aucune tâche ne correspond.';
            return count($tasks) . " tâche(s) :\n" . implode("\n", array_map(fn($t) => mcpTaskLine($c, $t), $tasks));
        }];

    $voir = function ($a) use ($api) {
        $c = mcpCtx($api('GET', '/api/state'));
        $t = null; foreach ($c['st']['tasks'] as $x) if ($x['id'] === ($a['id'] ?? '')) $t = $x;
        if (!$t) throw new Exception('Tâche introuvable : ' . ($a['id'] ?? ''));
        $d = $api('GET', '/api/tasks/' . rawurlencode($t['id']) . '/details');
        $cat = $c['cat']($t['type']); $un = $c['userName'];
        $steps = [];
        foreach ($t['steps'] as $i => $st) {
            $steps[] = ($i + 1) . '. [' . ($st['done'] ? 'x' : ' ') . "] {$st['label']}" . ($st['desc'] ? " — {$st['desc']}" : '')
                . ($st['done'] && $st['doneBy'] ? ' (cochée par ' . $un($st['doneBy']) . ($st['doneAt'] ? " le {$st['doneAt']} UTC" : '') . ')' : '') . "  (id {$st['id']})";
        }
        $out = ["{$cat['emoji']} {$t['title']}  [{$t['id']}]",
            'Groupe : ' . $c['groupLabel']($c['group']($t['groupId'])) . " · Catégorie : {$cat['label']} · Pour : " . ($t['ownerId'] ? $un($t['ownerId']) : 'tout le groupe') . ' · Priorité : ' . MCP_PRIO_TXT[$t['priority'] ?: 3],
            'Créée par ' . ($t['createdBy'] ? $un($t['createdBy']) : '—') . ($t['createdAt'] ? " le {$t['createdAt']} UTC" : ''),
            'Du ' . frDate($t['start']) . ' au ' . frDate($t['end']) . ' · Avancement ' . tPct($t) . ' % · ' . MCP_STATUS_TXT[tStatus($t)]];
        if ($t['desc']) $out[] = "\nDescription :\n{$t['desc']}";
        $out[] = "\nÉtapes :\n" . ($steps ? implode("\n", $steps) : '(aucune)');
        if ($t['doneAt']) $out[] = "\nTerminée par " . ($t['doneBy'] ? $un($t['doneBy']) : '—') . " le {$t['doneAt']} UTC.";
        if ($d['comments']) $out[] = "\nCommentaires :\n" . implode("\n", array_map(fn($x) => '- ' . $un($x['userId']) . " ({$x['at']} UTC) : {$x['body']}", $d['comments']));
        if ($d['activity']) $out[] = "\nHistorique récent :\n" . implode("\n", array_map(fn($x) => "- {$x['at']} UTC · " . $un($x['userId']) . " · {$x['action']}" . ($x['detail'] ? " : {$x['detail']}" : ''), array_slice($d['activity'], 0, 15)));
        return implode("\n", $out);
    };
    $T[] = ['name' => 'voir_tache', 'description' => "Tout le détail d'une tâche : description, étapes (avec leur identifiant), commentaires et historique.",
        'inputSchema' => $S(['id' => $s('Identifiant de la tâche (entre crochets dans les listes).')], ['id']), 'run' => $voir];

    $T[] = ['name' => 'creer_tache',
        'description' => "Crée une tâche. Demander confirmation à l'utilisateur si le groupe ou la personne ne sont pas clairs. Les dates sont au format AAAA-MM-JJ ou JJ/MM/AAAA.",
        'inputSchema' => $S([
            'titre' => $s('Titre de la tâche.'), 'groupe' => $s('Nom du groupe (ex. « Le Roy », « LLC », « Perso »).'),
            'fin' => $s('Date de fin (échéance).'), 'debut' => $s("Date de début (aujourd'hui par défaut)."),
            'categorie' => $s('Catégorie (Devis, Chantier, Commercial…). Première catégorie par défaut.'),
            'pour_qui' => $s('Nom de la personne responsable. Vide = tout le groupe (groupe commun) ou la personne connectée.'),
            'description' => $s("Contexte, client, points d'attention."), 'priorite' => $prio,
            'etapes' => ['type' => 'array', 'description' => 'Étapes à cocher, dans l\'ordre.', 'items' => ['anyOf' => [['type' => 'string'], ['type' => 'object', 'properties' => ['libelle' => ['type' => 'string'], 'description' => ['type' => 'string']], 'required' => ['libelle']]]]],
        ], ['titre', 'groupe', 'fin']),
        'run' => function ($a) use ($api) {
            $c = mcpCtx($api('GET', '/api/state'));
            $g = mcpFindOne($c['st']['groups'], $a['groupe'] ?? null, $c['groupLabel'], 'Groupe');
            if (!$g) throw new Exception('Indiquez le groupe.');
            $cat = !empty($a['categorie']) ? mcpFindOne(array_values(array_filter($c['st']['categories'], fn($x) => !$x['hidden'])), $a['categorie'], fn($x) => $x['label'], 'Catégorie') : null;
            $owner = !empty($a['pour_qui']) ? mcpFindOne(array_values(array_filter($c['st']['users'], fn($u) => $u['active'])), $a['pour_qui'], fn($u) => $u['name'], 'Personne') : null;
            $ownerId = $owner ? $owner['id'] : (count($g['members']) > 1 ? null : ($g['members'][0] ?? $c['me']['id']));
            $steps = array_map(fn($x) => is_string($x) ? ['label' => $x] : ['label' => $x['libelle'] ?? '', 'desc' => $x['description'] ?? ''], $a['etapes'] ?? []);
            $body = ['title' => $a['titre'] ?? '', 'groupId' => $g['id'], 'type' => $cat['id'] ?? null, 'ownerId' => $ownerId,
                'start' => mcpParseDate($a['debut'] ?? null, 'Début') ?: todayIso(), 'end' => mcpParseDate($a['fin'] ?? null, 'Fin'),
                'desc' => $a['description'] ?? '', 'steps' => $steps, 'priority' => MCP_PRIO_VAL[$a['priorite'] ?? ''] ?? 3];
            $r = $api('POST', '/api/tasks', $body);
            return "Tâche créée [{$r['id']}] : « {$body['title']} » dans " . $c['groupLabel']($g) . ', pour ' . ($owner ? $owner['name'] : ($ownerId ? $c['userName']($ownerId) : 'tout le groupe')) . ', échéance ' . frDate($body['end']) . ', ' . count($steps) . ' étape(s).';
        }];

    $T[] = ['name' => 'modifier_tache',
        'description' => 'Modifie une tâche existante (seuls les champs fournis changent). Pour les étapes, utiliser cocher_etape / ajouter_etape.',
        'inputSchema' => $S([
            'id' => $s('Identifiant de la tâche.'), 'titre' => $s('Nouveau titre.'), 'groupe' => $s('Nouveau groupe.'), 'categorie' => $s('Nouvelle catégorie.'),
            'pour_qui' => $s('Nouvelle personne responsable ; « tout le groupe » pour une tâche commune.'),
            'debut' => $s('Nouvelle date de début.'), 'fin' => $s('Nouvelle date de fin.'), 'description' => $s('Nouvelle description.'), 'priorite' => $prio,
        ], ['id']),
        'run' => function ($a) use ($api) {
            $c = mcpCtx($api('GET', '/api/state'));
            $t = null; foreach ($c['st']['tasks'] as $x) if ($x['id'] === ($a['id'] ?? '')) $t = $x;
            if (!$t) throw new Exception('Tâche introuvable : ' . ($a['id'] ?? ''));
            $b = $t;
            if (!empty($a['titre'])) $b['title'] = $a['titre'];
            if (!empty($a['groupe'])) $b['groupId'] = mcpFindOne($c['st']['groups'], $a['groupe'], $c['groupLabel'], 'Groupe')['id'];
            if (!empty($a['categorie'])) $b['type'] = mcpFindOne($c['st']['categories'], $a['categorie'], fn($x) => $x['label'], 'Catégorie')['id'];
            if (array_key_exists('pour_qui', $a)) $b['ownerId'] = (empty($a['pour_qui']) || preg_match('/^tout/i', mnorm((string)$a['pour_qui']))) ? null : mcpFindOne($c['st']['users'], $a['pour_qui'], fn($u) => $u['name'], 'Personne')['id'];
            if (!empty($a['debut'])) $b['start'] = mcpParseDate($a['debut'], 'Début');
            if (!empty($a['fin'])) $b['end'] = mcpParseDate($a['fin'], 'Fin');
            if (array_key_exists('description', $a)) $b['desc'] = (string)$a['description'];
            if (!empty($a['priorite'])) $b['priority'] = MCP_PRIO_VAL[$a['priorite']] ?? 3;
            $api('PUT', '/api/tasks/' . rawurlencode($t['id']), $b);
            return "Tâche [{$t['id']}] mise à jour.";
        }];

    $T[] = ['name' => 'cocher_etape',
        'description' => "Coche (ou décoche) une étape d'une tâche. L'étape peut être donnée par son identifiant, son numéro (1, 2…) ou son libellé.",
        'inputSchema' => $S(['tache_id' => $s('Identifiant de la tâche.'), 'etape' => $s("Identifiant, numéro ou libellé de l'étape."), 'fait' => ['type' => 'boolean', 'description' => 'true = cochée (par défaut), false = décochée.']], ['tache_id', 'etape']),
        'run' => function ($a) use ($api) {
            $st = $api('GET', '/api/state');
            $t = null; foreach ($st['tasks'] as $x) if ($x['id'] === ($a['tache_id'] ?? '')) $t = $x;
            if (!$t) throw new Exception('Tâche introuvable : ' . ($a['tache_id'] ?? ''));
            $n = $a['etape'] ?? '';
            $step = (is_numeric($n) && (int)$n == $n && $n >= 1 && $n <= count($t['steps'])) ? $t['steps'][(int)$n - 1] : mcpFindOne($t['steps'], $n, fn($x) => $x['label'], 'Étape');
            $done = ($a['fait'] ?? true) !== false;
            $api('PATCH', '/api/steps/' . rawurlencode($step['id']), ['done' => $done]);
            $after = array_map(fn($x) => $x['id'] === $step['id'] ? ['done' => $done] : $x, $t['steps']);
            $p = (int)round(count(array_filter($after, fn($x) => $x['done'])) / count($after) * 100);
            return "Étape « {$step['label']} » " . ($done ? 'cochée' : 'décochée') . ". Avancement de « {$t['title']} » : $p %.";
        }];

    $T[] = ['name' => 'ajouter_etape', 'description' => "Ajoute une étape à la fin d'une tâche.",
        'inputSchema' => $S(['tache_id' => $s('Identifiant de la tâche.'), 'libelle' => $s("Libellé de l'étape."), 'description' => $s('Description facultative.')], ['tache_id', 'libelle']),
        'run' => function ($a) use ($api) {
            $api('POST', '/api/tasks/' . rawurlencode((string)($a['tache_id'] ?? '')) . '/steps', ['label' => $a['libelle'] ?? '', 'desc' => $a['description'] ?? '']);
            return 'Étape « ' . ($a['libelle'] ?? '') . ' » ajoutée.';
        }];

    $T[] = ['name' => 'marquer_terminee', 'description' => 'Pour une tâche SANS étapes : la marquer terminée (ou la rouvrir). Les tâches avec étapes se terminent en cochant toutes leurs étapes.',
        'inputSchema' => $S(['tache_id' => $s('Identifiant de la tâche.'), 'terminee' => ['type' => 'boolean', 'description' => 'true par défaut ; false pour rouvrir.']], ['tache_id']),
        'run' => function ($a) use ($api) {
            $fin = ($a['terminee'] ?? true) !== false;
            $api('PATCH', '/api/tasks/' . rawurlencode((string)($a['tache_id'] ?? '')) . '/terminee', ['completed' => $fin]);
            return $fin ? 'Tâche marquée terminée.' : 'Tâche rouverte.';
        }];

    $T[] = ['name' => 'commenter', 'description' => "Ajoute un commentaire sur une tâche (visible par l'équipe), au nom de la personne connectée.",
        'inputSchema' => $S(['tache_id' => $s('Identifiant de la tâche.'), 'texte' => $s('Texte du commentaire.')], ['tache_id', 'texte']),
        'run' => function ($a) use ($api) {
            $api('POST', '/api/tasks/' . rawurlencode((string)($a['tache_id'] ?? '')) . '/comments', ['body' => $a['texte'] ?? '']);
            return 'Commentaire ajouté.';
        }];

    $T[] = ['name' => 'infos_equipe', 'description' => 'Liste les groupes (avec leurs membres), les personnes et les catégories disponibles. Utile avant de créer une tâche.',
        'inputSchema' => $S([]),
        'run' => function ($a) use ($api) {
            $c = mcpCtx($api('GET', '/api/state')); $st = $c['st'];
            $l = ['Groupes :'];
            foreach ($st['groups'] as $g) $l[] = '- ' . $c['groupLabel']($g) . ' (' . (count($g['members']) > 1 ? 'commun' : 'privé') . ') : ' . implode(', ', array_map($c['userName'], $g['members']));
            $l[] = "\nPersonnes :";
            foreach ($st['users'] as $u) if ($u['active']) $l[] = "- {$u['name']}" . ($u['role'] === 'admin' ? ' (admin)' : '');
            $l[] = "\nCatégories :";
            foreach ($st['categories'] as $k) if (!$k['hidden']) $l[] = "- {$k['emoji']} {$k['label']}";
            return implode("\n", $l);
        }];

    // Outils « search » et « fetch » : forme attendue par ChatGPT pour la recherche.
    $T[] = ['name' => 'search', 'description' => 'Recherche des tâches par mots-clés (titre, description, étapes). Renvoie une liste de résultats avec leur identifiant.',
        'inputSchema' => $S(['query' => $s('Mots à chercher.')], ['query']),
        'run' => function ($a) use ($api) {
            $c = mcpCtx($api('GET', '/api/state'));
            $found = array_slice(mcpMatchWords($c, $c['st']['tasks'], (string)($a['query'] ?? '')), 0, 30);
            return json_encode(['results' => array_map(fn($t) => ['id' => $t['id'], 'title' => $t['title'], 'text' => substr(mcpTaskLine($c, $t), 2), 'url' => 'projets-le-roy://tache/' . $t['id']], $found)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }];
    $T[] = ['name' => 'fetch', 'description' => "Renvoie le détail complet d'une tâche à partir de son identifiant (obtenu avec search).",
        'inputSchema' => $S(['id' => $s('Identifiant de la tâche.')], ['id']),
        'run' => function ($a) use ($voir) {
            $text = $voir(['id' => $a['id'] ?? '']);
            return json_encode(['id' => $a['id'], 'title' => explode("\n", $text)[0], 'text' => $text, 'url' => 'projets-le-roy://tache/' . $a['id'], 'metadata' => (object)[]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }];
    return $T;
}

// Traite un message JSON-RPC (protocole MCP). Renvoie la réponse, ou null pour une notification.
function mcpTraiter(mixed $msg, array $tools): ?array {
    $id = is_array($msg) ? ($msg['id'] ?? null) : null;
    $method = is_array($msg) ? ($msg['method'] ?? null) : null;
    $params = is_array($msg) ? ($msg['params'] ?? []) : [];
    $ok = fn($result) => ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
    $ko = fn(int $code, string $m) => ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $m]];
    if ($method === 'initialize') {
        return $ok(['protocolVersion' => $params['protocolVersion'] ?? '2025-06-18', 'capabilities' => ['tools' => (object)[]],
            'serverInfo' => ['name' => 'projets-le-roy', 'version' => MCP_VERSION],
            'instructions' => "Accès aux projets et tâches de l'équipe Le Roy / Lead Le Roy Concept. Répondre en français. Avant de créer ou modifier une tâche pour quelqu'un, vérifier le groupe et la personne (outil infos_equipe) et confirmer si c'est ambigu."]);
    }
    if ($method === 'ping') return $ok((object)[]);
    if ($method === 'tools/list') return $ok(['tools' => array_map(fn($t) => ['name' => $t['name'], 'description' => $t['description'], 'inputSchema' => $t['inputSchema']], $tools)]);
    if ($method === 'tools/call') {
        $tool = null; foreach ($tools as $t) if ($t['name'] === ($params['name'] ?? null)) $tool = $t;
        if (!$tool) return $ko(-32602, 'Outil inconnu : ' . ($params['name'] ?? ''));
        try {
            $text = $tool['run'](is_array($params['arguments'] ?? null) ? $params['arguments'] : []);
            return $ok(['content' => [['type' => 'text', 'text' => $text]]]);
        } catch (HttpError $e) {
            return $ok(['content' => [['type' => 'text', 'text' => 'Erreur : ' . $e->getMessage()]], 'isError' => true]);
        } catch (Throwable $e) {
            $m = $e instanceof Exception ? $e->getMessage() : 'Erreur inattendue.';
            return $ok(['content' => [['type' => 'text', 'text' => 'Erreur : ' . $m]], 'isError' => true]);
        }
    }
    if ($id !== null) return $ko(-32601, 'Méthode inconnue : ' . $method);
    return null; // notification (ex. notifications/initialized)
}
