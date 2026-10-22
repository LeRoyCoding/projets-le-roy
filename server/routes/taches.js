// Tâches, étapes, commentaires et historique.
const { fail, str, isDate, newId } = require('../outils');

module.exports = function (app, { db, auth, handle, q }) {
  // Historique : qui a fait quoi sur une tâche.
  const log = (taskId, userId, action, detail = '') =>
    db.prepare('INSERT INTO activity (task_id, user_id, action, detail) VALUES (?, ?, ?, ?)').run(taskId, userId, action, String(detail).slice(0, 300));

  function readCategory(value, existing) {
    const id = String(value ?? '');
    const c = db.prepare('SELECT id, hidden FROM categories WHERE id = ?').get(id);
    // Une catégorie masquée reste acceptée pour une tâche qui l'avait déjà.
    if (c && (!c.hidden || (existing && existing.type === c.id))) return c.id;
    if (c && c.hidden) fail(400, 'Cette catégorie est masquée : choisissez-en une autre.');
    const first = db.prepare('SELECT id FROM categories WHERE hidden = 0 ORDER BY position, label LIMIT 1').get();
    if (!first) fail(400, 'Aucune catégorie disponible.');
    return first.id;
  }

  function readTask(me, body, existing = null) {
    const b = body || {};
    const title = str(b.title, 200, 'Le titre', true);
    const desc = str(b.desc, 5000, 'La description');
    const type = readCategory(b.type, existing);
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
    if (ownerId && !unchangedOwner && !q.getActiveUser(ownerId)) fail(400, 'Ce compte est désactivé.');
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
    return { title, desc, type, start: b.start, end: b.end, groupId: g.id, ownerId, steps, completed: b.completed ? 1 : 0 };
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

  // Résumé lisible des changements pour l'historique.
  function describeChanges(before, d) {
    const out = [];
    if (before.title !== d.title) out.push('titre');
    if (before.group_id !== d.groupId) out.push('groupe');
    if ((before.owner_id || null) !== (d.ownerId || null)) {
      const u = d.ownerId ? q.getUser(d.ownerId) : null;
      out.push('responsable → ' + (u ? u.name : 'tout le groupe'));
    }
    if (before.type !== d.type) out.push('catégorie');
    if (before.start_date !== d.start) out.push('début');
    if (before.end_date !== d.end) out.push('fin → ' + d.end.split('-').reverse().join('/'));
    if (before.description !== d.desc) out.push('description');
    return out;
  }

  app.post('/api/tasks', auth, handle(req => {
    const d = readTask(req.me, req.body);
    const id = newId();
    db.tx(() => {
      db.prepare(`INSERT INTO tasks (id, group_id, owner_id, type, title, description, start_date, end_date, created_by, completed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, d.groupId, d.ownerId, d.type, d.title, d.desc, d.start, d.end, req.me.id, d.steps.length ? 0 : d.completed);
      writeSteps(id, d.steps);
      log(id, req.me.id, 'creation');
    });
    return { id };
  }, { notify: true }));

  app.put('/api/tasks/:id', auth, handle(req => {
    const t = q.editableTask(req.me, req.params.id);
    const d = readTask(req.me, { completed: t.completed, ...req.body }, t);
    const before = db.prepare('SELECT label, done FROM steps WHERE task_id = ? ORDER BY position').all(t.id);
    db.tx(() => {
      db.prepare(`UPDATE tasks SET group_id = ?, owner_id = ?, type = ?, title = ?, description = ?, start_date = ?, end_date = ?,
        completed = ?, updated_at = datetime('now') WHERE id = ?`).run(d.groupId, d.ownerId, d.type, d.title, d.desc, d.start, d.end, d.steps.length ? 0 : d.completed, t.id);
      writeSteps(t.id, d.steps);
      const changes = describeChanges(t, d);
      if (before.length !== d.steps.length || before.some((s, i) => s.label !== d.steps[i].label)) changes.push('étapes');
      if (changes.length) log(t.id, req.me.id, 'modification', changes.join(', '));
    });
  }, { notify: true }));

  app.delete('/api/tasks/:id', auth, handle(req => {
    const t = q.editableTask(req.me, req.params.id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id);
  }, { notify: true }));

  // Tâche sans étapes : terminée / pas terminée.
  app.patch('/api/tasks/:id/terminee', auth, handle(req => {
    const t = q.editableTask(req.me, req.params.id);
    const done = req.body.completed ? 1 : 0;
    db.prepare("UPDATE tasks SET completed = ?, updated_at = datetime('now') WHERE id = ?").run(done, t.id);
    log(t.id, req.me.id, done ? 'terminee' : 'rouverte');
  }, { notify: true }));

  // Détails affichés dans la fiche : commentaires et historique.
  app.get('/api/tasks/:id/details', auth, handle(req => {
    const t = q.getTask(req.params.id);
    if (!t || !q.canSeeTask(req.me, t)) fail(404, 'Cette tâche n\'existe plus.');
    return {
      comments: db.prepare(`SELECT c.id, c.body, c.created_at AS at, c.user_id AS userId FROM comments c
        WHERE c.task_id = ? ORDER BY c.created_at, c.rowid`).all(t.id),
      activity: db.prepare(`SELECT a.action, a.detail, a.created_at AS at, a.user_id AS userId FROM activity a
        WHERE a.task_id = ? ORDER BY a.id DESC LIMIT 100`).all(t.id)
    };
  }));

  /* ---------- Étapes ---------- */
  app.post('/api/tasks/:id/steps', auth, handle(req => {
    const t = q.editableTask(req.me, req.params.id);
    const label = str(req.body.label, 300, 'Le nom de l\'étape', true);
    const desc = str(req.body.desc, 2000, 'La description');
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM steps WHERE task_id = ?').get(t.id).p;
    const id = newId();
    db.tx(() => {
      db.prepare('INSERT INTO steps (id, task_id, position, label, description) VALUES (?, ?, ?, ?, ?)').run(id, t.id, pos, label, desc);
      db.prepare('UPDATE tasks SET completed = 0 WHERE id = ?').run(t.id);
      q.touch(t.id);
      log(t.id, req.me.id, 'etape_ajoutee', label);
    });
    return { id };
  }, { notify: true }));

  app.patch('/api/steps/:id', auth, handle(req => {
    const { step } = q.editableStep(req.me, req.params.id);
    const done = req.body.done ? 1 : 0;
    if (done === step.done) return;
    db.tx(() => {
      db.prepare('UPDATE steps SET done = ? WHERE id = ?').run(done, step.id);
      q.touch(step.task_id);
      log(step.task_id, req.me.id, done ? 'etape_cochee' : 'etape_decochee', step.label);
    });
  }, { notify: true }));

  app.delete('/api/steps/:id', auth, handle(req => {
    const { step } = q.editableStep(req.me, req.params.id);
    db.tx(() => {
      db.prepare('DELETE FROM steps WHERE id = ?').run(step.id);
      q.touch(step.task_id);
      log(step.task_id, req.me.id, 'etape_supprimee', step.label);
    });
  }, { notify: true }));

  /* ---------- Commentaires ---------- */
  app.post('/api/tasks/:id/comments', auth, handle(req => {
    const t = q.getTask(req.params.id);
    if (!t || !q.canSeeTask(req.me, t)) fail(404, 'Cette tâche n\'existe plus.');
    const body = str(req.body.body, 3000, 'Le commentaire', true);
    const id = newId();
    db.prepare('INSERT INTO comments (id, task_id, user_id, body) VALUES (?, ?, ?, ?)').run(id, t.id, req.me.id, body);
    return { id };
  }, { notify: true }));

  app.delete('/api/comments/:id', auth, handle(req => {
    const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(String(req.params.id));
    if (!c) fail(404, 'Ce commentaire n\'existe plus.');
    if (req.me.role !== 'admin' && c.user_id !== req.me.id) fail(403, 'Vous ne pouvez supprimer que vos propres commentaires.');
    db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
  }, { notify: true }));
};
