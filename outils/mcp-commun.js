// Outils proposés aux assistants (Claude, ChatGPT…) et protocole MCP, partagés par :
//  - outils/claude-mcp.js (Claude Desktop, sur le PC de l'utilisateur)
//  - server/mcp-http.js (point d'entrée HTTPS pour ChatGPT, désactivé par défaut)
// Les outils passent toujours par l'API de l'application, avec la clé de la personne :
// ils ont donc exactement ses droits.
'use strict';

const VERSION = '1.1.0';

/* ---------- Outils de lecture ---------- */
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DAY = 864e5;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / DAY);
const frDate = s => s ? s.split('-').reverse().join('/') : '';
const pct = t => t.steps.length ? Math.round(t.steps.filter(s => s.done).length / t.steps.length * 100) : (t.completed ? 100 : 0);
function status(t) {
  if (pct(t) === 100) return 'terminee';
  const d = daysBetween(todayIso(), t.end);
  if (d < 0) return 'en_retard';
  if (d <= 7) return 'sous_7_jours';
  return 'en_cours';
}
const STATUS_TXT = { terminee: '✅ terminée', en_retard: '🚨 en retard', sous_7_jours: '⚠️ échéance sous 7 jours', en_cours: 'en cours' };

function parseDate(v, label) {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  throw new Error(`${label} : date illisible « ${s} » (format attendu AAAA-MM-JJ ou JJ/MM/AAAA).`);
}

function findOne(list, value, labelOf, what) {
  if (value === undefined || value === null || value === '') return undefined;
  const v = String(value);
  const byId = list.find(x => x.id === v);
  if (byId) return byId;
  const exact = list.filter(x => norm(labelOf(x)) === norm(v));
  if (exact.length === 1) return exact[0];
  const partial = list.filter(x => norm(labelOf(x)).includes(norm(v)));
  if (partial.length === 1) return partial[0];
  const choices = list.map(labelOf).join(', ');
  if (exact.length > 1 || partial.length > 1) throw new Error(`Plusieurs ${what} correspondent à « ${v} ». Précisez parmi : ${choices}`);
  throw new Error(`${what} introuvable : « ${v} ». Choix possibles : ${choices}`);
}

function ctx(st) {
  const users = st.users;
  const userName = id => (users.find(u => u.id === id) || {}).name || '—';
  const groupLabel = g => (g.members.length === 1 && g.name === 'Perso') ? `Perso · ${userName(g.members[0])}` : g.name;
  return {
    st,
    userName,
    groupLabel,
    group: id => st.groups.find(g => g.id === id) || { name: '?', members: [] },
    cat: id => st.categories.find(c => c.id === id) || { label: '?', emoji: '📁' },
    me: users.find(u => u.id === st.me)
  };
}

function taskLine(c, t) {
  const cat = c.cat(t.type);
  const who = t.ownerId ? c.userName(t.ownerId) : 'tout le groupe';
  const d = daysBetween(todayIso(), t.end);
  const st = status(t);
  const when = st === 'en_retard' ? `${-d} j de retard` : st === 'sous_7_jours' ? (d === 0 ? 'fin aujourd\'hui' : `J-${d}`) : '';
  return `- [${t.id}] ${cat.emoji} ${t.title} — ${c.groupLabel(c.group(t.groupId))}, pour ${who}, fin ${frDate(t.end)}, ${pct(t)} % (${STATUS_TXT[st]}${when ? ', ' + when : ''})`;
}

// Crée la liste des outils pour une fonction d'appel à l'API donnée.
function creerOutils(api) {
  /* ---------- Définition des outils proposés à Claude ---------- */
  const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
  const str = description => ({ type: 'string', description });

  const TOOLS = [
    {
      name: 'resume_taches',
      description: 'Résumé de la situation : tâches en retard, échéances des 7 prochains jours, nombre de tâches en cours. À utiliser pour « où en est-on ? », « qu\'est-ce qui est urgent ? ».',
      inputSchema: S({ seulement_les_miennes: { type: 'boolean', description: 'Ne garder que les tâches de la personne connectée (par défaut : toutes celles qu\'elle voit).' } }),
      async run(a) {
        const c = ctx(await api('GET', '/api/state'));
        let tasks = c.st.tasks;
        if (a.seulement_les_miennes) tasks = tasks.filter(t => t.ownerId === c.me.id || (!t.ownerId && c.group(t.groupId).members.includes(c.me.id)));
        const late = tasks.filter(t => status(t) === 'en_retard').sort((x, y) => x.end.localeCompare(y.end));
        const soon = tasks.filter(t => status(t) === 'sous_7_jours').sort((x, y) => x.end.localeCompare(y.end));
        const open = tasks.filter(t => status(t) !== 'terminee');
        return [`Connecté en tant que ${c.me.name} (${c.me.role === 'admin' ? 'administrateur, voit tout' : 'utilisateur'}). Nous sommes le ${frDate(todayIso())}.`,
          `${open.length} tâche(s) en cours, ${soon.length} à échéance sous 7 jours, ${late.length} en retard.`,
          late.length ? '\nEn retard :\n' + late.map(t => taskLine(c, t)).join('\n') : '',
          soon.length ? '\nSous 7 jours :\n' + soon.map(t => taskLine(c, t)).join('\n') : ''].filter(Boolean).join('\n');
      }
    },
    {
      name: 'lister_taches',
      description: 'Liste les tâches visibles, avec filtres facultatifs. Chaque ligne commence par l\'identifiant de la tâche entre crochets.',
      inputSchema: S({
        recherche: str('Mots à chercher dans le titre, la description, les étapes, le client…'),
        groupe: str('Nom (ou identifiant) du groupe.'),
        personne: str('Nom de la personne responsable.'),
        categorie: str('Nom de la catégorie (Devis, Chantier…).'),
        statut: { type: 'string', enum: ['en_retard', 'sous_7_jours', 'en_cours', 'terminee'], description: 'Statut recherché.' },
        inclure_terminees: { type: 'boolean', description: 'Inclure les tâches terminées (non par défaut).' }
      }),
      async run(a) {
        const c = ctx(await api('GET', '/api/state'));
        let tasks = c.st.tasks;
        if (a.groupe) { const g = findOne(c.st.groups, a.groupe, c.groupLabel, 'Groupe'); tasks = tasks.filter(t => t.groupId === g.id); }
        if (a.personne) { const u = findOne(c.st.users, a.personne, u => u.name, 'Personne'); tasks = tasks.filter(t => t.ownerId === u.id || (!t.ownerId && c.group(t.groupId).members.includes(u.id))); }
        if (a.categorie) { const k = findOne(c.st.categories, a.categorie, x => x.label, 'Catégorie'); tasks = tasks.filter(t => t.type === k.id); }
        if (a.statut) tasks = tasks.filter(t => status(t) === a.statut);
        else if (!a.inclure_terminees) tasks = tasks.filter(t => status(t) !== 'terminee');
        if (a.recherche) {
          const words = norm(a.recherche).split(/\s+/).filter(Boolean);
          tasks = tasks.filter(t => { const h = norm([t.title, t.desc, c.cat(t.type).label, ...t.steps.map(s => s.label + ' ' + s.desc)].join(' ')); return words.every(w => h.includes(w)); });
        }
        tasks = [...tasks].sort((x, y) => x.end.localeCompare(y.end));
        if (!tasks.length) return 'Aucune tâche ne correspond.';
        return `${tasks.length} tâche(s) :\n` + tasks.map(t => taskLine(c, t)).join('\n');
      }
    },
    {
      name: 'voir_tache',
      description: 'Tout le détail d\'une tâche : description, étapes (avec leur identifiant), commentaires et historique.',
      inputSchema: S({ id: str('Identifiant de la tâche (entre crochets dans les listes).') }, ['id']),
      async run(a) {
        const c = ctx(await api('GET', '/api/state'));
        const t = c.st.tasks.find(x => x.id === a.id);
        if (!t) throw new Error('Tâche introuvable : ' + a.id);
        const d = await api('GET', `/api/tasks/${encodeURIComponent(t.id)}/details`);
        const cat = c.cat(t.type);
        return [`${cat.emoji} ${t.title}  [${t.id}]`,
          `Groupe : ${c.groupLabel(c.group(t.groupId))} · Catégorie : ${cat.label} · Pour : ${t.ownerId ? c.userName(t.ownerId) : 'tout le groupe'}`,
          `Du ${frDate(t.start)} au ${frDate(t.end)} · Avancement ${pct(t)} % · ${STATUS_TXT[status(t)]}`,
          t.desc ? `\nDescription :\n${t.desc}` : '',
          `\nÉtapes :\n` + (t.steps.map((s, i) => `${i + 1}. [${s.done ? 'x' : ' '}] ${s.label}${s.desc ? ' — ' + s.desc : ''}  (id ${s.id})`).join('\n') || '(aucune)'),
          d.comments.length ? `\nCommentaires :\n` + d.comments.map(x => `- ${c.userName(x.userId)} (${x.at} UTC) : ${x.body}`).join('\n') : '',
          d.activity.length ? `\nHistorique récent :\n` + d.activity.slice(0, 15).map(x => `- ${x.at} UTC · ${c.userName(x.userId)} · ${x.action}${x.detail ? ' : ' + x.detail : ''}`).join('\n') : ''
        ].filter(Boolean).join('\n');
      }
    },
    {
      name: 'creer_tache',
      description: 'Crée une tâche. Demander confirmation à l\'utilisateur si le groupe ou la personne ne sont pas clairs. Les dates sont au format AAAA-MM-JJ ou JJ/MM/AAAA.',
      inputSchema: S({
        titre: str('Titre de la tâche.'),
        groupe: str('Nom du groupe (ex. « Le Roy », « LLC », « Perso »).'),
        fin: str('Date de fin (échéance).'),
        debut: str('Date de début (aujourd\'hui par défaut).'),
        categorie: str('Catégorie (Devis, Chantier, Commercial…). Première catégorie par défaut.'),
        pour_qui: str('Nom de la personne responsable. Vide = tout le groupe (groupe commun) ou la personne connectée.'),
        description: str('Contexte, client, points d\'attention.'),
        etapes: { type: 'array', description: 'Étapes à cocher, dans l\'ordre.', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { libelle: { type: 'string' }, description: { type: 'string' } }, required: ['libelle'] }] } }
      }, ['titre', 'groupe', 'fin']),
      async run(a) {
        const c = ctx(await api('GET', '/api/state'));
        const g = findOne(c.st.groups, a.groupe, c.groupLabel, 'Groupe');
        const cat = a.categorie ? findOne(c.st.categories.filter(x => !x.hidden), a.categorie, x => x.label, 'Catégorie') : null;
        const owner = a.pour_qui ? findOne(c.st.users.filter(u => u.active), a.pour_qui, u => u.name, 'Personne') : null;
        const ownerId = owner ? owner.id : (g.members.length > 1 && c.me.role === 'admin' ? null : (g.members.length > 1 ? null : g.members[0] || c.me.id));
        const steps = (a.etapes || []).map(s => typeof s === 'string' ? { label: s } : { label: s.libelle, desc: s.description || '' });
        const body = { title: a.titre, groupId: g.id, type: cat ? cat.id : undefined, ownerId, start: parseDate(a.debut, 'Début') || todayIso(), end: parseDate(a.fin, 'Fin'), desc: a.description || '', steps };
        const r = await api('POST', '/api/tasks', body);
        return `Tâche créée [${r.id}] : « ${a.titre} » dans ${c.groupLabel(g)}, pour ${owner ? owner.name : (ownerId ? c.userName(ownerId) : 'tout le groupe')}, échéance ${frDate(body.end)}, ${steps.length} étape(s).`;
      }
    },
    {
      name: 'modifier_tache',
      description: 'Modifie une tâche existante (seuls les champs fournis changent). Pour les étapes, utiliser cocher_etape / ajouter_etape.',
      inputSchema: S({
        id: str('Identifiant de la tâche.'),
        titre: str('Nouveau titre.'), groupe: str('Nouveau groupe.'), categorie: str('Nouvelle catégorie.'),
        pour_qui: str('Nouvelle personne responsable ; « tout le groupe » pour une tâche commune.'),
        debut: str('Nouvelle date de début.'), fin: str('Nouvelle date de fin.'), description: str('Nouvelle description.')
      }, ['id']),
      async run(a) {
        const c = ctx(await api('GET', '/api/state'));
        const t = c.st.tasks.find(x => x.id === a.id);
        if (!t) throw new Error('Tâche introuvable : ' + a.id);
        const body = { ...t };
        if (a.titre) body.title = a.titre;
        if (a.groupe) body.groupId = findOne(c.st.groups, a.groupe, c.groupLabel, 'Groupe').id;
        if (a.categorie) body.type = findOne(c.st.categories, a.categorie, x => x.label, 'Catégorie').id;
        if (a.pour_qui !== undefined) body.ownerId = /^tout/i.test(norm(a.pour_qui)) || !a.pour_qui ? null : findOne(c.st.users, a.pour_qui, u => u.name, 'Personne').id;
        if (a.debut) body.start = parseDate(a.debut, 'Début');
        if (a.fin) body.end = parseDate(a.fin, 'Fin');
        if (a.description !== undefined) body.desc = a.description;
        await api('PUT', '/api/tasks/' + encodeURIComponent(t.id), body);
        return `Tâche [${t.id}] mise à jour.`;
      }
    },
    {
      name: 'cocher_etape',
      description: 'Coche (ou décoche) une étape d\'une tâche. L\'étape peut être donnée par son identifiant, son numéro (1, 2…) ou son libellé.',
      inputSchema: S({ tache_id: str('Identifiant de la tâche.'), etape: str('Identifiant, numéro ou libellé de l\'étape.'), fait: { type: 'boolean', description: 'true = cochée (par défaut), false = décochée.' } }, ['tache_id', 'etape']),
      async run(a) {
        const st = await api('GET', '/api/state');
        const t = st.tasks.find(x => x.id === a.tache_id);
        if (!t) throw new Error('Tâche introuvable : ' + a.tache_id);
        const n = Number(a.etape);
        const s = Number.isInteger(n) && n >= 1 && n <= t.steps.length ? t.steps[n - 1] : findOne(t.steps, a.etape, x => x.label, 'Étape');
        const done = a.fait !== false;
        await api('PATCH', '/api/steps/' + encodeURIComponent(s.id), { done });
        const after = t.steps.map(x => x.id === s.id ? { ...x, done } : x);
        const p = Math.round(after.filter(x => x.done).length / after.length * 100);
        return `Étape « ${s.label} » ${done ? 'cochée' : 'décochée'}. Avancement de « ${t.title} » : ${p} %.`;
      }
    },
    {
      name: 'ajouter_etape',
      description: 'Ajoute une étape à la fin d\'une tâche.',
      inputSchema: S({ tache_id: str('Identifiant de la tâche.'), libelle: str('Libellé de l\'étape.'), description: str('Description facultative.') }, ['tache_id', 'libelle']),
      async run(a) {
        await api('POST', `/api/tasks/${encodeURIComponent(a.tache_id)}/steps`, { label: a.libelle, desc: a.description || '' });
        return `Étape « ${a.libelle} » ajoutée.`;
      }
    },
    {
      name: 'marquer_terminee',
      description: 'Pour une tâche SANS étapes : la marquer terminée (ou la rouvrir). Les tâches avec étapes se terminent en cochant toutes leurs étapes.',
      inputSchema: S({ tache_id: str('Identifiant de la tâche.'), terminee: { type: 'boolean', description: 'true par défaut ; false pour rouvrir.' } }, ['tache_id']),
      async run(a) {
        await api('PATCH', `/api/tasks/${encodeURIComponent(a.tache_id)}/terminee`, { completed: a.terminee !== false });
        return a.terminee === false ? 'Tâche rouverte.' : 'Tâche marquée terminée.';
      }
    },
    {
      name: 'commenter',
      description: 'Ajoute un commentaire sur une tâche (visible par l\'équipe), au nom de la personne connectée.',
      inputSchema: S({ tache_id: str('Identifiant de la tâche.'), texte: str('Texte du commentaire.') }, ['tache_id', 'texte']),
      async run(a) {
        await api('POST', `/api/tasks/${encodeURIComponent(a.tache_id)}/comments`, { body: a.texte });
        return 'Commentaire ajouté.';
      }
    },
    {
      name: 'infos_equipe',
      description: 'Liste les groupes (avec leurs membres), les personnes et les catégories disponibles. Utile avant de créer une tâche.',
      inputSchema: S({}),
      async run() {
        const c = ctx(await api('GET', '/api/state'));
        return ['Groupes :', ...c.st.groups.map(g => `- ${c.groupLabel(g)} (${g.members.length > 1 ? 'commun' : 'privé'}) : ${g.members.map(c.userName).join(', ')}`),
          '\nPersonnes :', ...c.st.users.filter(u => u.active).map(u => `- ${u.name}${u.role === 'admin' ? ' (admin)' : ''}`),
          '\nCatégories :', ...c.st.categories.filter(x => !x.hidden).map(x => `- ${x.emoji} ${x.label}`)].join('\n');
      }
    }
  ];


  // Outils « search » et « fetch » : forme attendue par ChatGPT pour la recherche.
  TOOLS.push({
    name: 'search',
    description: 'Recherche des tâches par mots-clés (titre, description, étapes). Renvoie une liste de résultats avec leur identifiant.',
    inputSchema: S({ query: str('Mots à chercher.') }, ['query']),
    async run(a) {
      const c = ctx(await api('GET', '/api/state'));
      const words = norm(a.query).split(/\s+/).filter(Boolean);
      const found = c.st.tasks.filter(t => { const h = norm([t.title, t.desc, c.cat(t.type).label, ...t.steps.map(s => s.label + ' ' + s.desc)].join(' ')); return words.every(w => h.includes(w)); });
      return JSON.stringify({ results: found.slice(0, 30).map(t => ({ id: t.id, title: t.title, text: taskLine(c, t).slice(2), url: 'projets-le-roy://tache/' + t.id })) });
    }
  }, {
    name: 'fetch',
    description: 'Renvoie le détail complet d\'une tâche à partir de son identifiant (obtenu avec search).',
    inputSchema: S({ id: str('Identifiant de la tâche.') }, ['id']),
    async run(a) {
      const text = await TOOLS.find(t => t.name === 'voir_tache').run({ id: a.id });
      return JSON.stringify({ id: a.id, title: text.split('\n')[0], text, url: 'projets-le-roy://tache/' + a.id, metadata: {} });
    }
  });
  return TOOLS;
}

// Traite un message JSON-RPC. Renvoie la réponse, ou null pour une notification.
async function traiter(msg, tools, { instructions } = {}) {
  const { id, method, params } = msg || {};
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const ko = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (method === 'initialize') {
    return ok({
      protocolVersion: (params && params.protocolVersion) || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'projets-le-roy', version: VERSION },
      instructions: instructions || ('Accès aux projets et tâches de l\'équipe Le Roy / Lead Le Roy Concept. Répondre en français. ' +
        'Avant de créer ou modifier une tâche pour quelqu\'un, vérifier le groupe et la personne (outil infos_equipe) et confirmer si c\'est ambigu.')
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  if (method === 'tools/call') {
    const tool = tools.find(t => t.name === params?.name);
    if (!tool) return ko(-32602, 'Outil inconnu : ' + params?.name);
    try {
      const text = await tool.run(params.arguments || {});
      return ok({ content: [{ type: 'text', text }] });
    } catch (e) {
      return ok({ content: [{ type: 'text', text: 'Erreur : ' + e.message }], isError: true });
    }
  }
  if (id !== undefined && id !== null) return ko(-32601, 'Méthode inconnue : ' + method);
  return null; // notification (ex. notifications/initialized)
}

module.exports = { creerOutils, traiter, parseDate, status, VERSION };
