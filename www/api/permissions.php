<?php
// Droits d'accès, appliqués côté serveur à chaque requête (l'interface n'est qu'un confort).
//
//   Administrateur : tout.
//   Groupe — responsable : gère le groupe (nom, membres, rôles) et toutes ses tâches ; peut supprimer et restaurer.
//   Groupe — membre      : voit, crée des tâches, coche les étapes, commente ; modifie ses tâches
//                          (créées par lui, qui lui sont attribuées, ou « tout le groupe ») ; supprime celles qu'il a créées.
//   Groupe — lecteur     : voit seulement.
//   Clé d'accès (Claude, ChatGPT…) : mêmes droits que son propriétaire, sauf suppression et administration ; une clé « lecture » ne modifie rien.
declare(strict_types=1);

const ROLES_GROUPE = ['responsable', 'membre', 'lecteur'];

function getUser(mixed $id): ?array { return row('SELECT id, name, role, active, email FROM users WHERE id = ?', [(string)($id ?? '')]); }
function getActiveUser(mixed $id): ?array { return row('SELECT id, name, role, active FROM users WHERE id = ? AND active = 1', [(string)($id ?? '')]); }
function getGroup(mixed $id, bool $withDeleted = false): ?array {
    return row('SELECT * FROM groupes WHERE id = ?' . ($withDeleted ? '' : ' AND deleted_at IS NULL'), [(string)($id ?? '')]);
}
function getTask(mixed $id, bool $withDeleted = false): ?array {
    return row('SELECT * FROM tasks WHERE id = ?' . ($withDeleted ? '' : ' AND deleted_at IS NULL'), [(string)($id ?? '')]);
}
function membersOf(string $gid): array { return array_column(rows('SELECT user_id FROM group_members WHERE group_id = ?', [$gid]), 'user_id'); }
function isMember(string $gid, string $uid): bool { return group_member_role($gid, $uid) !== null; }

function group_member_role(string $gid, string $uid): ?string {
    $r = val('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', [$gid, $uid]);
    return $r === null ? null : (string)$r;
}

// Rôle de $me dans le groupe : « admin », « responsable », « membre », « lecteur » ou null (aucun droit).
function group_role(array $me, string $gid): ?string {
    if ($me['role'] === 'admin') return 'admin';
    return group_member_role($gid, $me['id']);
}
function is_group_manager(array $me, string $gid): bool { return in_array(group_role($me, $gid), ['admin', 'responsable'], true); }

// Actions possibles sur une tâche : view, step, comment, edit, delete, restore.
function task_can(string $action, array $me, array $t): bool {
    $role = group_role($me, $t['group_id']);
    $owner = $t['owner_id'] === $me['id'];
    $creator = $t['created_by'] === $me['id'];
    $manager = in_array($role, ['admin', 'responsable'], true);
    $writer = $manager || $role === 'membre';
    switch ($action) {
        case 'view':    return $role !== null || $owner;
        case 'step':
        case 'comment': return $writer || $owner;
        case 'edit':    return $manager || $creator || $owner || ($role === 'membre' && $t['owner_id'] === null);
        case 'delete':  return !($me['viaToken'] ?? false) && ($manager || $creator);
        case 'restore': return !($me['viaToken'] ?? false) && $manager;
    }
    return false;
}
// Actions sur un groupe : view, create_task, edit (nom, couleur, membres), delete, restore.
function group_can(string $action, array $me, array $g): bool {
    $role = group_role($me, $g['id']);
    $manager = in_array($role, ['admin', 'responsable'], true);
    switch ($action) {
        case 'view':        return $role !== null;
        case 'create_task': return $manager || $role === 'membre';
        case 'edit':        return $manager;
        case 'delete':
        case 'restore':     return !($me['viaToken'] ?? false) && $manager;
    }
    return false;
}

function viewableTask(array $me, mixed $id): array {
    $t = getTask($id);
    if (!$t || !task_can('view', $me, $t)) fail(404, "Cette tâche n'existe plus.");
    return $t;
}
function editableTask(array $me, mixed $id, string $action = 'edit'): array {
    $t = viewableTask($me, $id);
    if (!task_can($action, $me, $t)) fail(403, match ($action) {
        'delete' => 'Seul le créateur de la tâche ou un responsable du groupe peut la supprimer.',
        'step', 'comment' => 'Vous avez un accès en lecture seule à ce groupe.',
        default => 'Vous ne pouvez pas modifier cette tâche (réservée à son créateur, à la personne désignée ou à un responsable du groupe).',
    });
    return $t;
}
function editableStep(array $me, mixed $id, string $action = 'step'): array {
    $s = row('SELECT * FROM steps WHERE id = ?', [(string)($id ?? '')]);
    if (!$s) fail(404, "Cette étape n'existe plus.");
    $t = editableTask($me, $s['task_id'], $action);
    return ['step' => $s, 'task' => $t];
}
function editableGroup(array $me, mixed $id, string $action = 'edit'): array {
    $g = getGroup($id);
    if (!$g || !group_can('view', $me, $g)) fail(404, "Ce groupe n'existe plus.");
    if (!group_can($action, $me, $g)) fail(403, 'Seul un responsable du groupe (ou un administrateur) peut faire cela.');
    return $g;
}

// Une tâche est terminée quand toutes ses étapes sont cochées (ou, sans étape, quand on l'a marquée terminée).
function majTerminee(string $taskId, string $userId): void {
    $t = row('SELECT completed, done_at FROM tasks WHERE id = ?', [$taskId]);
    if (!$t) return;
    $n = row('SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS faites FROM steps WHERE task_id = ?', [$taskId]);
    $fini = (int)$n['total'] > 0 ? (int)$n['faites'] === (int)$n['total'] : (bool)$t['completed'];
    if ($fini && !$t['done_at']) q('UPDATE tasks SET done_at = ?, done_by = ? WHERE id = ?', [now(), $userId, $taskId]);
    elseif (!$fini && $t['done_at']) q('UPDATE tasks SET done_at = NULL, done_by = NULL WHERE id = ?', [$taskId]);
}
// Les tâches terminées depuis plus de 7 jours quittent l'écran (elles restent dans l'historique de l'admin).
const ARCHIVE_JOURS = 7;
function seuilArchive(): string { return gmdate('Y-m-d H:i:s', time() - ARCHIVE_JOURS * 86400); }
function touchTask(string $id): void { q('UPDATE tasks SET updated_at = ? WHERE id = ?', [now(), $id]); }
