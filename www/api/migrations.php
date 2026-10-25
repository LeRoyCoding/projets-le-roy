<?php
// Migrations de la base MySQL. Chaque étape ne s'exécute qu'une fois.
// RÈGLE : ne jamais modifier une migration déjà publiée, toujours en AJOUTER une à la suite.
// Chaque migration est une liste d'ordres SQL.
$T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
return [
    // 1 — schéma complet (équivalent des migrations 1 à 8 de la version précédente)
    [
        "CREATE TABLE users (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            name VARCHAR(60) NOT NULL,
            password_hash VARCHAR(100) NOT NULL,
            role VARCHAR(10) NOT NULL DEFAULT 'user',
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            UNIQUE KEY users_name (name)
        ) $T",
        "CREATE TABLE groupes (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            name VARCHAR(80) NOT NULL,
            icon VARCHAR(20) NOT NULL,
            color VARCHAR(9) NOT NULL,
            position INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL
        ) $T",
        "CREATE TABLE group_members (
            group_id VARCHAR(32) NOT NULL,
            user_id VARCHAR(32) NOT NULL,
            PRIMARY KEY (group_id, user_id),
            CONSTRAINT gm_g FOREIGN KEY (group_id) REFERENCES groupes(id) ON DELETE CASCADE,
            CONSTRAINT gm_u FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) $T",
        "CREATE TABLE categories (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            label VARCHAR(40) NOT NULL,
            emoji VARCHAR(16) NOT NULL,
            position INT NOT NULL DEFAULT 0,
            hidden TINYINT(1) NOT NULL DEFAULT 0,
            created_by VARCHAR(32) NULL,
            created_at DATETIME NOT NULL
        ) $T",
        "CREATE TABLE tasks (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            group_id VARCHAR(32) NOT NULL,
            owner_id VARCHAR(32) NULL,
            type VARCHAR(64) NOT NULL,
            title VARCHAR(200) NOT NULL,
            description TEXT NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            created_by VARCHAR(32) NULL,
            completed TINYINT(1) NOT NULL DEFAULT 0,
            done_at DATETIME NULL,
            done_by VARCHAR(32) NULL,
            priority TINYINT NOT NULL DEFAULT 3,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            KEY tasks_group (group_id), KEY tasks_owner (owner_id), KEY tasks_done (done_at), KEY tasks_type (type),
            CONSTRAINT t_g FOREIGN KEY (group_id) REFERENCES groupes(id),
            CONSTRAINT t_o FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT t_d FOREIGN KEY (done_by) REFERENCES users(id) ON DELETE SET NULL
        ) $T",
        "CREATE TABLE steps (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            seq BIGINT NOT NULL AUTO_INCREMENT,
            task_id VARCHAR(32) NOT NULL,
            position INT NOT NULL DEFAULT 0,
            label VARCHAR(300) NOT NULL,
            description TEXT NOT NULL,
            done TINYINT(1) NOT NULL DEFAULT 0,
            done_at DATETIME NULL,
            done_by VARCHAR(32) NULL,
            UNIQUE KEY steps_seq (seq), KEY steps_task (task_id),
            CONSTRAINT s_t FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            CONSTRAINT s_d FOREIGN KEY (done_by) REFERENCES users(id) ON DELETE SET NULL
        ) $T",
        "CREATE TABLE comments (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            seq BIGINT NOT NULL AUTO_INCREMENT,
            task_id VARCHAR(32) NOT NULL,
            user_id VARCHAR(32) NULL,
            body TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            UNIQUE KEY comments_seq (seq), KEY comments_task (task_id),
            CONSTRAINT c_t FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            CONSTRAINT c_u FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) $T",
        "CREATE TABLE activity (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            task_id VARCHAR(32) NOT NULL,
            user_id VARCHAR(32) NULL,
            action VARCHAR(40) NOT NULL,
            detail VARCHAR(300) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL,
            KEY activity_task (task_id),
            CONSTRAINT a_t FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            CONSTRAINT a_u FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) $T",
        "CREATE TABLE sessions (
            token CHAR(64) NOT NULL PRIMARY KEY,
            user_id VARCHAR(32) NOT NULL,
            created_at DATETIME NOT NULL,
            last_seen DATETIME NOT NULL,
            CONSTRAINT se_u FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) $T",
        "CREATE TABLE api_tokens (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            user_id VARCHAR(32) NOT NULL,
            name VARCHAR(60) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            created_at DATETIME NOT NULL,
            last_used DATETIME NULL,
            UNIQUE KEY api_hash (token_hash),
            CONSTRAINT at_u FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) $T",
        // Essais de connexion ratés (par compte et par adresse), pour bloquer les devinettes.
        "CREATE TABLE login_failures (
            k VARCHAR(80) NOT NULL PRIMARY KEY,
            n INT NOT NULL DEFAULT 0,
            last_at DATETIME NOT NULL
        ) $T",
        "INSERT INTO categories (id, label, emoji, position, created_at) VALUES
            ('devis', 'Devis', '🧾', 0, UTC_TIMESTAMP()),
            ('chantier', 'Chantier', '🏗️', 1, UTC_TIMESTAMP()),
            ('commercial', 'Commercial', '🤝', 2, UTC_TIMESTAMP()),
            ('dev', 'Développement', '💻', 3, UTC_TIMESTAMP()),
            ('admin', 'Administratif', '📋', 4, UTC_TIMESTAMP()),
            ('prod', 'Production', '⚙️', 5, UTC_TIMESTAMP()),
            ('event', 'Salon / évènement', '🎪', 6, UTC_TIMESTAMP()),
            ('perso', 'Perso', '🏡', 7, UTC_TIMESTAMP())",
    ],
];
