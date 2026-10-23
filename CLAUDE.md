# Projets Le Roy — application de gestion de projets et de to-do

## Contexte
Outil interne de l'entreprise Le Roy (matériel avicole) et de sa marque LLC « Lead Le Roy Concept ».
Utilisé par une petite équipe connectée au même Wi-Fi, depuis des PC et éventuellement des tablettes.
Les utilisateurs ne sont pas développeurs : l'interface doit rester simple, claire, en français.

Le fichier `prototype.html` à la racine est la maquette validée. Il fait référence pour :
- les écrans, leur contenu et leur comportement ;
- la charte graphique (couleurs, polices, logo intégré en base64, emojis) ;
- les textes de l'interface.
Reproduire fidèlement ce rendu. Ne pas réinventer le design.

## Architecture cible
- Un petit serveur **Node.js** (Express) qui tourne sur un PC du bureau, toujours allumé.
- Base de données **SQLite** (un seul fichier, facile à sauvegarder).
- Front-end : HTML/CSS/JS sans framework lourd, servi par le serveur, installable comme **PWA** (manifest + icône Le Roy).
- Les collègues ouvrent `http://<IP-du-PC>:3000` depuis leur navigateur, puis « Installer l'application ».
- Mises à jour en temps réel souhaitables (rafraîchissement automatique ou Server-Sent Events) pour que chacun voie les changements des autres.
- Lancement simple : `npm install` puis `npm start`. Prévoir un script pour démarrer automatiquement avec Windows.
- Le développement se fait avec Claude Code **dans la version web** (claude.ai/code), directement sur le dépôt GitHub. L'utilisateur n'a pas d'environnement de développement local.
- Fournir à la racine des scripts Windows à double-cliquer pour le PC serveur :
  - `installer.bat` : vérifie que Node.js est présent, lance `npm install`.
  - `demarrer.bat` : lance le serveur et affiche l'adresse à donner aux collègues (`http://<IP>:3000`).
  - `mettre-a-jour.bat` : récupère la dernière version depuis GitHub (`git pull`), réinstalle si besoin, redémarre, sans toucher à la base de données.
- Un `README.md` en français, très simple, qui explique ces trois scripts pas à pas.
- La base SQLite et les sauvegardes sont exclues de Git (`.gitignore`).
- Accès réseau local uniquement, pas d'exposition sur Internet.

## Comptes et droits
- Connexion : choix du compte puis mot de passe. Mots de passe **hachés** (bcrypt), session par cookie.
- Rôle **utilisateur** : voit les tâches des groupes dont il est membre + les tâches qui lui sont attribuées.
- Rôle **admin** : voit tout ; filtre par une ou plusieurs personnes (« Tout le monde » par défaut) ; crée groupes, tâches et comptes pour n'importe qui.
- Page Compte : changer son mot de passe, se déconnecter. Admin : liste de l'équipe + ajout d'utilisateurs.

## Données
- **Utilisateur** : id, nom, mot de passe haché, rôle (admin / utilisateur).
- **Groupe** : id, nom, logo (emoji ou logo Le Roy / LLC), couleur, membres.
  - 2 membres ou plus = groupe **commun** : chaque membre voit et fait avancer toutes ses tâches.
  - 1 membre = groupe privé (ex. « Perso » de chacun ; l'admin le voit sous la forme « Perso · Prénom »).
- **Tâche** : id, groupe, responsable (un utilisateur, ou vide = « Tout le groupe »), type, titre, description, date de début, date de fin, étapes.
  - Types (avec emoji) : Devis 🧾, Chantier 🏗️, Commercial 🤝, Développement 💻, Administratif 📋, Production ⚙️, Salon / évènement 🎪, Perso 🏡.
- **Étape** : id, libellé, description, cochée ou non.
- **Avancement** d'une tâche = étapes cochées / total des étapes, en %.
- Statuts : terminé (100 %) ✅, en retard (date de fin dépassée) 🚨, échéance sous 7 jours ⚠️ « J-n », sinon normal.

## Écrans
1. **Connexion** : logo, tuiles des comptes, mot de passe.
2. **Accueil** : une carte par groupe, en grille qui s'adapte à la largeur ; une carte de 5 tâches ou plus prend deux colonnes. Chaque tâche affiche son emoji de type, son titre, sa date de fin, son responsable, son badge de statut, une barre et un % d'avancement. Compteurs en haut : en cours / sous 7 jours / en retard. Bouton + par groupe.
3. **Fiche tâche** (fenêtre par-dessus) : groupe, type, responsable, dates, description, grand %, liste des étapes à cocher, ajout et suppression d'étapes, modifier, supprimer (avec confirmation dans la page).
4. **Timeline** : onglets par groupe + « Tous », barres type Gantt de la date de début à la date de fin, remplies selon le % d'avancement, ligne rouge « aujourd'hui », échelle des dates en bas, clic sur une barre = ouvre la fiche.
5. **+ Tâche** : titre, groupe, « Pour qui » (membres du groupe, ou « Tout le groupe » si commun), type, dates, description, étapes ajoutables. Sert aussi à modifier une tâche.
6. **+ Groupe** : nom, membres, logo, couleur ; liste des groupes existants (modifier, supprimer si vide).
7. **Compte** (voir plus haut).

## Charte graphique
- Couleurs : rouge Le Roy `#C4122F`, gris logo `#666A6F`, fond gris chaud `#F2F0EF`, bandeau d'onglets anthracite `#3D3A39` avec onglet actif souligné de rouge. Mode sombre prévu.
- Polices : Barlow Condensed (titres, onglets en majuscules), Barlow (texte), IBM Plex Mono (dates).
- Emojis couleur (rendu Fluent de Windows) pour les types, les groupes et les statuts.
- Logo Le Roy + LLC en haut de chaque écran (images base64 du prototype).

## Règles de travail
- Tout le texte de l'interface en français, sans jargon technique.
- Commits Git fréquents avec des messages clairs en français ; pousser sur GitHub après chaque étape qui fonctionne.
- Expliquer simplement à l'utilisateur comment tester chaque nouveauté (il n'est pas développeur).
- Ne jamais supprimer la base de données de production ; prévoir une sauvegarde automatique quotidienne du fichier SQLite dans un dossier `sauvegardes/`.

## Plus tard (ne pas faire tout de suite)
- Lien avec Business Central (clients, devis).
- Notifications d'échéance.

## Organisation du code (mise à jour d'octobre 2026)
- Les « types » de tâche sont devenus des **catégories** modifiables (table `categories`, onglet « Catégories ») ; `tasks.type` contient l'identifiant de la catégorie.
- Serveur : `server/index.js` (démarrage), `server/app.js` (application, sécurité, connexion par cookie ou clé d'accès), `server/routes/*.js` (une route par thème), `server/requetes.js` (règles d'accès), `server/db.js` (migrations numérotées : toujours **ajouter** une migration, ne jamais modifier une migration publiée).
- Interface : `public/js/base.js` (outils), `regles.js` (état et règles), `ecrans.js` (écrans), `fiche.js` (fiche tâche), `actions.js` (évènements, temps réel).
- Connecteurs IA : outils partagés `outils/mcp-commun.js`. Claude : `outils/claude-mcp.js` + `lier-a-claude.bat`. ChatGPT : `server/mcp-http.js` (port 3001, 127.0.0.1 uniquement, activé par l'admin) + `ouvrir-pour-chatgpt.bat` (tunnel Cloudflare vers ce seul port). C'est la seule exception, voulue par l'utilisateur, à la règle « réseau local uniquement ».
- Tâches terminées : `tasks.done_at` / `done_by` (qui a terminé, quand) et `steps.done_at` / `done_by` (qui a coché). Une tâche terminée depuis plus de 7 jours n'est plus envoyée à l'écran (`q.nonArchivee`) ; l'admin la retrouve dans l'onglet « Historique » (`/api/historique`). Le journal d'activité d'une tâche est réservé à l'admin.
- Ordre des groupes : `groupes.position`, réglé par l'admin (`/api/groups/ordre`).
- Feuille de route : `docs/feuille-de-route.md`.
- Tests : `npm test` (dossier `tests/`), relancés par GitHub Actions sous Windows et Linux. Les faire passer avant chaque envoi.
- Documentation : `README.md` (installation), `docs/guide-utilisateur.md`, `docs/lier-a-claude.md`, `docs/audit.md`.
