# Lier Projets Le Roy à ChatGPT

Même principe que pour Claude (voir [lier-a-claude.md](lier-a-claude.md)) : ChatGPT lit et fait avancer **vos** tâches, avec vos droits, sans rien pouvoir supprimer.

## Ce qu'il faut savoir

- L'administrateur doit **activer le connecteur** (Compte → « Lier à Claude ou ChatGPT »).
- Adresse du connecteur : `https://votre-domaine/mcp`.
- **La clé se transmet uniquement dans l'en-tête `Authorization: Bearer <clé>`** (ou `X-API-Key`). Elle n'est **jamais** acceptée dans l'adresse.
- Selon la formule ChatGPT, les connecteurs personnalisés avec en-tête d'authentification peuvent ne pas être disponibles. Dans ce cas, n'utilisez pas ChatGPT avec cet outil : la sécurité prime sur la commodité (une clé dans une adresse serait enregistrée dans les journaux).

## Mise en place (si votre ChatGPT le permet)

1. Créez votre clé : **Compte → Lier à Claude ou ChatGPT → Créer une clé d'accès** (nom « ChatGPT », durée au choix, « lecture seule » si vous ne voulez que consulter).
2. ChatGPT → Paramètres → Applications et connecteurs → mode développeur → **Créer** : URL du serveur MCP `https://votre-domaine/mcp`, authentification par **clé API / en-tête Bearer** : collez votre clé.
3. Essayez : « Quelles sont mes tâches en retard ? »

## Sécurité

- Seuls les outils de tâches sont ouverts (jamais les pages de l'application), avec vos droits.
- Supprimer la clé (Compte) ou désactiver le connecteur (administrateur) coupe l'accès immédiatement.
- Les accès par clé sont limités (essais répétés bloqués) et visibles : « dernière utilisation » dans la liste des clés.
