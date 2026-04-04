# Liste des API de Gestion & CRUD (Administrateur)

Ce document répertorie les points de terminaison de l'API destinés à la gestion des ressources (CRUD) et aux opérations administratives de la plateforme.

## 👥 Gestion des Utilisateurs

| Méthode | Chemin | Description | Accès |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/admin/users` | Liste paginée des utilisateurs avec recherche et filtres | **Admin** |
| `POST` | `/v1/admin/users` | Créer un nouvel utilisateur administrateur | **Admin** |
| `PUT` | `/v1/admin/users/{id}` | Mettre à jour les informations d'un utilisateur (nom, email, rôle) | **Admin** |
| `DELETE` | `/v1/admin/users/{id}` | Supprimer définitivement un compte utilisateur | **Admin** |
| `GET` | `/v1/users/session` | Récupérer les informations de la session actuelle | Utilisateur |
| `GET` | `/v1/users/{id}` | Récupérer les détails d'un utilisateur par son ID | Utilisateur |

## 🎨 Modèles de Personnages (Character Models)

| Méthode | Chemin | Description | Accès |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/admin/character-models` | Lister tous les modèles (vue admin complète) | **Admin** |
| `POST` | `/v1/admin/character-models` | Télécharger et enregistrer un nouveau modèle de base (image de référence) | **Admin** |
| `PATCH` | `/v1/admin/character-models/{id}` | Modifier les métadonnées ou l'image d'un modèle de base | **Admin** |
| `DELETE` | `/v1/admin/character-models/{id}` | Supprimer un modèle de personnage de base | **Admin** |
| `GET` | `/v1/character-models` | Lister tous les modèles de base disponibles pour la sélection | Public |
| `GET` | `/v1/characters` | Lister les personnages personnels de l'utilisateur connecté | Utilisateur |
| `POST` | `/v1/characters` | Créer un personnage personnel | Utilisateur |
| `PATCH` | `/v1/characters/{id}` | Mettre à jour un personnage personnel | Utilisateur |
| `DELETE` | `/v1/characters/{id}` | Supprimer un personnage personnel | Utilisateur |

## 📝 Gestion des Prompts Dynamiques

| Méthode | Chemin | Description | Accès |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/admin/prompts` | Créer un nouveau template de prompt dynamique | **Admin** |
| `GET` | `/v1/admin/prompts` | Lister tous les prompts (actifs et inactifs) avec filtres | **Admin** |
| `GET` | `/v1/admin/prompts/{id}` | Récupérer les détails complets d'un template de prompt | **Admin** |
| `PUT` | `/v1/admin/prompts/{id}` | Mettre à jour un template de prompt existant | **Admin** |
| `DELETE` | `/v1/admin/prompts/{id}` | Supprimer un template de prompt | **Admin** |
| `GET` | `/v1/prompts` | Lister les prompts actifs uniquement | Public |
| `POST` | `/v1/prompts/render` | Tester le rendu d'un prompt avec injection de variables | Utilisateur |

## 💰 Gestion des Crédits

| Méthode | Chemin | Description | Accès |
| :--- | :--- | :--- | :--- |
| `PATCH` | `/v1/admin/users/{id}/credits` | Ajuster manuellement les crédits supplémentaires d'un utilisateur | **Admin** |
| `GET` | `/v1/credits` | Consulter le solde de crédits (quota mensuel + extra) | Utilisateur |
| `POST` | `/v1/credits/checkout` | Initier un achat de pack de crédits (Stripe Checkout) | Utilisateur |
| `GET` | `/v1/credits/history` | Consulter l'historique des transactions de crédits | Utilisateur |

## 📊 Monitoring & File d'attente

| Méthode | Chemin | Description | Accès |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/admin/stats` | Statistiques globales (utilisateurs, vidéos, crédits utilisés) | **Admin** |
| `GET` | `/v1/admin/jobs` | État de la file d'attente BullMQ (jobs en cours, échoués, etc.) | **Admin** |

## 🎬 Gestion des Vidéos

| Méthode | Chemin | Description | Accès |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/videos` | Lister les vidéos générées par l'utilisateur | Utilisateur |
| `GET` | `/v1/videos/{id}` | Détails d'une vidéo (script, scènes, URLs des assets) | Utilisateur |
| `DELETE` | `/v1/videos/{id}` | Supprimer une vidéo et tous ses assets associés (MinIO) | Utilisateur |
| `POST` | `/v1/videos/generate` | Lancer la génération complète d'une vidéo | Utilisateur |
| `POST` | `/v1/videos/{id}/regenerate` | Relancer la génération avec les mêmes options | Utilisateur |
| `POST` | `/v1/videos/{id}/render` | Générer la vidéo à partir d'un script modifié | Utilisateur |
| `POST` | `/v1/videos/{id}/narrate` | Générer uniquement la narration et synchroniser le script | Utilisateur |
| `POST` | `/v1/videos/{id}/assemble` | Phase finale d'assemblage de la vidéo | Utilisateur |
| `POST` | `/v1/videos/{id}/scenes/{index}/reprompt` | Regénérer l'image d'une scène spécifique | Utilisateur |
| `PATCH` | `/v1/videos/{id}/voiceover` | Changer la voix de la narration | Utilisateur |
| `PATCH` | `/v1/videos/{id}/music` | Changer la musique de fond | Utilisateur |
| `PATCH` | `/v1/videos/{id}/captions` | Programmer/Configurer les sous-titres | Utilisateur |
| `PATCH` | `/v1/videos/{id}` | Mettre à jour les métadonnées ou le script de la vidéo | Utilisateur |

## ⚙️ Configuration Globale

| Méthode | Chemin | Description | Accès |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/config/video-types` | Lister les types de vidéos disponibles (Short, Explain, etc.) | Public |
| `GET` | `/v1/config/genres` | Lister les genres/styles visuels disponibles | Public |
| `GET` | `/v1/config/voices` | Lister les voix disponibles (Kokoro, ElevenLabs) | Public |
| `GET` | `/v1/config/plans` | Liste des forfaits et packs de crédits configurés | Public |
| `GET` | `/v1/config/music` | Lister les musiques de fond disponibles | Public |
