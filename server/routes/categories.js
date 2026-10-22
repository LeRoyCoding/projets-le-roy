// Catégories de tâches (Devis, Chantier… et celles que l'équipe ajoute).
// Tout le monde peut en créer, les renommer ou les masquer.
// Supprimer : possible si aucune tâche ne l'utilise ; sinon l'admin peut d'abord déplacer ses tâches vers une autre catégorie.
const { fail, str, newId } = require('../outils');

module.exports = function (app, { db, auth, handle }) {
  const getCat = id => db.prepare('SELECT * FROM categories WHERE id = ?').get(String(id ?? ''));
  const usage = id => db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE type = ?').get(id).n;

  function read(body) {
    const b = body || {};
    const label = str(b.label, 40, 'Le nom de la catégorie', true);
    const emoji = str(b.emoji, 16, 'Le pictogramme') || '📁';
    return { label, emoji };
  }
  const sameLabel = (label, exceptId = '') =>
    db.prepare('SELECT 1 FROM categories WHERE lower(label) = lower(?) AND id <> ?').get(label, exceptId);

  app.post('/api/categories', auth, handle(req => {
    const d = read(req.body);
    if (sameLabel(d.label)) fail(400, 'Une catégorie porte déjà ce nom.');
    const id = newId();
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories').get().p;
    db.prepare('INSERT INTO categories (id, label, emoji, position, created_by) VALUES (?, ?, ?, ?, ?)').run(id, d.label, d.emoji, pos, req.me.id);
    return { id };
  }, { notify: true }));

  app.put('/api/categories/:id', auth, handle(req => {
    const c = getCat(req.params.id);
    if (!c) fail(404, 'Cette catégorie n\'existe plus.');
    const d = read(req.body);
    if (sameLabel(d.label, c.id)) fail(400, 'Une catégorie porte déjà ce nom.');
    const hidden = req.body.hidden === undefined ? c.hidden : (req.body.hidden ? 1 : 0);
    if (hidden && !c.hidden && db.prepare('SELECT COUNT(*) AS n FROM categories WHERE hidden = 0').get().n <= 1) {
      fail(400, 'Il faut garder au moins une catégorie visible.');
    }
    db.prepare('UPDATE categories SET label = ?, emoji = ?, hidden = ? WHERE id = ?').run(d.label, d.emoji, hidden, c.id);
  }, { notify: true }));

  // Nouvel ordre d'affichage : liste complète des identifiants.
  app.post('/api/categories/ordre', auth, handle(req => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : fail(400, 'Ordre illisible.');
    db.tx(() => ids.forEach((id, i) => db.prepare('UPDATE categories SET position = ? WHERE id = ?').run(i, id)));
  }, { notify: true }));

  app.delete('/api/categories/:id', auth, handle(req => {
    const c = getCat(req.params.id);
    if (!c) fail(404, 'Cette catégorie n\'existe plus.');
    const n = usage(c.id);
    const replaceBy = req.query.remplacer ? getCat(req.query.remplacer) : null;
    if (n && !replaceBy) fail(400, `Cette catégorie est utilisée par ${n} tâche${n > 1 ? 's' : ''}. Masquez-la plutôt, ou choisissez une catégorie de remplacement.`);
    if (n && req.me.role !== 'admin') fail(403, 'Seul l\'administrateur peut supprimer une catégorie utilisée.');
    if (replaceBy && replaceBy.id === c.id) fail(400, 'Choisissez une autre catégorie de remplacement.');
    if (db.prepare('SELECT COUNT(*) AS n FROM categories WHERE hidden = 0 AND id <> ?').get(c.id).n < 1) fail(400, 'Il faut garder au moins une catégorie visible.');
    db.tx(() => {
      if (n) db.prepare('UPDATE tasks SET type = ? WHERE type = ?').run(replaceBy.id, c.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(c.id);
    });
    return { moved: n };
  }, { notify: true }));
};
