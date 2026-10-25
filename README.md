# Projets Le Roy

Application de suivi des projets et des tâches pour l'équipe Le Roy / Lead Le Roy Concept.

Elle est hébergée chez **OVHcloud** (offre Web PRO, PHP + base MySQL). Chacun l'ouvre dans son navigateur à l'adresse
du site (PC, tablette, téléphone), avec son nom et son mot de passe. Rien à installer sur les postes.

- 📖 **Mode d'emploi pour l'équipe** : [docs/guide-utilisateur.md](docs/guide-utilisateur.md)
- 🤖 **Lier l'application à Claude** : [docs/lier-a-claude.md](docs/lier-a-claude.md) · **à ChatGPT** : [docs/lier-a-chatgpt.md](docs/lier-a-chatgpt.md)
- 🔎 **Rapport d'audit** : [docs/audit.md](docs/audit.md) · 🧭 **Feuille de route** : [docs/feuille-de-route.md](docs/feuille-de-route.md)
- 📄 **Guides Word à imprimer** : [installation](docs/Guide-installation-Projets-Le-Roy.docx) et [utilisation](docs/Guide-utilisation-Projets-Le-Roy.docx)

Tout ce qui doit être envoyé sur l'hébergement se trouve dans le dossier **`www/`** de ce dépôt.

---

## 1. Installer sur OVHcloud (une seule fois)

### a) Préparer l'hébergement (Manager OVHcloud)

1. **Version de PHP** : *Web Cloud → Hébergements → votre hébergement → onglet « Configuration générale »* (ou « Configuration »)
   → choisissez **PHP 8.1 ou plus récent** (8.3 conseillé).
2. **Certificat SSL (le cadenas https)** : *onglet « Multisite »* → ⋯ à droite de votre domaine → **Modifier le domaine** →
   cochez **SSL**. Sans cadenas, les mots de passe circuleraient en clair : c'est indispensable.
3. **Base de données** : *onglet « Bases de données » → Créer une base de données* → MySQL (version la plus récente) →
   choisissez un mot de passe. Notez les 4 informations qu'OVH affiche : **serveur**, **nom de la base**, **utilisateur**, **mot de passe**.
4. **Accès FTP** : *onglet « FTP - SSH »* : notez l'identifiant et le serveur FTP (le mot de passe se redéfinit au même endroit).

### b) Préparer les fichiers

1. Sur <https://github.com/LeRoyCoding/projets-le-roy> : bouton vert **Code → Download ZIP**, puis décompressez.
2. Ouvrez le dossier **`www`**. Copiez le fichier **`config.exemple.php`** et renommez la copie en **`config.php`**.
3. Ouvrez `config.php` avec le Bloc-notes et remplacez les 4 valeurs par celles de l'étape a-3. Enregistrez.

### c) Envoyer les fichiers

Avec **FileZilla** (gratuit, <https://filezilla-project.org/>) ou le gestionnaire de fichiers FTP du Manager :
envoyez **tout le contenu du dossier `www`** (y compris `.htaccess`, qui est un fichier caché) dans le dossier **`www`** de l'hébergement
(ou dans le dossier de votre domaine, indiqué dans l'onglet Multisite → « Dossier racine »).

### d) Finaliser

1. Ouvrez **`https://votre-domaine/installer.php`**. La page vérifie l'hébergement, crée les tables et vous demande
   le nom et le mot de passe de l'administrateur (8 caractères minimum).
2. Quand c'est écrit « Installation terminée », **supprimez `installer.php`** de l'hébergement (FTP), puis ouvrez `https://votre-domaine/`.
3. Page **Compte** → ajoutez les membres de l'équipe. Dans **+ Groupe**, créez les groupes communs. Dans **Catégories**, ajustez la liste.

## 2. Reprendre les données de l'ancienne version (PC du bureau)

À faire après l'étape 1, **avant** que l'équipe ne commence à utiliser le nouveau site (sinon ce qu'ils auraient saisi serait remplacé).

1. Sur le PC du bureau, dans le dossier de l'ancienne version (`C:\ProjetsLeRoy`), mettez-y le contenu du nouveau ZIP
   (ou téléchargez-le dans un autre dossier : l'export fonctionne partout, voir plus bas), puis double-cliquez sur **`exporter-vers-ovh.bat`**.
   Il crée le fichier `export-ovh.sql` sans toucher à vos données actuelles.
   *Si le nouveau dossier est ailleurs :* glissez le fichier `donnees\projets.sqlite` de l'ancien dossier sur `exporter-vers-ovh.bat`.
2. Manager OVH → *Bases de données* → ⋯ → **Accéder à phpMyAdmin** → connectez-vous → cliquez sur votre base →
   onglet **Importer** → choisissez `export-ovh.sql` → **Exécuter**.
3. Ouvrez le site et connectez-vous avec **vos anciens comptes et mots de passe**. Si le mot de passe de l'administrateur
   était resté « admin », **changez-le tout de suite** (page Compte) : le site est maintenant sur Internet.

Gardez l'ancien PC et son fichier `donnees\projets.sqlite` quelques semaines, par précaution.

## 3. Mettre à jour

1. Téléchargez le nouveau ZIP (Code → Download ZIP) et décompressez-le.
2. Envoyez le contenu de **`www`** par-dessus l'ancien (FTP). Votre `config.php` n'est pas dans le ZIP : il n'est pas écrasé.
3. C'est tout : la base de données se met à jour toute seule à la première visite. Les données ne sont jamais effacées.

## 4. Sauvegardes

- OVHcloud sauvegarde automatiquement les bases (Manager → Bases de données → ⋯ → **Restaurer une sauvegarde** ; vérifiez la durée de conservation de votre offre).
- L'administrateur peut aussi **télécharger une sauvegarde complète** depuis la page **Compte** (fichier `.sql`, à garder sur une clé USB ou un disque).
  Pour la restaurer : phpMyAdmin → votre base → **Importer** → ce fichier.

## 5. Sécurité (le site est sur Internet)

- Toutes les pages passent en **https** (redirection automatique) ; les mots de passe sont stockés chiffrés (bcrypt).
- **6 caractères minimum** pour les mots de passe ; **5 erreurs de suite sur un compte = 1 minute de blocage**, et un blocage par appareil après 30 erreurs.
- Les fichiers de configuration (`config.php`…) ne sont pas téléchargeables.
- Choisissez des mots de passe que personne ne devine (pas « 1234 », pas le prénom).
- Le connecteur Claude / ChatGPT est **désactivé par défaut** : l'administrateur l'active dans la page Compte si besoin.
- Quand quelqu'un quitte l'entreprise : Compte → Équipe → crayon → décochez « Compte actif ».

## 6. Dépannage

| Problème | Solution |
|---|---|
| Page blanche ou « Erreur 500 » | Vérifiez la version de PHP (8.1 minimum) et que `.htaccess` a bien été envoyé. Manager → Hébergement → **Logs** (ou « Statistiques et logs ») donne le message d'erreur. |
| `installer.php` dit « Connexion impossible » | Les 4 valeurs de `config.php` ne sont pas bonnes (serveur, nom, utilisateur, mot de passe de la base). |
| L'application s'ouvre mais « Aucun compte » | `installer.php` n'a pas été fait (ou l'import SQL a échoué). |
| « Session expirée » en boucle | Vérifiez que le site s'ouvre bien en **https** (cadenas) et videz les cookies du navigateur. |
| Un collègue a oublié son mot de passe | Administrateur : **Compte → Équipe → crayon → Nouveau mot de passe**. |
| L'administrateur a oublié son mot de passe | phpMyAdmin → votre base → onglet **SQL** → collez la ligne ci-dessous → Exécuter. Connectez-vous ensuite avec le mot de passe `ChangeMoi-2026` et **changez-le immédiatement** (Compte).<br>`UPDATE users SET password_hash = '$2y$10$65J1aiMFuVeHH4UKT3FVju5W24VHgob2G9G60/qNEBOm1K9fP4aFG' WHERE role = 'admin' AND active = 1;` |
| Les mises à jour des collègues n'apparaissent pas | L'écran se rafraîchit seul toutes les 5 secondes quand la fenêtre est visible. Un bandeau rouge indique une coupure d'Internet. |

## 7. Pour développeurs

- **`www/`** : le site complet (PHP 8.1+, MySQL / MariaDB, aucune dépendance à installer).
  - `www/api/index.php` (entrée de l'API) · `routes.php` (toutes les routes) · `lib.php` (base de données, sessions, droits) ·
    `migrations.php` (migrations numérotées : toujours **ajouter**, jamais modifier) · `mcp.php` + `mcp-tools.php` (connecteur Claude / ChatGPT).
  - `www/index.html`, `www/js/`, `www/style.css` : l'interface (HTML/CSS/JS sans framework), reprise de `prototype.html`.
  - `www/.htaccess` : https obligatoire, aiguillage `/api` et `/mcp`, en-têtes de sécurité, fichiers protégés.
  - `www/installer.php` : page d'installation (à supprimer après usage).
- **`outils/`** : `exporter-vers-ovh.js` (reprise des données SQLite de l'ancienne version), `claude-mcp.js` + `lier-claude.js` (connecteur Claude Desktop local, facultatif),
  `serveur-test.php` et `test-base.php` (tests).
- **Tests** : `npm test` (Node 22 + PHP 8.1+ + un serveur MySQL). Variables : `LR_DB_HOST`, `LR_DB_USER`, `LR_DB_PASS` (un utilisateur MySQL
  qui peut créer des bases `lr_t_…`). Lancés automatiquement par GitHub Actions.
- Mises à jour de l'écran : sondage toutes les 5 s de `/api/rev` (l'hébergement mutualisé n'autorise pas les connexions permanentes).
