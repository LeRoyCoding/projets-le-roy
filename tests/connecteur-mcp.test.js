// Connecteur en ligne (www/api/mcp.php) pour ChatGPT et Claude : clé obligatoire, désactivé par défaut.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, equipe } = require('./aide');

let srv, E, cle;
before(async () => {
  srv = await demarrer(); E = await equipe(srv);
  cle = (await E.antoine.post('/api/tokens', { name: 'ChatGPT' })).data.token;
});
after(() => srv.stop());

const rpc = (chemin, body, headers = {}) => fetch(srv.base + chemin, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const appel = async (name, args = {}) => (await (await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } })).json()).result;

test('désactivé par défaut, activation réservée à l\'admin', async () => {
  assert.equal((await E.admin.state()).connecteur.actif, false);
  assert.equal((await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 403);
  assert.equal((await E.antoine.post('/api/connecteur', { actif: true })).status, 403);
  assert.equal((await E.admin.post('/api/connecteur', { actif: true })).data.actif, true);
  assert.equal((await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 200);
});

test('sans clé ou avec une mauvaise clé : refusé', async () => {
  assert.equal((await rpc('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  assert.equal((await rpc('/mcp/lr_' + '0'.repeat(64), { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  assert.equal((await fetch(srv.base + '/mcp/' + cle)).status, 405);
});

test('poignée de main et liste des outils (clé dans l\'adresse)', async () => {
  const r = await (await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt', version: '1' } } })).json();
  assert.equal(r.result.serverInfo.name, 'projets-le-roy');
  assert.equal((await rpc('/mcp/' + cle, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const l = await (await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  const noms = l.result.tools.map(t => t.name);
  for (const x of ['resume_taches', 'creer_tache', 'search', 'fetch']) assert.ok(noms.includes(x), x);
  for (const t of l.result.tools) assert.equal(typeof t.inputSchema.properties, 'object');
});

test('clé dans l\'en-tête Authorization et envoi groupé', async () => {
  const data = await (await rpc('/mcp', [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }], { authorization: 'Bearer ' + cle })).json();
  assert.equal(data.length, 2);
});

test('créer, modifier, cocher, commenter et retrouver une tâche', async () => {
  const c = await appel('creer_tache', { titre: 'Devis ChatGPT élevage Dupont', groupe: 'Le Roy', fin: '30/11/2026', priorite: 'urgente', etapes: ['Visite', 'Chiffrage'] });
  assert.ok(!c.isError, c.content[0].text);
  const id = c.content[0].text.match(/\[([0-9a-f]+)\]/)[1];
  assert.ok(!(await appel('cocher_etape', { tache_id: id, etape: 'visite' })).isError);
  assert.ok(!(await appel('modifier_tache', { id, priorite: 'basse', description: 'Client Dupont' })).isError);
  assert.ok(!(await appel('commenter', { tache_id: id, texte: 'via ChatGPT' })).isError);
  const v = (await appel('voir_tache', { id })).content[0].text;
  assert.match(v, /\[x\] Visite/);
  assert.match(v, /Priorité : basse/);
  assert.match(v, /via ChatGPT/);
  const s = JSON.parse((await appel('search', { query: 'dupont éLEVAGE' })).content[0].text);
  assert.equal(s.results.length, 1);
  const f = JSON.parse((await appel('fetch', { id: s.results[0].id })).content[0].text);
  assert.match(f.text, /Chiffrage/);
  assert.ok((await E.claire.state()).tasks.some(t => t.id === id && t.priority === 4));
  const r = await appel('resume_taches', {});
  assert.match(r.content[0].text, /Connecté en tant que Antoine/);
});

test('erreurs lisibles', async () => {
  const r = await appel('creer_tache', { titre: 'x', groupe: 'Inconnu', fin: '2026-11-01' });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /introuvable/);
  const u = await (await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope', arguments: {} } })).json();
  assert.ok(u.error);
});

test('une clé supprimée ne marche plus', async () => {
  const k = (await E.claire.post('/api/tokens', { name: 'temp' })).data.token;
  assert.equal((await rpc('/mcp/' + k, { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 200);
  const id = (await E.claire.get('/api/tokens')).data.tokens.find(t => t.name === 'temp').id;
  await E.claire.del('/api/tokens/' + id);
  assert.equal((await rpc('/mcp/' + k, { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 401);
});

test('blocage après 20 essais avec une mauvaise clé', async () => {
  for (let i = 0; i < 20; i++) await rpc('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.equal((await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 429);
});

test('désactiver le connecteur le ferme', async () => {
  await E.admin.post('/api/connecteur', { actif: false });
  assert.equal((await rpc('/mcp/' + cle, { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 403);
});
