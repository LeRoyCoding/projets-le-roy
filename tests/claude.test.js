// Le connecteur Claude (outils/claude-mcp.js), lancé comme le ferait Claude Desktop.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const { demarrer, equipe } = require('./aide');
const { parseDate } = require('../outils/claude-mcp');

let srv, E, proc, call;
before(async () => {
  srv = await demarrer(); E = await equipe(srv);
  const { token } = (await E.antoine.post('/api/tokens', { name: 'Test' })).data;
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'outils', 'claude-mcp.js')], { env: { ...process.env, PROJETS_URL: srv.base, PROJETS_CLE: token } });
  let buf = ''; const waiters = {}; let n = 0;
  proc.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiters[m.id]?.(m); } });
  call = (method, params) => new Promise(r => { const id = ++n; waiters[id] = r; proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
});
after(async () => { proc.kill(); await srv.stop(); });
const tool = async (name, args = {}) => (await call('tools/call', { name, arguments: args })).result;

test('dates acceptées par le connecteur', () => {
  assert.equal(parseDate('15/11/2026'), '2026-11-15');
  assert.equal(parseDate('2026-1-5'), '2026-01-05');
  assert.throws(() => parseDate('demain', 'Fin'));
});

test('poignée de main MCP et liste des outils', async () => {
  const r = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(r.result.serverInfo.name, 'projets-le-roy');
  const l = await call('tools/list', {});
  assert.ok(l.result.tools.some(t => t.name === 'creer_tache'));
  for (const t of l.result.tools) assert.match(t.name, /^[a-z_]+$/);
});

test('créer, cocher, commenter et relire une tâche', async () => {
  const c = await tool('creer_tache', { titre: 'Devis Martin', groupe: 'Le Roy', pour_qui: 'Claire', fin: '15/11/2026', etapes: ['Visite', 'Chiffrage'] });
  assert.ok(!c.isError, c.content[0].text);
  const id = c.content[0].text.match(/\[([0-9a-f]+)\]/)[1];
  assert.ok(!(await tool('cocher_etape', { tache_id: id, etape: 'visite' })).isError);
  assert.ok(!(await tool('commenter', { tache_id: id, texte: 'via Claude' })).isError);
  const v = (await tool('voir_tache', { id })).content[0].text;
  assert.match(v, /\[x\] Visite/);
  assert.match(v, /via Claude/);
  const st = await E.claire.state();
  assert.equal(st.tasks.find(t => t.id === id).ownerId, E.ids.c);
});

test('erreurs lisibles', async () => {
  const r = await tool('creer_tache', { titre: 'x', groupe: 'Inconnu', fin: '2026-11-01' });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /introuvable/);
  const u = await call('tools/call', { name: 'nope', arguments: {} });
  assert.ok(u.error);
});
