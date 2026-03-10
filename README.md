# Meko Academy Backend

Backend API pour la plateforme Meko Academy développée avec Hono.js et une architecture hexagonale.

## Table des matières 📋

- [Meko Academy Backend](#sketch-pilot-backend)
  - [Table des matières 📋](#table-des-matières-)
  - [Features 🛠️](#features-️)
  - [Installation 🚀](#installation-)
  - [Scripts disponibles 📜](#scripts-disponibles-)
  - [Schema de la base de données 🧩](#schema-de-la-base-de-données-)
  - [Structure du projet 📁](#structure-du-projet-)
  - [Conventions 📝](#conventions-)
    - [Git Commit Messages](#git-commit-messages)
    - [Style de code](#style-de-code)
  - [API Documentation 📚](#api-documentation-)
  - [Tests 🧪](#tests-)
  - [Architecture détaillée 🏗️](#architecture-détaillée-️)
  - [Configuration de l'environnement 🔧](#configuration-de-lenvironnement-)
  - [Système d'authentification 🔐](#système-dauthentification-)
  - [Middlewares 🔄](#middlewares-)
  - [Monitoring et Logs 📊](#monitoring-et-logs-)
  - [Bonnes pratiques de développement 👨‍💻](#bonnes-pratiques-de-développement-)
    - [TypeScript](#typescript)
    - [Tests](#tests)
    - [Organisation du code](#organisation-du-code)
  - [Contribution 🤝](#contribution-)

## Features 🛠️

- [**Hono.js**](https://hono.dev/) : Framework web ultrarapide et léger pour le edge computing
- [**Better Auth**](https://www.better-auth.com/docs/introduction) : Système d'authentification flexible et sécurisé
- [**Drizzle ORM**](https://orm.drizzle.team) : ORM TypeScript moderne avec une excellente sécurité des types
- [**Architecture Hexagonale**](./docs/architecture/index.md) : Architecture en couches pour une meilleure séparation des responsabilités
- [**Commitlint**](https://commitlint.js.org/) : Validation des messages de commit selon la convention Conventional Commits
- [**ESLint**](https://eslint.org/) : Linting et analyse statique du code
- [**Prettier**](https://prettier.io/) : Formatage automatique du code
- [**Vitest**](https://vitest.dev/) : Framework de test rapide et moderne
- [**OpenAPI/Swagger**](https://swagger.io/) : Documentation API interactive
- [**TypeScript**](https://www.typescriptlang.org/) : Typage statique pour un développement plus sûr

## Installation 🚀

### Prérequis
- **Node.js/Bun** : Runtime JavaScript
- **Docker & Docker Compose** : Pour PostgreSQL et Redis
- **PostgreSQL 15+** (via Docker) ou installation locale
- **Redis 6.2+** (via Docker) ou installation locale

### Étapes d'installation

1. **Cloner le dépôt** :
```sh
git clone https://gitlab.relia-consulting.com/client-project/sketch-pilot/sketch-pilot-backend.git
cd sketch-pilot-backend
```

2. **Installer les dépendances** :
```sh
bun install
```

3. **Démarrer PostgreSQL et Redis** (recommandé avec Docker Compose) :
```sh
docker-compose up -d
```

   Si vous n'avez pas Docker Compose, vous pouvez installer Redis et PostgreSQL localement. **Important**: Redis doit être à minimum en version **6.2.0** (pas 6.0.16).

4. **Configurer les variables d'environnement** :
```sh
cp .env.example .env
```

   Les valeurs par défaut doivent fonctionner avec docker-compose :
   ```env
   DATABASE_URL=postgresql://postgres:password@localhost:5432/default_db
   REDIS_URL=redis://localhost:6379
   ```

5. **Initialiser la base de données** :
```sh
bun run db:push   # Déploie le schéma
bun run db:seed   # Initialise les données de base
```

6. **Démarrer le serveur** :
```sh
bun run dev
```

   Le serveur sera accessible sur **http://localhost:5000**

### Notes de démarrage

- **Premier démarrage** : Les migrations sont appliquées automatiquement au démarrage
- **Port PostgreSQL** : `5432` (accessible depuis l'hôte)
- **Port Redis** : `6379` (accessible depuis l'hôte)
- **Utilisation locale** : Exécutez `docker-compose logs -f` pour voir les logs en temps réel

## Configuration de la base de données 🗄️

Le projet utilise PostgreSQL avec Drizzle ORM. Pour initialiser la base de données :

1. Assurez-vous d'avoir PostgreSQL installé et en cours d'exécution

2. Configurez la variable d'environnement dans `.env` :
```sh
DATABASE_URL=postgresql://postgres:password@localhost:5432/meko_academy?search_path=public
```

3. Créez la base de données (si nécessaire) :
```sh
psql -U postgres -c "drop database meko_academy"
```

4. Exécutez les migrations :
```sh
bun run db:migrate
```

5. Initialisez les données de base :
```sh
bun run db:seed
```
Cela créera un utilisateur administrateur par défaut :
- Email : admin@sketch-pilot.com
- Mot de passe : Admin123! (en production, utilisez ADMIN_PASSWORD dans .env)

Les commandes de base de données disponibles :
- `db:generate` - Génère les fichiers de migration
- `db:check` - Vérifie la cohérence du schéma
- `db:migrate` - Migrations
- `db:studio` - Interface de gestion de la base de données
- `db:push` - Mise à jour directe du schéma
- `db:drop` - Réinitialisation complète
- `db:seed` - Initialisation des données
## Scripts disponibles 📜

```sh
"dev": "bun run --hot src/server.ts"        # Lancer le serveur de développement
"start": "bun dist/server.js"               # Lancer en production
"build": "tsc && tsc-alias"                 # Compiler le projet
"format": "prettier --write \"./**/*.{js,ts,json}\"" # Formater le code
"lint": "eslint ."                          # Vérifier le code
"lint:fix": "bun run lint --fix"            # Corriger les erreurs de linting
"test": "vitest run"                        # Lancer les tests
"test:ui": "vitest --ui"                    # Interface utilisateur des tests
"db:generate": "npx drizzle-kit generate"   # Générer les migrations
"db:migrate": "tsx ./drizzle/migrate.ts"    # Appliquer les migrations
"db:studio": "npx drizzle-kit studio"       # Interface de gestion de la base de données
"db:push": "npx drizzle-kit push"           # Push les changements de schéma
```
## Schema de la base de données 🧩
Ce schéma illustre les entités principales ainsi que leurs relations, et sert de référence pour la modélisation de la base de données.

![Modèle Conceptuel de Données](./docs/conception/sketch-pilot.png)
[Modèle Conceptuel de Données (MCD) - sketch-pilot.dbml](./docs/conception/sketch-pilot.dbml)




## Structure du projet 📁

```sh
src/
├── application/           # Couche application (use cases)
│   ├── services/         # Services applicatifs
│   └── use-cases/        # Cas d'utilisation
├── domain/               # Couche domaine (logique métier)
│   ├── models/          # Modèles et entités
│   ├── repositories/    # Interfaces des repositories
│   └── types/          # Types et interfaces partagés
├── infrastructure/       # Couche infrastructure
│   ├── config/         # Configuration (auth, mail, etc.)
│   ├── controllers/    # Contrôleurs HTTP
│   ├── database/      # Configuration base de données
│   ├── middlewares/   # Middlewares HTTP
│   ├── pages/         # Pages de documentation
│   └── repositories/  # Implémentation des repositories
├── app.ts               # Configuration de l'application
└── server.ts           # Point d'entrée
```

## Conventions 📝

### Git Commit Messages

Nous utilisons la convention [Conventional Commits](https://www.conventionalcommits.org/). Format :

```
<type>(<scope>): <description>
```

Types disponibles:
- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `docs`: Documentation
- `style`: Formatage
- `refactor`: Refactorisation
- `test`: Tests
- `chore`: Maintenance

Exemples:
```
feat(auth): ajouter l'authentification OAuth
fix(api): corriger la validation des entrées
docs(readme): mettre à jour l'installation
```

### Style de code

- Utilisation de Prettier pour le formatage
- ESLint avec la configuration standard TypeScript
- Imports absolus avec alias (@/)
- Tests unitaires pour chaque fonctionnalité

## API Documentation 📚

La documentation API est disponible sur :
- Swagger UI : http://localhost:3000/docs
- OpenAPI JSON : http://localhost:3000/swagger
- Better Auth Swagger UI: http://localhost:3000/api/auth/reference

## Tests 🧪

Les tests sont écrits avec Vitest. Pour lancer les tests :

```sh
# Lancer tous les tests
bun test

# Mode watch
bun test:ui
```

## Architecture détaillée 🏗️

Voir la documentation détaillée dans le dossier [docs/architecture](./docs/architecture/index.md).

## Configuration de l'environnement 🔧

Le fichier `.env` doit contenir les variables suivantes :

```sh
# Base de données PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/default_db?search_path=public

# Better Auth
BETTER_AUTH_SECRET=votre_secret_ici
BETTER_AUTH_URL=http://localhost:3000

# Admin initial (optionnel)
ADMIN_PASSWORD=votre_mot_de_passe_admin

# Environnement
NODE_ENV="development"
```

## Système d'authentification 🔐

Le projet utilise Better Auth avec les fonctionnalités suivantes :

- Authentification Email/Mot de passe
- Vérification d'email
- Réinitialisation de mot de passe
- Sessions sécurisées
- Support OAuth (configurable)
- Rôles utilisateur (admin/utilisateur)

Configuration dans `src/infrastructure/config/auth.config.ts`.

## Middlewares 🔄

Le projet inclut plusieurs middlewares essentiels :

- **Authentication** : Vérifie les sessions et les permissions
- **Error Handler** : Gestion centralisée des erreurs
- **Response** : Formatage standardisé des réponses
- **CORS** : Configuration pour les requêtes cross-origin
- **Logger** : Journalisation des requêtes

## Monitoring et Logs 📊

Le système inclut un système de logs d'activité :

- Suivi des connexions/déconnexions
- Logs des modifications de compte
- Historique des abonnements
- Traçage des actions administratives

Les logs sont stockés dans la table `activity_logs`.

## Bonnes pratiques de développement 👨‍💻

En plus des conventions de commit, nous suivons ces pratiques :

### TypeScript
- Types stricts activés
- Interfaces pour tous les modèles
- Validation avec Zod

### Tests
- Tests unitaires avec Vitest
- Coverage cible : 100%
- Tests d'intégration
- Tests des repositories

### Organisation du code
- Architecture hexagonale
- Principes SOLID
- Documentation exhaustive
- Code formatting avec Prettier

## Contribution 🤝

1. Créer une branche (`git checkout -b feature/amazing-feature`)
2. Commit (`git commit -m 'feat: add amazing feature'`)
3. Push (`git push origin feature/amazing-feature`)
4. Créer une Merge Request
