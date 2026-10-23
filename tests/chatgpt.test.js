// Connecteur ChatGPT (server/mcp-http.js) : protocole MCP sur HTTP, clé obligatoire, désactivé par défaut.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, equipe } = require('./aide');
const { creerServeurMcp, pilote } = require('../server/mcp-http');

let srv, E, mcp, url, cle;
before(async () => {
  srv = await demarrer(); E = await equipe(srv);
  cle = (await E.antoine.post('/api/tokens', { name: 'ChatGPT' })).data.token;
  const mainPort = Number(new URL(srv.base).port);
  mcp = creerServeurMcp({ mainPort });
  await new Promise(r => mcp.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${mcp.address().port}`;
});
after(async () => { mcp.close(); mcp.closeAllConnections(); await srv.stop(); });

const rpc = (chemin, body, headers = {}) => fetch(url + chemin, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const appel = async (name, args = {}) => (await (await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } })).json()).result;

test('page d\'accueil du connecteur (vérification du tunnel)', async () => {
  const r = await fetch(url + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Projets Le Roy/);
});

test('sans clé ou avec une mauvaise clé : refusé', async () => {
  assert.equal((await rpc('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  assert.equal((await rpc('/mcp/lr_' + '0'.repeat(64), { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  assert.equal((await fetch(url + '/autre')).status, 404);
  assert.equal((await fetch(url + '/mcp/' + cle)).status, 405);
});

test('poignée de main et liste des outils (clé dans l\'adresse)', async () => {
  const r = await (await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt', version: '1' } } })).json();
  assert.equal(r.result.serverInfo.name, 'projets-le-roy');
  const n = await rpc('/mcp/' + cle, { jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(n.status, 202);
  const l = await (await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  const noms = l.result.tools.map(t => t.name);
  for (const x of ['resume_taches', 'creer_tache', 'search', 'fetch']) assert.ok(noms.includes(x), x);
});

test('clé dans l\'en-tête Authorization et envoi groupé', async () => {
  const r = await rpc('/mcp', [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }], { authorization: 'Bearer ' + cle });
  const data = await r.json();
  assert.equal(data.length, 2);
});

test('créer une tâche puis la retrouver avec search et fetch', async () => {
  const c = await appel('creer_tache', { titre: 'Devis ChatGPT élevage Dupont', groupe: 'Le Roy', fin: '30/11/2026', etapes: ['Visite'] });
  assert.ok(!c.isError, c.content[0].text);
  const s = JSON.parse((await appel('search', { query: 'dupont' })).content[0].text);
  assert.equal(s.results.length, 1);
  const f = JSON.parse((await appel('fetch', { id: s.results[0].id })).content[0].text);
  assert.match(f.text, /Visite/);
  // La tâche est bien dans l'application, au nom d'Antoine (droits de sa clé)
  const st = await E.claire.state();
  assert.ok(st.tasks.some(t => t.title === 'Devis ChatGPT élevage Dupont'));
});

test('une clé supprimée ne marche plus', async () => {
  const k = (await E.claire.post('/api/tokens', { name: 'temp' })).data.token;
  assert.equal((await rpc('/mcp/' + k, { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 200);
  const id = (await E.claire.get('/api/tokens')).data.tokens.find(t => t.name === 'temp').id;
  await E.claire.del('/api/tokens/' + id);
  // la validation est gardée 60 s en mémoire : un nouveau serveur ne la connaît pas
  const mainPort = Number(new URL(srv.base).port);
  const m2 = creerServeurMcp({ mainPort }); await new Promise(r => m2.listen(0, '127.0.0.1', r));
  const r = await fetch(`http://127.0.0.1:${m2.address().port}/mcp/${k}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
  assert.equal(r.status, 401);
  m2.close();
});

test('blocage après 20 essais avec une mauvaise clé', async () => {
  for (let i = 0; i < 20; i++) await rpc('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '203.0.113.9' });
  assert.equal((await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '203.0.113.9' })).status, 429);
  assert.equal((await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '203.0.113.10' })).status, 200);
});

test('activation réservée à l\'admin, désactivé par défaut', async () => {
  assert.equal((await E.admin.state()).connecteur.actif, false);
  assert.equal((await E.antoine.post('/api/connecteur', { actif: true })).status, 403);
  assert.equal((await E.admin.post('/api/connecteur', { actif: true })).data.actif, true);
  const p = pilote({ db: srv.db, mainPort: 1, port: 0, log: () => {} });
  p.appliquer(); assert.equal(p.estActif(), true);
  await E.admin.post('/api/connecteur', { actif: false });
  p.appliquer(); assert.equal(p.estActif(), false);
});
