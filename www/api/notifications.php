<?php
// Notifications utiles : on prévient la personne concernée, jamais l'auteur de l'action, et jamais pour du bruit.
//   - une tâche vient de vous être attribuée ;
//   - quelqu'un a commenté une tâche qui vous est attribuée ou que vous avez créée ;
//   - une tâche que vous avez créée vient d'être terminée.
// Les retards et échéances proches se calculent à la volée (pas de stockage) et alimentent la cloche et le résumé quotidien.
declare(strict_types=1);

function notify_user(?string $userId, string $kind, ?string $taskId, ?string $actorId, string $text): void {
    if (!$userId || $userId === $actorId) return;
    $u = getActiveUser($userId); if (!$u) return;
    try {
        q('INSERT INTO notifications (id, user_id, kind, task_id, actor_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [newId(), $userId, $kind, $taskId, $actorId, mb_substr($text, 0, 300), now()]);
    } catch (Throwable $e) { error_log('Notification : ' . $e->getMessage()); }
}

// Tâches (de l'utilisateur) en retard ou à échéance proche : [retard, sous 3 jours, sous 7 jours].
function deadlines_for(array $me): array {
    $today = todayIso();
    $rows = rows('SELECT t.id, t.title, t.end_date, t.owner_id, t.group_id FROM tasks t JOIN groupes g ON g.id = t.group_id
        WHERE t.deleted_at IS NULL AND g.deleted_at IS NULL AND t.done_at IS NULL AND (t.owner_id = ? OR (t.owner_id IS NULL AND t.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)))
        ORDER BY t.end_date', [$me['id'], $me['id']]);
    $late = []; $soon = [];
    foreach ($rows as $r) {
        $d = (int)round((strtotime($r['end_date'] . ' 12:00:00 UTC') - strtotime($today . ' 12:00:00 UTC')) / 86400);
        if ($d < 0) $late[] = ['id' => $r['id'], 'title' => $r['title'], 'end' => $r['end_date'], 'jours' => -$d];
        elseif ($d <= 7) $soon[] = ['id' => $r['id'], 'title' => $r['title'], 'end' => $r['end_date'], 'jours' => $d];
    }
    return ['late' => $late, 'soon' => $soon];
}

function r_notifications(array $c): array {
    $me = $c['me'];
    $list = rows('SELECT n.id, n.kind, n.task_id AS taskId, n.actor_id AS actorId, n.text, n.created_at AS `at`, n.read_at AS readAt FROM notifications n
                  WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 40', [$me['id']]);
    $d = deadlines_for($me);
    return ['notifications' => $list, 'unread' => (int)val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$me['id']]),
            'retard' => $d['late'], 'bientot' => $d['soon']];
}
function r_notifications_read(array $c): array {
    $ids = is_array($c['b']['ids'] ?? null) ? array_map('strval', $c['b']['ids']) : null;
    if ($ids === null) q('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now(), $c['me']['id']]);
    elseif ($ids) q('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (' . in($ids) . ')', array_merge([now(), $c['me']['id']], $ids));
    q('DELETE FROM notifications WHERE user_id = ? AND created_at < ?', [$c['me']['id'], gmdate('Y-m-d H:i:s', time() - 60 * 86400)]);
    return ['ok' => true];
}

// Texte du résumé quotidien d'une personne (null s'il n'y a rien à dire).
function digest_text(array $u, string $baseUrl): ?string {
    $d = deadlines_for($u);
    $mgr = rows("SELECT t.title, t.end_date, g.name AS groupe FROM tasks t JOIN groupes g ON g.id = t.group_id
        JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ? AND gm.role = 'responsable'
        WHERE t.deleted_at IS NULL AND g.deleted_at IS NULL AND t.done_at IS NULL AND t.end_date < ? AND (t.owner_id IS NULL OR t.owner_id <> ?) ORDER BY t.end_date LIMIT 30", [$u['id'], todayIso(), $u['id']]);
    $unread = (int)val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$u['id']]);
    $soon3 = array_values(array_filter($d['soon'], fn($t) => $t['jours'] <= 3));
    if (!$d['late'] && !$soon3 && !$mgr && !$unread) return null;
    $out = ["Bonjour {$u['name']},", ''];
    if ($d['late']) { $out[] = 'EN RETARD (' . count($d['late']) . ') :'; foreach ($d['late'] as $t) $out[] = "  - {$t['title']} — fin le " . frd($t['end']) . " ({$t['jours']} j de retard)"; $out[] = ''; }
    if ($soon3) { $out[] = 'À FAIRE DANS LES 3 JOURS :'; foreach ($soon3 as $t) $out[] = "  - {$t['title']} — " . ($t['jours'] === 0 ? "aujourd'hui" : 'dans ' . $t['jours'] . ' j') . ' (' . frd($t['end']) . ')'; $out[] = ''; }
    if ($mgr) { $out[] = 'TÂCHES EN RETARD DANS VOS GROUPES (vous en êtes responsable) :'; foreach ($mgr as $t) $out[] = "  - [{$t['groupe']}] {$t['title']} — fin le " . frd($t['end_date']); $out[] = ''; }
    if ($unread) { $out[] = "$unread notification(s) non lue(s) dans l'application."; $out[] = ''; }
    $out[] = "Ouvrir l'application : $baseUrl";
    $out[] = '';
    $out[] = "Vous recevez ce résumé parce que vous l'avez demandé (page Compte). Vous pouvez l'arrêter à tout moment.";
    return implode("\n", $out);
}
