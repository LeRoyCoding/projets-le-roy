<?php
// Groupes (communs ou privés) et catégories.
declare(strict_types=1);

function routes_groupes(callable $add): void {
    $add('POST', '/api/groups', 'user', 'r_group_create', ['notify']);
    $add('POST', '/api/groups/ordre', 'admin', 'r_group_order', ['notify']);
    $add('PUT', '/api/groups/{id}', 'user', 'r_group_update', ['notify']);
    $add('DELETE', '/api/groups/{id}', 'user', 'r_group_delete', ['notify']);

    $add('POST', '/api/categories', 'user', 'r_cat_create', ['notify']);
    $add('POST', '/api/categories/ordre', 'admin', 'r_cat_order', ['notify']);
    $add('PUT', '/api/categories/{id}', 'admin', 'r_cat_update', ['notify']);
    $add('DELETE', '/api/categories/{id}', 'admin', 'r_cat_delete', ['notify']);
}

/* =====================  GROUPES  ===================== */
// Les membres arrivent soit comme une liste d'identifiants, soit comme une liste {id, role}.
function readGroup(array $me, array $b, ?array $existing = null): array {
    $name = str($b['name'] ?? null, 80, 'Le nom du groupe', true);
    $icon = str($b['icon'] ?? null, 20, 'Le logo') ?: '📁';
    if (str_starts_with($icon, 'img:') && !in_array($icon, ['img:lr', 'img:llc'], true)) $icon = '📁';
    $color = preg_match('/^#[0-9A-Fa-f]{6}$/', (string)($b['color'] ?? '')) ? $b['color'] : GROUP_COLORS[2];
    $members = [];   // id => rôle
    foreach (is_array($b['members'] ?? null) ? $b['members'] : [] as $m) {
        $id = is_array($m) ? (string)($m['id'] ?? '') : (is_scalar($m) ? (string)$m : '');
        $role = is_array($m) && in_array($m['role'] ?? '', ROLES_GROUPE, true) ? $m['role'] : null;
        if ($id === '' || !getActiveUser($id) && !($existing && group_member_role($existing['id'], $id))) continue;
        if (!isset($members[$id])) $members[$id] = $role ?? ($existing ? (group_member_role($existing['id'], $id) ?? 'membre') : 'membre');
    }
    // Un non-administrateur qui crée un groupe en devient responsable.
    if (!$existing && $me['role'] !== 'admin') $members[$me['id']] = 'responsable';
    if (!$members) fail(400, 'Choisissez au moins une personne pour ce groupe.');
    // Il faut toujours au moins un responsable : sinon le premier membre le devient.
    if (!in_array('responsable', $members, true)) { $first = array_key_first($members); $members[$first] = 'responsable'; }
    // Un responsable ne peut pas se retirer ni se rétrograder s'il est le dernier (garanti ci-dessus) ; un non-admin reste membre de son groupe.
    if ($existing && $me['role'] !== 'admin' && !isset($members[$me['id']])) fail(400, 'Vous ne pouvez pas vous retirer vous-même du groupe : demandez à un autre responsable ou à un administrateur.');
    return ['name' => $name, 'icon' => $icon, 'color' => $color, 'members' => $members];
}

function setMembers(string $gid, array $members): void {
    q('DELETE FROM group_members WHERE group_id = ?', [$gid]);
    foreach ($members as $uid => $role) q('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', [$gid, $uid, $role]);
}

function describeMembers(array $before, array $after): string {
    $names = fn($id) => getUser($id)['name'] ?? $id;
    $out = [];
    foreach ($after as $id => $r) { if (!isset($before[$id])) $out[] = '+' . $names($id) . " ($r)"; elseif ($before[$id] !== $r) $out[] = $names($id) . " : {$before[$id]} → $r"; }
    foreach ($before as $id => $r) if (!isset($after[$id])) $out[] = '−' . $names($id);
    return implode(', ', $out);
}

function r_group_create(array $c): array {
    $d = readGroup($c['me'], $c['b']); $id = newId();
    tx(function () use ($id, $d, $c) {
        $pos = (int)val('SELECT COALESCE(MAX(position), 0) + 1 FROM groupes');
        q('INSERT INTO groupes (id, name, icon, color, position, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [$id, $d['name'], $d['icon'], $d['color'], $pos, now(), $c['me']['id']]);
        setMembers($id, $d['members']);
        audit('groupe.cree', 'group', $id, cut($d['name'], 80) . ' — ' . describeMembers([], $d['members']));
    });
    return ['id' => $id];
}

function r_group_update(array $c): array {
    $g = editableGroup($c['me'], $c['p']['id'], 'edit');
    $d = readGroup($c['me'], $c['b'], $g);
    $before = array_column(rows('SELECT user_id, role FROM group_members WHERE group_id = ?', [$g['id']]), 'role', 'user_id');
    tx(function () use ($g, $d, $before) {
        q('UPDATE groupes SET name = ?, icon = ?, color = ? WHERE id = ?', [$d['name'], $d['icon'], $d['color'], $g['id']]);
        setMembers($g['id'], $d['members']);
        $diff = describeMembers($before, $d['members']);
        audit('groupe.modifie', 'group', $g['id'], cut($d['name'], 80) . ($diff ? ' — membres : ' . $diff : ''));
    });
    return ['ok' => true];
}

// Ordre d'affichage des groupes (accueil, timeline, listes) : réglé par l'administrateur pour tout le monde.
function r_group_order(array $c): array {
    if (!is_array($c['b']['ids'] ?? null)) fail(400, 'Ordre illisible.');
    tx(function () use ($c) { foreach (array_values($c['b']['ids']) as $i => $id) q('UPDATE groupes SET position = ? WHERE id = ?', [$i + 1, (string)$id]); });
    return ['ok' => true];
}

// Supprimer un groupe = le mettre à la corbeille (possible seulement s'il ne contient plus de tâche).
function r_group_delete(array $c): array {
    $g = editableGroup($c['me'], $c['p']['id'], 'delete');
    if ((int)val('SELECT COUNT(*) FROM tasks WHERE group_id = ? AND deleted_at IS NULL', [$g['id']])) fail(400, 'Ce groupe contient encore des tâches.');
    q('UPDATE groupes SET deleted_at = ?, deleted_by = ? WHERE id = ?', [now(), $c['me']['id'], $g['id']]);
    audit('groupe.supprime', 'group', $g['id'], cut($g['name'], 80));
    return ['ok' => true];
}

/* =====================  CATÉGORIES  ===================== */
function getCat(mixed $id): ?array { return row('SELECT * FROM categories WHERE id = ?', [(string)($id ?? '')]); }
function readCat(array $b): array {
    return ['label' => str($b['label'] ?? null, 40, 'Le nom de la catégorie', true), 'emoji' => str($b['emoji'] ?? null, 16, 'Le pictogramme') ?: '📁'];
}
function sameLabel(string $label, string $exceptId = ''): bool {
    return val('SELECT 1 FROM categories WHERE LOWER(label) = LOWER(?) AND id <> ?', [$label, $exceptId]) !== null;
}
// Tout le monde peut proposer une nouvelle catégorie ; seul l'administrateur modifie, masque, réordonne ou supprime.
function r_cat_create(array $c): array {
    $d = readCat($c['b']);
    if (sameLabel($d['label'])) fail(400, 'Une catégorie porte déjà ce nom.');
    $id = newId();
    $pos = (int)val('SELECT COALESCE(MAX(position), -1) + 1 FROM categories');
    q('INSERT INTO categories (id, label, emoji, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$id, $d['label'], $d['emoji'], $pos, $c['me']['id'], now()]);
    audit('categorie.creee', 'category', $id, $d['label']);
    return ['id' => $id];
}
function r_cat_update(array $c): array {
    $k = getCat($c['p']['id']);
    if (!$k) fail(404, "Cette catégorie n'existe plus.");
    $d = readCat($c['b']);
    if (sameLabel($d['label'], $k['id'])) fail(400, 'Une catégorie porte déjà ce nom.');
    $hidden = array_key_exists('hidden', $c['b']) ? (empty($c['b']['hidden']) ? 0 : 1) : (int)$k['hidden'];
    if ($hidden && !$k['hidden'] && (int)val('SELECT COUNT(*) FROM categories WHERE hidden = 0') <= 1) fail(400, 'Il faut garder au moins une catégorie visible.');
    q('UPDATE categories SET label = ?, emoji = ?, hidden = ? WHERE id = ?', [$d['label'], $d['emoji'], $hidden, $k['id']]);
    audit('categorie.modifiee', 'category', $k['id'], $k['label'] . ' → ' . $d['label'] . ($hidden !== (int)$k['hidden'] ? ($hidden ? ' (masquée)' : ' (affichée)') : ''));
    return ['ok' => true];
}
function r_cat_order(array $c): array {
    if (!is_array($c['b']['ids'] ?? null)) fail(400, 'Ordre illisible.');
    tx(function () use ($c) { foreach (array_values($c['b']['ids']) as $i => $id) q('UPDATE categories SET position = ? WHERE id = ?', [$i, (string)$id]); });
    return ['ok' => true];
}
function r_cat_delete(array $c): array {
    $k = getCat($c['p']['id']);
    if (!$k) fail(404, "Cette catégorie n'existe plus.");
    $n = (int)val('SELECT COUNT(*) FROM tasks WHERE type = ?', [$k['id']]);
    $rep = !empty($c['q']['remplacer']) ? getCat($c['q']['remplacer']) : null;
    if ($n && !$rep) fail(400, "Cette catégorie est utilisée par $n tâche" . ($n > 1 ? 's' : '') . '. Masquez-la plutôt, ou choisissez une catégorie de remplacement.');
    if ($rep && $rep['id'] === $k['id']) fail(400, 'Choisissez une autre catégorie de remplacement.');
    if ((int)val('SELECT COUNT(*) FROM categories WHERE hidden = 0 AND id <> ?', [$k['id']]) < 1) fail(400, 'Il faut garder au moins une catégorie visible.');
    tx(function () use ($n, $rep, $k) {
        if ($n) q('UPDATE tasks SET type = ? WHERE type = ?', [$rep['id'], $k['id']]);
        q('DELETE FROM categories WHERE id = ?', [$k['id']]);
        audit('categorie.supprimee', 'category', $k['id'], $k['label'] . ($n ? " ($n tâche(s) déplacée(s))" : ''));
    });
    return ['moved' => $n];
}
