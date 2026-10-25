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

## Organisation du code (version stabilisée — branche de finalisation)
- **Hébergement : OVHcloud Web PRO (mutualisé), PHP 8.1+ et MySQL.** Aucun serveur Node.js en production (Node = tests et connecteur Claude Desktop local seulement). **Application autonome : aucune interaction avec le site www.le-roy.fr, le CRM ou l'intranet** (préparation seulement, voir `docs/architecture-intranet.md`).
- **Séparation code / configuration / données** : `~/projets/releases/ID` (code, `www/` + `outils/`), lien `current`, `~/projets/config/config.php` (secrets, jamais dans Git ni dans `www/`, modèle `www/config.exemple.php`), `~/projets/data/` (sauvegardes, état). Déploiement : `deploiement/deployer.sh` et workflows GitHub manuels (`deployer.yml`, `retour-arriere.yml`). **Ne jamais fusionner dans `main` ni publier sur OVH sans l'accord explicite de l'utilisateur.**
- **Base** : migrations numérotées dans `www/api/migrations.php` (toujours **ajouter**, jamais modifier une migration publiée ; indicateur `breaking` + `schema_min_code`). Elles ne s'exécutent **jamais** sur une simple requête : `installer.php`, `maintenance.php` (clé de maintenance en POST), `outils/migrer.php --appliquer`, ou `deployer.sh --migrer`, toujours après une **sauvegarde vérifiée**. Sans cela l'API répond 503 `schema`.
- **Sécurité** : mots de passe bcrypt 12 caractères min., mot de passe provisoire à changer (`must_change`), limitation d'essais par compte et IP, cookie `__Host-`, jetons de session hachés, contrôle d'origine (CSRF), clés d'accès **en en-tête uniquement** (portée lecture/écriture, expiration), journal `audit_log` en écriture seule.
- **Droits (appliqués côté serveur, `www/api/permissions.php`)** : admin ; par groupe `responsable` / `membre` / `lecteur` ; l'état renvoyé au navigateur contient les indicateurs `can`. Corbeille (suppression douce `deleted_at`, 90 jours, purge admin).
- **Sauvegardes** : `www/api/backup.php`, `outils/sauvegarde.php` (CRON quotidien), chiffrement par clé publique (la privée reste sur le serveur interne), `outils/restaurer.php` (jamais vers la production sans `--confirmer`), `serveur-interne/` (récupération, rétention 30/12/12, alertes, test de restauration). Voir `docs/sauvegardes.md`.
- **Code** : API `www/api/` (`index.php`, `core.php`, `schema.php`, `auth.php`, `auth_provider.php`, `permissions.php`, `backup.php`, `notifications.php`, `routes*.php`, `mcp.php` + `mcp-tools.php`), interface `www/js/` (`base`, `regles`, `ecrans`, `fiche`, `actions`), sondage de `/api/rev` toutes les 5 s. Les outils MCP existent aussi en JavaScript (`outils/mcp-commun.js`) : **garder les deux versions identiques**.
- Types de tâche = **catégories** modifiables ; priorité 1–4 ; Direction (`/api/direction`) ; notifications et résumé quotidien (`outils/notifier.php`).
- **Tests** : `npm test` (Node 22 + PHP + MySQL/MariaDB ; `LR_DB_HOST`, `LR_DB_USER`, `LR_DB_PASS`), CI GitHub PHP 8.1/8.2/8.3 × MySQL 8.0/MariaDB 10.11. Les faire passer avant chaque envoi.
- Documentation : `README.md`, `docs/` (guide utilisateur, sauvegardes, déploiement, sécurité et compatibilité OVH, audit, rapport de tests, études priorité 2 et intranet).
