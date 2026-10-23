// Connecteur pour ChatGPT (protocole MCP sur HTTP), DÉSACTIVÉ PAR DÉFAUT.
//
// ChatGPT ne sait joindre que des outils accessibles depuis Internet en HTTPS. Pour ne pas exposer
// l'application, ce connecteur est un petit serveur À PART :
//  - il n'écoute que sur ce PC (127.0.0.1), sur son propre port (3001 par défaut) ;
//  - il ne donne accès qu'aux outils (lister, créer, cocher, commenter…), jamais aux pages de l'application ;
//  - chaque demande doit porter une clé d'accès personnelle (dans l'adresse ou l'en-tête Authorization) ;
//  - il passe par l'API de l'application avec cette clé : mêmes droits que la personne, aucune suppression possible.
// C'est le script ouvrir-pour-chatgpt.bat qui ouvre un tunnel HTTPS vers ce seul port, quand on le décide.
'use strict';
const http = require('http');
const { creerOutils, traiter } = require('../outils/mcp-commun');

const INSTRUCTIONS = 'Accès aux projets et tâches de l\'équipe Le Roy / Lead Le Roy Concept (outils resume_taches, lister_taches, voir_tache, creer_tache, cocher_etape, commenter…). ' +
  'Répondre en français. Avant de créer ou modifier une tâche pour quelqu\'un, vérifier le groupe et la personne (outil infos_equipe) et confirmer si c\'est ambigu.';

function creerServeurMcp({ mainPort }) {
  const base = `http://127.0.0.1:${mainPort}`;

  // Appel à l'API de l'application avec la clé de la personne.
  const apiPour = key => async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Clé d\'accès refusée (supprimée, ou compte désactivé).');
    if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
    return data;
  };

  // Clés vérifiées récemment (évite d'interroger l'application à chaque message).
  const valides = new Map();
  async function cleValide(key) {
    if (!/^lr_[0-9a-f]{64}$/.test(key || '')) return false;
    const v = valides.get(key);
    if (v && Date.now() - v < 60000) return true;
    const res = await fetch(base + '/api/tokens', { headers: { authorization: 'Bearer ' + key } }).catch(() => null);
    if (res && res.ok) { valides.set(key, Date.now()); return true; }
    valides.delete(key);
    return false;
  }

  // Trop d'essais avec une mauvaise clé depuis la même adresse : blocage 10 minutes.
  const echecs = new Map();
  const ipDe = req => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  const repondre = (res, status, obj, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(obj === undefined ? '' : JSON.stringify(obj));
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Connecteur Projets Le Roy : en service.');
      }
      const m = url.pathname.match(/^\/mcp(?:\/(lr_[0-9a-f]{64}))?\/?$/);
      if (!m) return repondre(res, 404, { error: 'Adresse inconnue.' });
      if (req.method !== 'POST') return repondre(res, 405, { error: 'Méthode non prise en charge.' }, { Allow: 'POST' });

      const ip = ipDe(req);
      const e = echecs.get(ip);
      if (e && e.n >= 20 && Date.now() - e.t < 10 * 60000) return repondre(res, 429, { error: 'Trop d\'essais. Réessayez plus tard.' });

      const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
      const key = m[1] || (bearer && bearer[1]);
      if (!(await cleValide(key))) {
        echecs.set(ip, { n: (e && Date.now() - e.t < 10 * 60000 ? e.n : 0) + 1, t: Date.now() });
        return repondre(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Clé d\'accès absente ou refusée.' } });
      }
      echecs.delete(ip);

      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) return repondre(res, 413, { error: 'Message trop long.' }); }
      let msg;
      try { msg = JSON.parse(raw); } catch { return repondre(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Message illisible' } }); }

      const tools = creerOutils(apiPour(key));
      const lot = Array.isArray(msg) ? msg : [msg];
      const reponses = (await Promise.all(lot.map(x => traiter(x, tools, { instructions: INSTRUCTIONS })))).filter(Boolean);
      if (!reponses.length) { res.writeHead(202); return res.end(); } // notifications seulement
      return repondre(res, 200, Array.isArray(msg) ? reponses : reponses[0]);
    } catch (err) {
      console.error('Connecteur ChatGPT :', err.message);
      if (!res.headersSent) repondre(res, 500, { error: 'Erreur inattendue.' });
    }
  });
  return server;
}

// Démarre / arrête le connecteur selon le réglage (page Compte de l'administrateur).
function pilote({ db, mainPort, port = Number(process.env.MCP_PORT) || 3001, host = '127.0.0.1', log = console.log }) {
  let server = null;
  const actif = () => db.getSetting('connecteur_internet') === '1';
  function appliquer() {
    if (actif() && !server) {
      server = creerServeurMcp({ mainPort });
      server.on('error', e => { log(`  Connecteur ChatGPT : impossible d'écouter le port ${port} (${e.code}).`); server = null; });
      server.listen(port, host, () => log(`  Connecteur ChatGPT actif (sur ce PC uniquement) : http://${host}:${port}/mcp`));
    } else if (!actif() && server) {
      server.close(); server.closeAllConnections?.(); server = null;
      log('  Connecteur ChatGPT arrêté.');
    }
  }
  return { appliquer, port, estActif: () => !!server, fermer: () => { if (server) { server.close(); server.closeAllConnections?.(); server = null; } } };
}

module.exports = { creerServeurMcp, pilote };
