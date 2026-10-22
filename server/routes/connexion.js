// Écran de connexion : liste des comptes, connexion, déconnexion.
const bcrypt = require('bcryptjs');
const { fail, newToken, hashToken } = require('../outils');

module.exports = function (app, { db, demo, handle, COOKIE, SESSION_DAYS }) {
  app.get('/api/comptes', handle(() => ({
    users: db.prepare("SELECT id, name, role FROM users WHERE active = 1 ORDER BY role = 'admin' DESC, name").all(),
    defaultAdminPassword: db.getSetting('default_admin_password') === '1',
    demo
  })));

  // Limite les essais : 5 erreurs de suite sur un compte = 1 minute d'attente.
  const failures = new Map();
  app.post('/api/login', handle((req, res) => {
    const { userId, password } = req.body || {};
    const row = db.prepare('SELECT id, password_hash FROM users WHERE id = ? AND active = 1').get(String(userId || ''));
    if (!row) fail(401, 'Compte inconnu ou désactivé.');
    const f = failures.get(row.id);
    const recent = f && Date.now() - f.last < 60000;
    if (recent && f.count >= 5) fail(429, 'Trop d\'essais. Patientez une minute.');
    if (typeof password !== 'string' || !bcrypt.compareSync(password, row.password_hash)) {
      failures.set(row.id, { count: (recent ? f.count : 0) + 1, last: Date.now() });
      fail(401, 'Mot de passe incorrect.');
    }
    failures.delete(row.id);
    const token = newToken();
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(hashToken(token), row.id);
    db.prepare("DELETE FROM sessions WHERE last_seen < datetime('now', ?)").run(`-${SESSION_DAYS} days`);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
    return { ok: true };
  }));

  app.post('/api/logout', handle((req, res) => {
    const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
    if (m) db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(m[1]));
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return { ok: true };
  }));
};
