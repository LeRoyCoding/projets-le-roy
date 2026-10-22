// Comptes : mot de passe, équipe (admin), clés d'accès pour Claude, sauvegarde.
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const { fail, str, newId, newToken, hashToken, todayIso } = require('../outils');
const { GROUP_COLORS } = require('./groupes');

module.exports = function (app, { db, auth, adminOnly, handle, q }) {
  const checkPassword = (p, label = 'Le mot de passe') => {
    if (typeof p !== 'string' || p.length < 4) fail(400, `${label} doit faire au moins 4 caractères.`);
    if (p.length > 200) fail(400, `${label} est trop long.`);
    return p;
  };
  const activeAdmins = () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n;

  app.post('/api/password', auth, handle(req => {
    const { oldPassword, newPassword } = req.body || {};
    const row = db.prepare('SELECT password_hash, role FROM users WHERE id = ?').get(req.me.id);
    if (typeof oldPassword !== 'string' || !bcrypt.compareSync(oldPassword, row.password_hash)) fail(400, 'Le mot de passe actuel ne correspond pas.');
    checkPassword(newPassword, 'Le nouveau mot de passe');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.me.id);
    // Les autres appareils connectés à ce compte devront se reconnecter.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(req.me.id, req.me.sessionHash || '');
    if (row.role === 'admin') db.setSetting('default_admin_password', '0');
  }));

  /* ---------- Équipe (admin) ---------- */
  app.post('/api/users', auth, adminOnly, handle(req => {
    const name = str(req.body.name, 60, 'Le nom', true);
    const password = checkPassword(req.body.password);
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name)) fail(400, 'Ce nom est déjà utilisé.');
    const id = newId();
    db.tx(() => {
      db.prepare('INSERT INTO users (id, name, password_hash, role) VALUES (?, ?, ?, ?)').run(id, name, bcrypt.hashSync(password, 10), role);
      if (role === 'user') {
        // Chaque utilisateur reçoit son groupe privé « Perso ».
        const n = db.prepare('SELECT COUNT(*) AS n FROM groupes').get().n;
        const gid = newId();
        db.prepare('INSERT INTO groupes (id, name, icon, color) VALUES (?, ?, ?, ?)').run(gid, 'Perso', '🏡', GROUP_COLORS[2 + (n % 4)]);
        db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(gid, id);
      }
    });
    return { id };
  }, { notify: true }));

  // Modifier un compte : nom, rôle, actif, nouveau mot de passe (facultatif).
  app.put('/api/users/:id', auth, adminOnly, handle(req => {
    const u = q.getUser(req.params.id);
    if (!u) fail(404, 'Ce compte n\'existe plus.');
    const b = req.body || {};
    const name = b.name === undefined ? u.name : str(b.name, 60, 'Le nom', true);
    const role = b.role === undefined ? u.role : (b.role === 'admin' ? 'admin' : 'user');
    const active = b.active === undefined ? u.active : (b.active ? 1 : 0);
    if (db.prepare('SELECT 1 FROM users WHERE name = ? AND id <> ?').get(name, u.id)) fail(400, 'Ce nom est déjà utilisé.');
    if (u.id === req.me.id && !active) fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
    const removesAdmin = u.role === 'admin' && u.active && (role !== 'admin' || !active);
    if (removesAdmin && activeAdmins() <= 1) fail(400, 'Il faut garder au moins un administrateur actif.');
    const password = b.password ? checkPassword(b.password, 'Le nouveau mot de passe') : null;
    db.tx(() => {
      db.prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(name, role, active, u.id);
      if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), u.id);
      // Nouveau mot de passe ou compte désactivé : ses appareils sont déconnectés.
      if (password || !active) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(u.id, req.me.sessionHash || '');
      if (!active) db.prepare('DELETE FROM api_tokens WHERE user_id = ?').run(u.id);
      if (password && role === 'admin' && u.id === req.me.id) db.setSetting('default_admin_password', '0');
    });
  }, { notify: true }));

  /* ---------- Clés d'accès (lien avec Claude ou d'autres outils) ---------- */
  app.get('/api/tokens', auth, handle(req => ({
    tokens: db.prepare('SELECT id, name, created_at AS createdAt, last_used AS lastUsed FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC').all(req.me.id)
  })));

  app.post('/api/tokens', auth, handle(req => {
    if (req.me.viaToken) fail(403, 'Une clé d\'accès ne peut pas créer d\'autres clés.');
    const name = str(req.body.name, 60, 'Le nom de la clé') || 'Claude';
    if (db.prepare('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?').get(req.me.id).n >= 10) fail(400, 'Vous avez déjà 10 clés : supprimez-en une.');
    const token = 'lr_' + newToken();
    db.prepare('INSERT INTO api_tokens (id, user_id, name, token_hash) VALUES (?, ?, ?, ?)').run(newId(), req.me.id, name, hashToken(token));
    return { token }; // affichée une seule fois
  }));

  app.delete('/api/tokens/:id', auth, handle(req => {
    const r = db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(String(req.params.id), req.me.id);
    if (!r.changes) fail(404, 'Cette clé n\'existe plus.');
  }));

  /* ---------- Sauvegarde à télécharger (admin) ---------- */
  app.get('/api/sauvegarde', auth, adminOnly, (req, res) => {
    const tmp = path.join(os.tmpdir(), `projets-le-roy-${process.pid}-${Date.now()}.sqlite`);
    try {
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      res.download(tmp, `projets-le-roy-${todayIso()}.sqlite`, () => fs.rm(tmp, { force: true }, () => {}));
    } catch (e) {
      console.error(e);
      fs.rm(tmp, { force: true }, () => {});
      res.status(500).json({ error: 'Sauvegarde impossible.' });
    }
  });
};
