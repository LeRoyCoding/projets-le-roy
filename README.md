# Projets Le Roy

Application de suivi des projets et des tâches pour l'équipe Le Roy / Lead Le Roy Concept.

Elle tourne sur **un PC du bureau** (le « PC serveur », toujours allumé).
Les collègues l'ouvrent dans leur navigateur depuis le même Wi-Fi, sans rien installer.

- 📖 **Mode d'emploi pour l'équipe** : [docs/guide-utilisateur.md](docs/guide-utilisateur.md)
- 🤖 **Lier l'application à Claude** : [docs/lier-a-claude.md](docs/lier-a-claude.md)
- 🔎 **Rapport d'audit et améliorations** : [docs/audit.md](docs/audit.md)
- 📄 **Guides Word à imprimer** : [docs/Guide-installation-Projets-Le-Roy.docx](docs/Guide-installation-Projets-Le-Roy.docx) et [docs/Guide-utilisation-Projets-Le-Roy.docx](docs/Guide-utilisation-Projets-Le-Roy.docx)

---

## 1. Préparer le PC serveur (une seule fois)

1. **Installer Node.js** : <https://nodejs.org/fr/download> → bouton « LTS » → installer avec les options par défaut.
2. **Installer Git** : <https://git-scm.com/download/win> → installer avec les options par défaut.
   (Git sert aux mises à jour automatiques.)
3. **Récupérer l'application**, au choix :
   - **Simple** : sur <https://github.com/LeRoyCoding/projets-le-roy>, bouton vert **Code** → **Download ZIP**,
     puis décompressez le contenu dans `C:\ProjetsLeRoy`.
   - **Avec Git** : menu Démarrer → tapez `cmd` → Entrée, puis :
     ```
     cd C:\
     git clone https://github.com/LeRoyCoding/projets-le-roy.git ProjetsLeRoy
     ```
   Les deux méthodes conviennent : la première mise à jour relie automatiquement un dossier « ZIP » à GitHub.

## 2. Les scripts à double-cliquer

Tous se trouvent dans `C:\ProjetsLeRoy`.

| Script | À quoi il sert |
|---|---|
| `installer.bat` | **À faire une fois.** Vérifie Node.js et installe les composants. |
| `autoriser-pare-feu.bat` | **À faire une fois.** Autorise les collègues à se connecter (Windows demande confirmation). |
| `demarrer-en-arriere-plan.bat` | **Lance l'application, sans fenêtre.** Affiche l'adresse à donner aux collègues. Sans risque si elle tourne déjà : il réaffiche l'adresse. |
| `arreter.bat` | Arrête l'application. |
| `activer-demarrage-auto.bat` | L'application démarre toute seule à chaque ouverture de session Windows (conseillé). `desactiver-demarrage-auto.bat` pour annuler. |
| `mettre-a-jour.bat` | Installe la dernière version publiée sur GitHub et relance l'application. **Les données ne sont jamais touchées.** |
| `demarrer.bat` | Lance l'application avec sa fenêtre noire (utile pour voir un message d'erreur). La fermer arrête l'application. |
| `lier-a-claude.bat` | Relie l'application Claude (sur ordinateur) à vos tâches. Voir [docs/lier-a-claude.md](docs/lier-a-claude.md). |

Pensez à régler le PC serveur pour qu'il **ne se mette pas en veille** (Paramètres → Système → Alimentation).

## 3. Première connexion

1. Sur le PC serveur, ouvrez <http://localhost:3000>.
2. Cliquez sur **Administrateur**, mot de passe **`admin`**.
3. Allez dans **Compte** → changez tout de suite ce mot de passe.
4. Toujours dans **Compte**, ajoutez chaque membre de l'équipe (nom + mot de passe). Chacun reçoit automatiquement son groupe « Perso ».
5. Dans **+ Groupe**, créez les groupes communs (par exemple « Le Roy », « LLC ») et cochez leurs membres.
6. Dans **Catégories**, ajustez la liste si besoin (Devis, Chantier… sont déjà là).

## 4. Installer l'application sur les postes des collègues

Sur chaque PC ou tablette, ouvrez l'adresse donnée par `demarrer-en-arriere-plan.bat`
(par exemple `http://192.168.1.25:3000`) dans **Chrome**, **Edge** ou **Brave**, puis :

- **Chrome / Brave** : menu **⋮** (ou **≡**) → **Enregistrer et partager** (ou **Plus d'outils**) → **Créer un raccourci…** → cochez **Ouvrir dans une fenêtre** → **Créer** ;
- **Edge** : menu **…** → **Applications** → **Installer ce site en tant qu'application**.

L'icône Le Roy apparaît sur le bureau, comme un vrai logiciel.

## 5. Données et sauvegardes

- Les données sont dans `C:\ProjetsLeRoy\donnees\projets.sqlite` (un seul fichier). Elles ne vont jamais sur GitHub.
- Chaque jour, une copie est faite automatiquement dans `C:\ProjetsLeRoy\sauvegardes\` (60 jours gardés).
- L'administrateur peut aussi **télécharger une sauvegarde complète** depuis la page **Compte** (à garder sur une clé USB ou un disque réseau).
- **Restaurer une sauvegarde** : `arreter.bat`, remplacez `donnees\projets.sqlite` par la sauvegarde choisie (renommée `projets.sqlite`),
  supprimez `projets.sqlite-wal` et `projets.sqlite-shm` s'ils existent, puis `demarrer-en-arriere-plan.bat`.

L'application n'est accessible que depuis le réseau local du bureau, pas depuis Internet.

## 6. Dépannage

| Problème | Solution |
|---|---|
| Les collègues n'arrivent pas à ouvrir l'adresse | Double-cliquez sur `autoriser-pare-feu.bat` sur le PC serveur. Vérifiez que le Wi-Fi est en « Réseau privé » dans les paramètres Windows. |
| « Le serveur ne répond pas » | Le PC serveur est éteint, en veille, ou l'application est arrêtée : lancez `demarrer-en-arriere-plan.bat`. |
| Un collègue a oublié son mot de passe | L'administrateur : page **Compte** → **Équipe** → crayon → « Nouveau mot de passe ». |
| Quelqu'un quitte l'entreprise | Page **Compte** → **Équipe** → crayon → décochez « Compte actif ». Ses tâches restent. |
| L'adresse du PC serveur a changé | Relancez `demarrer-en-arriere-plan.bat` pour voir la nouvelle adresse. Pour qu'elle ne change plus, demandez une « adresse IP fixe » pour ce PC dans la box ou le routeur. |
| Un message d'erreur au démarrage | Lancez `demarrer.bat` (avec fenêtre) pour lire le message. |
| Tout le monde est déconnecté après une mise à jour | Normal pour certaines mises à jour de sécurité : il suffit de se reconnecter. |

## 7. Pour essayer sans toucher aux vraies données (mode démo)

Dans une fenêtre `cmd` ouverte dans le dossier : `npm run demo`.
L'application démarre avec les exemples de la maquette (mot de passe `0000`, Administrateur `admin`),
dans un fichier séparé `donnees\demo.sqlite`.

---

## Informations techniques

- **Serveur** : Node.js 22.13+ (Express), base SQLite intégrée à Node.js (aucune compilation sous Windows).
  - `server/index.js` démarrage · `server/app.js` application et sécurité · `server/routes/` routes par thème
  - `server/db.js` schéma et migrations numérotées (les données existantes sont conservées)
- **Interface** : HTML/CSS/JS sans framework dans `public/`, reprise fidèlement de `prototype.html`
  (`public/js/base.js`, `regles.js`, `ecrans.js`, `fiche.js`, `actions.js`). Polices hébergées localement.
- **Temps réel** : Server-Sent Events (`/api/events`).
- **Sécurité** : mots de passe hachés (bcrypt), sessions par cookie (jetons hachés en base), réseau local uniquement,
  en-têtes CSP, clés d'accès personnelles pour les outils externes.
- **Tests** : `npm test` (API, droits, migrations, connecteur Claude), lancés automatiquement sur GitHub (Windows et Linux).
- **Connecteur Claude** : `outils/claude-mcp.js` (protocole MCP, sans dépendance).
- Port modifiable avec la variable d'environnement `PORT`.
