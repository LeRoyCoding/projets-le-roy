# Rapport de tests et avis GO / NO GO

Date : 25 octobre 2026 · Branche : `claude/nifty-franklin-i0pm82` · **Rien n'a été fusionné dans `main`, rien n'a été publié sur OVH, aucun accès à www.le-roy.fr, au CRM ou à l'intranet.**

## 1. Résultats des tests automatiques (exécutés ici)

| Suite | Résultat |
|---|---|
| `npm test` (Node 22 + PHP 8.3 + MariaDB 10.11), 16 fichiers | **139 / 139 réussis**, 0 échec (≈ 31 s) |
| Retenue 30/12/12 du serveur interne (Python) | 7 / 7 réussis |
| Syntaxe PHP de tous les fichiers (`php -l`), scripts shell (`bash -n`) | sans erreur |

Couverture par thème : installation verrouillée et administrateur sans mot de passe par défaut (`installateur`), sécurité des sessions/CSRF/force brute/clés (`securite`, `connecteur-mcp`, `claude`), migrations volontaires et sauvegarde préalable (`maintenance`), droits fins par rôle de groupe (`droits`), corbeille et restauration (`corbeille`), sauvegarde en flux avec 24 Mo de mémoire, chiffrement, restauration isolée (`sauvegarde`), récupération/rétention/alerte/test de restauration du serveur interne (`serveur-interne`), déploiement atomique, sauvegarde obligatoire, retour arrière, refus si schéma incompatible (`deploiement`), notifications et retards (`notifications`), identité interchangeable (`intranet`), fonctions existantes préservées (`base`, `nouveautes`, `terminees`, `priorite-createur`).

Parcours d'interface vérifiés en navigateur (Chromium/Playwright, `php -S` + MariaDB) : connexion, changement de mot de passe obligatoire, accueil, fiche, création de tâche, corbeille, journal, cloche, Direction.

## 2. Ce qui n'a PAS pu être vérifié ici
1. **GitHub Actions** : la matrice PHP 8.1/8.2/8.3 × MySQL 8.0/MariaDB 10.11 n'a pas encore tourné pour cette branche (résultat à lire sur la Pull Request). Seuls PHP 8.3 + MariaDB 10.11 sont testés localement.
2. **Hébergement OVH réel** : version de PHP/extensions, SSH, liens symboliques, tâches CRON (limites), `mail()`, droits de fichiers — voir `securite-et-compatibilite-ovh.md`.
3. **Échange réel serveur interne ↔ OVH** (SSH/clé, pare-feu) : les scripts sont testés en local seulement.
4. **Navigateurs/tablettes** autres que Chromium ; test de charge réel (non nécessaire pour une petite équipe).
5. Reprise des données de l'ancienne version (`exporter-vers-ovh.js`) : adaptée (plus de suppression, mots de passe à changer) mais non rejouée avec une vraie base d'origine.

## 3. Écarts connus / limites
- Pas de double authentification. Clé privée de sauvegarde = point critique (coffre).
- Pièces jointes, tâches récurrentes, échéance/responsable par étape, recherche serveur : **étudiés seulement** (`etude-priorite-2.md`).
- Les guides Word (`docs/*.docx`) décrivent encore l'ancienne version : à régénérer si vous les utilisez ; les `.md` sont à jour.
- La clé de maintenance et les données de config sont à créer à l'installation (aucun défaut).

## 4. Avis

**GO conditionnel pour un essai sur l'environnement de TEST d'OVH** (sous-domaine séparé, base séparée, fausses données).
**NO GO tant que les conditions suivantes ne sont pas remplies pour la PRODUCTION** :
1. La CI GitHub est verte sur cette Pull Request (notamment MySQL 8.0 et PHP 8.1).
2. Un essai complet sur le *test* OVH : installation, connexion, déploiement + retour arrière, migration.
3. La sauvegarde chiffrée est récupérée par le serveur interne **et restaurée avec succès** (test de restauration vert), clé privée mise au coffre, alertes reçues.
4. Les tâches CRON sont créées et leur exécution contrôlée dans le Manager OVH ; un e-mail d'alerte de test arrive bien.
5. Votre autorisation explicite pour fusionner puis publier.
