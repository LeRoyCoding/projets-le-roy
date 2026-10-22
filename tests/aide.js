// Outils pour les tests : démarre un serveur sur une base temporaire et simule des navigateurs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { open } = require('../server/db');
const { createApp } = require('../server/app');

async function demarrer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projets-test-'));
  const db = open(path.join(dir, 'test.sqlite'));
  const app = createApp({ db, backupDir: path.join(dir, 'sauvegardes') });
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  // Un « navigateur » garde son cookie de session.
  function client() {
    let cookie = '';
    let bearer = null;
    const call = async (method, url, body, { raw = false } = {}) => {
      const headers = {};
      if (cookie) headers.cookie = cookie;
      if (bearer) headers.authorization = 'Bearer ' + bearer;
      if (method !== 'GET') headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      if (raw) return res;
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    };
    return {
      get: u => call('GET', u),
      post: (u, b = {}) => call('POST', u, b),
      put: (u, b = {}) => call('PUT', u, b),
      patch: (u, b = {}) => call('PATCH', u, b),
      del: u => call('DELETE', u),
      raw: (m, u, b) => call(m, u, b, { raw: true }),
      setBearer: t => { bearer = t; },
      async login(name, password) {
        const { data } = await call('GET', '/api/comptes');
        const u = data.users.find(x => x.name === name);
        if (!u) throw new Error('compte introuvable : ' + name);
        return call('POST', '/api/login', { userId: u.id, password });
      },
      async state() { return (await call('GET', '/api/state')).data; }
    };
  }

  const stop = async () => {
    app.locals.closeEvents();
    await new Promise(r => server.close(r));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { base, db, client, stop };
}

// Prépare une équipe : admin + Antoine + Claire, un groupe commun « Le Roy ».
async function equipe(srv) {
  const admin = srv.client();
  await admin.login('Administrateur', 'admin');
  const a = (await admin.post('/api/users', { name: 'Antoine', password: '0000', role: 'user' })).data.id;
  const c = (await admin.post('/api/users', { name: 'Claire', password: '0000', role: 'user' })).data.id;
  const g = (await admin.post('/api/groups', { name: 'Le Roy', icon: 'img:lr', color: '#C4122F', members: [a, c] })).data.id;
  const antoine = srv.client(); await antoine.login('Antoine', '0000');
  const claire = srv.client(); await claire.login('Claire', '0000');
  const st = await antoine.state();
  const persoA = st.groups.find(x => x.name === 'Perso').id;
  return { admin, antoine, claire, ids: { a, c, g, persoA } };
}

const tache = (groupId, extra = {}) => ({
  title: 'Tâche test', groupId, type: 'devis', start: '2026-10-01', end: '2026-10-31', desc: '', steps: [{ label: 'Étape 1' }, { label: 'Étape 2' }], ...extra
});

module.exports = { demarrer, equipe, tache };
