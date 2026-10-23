#!/usr/bin/env node
// Connecteur « Projets Le Roy » pour Claude (protocole MCP, sans dépendance).
// Claude Desktop le lance sur le PC de l'utilisateur ; il parle à l'application avec une clé d'accès.
//
// Réglages (variables d'environnement, renseignées dans la configuration de Claude) :
//   PROJETS_URL  adresse de l'application, ex. http://192.168.1.25:3000
//   PROJETS_CLE  clé d'accès créée dans l'application (page Compte → Lier à Claude)
'use strict';

const BASE = (process.env.PROJETS_URL || 'http://localhost:3000').replace(/\/+$/, '');
const KEY = process.env.PROJETS_CLE || '';
const { creerOutils, traiter, parseDate, status } = require('./mcp-commun');

/* ---------- Appels à l'application ---------- */
async function api(method, url, body) {
  if (!KEY) throw new Error('Clé d\'accès absente : renseignez PROJETS_CLE dans la configuration de Claude.');
  let res;
  try {
    res = await fetch(BASE + url, {
      method,
      headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error(`L'application ne répond pas à ${BASE}. Le PC serveur est-il allumé, et êtes-vous sur le réseau du bureau ?`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Clé d\'accès refusée (supprimée, ou compte désactivé). Créez-en une nouvelle dans la page Compte.');
  if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
  return data;
}

const TOOLS = creerOutils(api);

/* ---------- Protocole MCP sur l'entrée/sortie standard (Claude Desktop) ---------- */
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');

function listen() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Message illisible' } }); continue; }
      traiter(msg, TOOLS).then(r => { if (r) send(r); }, e => { if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } }); });
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
if (require.main === module) listen();

module.exports = { TOOLS, parseDate, status };
