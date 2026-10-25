<?php
// Tâches, étapes, commentaires, historique, corbeille des tâches.
declare(strict_types=1);

function routes_taches(callable $add): void {
    $add('POST', '/api/tasks', 'user', 'r_task_create', ['notify']);
    $add('PUT', '/api/tasks/{id}', 'user', 'r_task_update', ['notify']);
    $add('DELETE', '/api/tasks/{id}', 'user', 'r_task_delete', ['notify']);
    $add('PATCH', '/api/tasks/{id}/terminee', 'user', 'r_task_done', ['notify']);
    $add('GET', '/api/tasks/{id}/details', 'user', 'r_task_details');
    $add('GET', '/api/historique', 'admin', 'r_historique');
    $add('POST', '/api/tasks/{id}/steps', 'user', 'r_step_add', ['notify']);
    $add('PATCH', '/api/steps/{id}', 'user', 'r_step_patch', ['notify']);
    $add('DELETE', '/api/steps/{id}', 'user', 'r_step_delete', ['notify']);
    $add('POST', '/api/tasks/{id}/comments', 'user', 'r_comment_add', ['notify']);
    $add('DELETE', '/api/comments/{id}', 'user', 'r_comment_delete', ['notify']);
    // Corbeille
    $add('GET', '/api/corbeille', 'user', 'r_trash_list');
    $add('POST', '/api/corbeille/tache/{id}/restaurer', 'user', 'r_trash_restore_task', ['notify']);
    $add('POST', '/api/corbeille/groupe/{id}/restaurer', 'user', 'r_trash_restore_group', ['notify']);
    $add('DELETE', '/api/corbeille/tache/{id}', 'admin', 'r_trash_purge_task', ['notify']);
    $add('DELETE', '/api/corbeille/groupe/{id}', 'admin', 'r_trash_purge_group', ['notify']);
}

/* ---------- Historique d'une tâche : qui a fait quoi ---------- */
function logAct(string $taskId, ?string $userId, string $action, string $detail = ''): void {
    q('INSERT INTO activity (task_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)', [$taskId, $userId, $action, mb_substr($detail, 0, 2000), now()]);
}

function readCategory(mixed $value, ?array $existing): string {
    $id = (string)($value ?? '');
    $k = row('SELECT id, hidden FROM categories WHERE id = ?', [$id]);
    // Une catégorie masquée reste acceptée pour une tâche qui l'avait déjà.
    if ($k && (!$k['hidden'] || ($existing && $existing['type'] === $k['id']))) return $k['id'];
    if ($k && $k['hidden']) fail(400, 'Cette catégorie est masquée : choisissez-en une autre.');
    $first = val('SELECT id FROM categories WHERE hidden = 0 ORDER BY position, label LIMIT 1');
    if (!$first) fail(400, 'Aucune catégorie disponible.');
    return (string)$first;
}

function readTask(array $me, array $b, ?array $existing = null): array {
    $title = str($b['title'] ?? null, 200, 'Le titre', true);
    $desc = str($b['desc'] ?? null, 5000, 'La description');
    $type = readCategory($b['type'] ?? null, $existing);
    if (!isDate($b['start'] ?? null) || !isDate($b['end'] ?? null)) fail(400, 'Renseignez des dates de début et de fin valides.');
    if ($b['end'] < $b['start']) fail(400, 'La date de fin doit être après la date de début.');
    $g = getGroup($b['groupId'] ?? null);
    if (!$g) fail(400, 'Choisissez un groupe.');
    $members = membersOf($g['id']);
    // Créer une tâche (ou la déplacer) dans un groupe demande d'y être membre ou responsable.
    $sameGroup = $existing && $existing['group_id'] === $g['id'];
    if (!$sameGroup && !group_can('create_task', $me, $g)) fail(403, "Vous ne pouvez pas ajouter de tâche dans ce groupe (accès en lecture seule, ou vous n'en faites pas partie).");
    $ownerId = !empty($b['ownerId']) ? (string)$b['ownerId'] : null;
    if ($ownerId && !getUser($ownerId)) fail(400, 'Personne inconnue.');
    $unchanged = $existing && $existing['owner_id'] === $ownerId;
    if ($ownerId && !$unchanged && !getActiveUser($ownerId)) fail(400, 'Ce compte est désactivé.');
    if ($ownerId && !$unchanged && !in_array($ownerId, $members, true) && $ownerId !== $me['id']) fail(400, 'Cette personne ne fait pas partie du groupe.');
    if (!$ownerId && count($members) < 2) $ownerId = $members[0] ?? $me['id']; // groupe privé : la tâche est à son unique membre
    $rawSteps = $b['steps'] ?? [];
    if (!is_array($rawSteps)) fail(400, "Liste d'étapes illisible.");
    if (count($rawSteps) > 200) fail(400, "Trop d'étapes (200 maximum).");
    $steps = [];
    foreach ($rawSteps as $s) {
        $s = is_array($s) ? $s : [];
        $label = str($s['label'] ?? null, 300, "Le nom d'une étape");
        if ($label === '') continue;
        $steps[] = ['id' => is_string($s['id'] ?? null) ? $s['id'] : null, 'label' => $label, 'desc' => str($s['desc'] ?? null, 2000, "La description d'une étape"), 'done' => !empty($s['done'])];
    }
    // Priorité : 1 urgente, 2 haute, 3 normale, 4 basse (inchangée si absente ou illisible).
    $pr = isset($b['priority']) && is_numeric($b['priority']) ? (int)$b['priority'] : 0;
    $priority = isset(PRIORITES[$pr]) ? $pr : ($existing ? (int)$existing['priority'] : 3);
    return ['title' => $title, 'desc' => $desc, 'type' => $type, 'start' => $b['start'], 'end' => $b['end'], 'groupId' => $g['id'],
            'ownerId' => $ownerId, 'steps' => $steps, 'completed' => !empty($b['completed']) ? 1 : 0, 'priority' => $priority];
}

function writeSteps(string $taskId, array $steps, string $userId): void {
    $existing = array_flip(array_column(rows('SELECT id FROM steps WHERE task_id = ?', [$taskId]), 'id'));
    $keep = [];
    foreach ($steps as $i => $s) {
        if ($s['id'] && isset($existing[$s['id']]) && !isset($keep[$s['id']])) {
            q('UPDATE steps SET position = ?, label = ?, description = ?, done = ? WHERE id = ?', [$i, $s['label'], $s['desc'], $s['done'] ? 1 : 0, $s['id']]);
            // Coché ici : on retient qui et quand (sans écraser une validation plus ancienne).
            if ($s['done']) q('UPDATE steps SET done_by = COALESCE(done_by, ?), done_at = COALESCE(done_at, ?) WHERE id = ?', [$userId, now(), $s['id']]);
            else q('UPDATE steps SET done_by = NULL, done_at = NULL WHERE id = ?', [$s['id']]);
            $keep[$s['id']] = true;
        } else {
            q('INSERT INTO steps (id, task_id, position, label, description, done, done_by, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [newId(), $taskId, $i, $s['label'], $s['desc'], $s['done'] ? 1 : 0, $s['done'] ? $userId : null, $s['done'] ? now() : null]);
        }
    }
    foreach ($existing as $id => $_) if (!isset($keep[$id])) q('DELETE FROM steps WHERE id = ?', [$id]);
}

function cut(string $s, int $n = 60): string { return mb_strlen($s) > $n ? mb_substr($s, 0, $n - 1) . '…' : $s; }
function frd(string $d): string { return implode('/', array_reverse(explode('-', $d))); }

// Résumé lisible des changements, avec l'ancienne et la nouvelle valeur.
function describeChanges(array $before, array $d): array {
    $out = [];
    if ($before['title'] !== $d['title']) $out[] = 'titre : « ' . cut($before['title']) . ' » → « ' . cut($d['title']) . ' »';
    if ($before['group_id'] !== $d['groupId']) $out[] = 'groupe : « ' . cut((string)(getGroup($before['group_id'], true)['name'] ?? '?')) . ' » → « ' . cut((string)(getGroup($d['groupId'])['name'] ?? '?')) . ' »';
    if (($before['owner_id'] ?: null) !== ($d['ownerId'] ?: null)) {
        $a = $before['owner_id'] ? (getUser($before['owner_id'])['name'] ?? '?') : 'tout le groupe';
        $b = $d['ownerId'] ? (getUser($d['ownerId'])['name'] ?? '?') : 'tout le groupe';
        $out[] = "responsable : $a → $b";
    }
    if ($before['type'] !== $d['type']) $out[] = 'catégorie : ' . ($before['type']) . ' → ' . $d['type'];
    if ((int)$before['priority'] !== $d['priority']) $out[] = 'priorité : ' . PRIORITES[(int)$before['priority']] . ' → ' . PRIORITES[$d['priority']];
    if ($before['start_date'] !== $d['start']) $out[] = 'début : ' . frd($before['start_date']) . ' → ' . frd($d['start']);
    if ($before['end_date'] !== $d['end']) $out[] = 'fin : ' . frd($before['end_date']) . ' → ' . frd($d['end']);
    if ($before['description'] !== $d['desc']) $out[] = 'description modifiée';
    return $out;
}

function r_task_create(array $c): array {
    $me = $c['me']; $d = readTask($me, $c['b']); $id = newId();
    tx(function () use ($id, $d, $me) {
        q('INSERT INTO tasks (id, group_id, owner_id, type, title, description, start_date, end_date, created_by, completed, priority, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [$id, $d['groupId'], $d['ownerId'], $d['type'], $d['title'], $d['desc'], $d['start'], $d['end'], $me['id'], $d['steps'] ? 0 : $d['completed'], $d['priority'], now(), now()]);
        writeSteps($id, $d['steps'], $me['id']);
        majTerminee($id, $me['id']);
        logAct($id, $me['id'], 'creation', 'tâche créée' . ($me['viaToken'] ? ' (clé d\'accès)' : ''));
    });
    return ['id' => $id];
}

function r_task_update(array $c): array {
    $me = $c['me']; $t = editableTask($me, $c['p']['id'], 'edit');
    $d = readTask($me, ['completed' => $t['completed']] + $c['b'], $t);
    $before = rows('SELECT label, done FROM steps WHERE task_id = ? ORDER BY position, seq', [$t['id']]);
    tx(function () use ($t, $d, $me, $before) {
        q('UPDATE tasks SET group_id = ?, owner_id = ?, type = ?, title = ?, description = ?, start_date = ?, end_date = ?, completed = ?, priority = ?, updated_at = ? WHERE id = ?',
          [$d['groupId'], $d['ownerId'], $d['type'], $d['title'], $d['desc'], $d['start'], $d['end'], $d['steps'] ? 0 : $d['completed'], $d['priority'], now(), $t['id']]);
        writeSteps($t['id'], $d['steps'], $me['id']);
        majTerminee($t['id'], $me['id']);
        $changes = describeChanges($t, $d);
        $diff = count($before) !== count($d['steps']);
        foreach ($before as $i => $s) if (!$diff && $s['label'] !== $d['steps'][$i]['label']) $diff = true;
        if ($diff) $changes[] = 'étapes modifiées (' . count($before) . ' → ' . count($d['steps']) . ')';
        if ($changes) logAct($t['id'], $me['id'], 'modification', implode(' ; ', $changes));
    });
    return ['ok' => true];
}

// Supprimer = mettre à la corbeille (récupérable). La suppression définitive est réservée à l'administrateur.
function r_task_delete(array $c): array {
    $me = $c['me']; $t = editableTask($me, $c['p']['id'], 'delete');
    tx(function () use ($t, $me) {
        q('UPDATE tasks SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?', [now(), $me['id'], now(), $t['id']]);
        logAct($t['id'], $me['id'], 'supprimee', 'mise à la corbeille');
        audit('tache.supprimee', 'task', $t['id'], cut($t['title'], 120));
    });
    return ['ok' => true];
}

// Tâche sans étapes : terminée / pas terminée.
function r_task_done(array $c): array {
    $t = editableTask($c['me'], $c['p']['id'], 'step');
    $done = !empty($c['b']['completed']) ? 1 : 0;
    tx(function () use ($t, $done, $c) {
        q('UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?', [$done, now(), $t['id']]);
        majTerminee($t['id'], $c['me']['id']);
        logAct($t['id'], $c['me']['id'], $done ? 'terminee' : 'rouverte');
    });
    return ['ok' => true];
}

function r_task_details(array $c): array {
    $t = viewableTask($c['me'], $c['p']['id']);
    return [
        'comments' => rows('SELECT id, body, created_at AS `at`, user_id AS userId FROM comments WHERE task_id = ? ORDER BY created_at, seq', [$t['id']]),
        // Le journal « qui a fait quoi » est réservé à l'administrateur et aux responsables du groupe.
        'activity' => is_group_manager($c['me'], $t['group_id'])
            ? rows('SELECT action, detail, created_at AS `at`, user_id AS userId FROM activity WHERE task_id = ? ORDER BY id DESC LIMIT 200', [$t['id']])
            : [],
    ];
}

function r_historique(array $c): array {
    $tasks = rows('SELECT t.*, g.name AS group_name, g.icon AS group_icon, g.color AS group_color FROM tasks t LEFT JOIN groupes g ON g.id = t.group_id
                   WHERE t.done_at IS NOT NULL AND t.deleted_at IS NULL ORDER BY t.done_at DESC LIMIT 1000');
    $steps = steps_of(array_column($tasks, 'id'));
    $seuil = seuilArchive();
    return ['jours' => ARCHIVE_JOURS, 'tasks' => array_map(fn($t) => [
        'id' => $t['id'], 'title' => $t['title'], 'desc' => $t['description'], 'type' => $t['type'], 'ownerId' => $t['owner_id'], 'groupId' => $t['group_id'],
        'group' => ['name' => $t['group_name'] ?: 'Groupe supprimé', 'icon' => $t['group_icon'] ?: '📁', 'color' => $t['group_color'] ?: '#666A6F'],
        'start' => $t['start_date'], 'end' => $t['end_date'], 'doneAt' => $t['done_at'], 'doneBy' => $t['done_by'],
        'createdBy' => $t['created_by'], 'createdAt' => $t['created_at'], 'priority' => (int)$t['priority'],
        'archived' => $t['done_at'] <= $seuil, 'steps' => $steps[$t['id']] ?? [],
    ], $tasks)];
}

/* ----- Étapes ----- */
function r_step_add(array $c): array {
    $me = $c['me']; $t = editableTask($me, $c['p']['id'], 'step');
    $label = str($c['b']['label'] ?? null, 300, "Le nom de l'étape", true);
    $desc = str($c['b']['desc'] ?? null, 2000, 'La description');
    $pos = (int)val('SELECT COALESCE(MAX(position), -1) + 1 FROM steps WHERE task_id = ?', [$t['id']]);
    $id = newId();
    tx(function () use ($id, $t, $pos, $label, $desc, $me) {
        q('INSERT INTO steps (id, task_id, position, label, description) VALUES (?, ?, ?, ?, ?)', [$id, $t['id'], $pos, $label, $desc]);
        q('UPDATE tasks SET completed = 0 WHERE id = ?', [$t['id']]);
        majTerminee($t['id'], $me['id']);
        touchTask($t['id']);
        logAct($t['id'], $me['id'], 'etape_ajoutee', $label);
    });
    return ['id' => $id];
}

function r_step_patch(array $c): ?array {
    $me = $c['me']; ['step' => $s] = editableStep($me, $c['p']['id'], 'step');
    $done = !empty($c['b']['done']) ? 1 : 0;
    if ($done === (int)$s['done']) return null;
    tx(function () use ($s, $done, $me) {
        // On note qui a coché l'étape et quand (effacé si on la décoche).
        if ($done) q('UPDATE steps SET done = 1, done_by = ?, done_at = ? WHERE id = ?', [$me['id'], now(), $s['id']]);
        else q('UPDATE steps SET done = 0, done_by = NULL, done_at = NULL WHERE id = ?', [$s['id']]);
        majTerminee($s['task_id'], $me['id']);
        touchTask($s['task_id']);
        logAct($s['task_id'], $me['id'], $done ? 'etape_cochee' : 'etape_decochee', $s['label']);
    });
    return null;
}

function r_step_delete(array $c): ?array {
    $me = $c['me']; ['step' => $s] = editableStep($me, $c['p']['id'], 'edit');
    tx(function () use ($s, $me) {
        q('DELETE FROM steps WHERE id = ?', [$s['id']]);
        majTerminee($s['task_id'], $me['id']);
        touchTask($s['task_id']);
        logAct($s['task_id'], $me['id'], 'etape_supprimee', $s['label']);
    });
    return null;
}

/* ----- Commentaires ----- */
function r_comment_add(array $c): array {
    $t = editableTask($c['me'], $c['p']['id'], 'comment');
    $body = str($c['b']['body'] ?? null, 3000, 'Le commentaire', true);
    $id = newId();
    q('INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [$id, $t['id'], $c['me']['id'], $body, now()]);
    return ['id' => $id];
}
function r_comment_delete(array $c): ?array {
    $k = row('SELECT * FROM comments WHERE id = ?', [$c['p']['id']]);
    if (!$k) fail(404, "Ce commentaire n'existe plus.");
    $t = viewableTask($c['me'], $k['task_id']);
    if ($k['user_id'] !== $c['me']['id'] && !is_group_manager($c['me'], $t['group_id'])) fail(403, 'Vous ne pouvez supprimer que vos propres commentaires.');
    q('DELETE FROM comments WHERE id = ?', [$k['id']]);
    logAct($t['id'], $c['me']['id'], 'commentaire_supprime', cut($k['body'], 120));
    return null;
}

/* =====================  CORBEILLE  ===================== */
const CORBEILLE_JOURS = 90;   // durée de conservation avant suppression définitive (par la tâche d'entretien uniquement)

// Groupes dont la personne peut restaurer le contenu : tous (admin) ou ceux dont elle est responsable.
function trash_scope(array $me): ?array {
    if ($me['role'] === 'admin') return null;
    return array_keys(array_filter(my_roles($me), fn($r) => $r === 'responsable'));
}

function trash_count(array $me): int {
    $s = trash_scope($me);
    if ($s !== null && !$s) return 0;
    $w = $s === null ? '' : ' AND group_id IN (' . in($s) . ')';
    $p = $s ?? [];
    return (int)val('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NOT NULL' . $w, $p) + (int)val('SELECT COUNT(*) FROM groupes WHERE deleted_at IS NOT NULL' . ($s === null ? '' : ' AND id IN (' . in($s) . ')'), $p);
}

function r_trash_list(array $c): array {
    $me = $c['me']; $s = trash_scope($me);
    if ($s !== null && !$s) return ['tasks' => [], 'groups' => [], 'jours' => CORBEILLE_JOURS];
    $w = $s === null ? '' : ' AND t.group_id IN (' . in($s) . ')';
    $tasks = rows('SELECT t.id, t.title, t.group_id, t.deleted_at, t.deleted_by, t.created_by, t.end_date, g.name AS group_name, g.deleted_at AS group_deleted
                   FROM tasks t JOIN groupes g ON g.id = t.group_id WHERE t.deleted_at IS NOT NULL' . $w . ' ORDER BY t.deleted_at DESC LIMIT 500', $s ?? []);
    $groups = rows('SELECT id, name, icon, color, deleted_at, deleted_by FROM groupes WHERE deleted_at IS NOT NULL' . ($s === null ? '' : ' AND id IN (' . in($s) . ')') . ' ORDER BY deleted_at DESC', $s ?? []);
    $left = fn($d) => max(0, CORBEILLE_JOURS - (int)floor((time() - strtotime($d . ' UTC')) / 86400));
    return [
        'jours' => CORBEILLE_JOURS,
        'tasks' => array_map(fn($t) => ['id' => $t['id'], 'title' => $t['title'], 'groupId' => $t['group_id'], 'group' => $t['group_name'], 'groupDeleted' => $t['group_deleted'] !== null,
            'deletedAt' => $t['deleted_at'], 'deletedBy' => $t['deleted_by'], 'end' => $t['end_date'], 'joursRestants' => $left($t['deleted_at'])], $tasks),
        'groups' => array_map(fn($g) => ['id' => $g['id'], 'name' => $g['name'], 'icon' => $g['icon'], 'color' => $g['color'], 'deletedAt' => $g['deleted_at'], 'deletedBy' => $g['deleted_by'], 'joursRestants' => $left($g['deleted_at'])], $groups),
    ];
}

function r_trash_restore_task(array $c): array {
    $t = getTask($c['p']['id'], true);
    if (!$t || $t['deleted_at'] === null) fail(404, "Cette tâche n'est pas dans la corbeille.");
    if (!task_can('restore', $c['me'], $t)) fail(403, 'Seul un responsable du groupe ou un administrateur peut restaurer cette tâche.');
    if (!getGroup($t['group_id'])) fail(409, "Le groupe de cette tâche est lui aussi à la corbeille : restaurez-le d'abord.");
    tx(function () use ($t, $c) {
        q('UPDATE tasks SET deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?', [now(), $t['id']]);
        logAct($t['id'], $c['me']['id'], 'restauree', 'sortie de la corbeille');
        audit('tache.restauree', 'task', $t['id'], cut($t['title'], 120));
    });
    return ['ok' => true];
}

function r_trash_restore_group(array $c): array {
    $g = getGroup($c['p']['id'], true);
    if (!$g || $g['deleted_at'] === null) fail(404, "Ce groupe n'est pas dans la corbeille.");
    if (!group_can('restore', $c['me'], $g)) fail(403, 'Seul un responsable du groupe ou un administrateur peut le restaurer.');
    q('UPDATE groupes SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [$g['id']]);
    audit('groupe.restaure', 'group', $g['id'], cut($g['name'], 120));
    return ['ok' => true];
}

// Suppression définitive : administrateur seulement, depuis la corbeille.
function r_trash_purge_task(array $c): array {
    $t = getTask($c['p']['id'], true);
    if (!$t || $t['deleted_at'] === null) fail(404, "Cette tâche n'est pas dans la corbeille.");
    purge_task($t);
    return ['ok' => true];
}
function purge_task(array $t): void {
    tx(function () use ($t) {
        q('DELETE FROM tasks WHERE id = ?', [$t['id']]);   // étapes, commentaires et historique partent avec elle
        audit('tache.purgee', 'task', $t['id'], cut($t['title'], 120) . ' (supprimée le ' . $t['deleted_at'] . ' UTC)');
    });
}
function r_trash_purge_group(array $c): array {
    $g = getGroup($c['p']['id'], true);
    if (!$g || $g['deleted_at'] === null) fail(404, "Ce groupe n'est pas dans la corbeille.");
    if ((int)val('SELECT COUNT(*) FROM tasks WHERE group_id = ?', [$g['id']])) fail(409, 'Ce groupe contient encore des tâches (même à la corbeille) : supprimez-les définitivement d\'abord.');
    q('DELETE FROM groupes WHERE id = ?', [$g['id']]);
    audit('groupe.purge', 'group', $g['id'], cut($g['name'], 120));
    return ['ok' => true];
}
