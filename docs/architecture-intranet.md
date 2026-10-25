# Architecture « prête pour l'intranet » (aucune intégration réalisée)

**Aujourd'hui, Projets Le Roy est totalement autonome** : aucune connexion à l'intranet, au CRM ni à www.le-roy.fr. Il n'y a pas de code qui les appelle, pas de partage de base, pas de cookie commun. Cette note décrit seulement comment une intégration *pourrait* se faire plus tard sans réécriture.

## Ce qui est déjà préparé
- **Identité interchangeable** : `www/api/auth_provider.php` définit une interface `AuthProvider` (`authenticate(): ?array`). Le fournisseur actuel est local (cookie de session + clés d'accès). Un futur fournisseur (SSO de l'intranet, OIDC/SAML) s'ajoute **sans toucher aux droits ni aux routes**.
- **Comptes liés** : colonnes `users.auth_source` (`local` par défaut) et `users.external_id`, et `user_from_identity()` pour retrouver/créer un compte à partir d'une identité externe. Les droits (admin, responsable/membre/lecteur) restent gérés dans Projets Le Roy.
- **API propre** : toutes les actions passent par `/api/…` (JSON), droits appliqués côté serveur ; clés d'accès à portée limitée (lecture/écriture) pour des échanges machine‑à‑machine.
- **Pas d'état caché** : configuration hors du site, base séparée, déploiement indépendant.

## Pistes futures (à décider par vous, rien n'est fait)
| Besoin | Approche | Précautions |
|---|---|---|
| Connexion unique avec l'intranet | Nouveau `AuthProvider` OIDC | Mapper les comptes par e‑mail vérifié ; conserver un compte admin local de secours |
| Lien tâche ↔ client/devis du CRM | Champ « référence externe » (texte/URL) sur la tâche | Lecture seule d'abord ; jamais d'écriture dans le CRM |
| Afficher des tâches dans l'intranet | Petit flux JSON en lecture avec clé d'accès dédiée | Clé en lecture seule, expirante, en en-tête |
| Notifications croisées | Webhook sortant signé | Liste blanche d'adresses, journal |

## Règle d'or
Toute intégration future se fera sur une branche à part, testée sur l'environnement de test, avec votre accord explicite.
