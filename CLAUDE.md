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
- **Hébergement OVHcloud Web PRO (mutualisé)** : site **PHP 8.1+** et base **MySQL** (voir « Organisation du code » plus bas pour le détail). Plus de PC serveur au bureau.
- Front-end : HTML/CSS/JS sans framework lourd, servi par l'hébergement, installable comme **PWA** (manifest + icône Le Roy).
- Les collègues ouvrent `https://<adresse-du-site>` depuis leur navigateur, puis « Installer l'application ». La page Compte affiche l'adresse et un QR code.
- Mises à jour quasi temps réel : l'écran interroge le serveur toutes les 5 secondes.
- Le développement se fait avec Claude Code **dans la version web** (claude.ai/code), directement sur le dépôt GitHub. L'utilisateur n'a pas d'environnement de développement local.
- Installation et mises à jour : l'utilisateur envoie le contenu du dossier `www/` par FTP ; `README.md` explique tout pas à pas, en français très simple.
- Les identifiants de la base (`www/config.php`) et les sauvegardes sont exclus de Git (`.gitignore`).
- Le site est **sur Internet** (choix de l'utilisateur, octobre 2026) : https obligatoire, mots de passe hachés, limitation des essais.

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
- Ne jamais supprimer ni vider la base de données de production ; les migrations ne font qu'ajouter. Sauvegardes : celles d'OVHcloud + le téléchargement d'un fichier `.sql` par l'admin (page Compte).

## Plus tard (ne pas faire tout de suite)
- Lien avec Business Central (clients, devis).
- Notifications d'échéance.

## Organisation du code (mise à jour d'octobre 2026 — version OVHcloud)
- **Hébergement : OVHcloud Web PRO (mutualisé), PHP 8.1+ et MySQL.** Tout ce qui est publié est dans `www/` (envoyé par FTP dans le dossier `www` de l'hébergement). Plus de serveur Node.js ni de scripts `.bat` de démarrage : l'ancienne version (Node + SQLite sur un PC du bureau) a été remplacée.
- L'application est désormais **sur Internet** (https obligatoire via `www/.htaccess`). Ancienne règle « réseau local uniquement » abandonnée à la demande de l'utilisateur ; en contrepartie : mots de passe de 6 caractères minimum, blocage après essais ratés (`login_failures`), cookies `Secure`/`HttpOnly`, compte admin créé par `installer.php` (jamais de mot de passe par défaut).
- Les « types » de tâche sont des **catégories** modifiables (table `categories`) ; `tasks.type` contient l'identifiant de la catégorie.
- API PHP : `www/api/index.php` (entrée, `/api/...`), `routes.php` (toutes les routes, table `table_routes()`), `lib.php` (MySQL via PDO, sessions, règles d'accès), `migrations.php` (migrations numérotées : toujours **ajouter**, jamais modifier une migration publiée ; elles s'exécutent toutes seules à la première visite). Configuration : `www/config.php` (jamais dans Git, modèle `config.exemple.php`).
- Connecteur Claude / ChatGPT : `www/api/mcp.php` + `mcp-tools.php` (URL `https://site/mcp/lr_CLE`, activé par l'admin, réglage `connecteur_internet`). Les outils sont aussi en JavaScript dans `outils/mcp-commun.js` pour le connecteur Claude Desktop local (`outils/claude-mcp.js`, `lier-a-claude.bat`) : **garder les deux versions identiques**.
- Interface : `www/js/base.js` (outils), `regles.js` (état et règles), `ecrans.js` (écrans), `fiche.js` (fiche tâche), `actions.js` (évènements, sondage de `/api/rev` toutes les 5 s à la place des Server-Sent Events, impossibles sur mutualisé). QR code dessiné dans le navigateur (`www/js/vendor/qrcode.js`).
- Tâches terminées : `tasks.done_at` / `done_by` et `steps.done_at` / `done_by`. Une tâche terminée depuis plus de 7 jours n'est plus envoyée à l'écran ; l'admin la retrouve dans l'onglet « Historique » (`/api/historique`). Le journal d'activité d'une tâche est réservé à l'admin.
- Ordre des groupes : `groupes.position`, réglé par l'admin (`/api/groups/ordre`), avec des flèches ← → sur chaque carte de l'accueil.
- Tâches : `tasks.priority` (1 urgente, 2 haute, 3 normale par défaut, 4 basse) et `tasks.created_by` (affiché « Créée par »).
- Reprise des données de l'ancienne version : `exporter-vers-ovh.bat` / `outils/exporter-vers-ovh.js` (SQLite → fichier SQL pour phpMyAdmin).
- Feuille de route : `docs/feuille-de-route.md`.
- Tests : `npm test` (dossier `tests/`, Node 22 + PHP + MySQL ; variables `LR_DB_HOST`, `LR_DB_USER`, `LR_DB_PASS`), relancés par GitHub Actions. Les faire passer avant chaque envoi.
- Documentation : `README.md` (installation OVH), `docs/guide-utilisateur.md`, `docs/lier-a-claude.md`, `docs/lier-a-chatgpt.md`, `docs/audit.md` (historique).
