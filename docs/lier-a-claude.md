# Lier Projets Le Roy à Claude

Une fois relié, Claude peut lire et faire avancer vos tâches. Vous lui parlez normalement, en français :

- « Qu'est-ce qui est en retard ? Résume-moi la semaine. »
- « Crée un devis pour l'élevage Martin dans Le Roy, pour Claire, urgent, à rendre le 15/11, avec les étapes visite, chiffrage, envoi. »
- « Coche l'étape chiffrage du devis Martin et ajoute un commentaire : client rappelé. »

Claude agit **avec vos droits** (ceux de votre compte et de vos groupes), **ne peut rien supprimer**, et chaque action est notée dans l'historique de la tâche à votre nom.

## Comment la clé est protégée

- La clé est **personnelle et secrète**. Elle n'est affichée qu'une fois, **stockée chiffrée (empreinte) sur le serveur**, et **expire** (30 jours, 90 jours ou 1 an, au choix).
- Elle ne voyage **jamais dans une adresse web** (les adresses sont enregistrées dans les journaux et l'historique) : seulement dans l'en-tête `Authorization: Bearer …`.
- Vous pouvez la créer en **lecture seule** (Claude pourra consulter mais rien modifier).
- Vous la supprimez quand vous voulez (corbeille) ; l'administrateur peut aussi révoquer n'importe quelle clé (Compte → Sécurité).

## Méthode recommandée : Claude Desktop (la clé reste sur votre ordinateur)

Il faut **Claude Desktop** et **Node.js** (<https://nodejs.org/fr/download>, version LTS) sur le PC.

1. Dans Projets Le Roy : **Compte → Lier à Claude ou ChatGPT → Créer une clé d'accès**. Copiez la clé (`lr_…`).
2. Téléchargez le dépôt (GitHub → **Code → Download ZIP**) et décompressez-le.
3. Double-cliquez sur **`lier-a-claude.bat`**, indiquez l'adresse du site (`https://votre-domaine`), collez la clé.
4. Quittez complètement Claude (clic droit sur son icône → Quitter) puis rouvrez-le : *Paramètres → Développeur* doit afficher « projets-le-roy ».

## Connecteur en ligne (outils qui savent envoyer un en-tête)

L'administrateur doit d'abord l'**activer** (Compte → bas de la section « Lier à Claude ou ChatGPT »). L'adresse est `https://votre-domaine/mcp` ; l'authentification se fait par l'en-tête `Authorization: Bearer <votre clé>`.
Si votre outil ne permet pas de choisir un en-tête, utilisez la méthode Claude Desktop ci-dessus : **une clé placée dans l'adresse est refusée** par sécurité.

## Dépannage

| Problème | Solution |
|---|---|
| « Le connecteur est désactivé » | L'administrateur doit l'activer. |
| « Clé d'accès … expirée ou refusée » | Créez-en une nouvelle (Compte). |
| « Cette clé d'accès est en lecture seule » | Créez une clé « Lecture et écriture ». |
| 20 mauvaises clés de suite | Blocage progressif depuis cet appareil. |
