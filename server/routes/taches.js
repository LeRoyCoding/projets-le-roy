// Tâches et étapes.
const { fail, str, isDate, newId } = require('../outils');

const TYPES = ['devis', 'chantier', 'commercial', 'dev', 'admin', 'prod', 'event', 'perso'];

module.exports = function (app, { db, auth, handle, q }) {
  function readTask(me, body, existing = null) {
    const b = body || {};
    const title = str(b.title, 200, 'Le titre', true);
    const desc = str(b.desc, 5000, 'La description');
    const type = TYPES.includes(b.type) ? b.type : 'devis';
    if (!isDate(b.start) || !isDate(b.end)) fail(400, 'Renseignez des dates de début et de fin valides.');
    if (b.end < b.start) fail(400, 'La date de fin doit être après la date de début.');
    const g = q.getGroup(b.groupId);
    if (!g) fail(400, 'Choisissez un groupe.');
    const members = q.membersOf(g.id);
    // Une personne hors du groupe peut modifier une tâche qui lui est attribuée, sans la déplacer.
    const keepsOwnTask = existing && existing.group_id === g.id && existing.owner_id === me.id;
    if (me.role !== 'admin' && !members.includes(me.id) && !keepsOwnTask) fail(403, 'Vous ne faites pas partie de ce groupe.');
    let ownerId = b.ownerId ? String(b.ownerId) : null;
    if (ownerId && !q.getUser(ownerId)) fail(400, 'Personne inconnue.');
    const unchangedOwner = existing && existing.owner_id === ownerId;
    if (ownerId && !unchangedOwner && !members.includes(ownerId) && ownerId !== me.id) fail(400, 'Cette personne ne fait pas partie du groupe.');
    if (!ownerId && members.length < 2) ownerId = members[0] || me.id; // groupe privé : la tâche est à son unique membre
    if (!Array.isArray(b.steps ?? [])) fail(400, 'Liste d\'étapes illisible.');
    if ((b.steps || []).length > 200) fail(400, 'Trop d\'étapes (200 maximum).');
    const steps = (b.steps || []).map(s => ({
      id: s && typeof s.id === 'string' ? s.id : null,
      label: str(s && s.label, 300, 'Le nom d\'une étape'),
      desc: str(s && s.desc, 2000, 'La description d\'une étape'),
      done: !!(s && s.done)
    })).filter(s => s.label);
    return { title, desc, type, start: b.start, end: b.end, groupId: g.id, ownerId, steps };
  }

  function writeSteps(taskId, steps) {
    const existing = new Set(db.prepare('SELECT id FROM steps WHERE task_id = ?').all(taskId).map(r => r.id));
    const keep = new Set();
    steps.forEach((s, i) => {
      if (s.id && existing.has(s.id) && !keep.has(s.id)) {
        db.prepare('UPDATE steps SET position = ?, label = ?, description = ?, done = ? WHERE id = ?').run(i, s.label, s.desc, s.done ? 1 : 0, s.id);
        keep.add(s.id);
      } else {
        db.prepare('INSERT INTO steps (id, task_id, position, label, description, done) VALUES (?, ?, ?, ?, ?, ?)').run(newId(), taskId, i, s.label, s.desc, s.done ? 1 : 0);
      }
    });
    for (const id of existing) if (!keep.has(id)) db.prepare('DELETE FROM steps WHERE id = ?').run(id);
  }

  app.post('/api/tasks', auth, handle(req => {
    const d = readTask(req.me, req.body);
    const id = newId();
    db.tx(() => {
      db.prepare(`INSERT INTO tasks (id, group_id, owner_id, type, title, description, start_date, end_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, d.groupId, d.ownerId, d.type, d.title, d.desc, d.start, d.end, req.me.id);
      writeSteps(id, d.steps);
    });
    return { id };
  }, { notify: true }));

  app.put('/api/tasks/:id', auth, handle(req => {
    const t = q.editableTask(req.me, req.params.id);
    const d = readTask(req.me, req.body, t);
    db.tx(() => {
      db.prepare(`UPDATE tasks SET group_id = ?, owner_id = ?, type = ?, title = ?, description = ?, start_date = ?, end_date = ?,
        updated_at = datetime('now') WHERE id = ?`).run(d.groupId, d.ownerId, d.type, d.title, d.desc, d.start, d.end, t.id);
      writeSteps(t.id, d.steps);
    });
  }, { notify: true }));

  app.delete('/api/tasks/:id', auth, handle(req => {
    const t = q.editableTask(req.me, req.params.id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id);
  }, { notify: true }));

  /* ---------- Étapes ---------- */
  app.post('/api/tasks/:id/steps', auth, handle(req => {
    const t = q.editableTask(req.me, req.params.id);
    const label = str(req.body.label, 300, 'Le nom de l\'étape', true);
    const desc = str(req.body.desc, 2000, 'La description');
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM steps WHERE task_id = ?').get(t.id).p;
    const id = newId();
    db.prepare('INSERT INTO steps (id, task_id, position, label, description) VALUES (?, ?, ?, ?, ?)').run(id, t.id, pos, label, desc);
    q.touch(t.id);
    return { id };
  }, { notify: true }));

  app.patch('/api/steps/:id', auth, handle(req => {
    const { step } = q.editableStep(req.me, req.params.id);
    db.prepare('UPDATE steps SET done = ? WHERE id = ?').run(req.body.done ? 1 : 0, step.id);
    q.touch(step.task_id);
  }, { notify: true }));

  app.delete('/api/steps/:id', auth, handle(req => {
    const { step } = q.editableStep(req.me, req.params.id);
    db.prepare('DELETE FROM steps WHERE id = ?').run(step.id);
    q.touch(step.task_id);
  }, { notify: true }));
};
