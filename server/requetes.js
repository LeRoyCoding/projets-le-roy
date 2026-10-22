// Lectures et règles d'accès communes à toutes les routes.
const { fail } = require('./outils');

module.exports = function requetes(db) {
  const q = {};
  q.getUser = id => db.prepare('SELECT id, name, role, active FROM users WHERE id = ?').get(String(id ?? ''));
  q.getActiveUser = id => db.prepare('SELECT id, name, role, active FROM users WHERE id = ? AND active = 1').get(String(id ?? ''));
  q.getGroup = id => db.prepare('SELECT * FROM groupes WHERE id = ?').get(String(id ?? ''));
  q.getTask = id => db.prepare('SELECT * FROM tasks WHERE id = ?').get(String(id ?? ''));
  q.membersOf = gid => db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(gid).map(r => r.user_id);
  q.isMember = (gid, uid) => !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(gid, uid);

  // Voir / modifier une tâche : admin, responsable de la tâche ou membre du groupe.
  q.canSeeTask = (me, t) => me.role === 'admin' || t.owner_id === me.id || q.isMember(t.group_id, me.id);
  q.canEditTask = q.canSeeTask;

  q.editableTask = (me, id) => {
    const t = q.getTask(id);
    if (!t) fail(404, 'Cette tâche n\'existe plus.');
    if (!q.canEditTask(me, t)) fail(403, 'Vous ne pouvez pas modifier cette tâche.');
    return t;
  };
  q.editableStep = (me, id) => {
    const s = db.prepare('SELECT * FROM steps WHERE id = ?').get(String(id ?? ''));
    if (!s) fail(404, 'Cette étape n\'existe plus.');
    const t = q.editableTask(me, s.task_id);
    return { step: s, task: t };
  };
  q.editableGroup = (me, id) => {
    const g = q.getGroup(id);
    if (!g) fail(404, 'Ce groupe n\'existe plus.');
    if (me.role !== 'admin' && !q.isMember(g.id, me.id)) fail(403, 'Vous ne faites pas partie de ce groupe.');
    return g;
  };
  q.touch = taskId => db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(taskId);
  return q;
};
