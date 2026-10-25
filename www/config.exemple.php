<?php
// Copiez ce fichier en « config.php » puis remplacez les 4 valeurs ci-dessous
// par celles de votre base de données OVHcloud (Manager OVH → Hébergements → Bases de données).
// Ne mettez JAMAIS ce fichier sur GitHub : le vrai config.php reste uniquement sur l'hébergement.
return [
    'db_host' => 'monnom.mysql.db',   // « Serveur » indiqué par OVH (ex. : leroy1234.mysql.db)
    'db_name' => 'monnom',            // « Nom de la base »
    'db_user' => 'monnom',            // « Utilisateur »
    'db_pass' => 'MOT_DE_PASSE_BASE', // mot de passe choisi à la création de la base
];
