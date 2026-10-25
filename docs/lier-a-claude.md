# Lier Projets Le Roy à Claude

Une fois relié, Claude peut lire et faire avancer vos tâches. Vous lui parlez normalement, en français :

- « Qu'est-ce qui est en retard ? Résume-moi la semaine. »
- « Crée un devis pour l'élevage Martin dans Le Roy, pour Claire, urgent, à rendre le 15/11, avec les étapes visite, chiffrage, envoi. »
- « Coche l'étape chiffrage du devis Martin et ajoute un commentaire : client rappelé. »
- « Quelles tâches de Julien finissent ce mois-ci ? »

Claude agit **avec vos droits** : il voit exactement ce que vous voyez dans l'application, ni plus ni moins, et ne peut rien supprimer.
Chaque action est notée dans l'historique des tâches, à votre nom.

## Étape 0 — L'administrateur active le connecteur (une seule fois)

Page **Compte** → bas de la section « Lier à Claude ou ChatGPT » → **Activer le connecteur**. Tant qu'il est désactivé, personne ne peut s'en servir.

## Étape 1 — Créer votre clé d'accès

1. Page **Compte** → **Lier à Claude ou ChatGPT** → **Créer une clé d'accès**.
2. Un **lien personnel** s'affiche (`https://votre-site/mcp/lr_…`). **Copiez-le** : il ne sera plus jamais affiché.
   Il fonctionne comme un mot de passe : ne le partagez avec personne.

Vous pouvez supprimer une clé à tout moment (corbeille) : Claude perd alors l'accès immédiatement.

## Étape 2 — Relier Claude

### Méthode simple : connecteur personnalisé (Claude sur le web ou sur ordinateur)

1. Dans Claude : **Paramètres → Connecteurs → Ajouter un connecteur personnalisé**.
2. Nom : `Projets Le Roy`. Adresse : collez votre **lien personnel**. Ajoutez.
3. Ouvrez une conversation et posez une question sur vos tâches.

*(Selon votre formule Claude, les connecteurs personnalisés peuvent ne pas être disponibles : utilisez alors la méthode ci-dessous.)*

### Autre méthode : Claude Desktop avec Node.js

Il faut **Node.js** sur le PC (<https://nodejs.org/fr/download>, version LTS) et le dossier de l'application.

1. Téléchargez le dossier : <https://github.com/LeRoyCoding/projets-le-roy> → **Code → Download ZIP**, décompressez-le (par exemple dans `C:\ProjetsLeRoy`).
2. Créez une clé (étape 1) ; **gardez seulement la partie `lr_…`** du lien (la fin, après `/mcp/`).
3. Double-cliquez sur **`lier-a-claude.bat`**, indiquez l'adresse du site (`https://votre-domaine`), collez la clé `lr_…`, Entrée.
4. **Quittez complètement Claude** (clic droit sur son icône près de l'horloge → Quitter) puis rouvrez-le.
   *Paramètres → Développeur* doit afficher « projets-le-roy ».

## Dépannage

| Problème | Solution |
|---|---|
| « Le connecteur est désactivé » | L'administrateur doit l'activer (étape 0). |
| « Clé d'accès refusée » | La clé a été supprimée, ou le compte désactivé : créez-en une nouvelle. |
| Claude ne voit aucun outil | Quittez et rouvrez Claude ; vérifiez le lien (il doit commencer par `https://` et contenir `/mcp/lr_`). |
| 20 mauvaises clés de suite | Blocage de 10 minutes depuis cet appareil. |
