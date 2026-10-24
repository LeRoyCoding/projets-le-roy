// Construit l'application web (sans la démarrer) : utilisé par index.js et par les tests.
const path = require('path');
const express = require('express');
const { HttpError, hashToken } = require('./outils');
const { ROOT } = require('./db');

const COOKIE = 'lr_session';
const SESSION_DAYS = 60;

// Réseau local uniquement : on refuse toute connexion qui ne vient pas d'une adresse privée.
function isLocalAddress(ip = '') {
  ip = String(ip).replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.')) return true;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(ip)) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return /^(fc|fd|fe80)/i.test(ip);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function createApp({ db, demo = false, publicDir = path.join(ROOT, 'public') }) {
  const app = express();
  app.disable('x-powered-by');

  /* ---------- Temps réel (Server-Sent Events) ---------- */
  const listeners = new Set();
  const broadcast = () => { for (const l of listeners) l.res.write('event: change\ndata: {}\n\n'); };
  const ping = setInterval(() => { for (const l of listeners) l.res.write(': ping\n\n'); }, 25000);
  ping.unref();

  /* ---------- Sécurité de base ---------- */
  app.use((req, res, next) => {
    if (!isLocalAddress(req.socket.remoteAddress)) return res.status(403).send('Accès réservé au réseau local.');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'");
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Les modifications doivent arriver en JSON (empêche un autre site de les déclencher).
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && !String(req.headers['content-type'] || '').startsWith('application/json')) {
      return res.status(415).json({ error: 'Requête refusée.' });
    }
    next();
  });

  /* ---------- Qui est connecté ? ---------- */
  const userCols = 'u.id, u.name, u.role';
  function currentUser(req) {
    // 1) Clé d'accès (outils externes, ex. Claude) : en-tête « Authorization: Bearer … »
    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
    if (bearer) {
      const row = db.prepare(`SELECT ${userCols}, t.id AS token_id FROM api_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND u.active = 1`).get(hashToken(bearer[1]));
      if (!row) return null;
      db.prepare("UPDATE api_tokens SET last_used = datetime('now') WHERE id = ?").run(row.token_id);
      return { id: row.id, name: row.name, role: row.role, viaToken: true };
    }
    // 2) Cookie de session (navigateur)
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    const hash = hashToken(token);
    const row = db.prepare(`SELECT ${userCols} FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND u.active = 1 AND s.last_seen > datetime('now', '-${SESSION_DAYS} days')`).get(hash);
    if (!row) return null;
    db.prepare("UPDATE sessions SET last_seen = datetime('now') WHERE token = ? AND last_seen < datetime('now', '-1 hour')").run(hash);
    return { id: row.id, name: row.name, role: row.role, sessionHash: hash };
  }

  const auth = (req, res, next) => {
    const me = currentUser(req);
    if (!me) return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
    req.me = me;
    next();
  };
  const adminOnly = (req, res, next) => (req.me.role === 'admin' ? next() : res.status(403).json({ error: 'Réservé à l\'administrateur.' }));

  // Enveloppe : capture les erreurs et prévient les autres postes après une modification.
  const handle = (fn, { notify = false } = {}) => (req, res) => {
    try {
      const out = fn(req, res);
      if (notify) broadcast();
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'Erreur inattendue du serveur.' });
    }
  };

  const ctx = { db, demo, auth, adminOnly, handle, broadcast, COOKIE, SESSION_DAYS };
  ctx.q = require('./requetes')(db);

  app.get('/api/events', auth, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    const l = { res, userId: req.me.id };
    listeners.add(l);
    req.on('close', () => listeners.delete(l));
  });

  for (const r of ['connexion', 'etat', 'taches', 'groupes', 'categories', 'comptes', 'acces']) require('./routes/' + r)(app, ctx);

  // Connecteur pour Claude, téléchargeable depuis la page Compte.
  app.get('/outils/claude-mcp.js', (req, res) => res.download(path.join(ROOT, 'outils', 'claude-mcp.js'), 'claude-mcp.js'));

  /* ---------- Fichiers de l'application ---------- */
  app.use(express.static(publicDir, {
    setHeaders(res, file) {
      if (/\.(html|js|css|webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Adresse inconnue.' }));
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // Erreurs imprévues (ex. contenu JSON illisible) : toujours une réponse claire en JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status === 400 ? 'Données reçues illisibles.' : 'Erreur inattendue du serveur.' });
  });

  app.locals.closeEvents = () => { clearInterval(ping); for (const l of listeners) l.res.end(); listeners.clear(); };
  return app;
}

module.exports = { createApp, isLocalAddress };
