// Outils pour les tests : démarre le site PHP sur une base MySQL temporaire et simule des navigateurs.
// Variables : LR_DB_HOST, LR_DB_PORT, LR_DB_USER, LR_DB_PASS (un utilisateur MySQL autorisé à créer des bases « lr_t_… »).
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const RACINE = path.join(__dirname, '..');
const phpCli = (args, env) => spawnSync('php', [path.join(RACINE, 'outils', 'test-base.php'), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
const portLibre = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
let compteur = 0;

async function demarrer({ sansAdmin = false } = {}) {
  const nom = `lr_t_${process.pid}_${++compteur}_${Date.now() % 100000}`;
  const env = { LR_DB_NAME: nom };
  let r = phpCli(['create', nom], {});
  if (r.status !== 0) throw new Error('Impossible de créer la base de test : ' + (r.stderr || r.stdout));
  r = sansAdmin ? phpCli(['sql', 'SELECT 1'], env) : phpCli(['admin'], env);
  if (r.status !== 0) throw new Error('Impossible de préparer la base de test : ' + (r.stderr || r.stdout));

  const port = await portLibre();
  const proc = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', path.join(RACINE, 'www'), path.join(RACINE, 'outils', 'serveur-test.php')],
    { env: { ...process.env, ...env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/comptes'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

  // Ordre SQL direct (pour fabriquer des situations de test : dates anciennes…).
  const sql = ordre => { const x = phpCli(['sql', ordre], env); if (x.status !== 0) throw new Error(x.stderr || x.stdout); };

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
    proc.kill();
    await new Promise(r => setTimeout(r, 200));
    phpCli(['drop', nom], {});
  };
  return { base, sql, client, stop };
}

// Prépare une équipe : admin + Antoine + Claire, un groupe commun « Le Roy ».
async function equipe(srv) {
  const admin = srv.client();
  await admin.login('Administrateur', 'admin');
  const a = (await admin.post('/api/users', { name: 'Antoine', password: 'secret0000', role: 'user' })).data.id;
  const c = (await admin.post('/api/users', { name: 'Claire', password: 'secret0000', role: 'user' })).data.id;
  const g = (await admin.post('/api/groups', { name: 'Le Roy', icon: 'img:lr', color: '#C4122F', members: [a, c] })).data.id;
  const antoine = srv.client(); await antoine.login('Antoine', 'secret0000');
  const claire = srv.client(); await claire.login('Claire', 'secret0000');
  const st = await antoine.state();
  const persoA = st.groups.find(x => x.name === 'Perso').id;
  return { admin, antoine, claire, ids: { a, c, g, persoA } };
}

const tache = (groupId, extra = {}) => ({
  title: 'Tâche test', groupId, type: 'devis', start: '2026-10-01', end: '2026-10-31', desc: '', steps: [{ label: 'Étape 1' }, { label: 'Étape 2' }], ...extra
});

module.exports = { demarrer, equipe, tache };
