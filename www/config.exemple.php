<?php
// Fichier de configuration : à copier en « config.php » dans le dossier « config » de l'hébergement,
// À CÔTÉ du dossier du site et NON DEDANS (ex. ~/projets/config/config.php, ou ~/config/config.php).
// Ainsi, il n'est jamais accessible depuis Internet et n'est jamais touché par une mise à jour du site.
// Ne mettez JAMAIS ce fichier dans Git, dans un e-mail ou dans une conversation : il contient des mots de passe.
// Les valeurs ci-dessous sont des exemples à remplacer.
return [
    // --- Base de données MySQL (Manager OVH → Hébergements → Bases de données) ---
    'db_host' => 'monnom.mysql.db',
    'db_name' => 'monnom',
    'db_user' => 'monnom',
    'db_pass' => 'MOT_DE_PASSE_BASE',

    // --- Clé de maintenance : protège installer.php et maintenance.php (32 caractères minimum, au hasard) ---
    // Générez-la par exemple avec : php -r 'echo bin2hex(random_bytes(32)), "\n";'
    'maintenance_key' => 'REMPLACER_PAR_UNE_CLE_ALEATOIRE_DE_64_CARACTERES',

    // --- Environnement : « production » (par défaut) ou « test » (affiche un bandeau « ENVIRONNEMENT DE TEST ») ---
    'env' => 'production',

    // --- Adresse publique du site (utilisée dans les e-mails de résumé) et expéditeur ---
    'base_url' => 'https://projets.le-roy.fr',
    'mail_from' => 'projets@le-roy.fr',

    // --- Sauvegardes (voir docs/sauvegardes.md) ---
    // Dossier des données (sauvegardes, état, fichiers) : HORS du site. Par défaut : le dossier « data » à côté de « config ».
    // 'data_dir' => '/homez.123/votrecompte/projets/data',
    // Clé PUBLIQUE du serveur interne : les sauvegardes sont chiffrées pour lui seul. (La clé privée ne quitte jamais le serveur interne.)
    'backup_public_key' => '',            // chemin d'un fichier .pem, ou le texte « -----BEGIN PUBLIC KEY----- … »
    'alert_email' => 'informatique@le-roy.fr',   // prévenu si une sauvegarde échoue

    // --- Base d'ESSAI pour tester une restauration (une autre base que la production !) ---
    // 'restore_test' => ['db_host' => 'monnom.mysql.db', 'db_name' => 'monnom_essai', 'db_user' => 'monnom_essai', 'db_pass' => '...'],

    // --- Derrière un relais de confiance qui envoie « X-Forwarded-Proto: https » (à laisser à false sur OVH mutualisé) ---
    // 'trust_proxy' => false,
];
