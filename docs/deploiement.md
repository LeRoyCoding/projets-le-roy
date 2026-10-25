# Déploiement GitHub → OVH, retour arrière, environnement de test

> **Rien n'est jamais publié automatiquement.** Chaque déploiement se lance à la main, avec une approbation pour la production.

## Disposition sur l'hébergement
```
~/projets/
  releases/20261101-103000-ab12cd3/   ← une version du code (www/ + outils/)
  current  → releases/…               ← lien : le domaine pointe sur projets/current/www
  config/config.php                   ← secrets (jamais touchés par une mise à jour, jamais dans Git)
  data/                               ← sauvegardes, état, fichiers (jamais touchés)
```
Le site public ne contient donc aucun mot de passe ni sauvegarde. Les 5 dernières versions sont conservées.

## Deux environnements
- **test** : sous-domaine `projets-test.…`, **base de données séparée**, `config.php` avec `'env' => 'test'` (bandeau « TEST » ; les moteurs de recherche sont de toute façon exclus partout). On y essaie chaque version, avec `outils/donnees-demo.php` (fausses données) — jamais de vraies données.
- **production** : le vrai site.

## Déployer (depuis GitHub, sans ligne de commande)
1. GitHub → **Actions → « Déployer sur OVH » → Run workflow**.
2. Choisir `test`, la branche ou l'étiquette, et cocher « migrer » si la version change la base.
3. Le processus : tests automatiques → paquet → envoi → contrôle de syntaxe → **sauvegarde vérifiée obligatoire** → (migration) → bascule atomique du lien `current` → test d'accès (`/api/comptes`) → **retour arrière automatique si le test échoue**.
4. Après validation sur *test*, relancer avec `production` (GitHub demande l'approbation d'une personne autorisée).

Secrets à créer une fois (GitHub → Settings → Environments → test / production → Secrets) : `OVH_SSH_HOST`, `OVH_SSH_USER`, `OVH_SSH_PORT`, `OVH_SSH_KEY` (clé dédiée au déploiement), `OVH_SSH_KNOWN_HOSTS`, `OVH_REMOTE_BASE`, `OVH_SITE_URL`, `OVH_PHP_BIN` (facultatif).

## Retour arrière
- Code : GitHub → Actions → **« Retour arrière »** (ou `deploiement/retour-arriere.sh --cible=production`) : le lien `current` repasse à la version précédente en une seconde.
- Si la version annulée avait modifié la base, le script **refuse** le retour si l'ancien code est incompatible avec la base (`schema_min_code`) et indique la sauvegarde à restaurer (voir `sauvegardes.md`). Les migrations ne font qu'ajouter des colonnes/tables ; une migration « cassante » est marquée comme telle.

## Migrations
Elles ne s'exécutent **jamais** toutes seules lors d'une visite. Tant qu'une migration est en attente, l'application affiche « mise à jour en cours » (HTTP 503). On les applique volontairement : option « migrer » du déploiement, `php outils/migrer.php --appliquer`, ou `installer.php`/`maintenance.php` avec la clé de maintenance. Une **sauvegarde vérifiée** est toujours faite avant ; si elle échoue, rien n'est modifié.

## Plan B sans SSH (envoi FTP manuel)
1. Envoyer le dossier `www/` dans un **nouveau dossier** (ex. `projets/releases/manuel-1`) et ne pas toucher à l'ancien.
2. Dans le Manager OVH → *Multisite*, changer le dossier racine du domaine vers ce nouveau dossier (retour arrière = remettre l'ancien).
3. `config.php` reste hors de `www/` (voir `config.exemple.php`).

## Avant la première mise en production
Voir la liste « GO / NO GO » dans `docs/rapport-de-tests.md`.
