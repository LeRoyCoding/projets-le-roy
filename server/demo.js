// Données d'exemple (celles de la maquette), utilisées seulement avec « npm run demo ».
// Elles vont dans un fichier séparé (donnees/demo.sqlite) : la vraie base n'est jamais touchée.
const bcrypt = require('bcryptjs');
const { newId } = require('./db');

function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 1) return;
  const day = n => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const hash = bcrypt.hashSync('0000', 10);
  db.tx(() => {
    const U = {};
    for (const name of ['Antoine', 'Claire', 'Julien']) {
      U[name] = newId();
      db.prepare("INSERT INTO users (id, name, password_hash, role) VALUES (?, ?, ?, 'user')").run(U[name], name, hash);
    }
    const G = {};
    const groups = [
      ['lr', 'Le Roy', 'img:lr', '#C4122F', ['Antoine', 'Claire', 'Julien']],
      ['llc', 'LLC', 'img:llc', '#666A6F', ['Antoine', 'Claire']],
      ['p1', 'Perso', '🏡', '#2E8C76', ['Antoine']],
      ['p2', 'Perso', '🏡', '#3F7CC0', ['Claire']],
      ['p3', 'Perso', '🏡', '#D08A1E', ['Julien']]
    ];
    groups.forEach(([k, name, icon, color, members], i) => {
      G[k] = newId();
      db.prepare("INSERT INTO groupes (id, name, icon, color, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))").run(G[k], name, icon, color, `+${i} seconds`);
      for (const m of members) db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(G[k], U[m]);
    });
    const T = [
      ['lr', 'Antoine', 'devis', 'Devis chaîne plate – élevage 30 000 poulets', -6, 4, 'Bâtiment 120 × 15 m, 2 lignes. Le client attend une variante avec trémie double.', [['Relevé des cotes du bâtiment', 'Plan transmis par le client'], ['Configurer la chaîne plate', 'Longueur, nombre de coins, moteurs'], ['Chiffrer la variante trémie double'], ['Export CSV vers Business Central', 'Vérifier les références articles'], ['Envoyer le devis et relancer à J+5']], 3],
      ['lr', null, 'event', 'Préparer le stand du salon', -4, 9, 'Tâche commune à toute l\'équipe Le Roy.', [['Liste du matériel à exposer'], ['Réserver le transport'], ['Imprimer les fiches produits'], ['Planning de présence sur le stand']], 1],
      ['lr', 'Antoine', 'dev', 'Outil atelier radiants', -3, 20, 'Outil tablette pour le suivi de production des radiants.', [['Prototype ergonomie'], ['Test avec l\'opérateur', 'Poser la tablette sans explication'], ['Liste des composants et sous-composants'], ['Photos des notices'], ['Choix MobileNAV ou Power Apps', 'Avec le prestataire BC'], ['Déploiement en atelier']], 2],
      ['lr', 'Julien', 'chantier', 'Ventilation bâtiment reproducteurs', -15, 6, 'Remplacement de 6 extracteurs et du boîtier de régulation.', [['Commande du matériel'], ['Planification de l\'équipe de pose'], ['Dépose des anciens extracteurs'], ['Pose et câblage'], ['Mise en service et réglage', 'Avec l\'éleveur']], 4],
      ['lr', 'Claire', 'admin', 'Tarifs 2027 dans Business Central', 2, 30, 'Intégrer les nouvelles grilles fournisseurs.', [['Recevoir les grilles fournisseurs'], ['Calcul des coefficients'], ['Import des prix'], ['Contrôle sur 10 devis types']], 0],
      ['lr', 'Claire', 'commercial', 'Relance clients pondoirs Q4', -20, -2, 'Clients ayant reçu une offre pondoirs depuis juin.', [['Extraire la liste des offres ouvertes'], ['Appeler les prioritaires'], ['Mettre à jour les probabilités']], 2],
      ['llc', null, 'commercial', 'Plaquette Lead Le Roy Concept', -5, 15, '4 pages : concept, références, contact. Tâche commune LLC.', [['Textes'], ['Photos de réalisations'], ['Mise en page'], ['Validation et impression']], 2],
      ['llc', 'Antoine', 'dev', 'Agent devis CSV – chaîne plate', -8, 25, 'Générer le CSV d\'import BC depuis le configurateur.', [['Format CSV Business Central', 'Colonnes et références'], ['Règles de la chaîne plate'], ['Tests sur 3 devis réels'], ['Étendre aux autres configurateurs'], ['Documentation']], 1],
      ['p1', 'Antoine', 'perso', 'Révision voiture', 1, 5, '', [['Prendre rendez-vous'], ['Déposer le véhicule']], 0],
      ['p2', 'Claire', 'perso', 'Inscription formation anglais', -4, 18, '', [['Comparer les organismes'], ['Demande de prise en charge'], ['Inscription']], 1]
    ];
    for (const [g, owner, type, title, s, e, desc, steps, done] of T) {
      const id = newId();
      db.prepare('INSERT INTO tasks (id, group_id, owner_id, type, title, description, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, G[g], owner ? U[owner] : null, type, title, desc, day(s), day(e));
      steps.forEach(([label, d], i) =>
        db.prepare('INSERT INTO steps (id, task_id, position, label, description, done) VALUES (?, ?, ?, ?, ?, ?)').run(newId(), id, i, label, d || '', i < done ? 1 : 0));
    }
  });
  console.log('  Données d\'exemple créées (mot de passe des comptes : 0000, Administrateur : admin).');
}

module.exports = { seed };
