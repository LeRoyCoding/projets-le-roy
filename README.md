# Projets Le Roy

Application de gestion de projets et de tâches de l'entreprise Le Roy et de sa marque « Lead Le Roy Concept ».
Elle fonctionne sur l'hébergement **OVHcloud Web PRO** (PHP + MySQL). Les collègues l'ouvrent dans leur navigateur à l'adresse
du site (PC, tablette, téléphone), avec leur nom et leur mot de passe. Rien à installer sur les postes.

> **Application autonome** : elle n'est reliée ni au site www.le-roy.fr, ni au CRM, ni à l'intranet.
> Les guides détaillés sont dans le dossier `docs/` (liste en bas de page).

## 1. Ce dont vous avez besoin

- L'hébergement OVHcloud Web PRO, avec une **base de données MySQL** et un **domaine ou sous-domaine** en HTTPS (certificat gratuit « Let's Encrypt » à activer dans le Manager OVH).
- **PHP 8.1 ou plus** pour ce domaine (Manager OVH → Hébergement → *Informations générales* ou fichier `.ovhconfig`).
- Un accès **FTP** (obligatoire) ; un accès **SSH** est très utile (déploiement automatique, tâches planifiées, récupération des sauvegardes) — il dépend de votre formule.

## 2. Installation pas à pas (première fois)

Disposition recommandée : les secrets et les données sont **à côté** du site, jamais dedans.
```
projets/
  www/        ← le contenu du dossier « www » de ce dépôt (le domaine pointe ici)
  config/     ← config.php (mots de passe de la base, clés)
  data/       ← sauvegardes et fichiers (créé tout seul)
```
1. **Base de données** : Manager OVH → *Bases de données* → créer une base MySQL. Notez serveur, nom, utilisateur, mot de passe.
2. **Envoyer le site** : par FTP, envoyez le contenu de `www/` dans `projets/www` (ou laissez le déploiement GitHub le faire, voir `docs/deploiement.md`). Dans *Multisite*, faites pointer le domaine sur ce dossier.
3. **Configuration** : copiez `www/config.exemple.php`, renommez la copie `config.php` et placez-la dans `projets/config/` (**pas** dans `www/`). Remplacez les valeurs : base de données, **clé de maintenance** (64 caractères au hasard : `php -r 'echo bin2hex(random_bytes(32));'`, ou un générateur de mot de passe), adresse du site.
4. **Installation** : ouvrez `https://votre-domaine/installer.php`, saisissez la clé de maintenance. La page vérifie l'hébergement (PHP, extensions, dossiers hors site), crée les tables puis vous demande **votre nom et un mot de passe de 12 caractères minimum**. Il n'existe aucun mot de passe par défaut.
5. **Supprimez `installer.php`** de l'hébergement (par sécurité, il ne fait de toute façon plus rien une fois l'installation terminée).
6. Connectez-vous sur `https://votre-domaine/`. Créez les comptes de l'équipe (**Compte → Équipe**) : chacun reçoit un mot de passe provisoire que vous lui transmettez de vive voix ; il devra en choisir un nouveau à sa première connexion.
7. **Sauvegardes** : suivez `docs/sauvegardes.md` (obligatoire avant de saisir de vraies données).

### Installer l'application sur un poste
Dans Chrome ou Edge : menu ⋮ → *Installer l'application*. Sur tablette/téléphone : *Ajouter à l'écran d'accueil*.
La page **Compte** affiche l'adresse du site et un QR code pour les collègues.

## 3. Mises à jour

Une mise à jour = nouveau code, et parfois une mise à jour de la base.
- Méthode recommandée : **GitHub → Actions → « Déployer sur OVH »** — d'abord sur l'environnement de *test*, puis en *production*. Une **sauvegarde vérifiée** est faite avant, et un **retour arrière** est possible en une seconde. Voir `docs/deploiement.md`.
- Les mises à jour de la base ne se font **jamais toutes seules** : tant qu'elles n'ont pas été lancées volontairement, l'application affiche « mise à jour en attente » et ne touche pas aux données.

## 4. Mot de passe oublié

- Un utilisateur : l'administrateur ouvre **Compte → Équipe**, clique sur le crayon à côté du nom puis « Réinitialiser le mot de passe » : cela donne un nouveau mot de passe provisoire (à changer à la connexion).
- L'administrateur lui-même : ouvrez `https://votre-domaine/maintenance.php` avec la clé de maintenance (section « Retrouver un accès administrateur »), ou en SSH : `php outils/admin.php reinitialiser "Votre nom"`.
- Ne placez **jamais** de mot de passe ou de hash connu dans la base : toute réinitialisation donne un mot de passe aléatoire à usage unique.

## 5. Sécurité en bref

- HTTPS obligatoire, mots de passe hachés (bcrypt), 12 caractères minimum, blocage progressif après des essais ratés.
- Droits appliqués **par le serveur** : administrateur, et dans chaque groupe responsable / membre / lecteur.
- **Corbeille** de 90 jours (tâches et groupes) ; rien n'est supprimé définitivement par erreur.
- **Journal** des opérations sensibles (connexions, droits, suppressions, sauvegardes) en écriture seule.
- Clés d'accès Claude / ChatGPT : seulement dans un en-tête, avec expiration et option « lecture seule ».
- Aucun fichier de configuration, sauvegarde ou secret dans le dossier public. Détails : `docs/securite-et-compatibilite-ovh.md`.

## 6. Problèmes fréquents

| Problème | Solution |
|---|---|
| « Mise à jour de la base en attente » | Une version plus récente a été envoyée : lancez la mise à jour volontaire (`docs/deploiement.md`). |
| `installer.php` dit « Clé de maintenance incorrecte » | Vérifiez `maintenance_key` dans `config.php` (32 caractères minimum). |
| « Connexion à la base impossible » | Les valeurs `db_*` de `config.php` ne sont pas bonnes. |
| Écran de connexion : « trop d'essais » | Attendez quelques minutes ; l'administrateur peut réinitialiser le mot de passe. |
| Les mises à jour des collègues n'apparaissent pas | L'écran se rafraîchit seul toutes les 5 secondes. Un bandeau rouge indique une coupure d'Internet. |
| La sauvegarde de la nuit n'a pas eu lieu | Vous recevez un e-mail d'alerte. Voir `docs/sauvegardes.md` (vérifier les tâches planifiées dans le Manager OVH). |

## 7. Pour développeurs

- **`www/`** : le site (PHP 8.1+, MySQL / MariaDB, aucune dépendance à installer). `www/api/` : `index.php` (entrée), `core.php`, `schema.php` + `migrations.php` (base versionnée), `auth.php`, `permissions.php`, `auth_provider.php`, `backup.php`, `notifications.php`, `routes*.php`, `mcp*.php`. Interface : `index.html`, `js/`, `style.css`.
- **`outils/`** : outils en ligne de commande PHP (`sauvegarde`, `restaurer`, `migrer`, `admin`, `entretien`, `notifier`), reprise de l'ancienne version (`exporter-vers-ovh.js`), connecteur Claude Desktop local facultatif (`claude-mcp.js`).
- **`serveur-interne/`** : scripts du serveur interne 24/7 (récupération, rétention 30/12/12, alertes, test de restauration).
- **`deploiement/`** + `.github/workflows/` : déploiement, retour arrière, tests.
- **Tests** : `npm test` (Node 22, PHP 8.1+, MySQL 8 ou MariaDB). Variables : `LR_DB_HOST`, `LR_DB_USER`, `LR_DB_PASS` (utilisateur pouvant créer des bases `lr_t_…`). Lancés par GitHub Actions sur PHP 8.1/8.2/8.3 × MySQL 8.0/MariaDB 10.11.
- Aucun serveur Node.js en production : Node ne sert qu'aux tests et au connecteur Claude Desktop local.
- Mises à jour de l'écran : sondage de `/api/rev` toutes les 5 s (pas de connexion permanente sur mutualisé).

## 8. Documentation (`docs/`)

| Fichier | Contenu |
|---|---|
| `guide-utilisateur.md` | Utilisation au quotidien |
| `sauvegardes.md` | Sauvegardes chiffrées, serveur interne, restauration |
| `deploiement.md` | GitHub → OVH, test/production, retour arrière |
| `securite-et-compatibilite-ovh.md` | Sécurité, compatibilité OVH, limites |
| `audit.md` | Audit : problèmes connus et corrections |
| `rapport-de-tests.md` | Rapport de tests et avis GO / NO GO |
| `etude-priorite-2.md`, `architecture-intranet.md` | Études (rien de développé) |
| `lier-a-claude.md`, `lier-a-chatgpt.md` | Connecteurs |
| `feuille-de-route.md` | Suite prévue |
