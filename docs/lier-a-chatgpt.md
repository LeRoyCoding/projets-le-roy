# Lier Projets Le Roy à ChatGPT

Même principe que pour Claude : ChatGPT peut lire et faire avancer **vos** tâches, avec vos droits, sans rien pouvoir supprimer.

## Étape 0 — L'administrateur active le connecteur (une seule fois)

Page **Compte** → **Lier à Claude ou ChatGPT** → **Activer le connecteur**.

## Étape 1 — Créer votre clé d'accès

Page **Compte** → **Créer une clé d'accès** (nommez-la « ChatGPT »). **Copiez le lien personnel** qui s'affiche
(`https://votre-site/mcp/lr_…`) : il ne sera plus affiché, et il ne faut le partager avec personne.

## Étape 2 — Ajouter le connecteur dans ChatGPT

1. ChatGPT → **Paramètres → Applications et connecteurs** (ou *Plugins*) → **Paramètres avancés** → activez le **mode développeur**.
2. **Créer** (ou *Parcourir le catalogue* → bouton **+**) :
   - Nom : `Projets Le Roy`
   - URL du serveur MCP : votre **lien personnel**
   - Authentification : **Aucune** (la clé est déjà dans le lien)
3. Enregistrez. Dans une conversation, activez le connecteur puis demandez par exemple :
   « Quelles sont mes tâches en retard ? » ou « Crée une tâche urgente "Rappeler le GAEC du Moulin" dans Le Roy pour demain ».

*(Les connecteurs de ce type dépendent de la formule ChatGPT : certaines offres ne les proposent pas.)*

## Sécurité

- Seuls les outils de tâches sont ouverts (lister, créer, cocher, commenter…), **jamais** les pages de l'application.
- Supprimer la clé (Compte) ou désactiver le connecteur (administrateur) coupe l'accès immédiatement.
- Plus de tunnel ni de script à lancer : le site est déjà sur Internet.
