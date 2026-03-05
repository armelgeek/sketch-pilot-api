# Roadmap API & Frontend — Stickman Generator SaaS

**Date** : Mars 2026  
**Version** : 1.0  
**Audience** : Équipe de développement (frontend + backend)

---

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Stack technique recommandée](#stack-technique-recommandée)
3. [API Backend — Endpoints](#api-backend--endpoints)
   - [Auth](#1-auth)
   - [Utilisateurs](#2-utilisateurs)
   - [Génération de vidéos](#3-génération-de-vidéos)
   - [Scripts](#4-scripts)
   - [Assets](#5-assets)
   - [Crédits & Abonnements](#6-crédits--abonnements)
   - [Modèles & Paramètres](#7-modèles--paramètres)
   - [Webhooks](#8-webhooks)
   - [Administration](#9-administration)
4. [Frontend — Pages & Sections](#frontend--pages--sections)
   - [Landing Page](#page-1--landing-page)
   - [Authentification](#page-2--authentification)
   - [Dashboard](#page-3--dashboard)
   - [Générateur de vidéo](#page-4--générateur-de-vidéo)
   - [Bibliothèque de vidéos](#page-5--bibliothèque-de-vidéos)
   - [Détail d'une vidéo](#page-6--détail-dune-vidéo)
   - [Pricing](#page-7--pricing)
   - [Profil & Compte](#page-8--profil--compte)
   - [Facturation](#page-9--facturation)
   - [Paramètres](#page-10--paramètres)
   - [Aide & Documentation](#page-11--aide--documentation)
   - [Administration](#page-12--administration-panel)
5. [Modèles de données](#modèles-de-données)
6. [Flux utilisateur clés](#flux-utilisateur-clés)
7. [Planning d'implémentation](#planning-dimplémentation)

---

## Vue d'ensemble

Stickman Generator est une plateforme SaaS de génération automatique de vidéos animées via l'IA. L'utilisateur saisit un sujet, choisit un style, et obtient en quelques minutes une vidéo complète avec narration, images stickman animées et sous-titres.

**Plans tarifaires** :
| Plan | Prix | Vidéos/mois | Cible |
|------|------|-------------|-------|
| Creator | $49/mois | 30 | Créateurs de contenu |
| Professional | $149/mois | 100 | Agences |
| Business | $399/mois | 300 | PME / équipes |
| Enterprise | Sur devis | Illimité | Grandes entreprises |

---

## Stack technique recommandée

### Backend
- **Runtime** : Node.js (TypeScript) — aligné avec la codebase existante
- **Framework** : Express.js ou Fastify
- **Base de données** : PostgreSQL (utilisateurs, abonnements, vidéos) + Redis (file d'attente, cache)
- **File d'attente** : BullMQ (Redis) pour les jobs de génération asynchrone
- **Stockage** : AWS S3 (ou compatible) pour les vidéos et assets générés
- **Paiements** : Stripe
- **Auth** : JWT (access token 15min + refresh token 7j) ou Auth0

### Frontend
- **Framework** : Next.js 14+ (App Router)
- **UI** : Tailwind CSS + shadcn/ui
- **State** : Zustand ou Jotai pour l'état global
- **Data fetching** : TanStack Query (react-query)
- **Player vidéo** : Video.js ou player natif HTML5
- **Upload** : react-dropzone

### Déploiement
- **Backend API** : Railway, Render ou AWS ECS
- **Frontend** : Vercel
- **CDN** : CloudFront (pour les assets S3)

---

## API Backend — Endpoints

> **Base URL** : `https://api.stickman-generator.com/v1`  
> **Format** : JSON  
> **Auth** : Bearer Token (JWT) dans le header `Authorization`

---

### 1. Auth

#### `POST /auth/register`
Créer un nouveau compte utilisateur.

**Body** :
```json
{
  "email": "user@example.com",
  "password": "motdepasse123",
  "name": "Jean Dupont"
}
```

**Réponse 201** :
```json
{
  "user": { "id": "uuid", "email": "...", "name": "..." },
  "accessToken": "jwt...",
  "refreshToken": "jwt..."
}
```

---

#### `POST /auth/login`
Connexion avec email/mot de passe.

**Body** :
```json
{
  "email": "user@example.com",
  "password": "motdepasse123"
}
```

**Réponse 200** :
```json
{
  "user": { "id": "uuid", "email": "...", "name": "...", "plan": "creator" },
  "accessToken": "jwt...",
  "refreshToken": "jwt..."
}
```

---

#### `POST /auth/logout`
Invalider le refresh token.

**Body** :
```json
{ "refreshToken": "jwt..." }
```

---

#### `POST /auth/refresh`
Renouveler l'access token.

**Body** :
```json
{ "refreshToken": "jwt..." }
```

**Réponse 200** :
```json
{ "accessToken": "jwt..." }
```

---

#### `POST /auth/forgot-password`
Envoyer un lien de réinitialisation.

**Body** :
```json
{ "email": "user@example.com" }
```

---

#### `POST /auth/reset-password`
Réinitialiser le mot de passe avec le token reçu par email.

**Body** :
```json
{
  "token": "reset-token-uuid",
  "newPassword": "nouveaumotdepasse"
}
```

---

#### `GET /auth/me` 🔒
Obtenir les informations de l'utilisateur connecté.

**Réponse 200** :
```json
{
  "id": "uuid",
  "email": "...",
  "name": "...",
  "plan": "professional",
  "credits": 85,
  "avatarUrl": "..."
}
```

---

### 2. Utilisateurs

#### `PATCH /users/me` 🔒
Mettre à jour le profil.

**Body** :
```json
{
  "name": "Nouveau Nom",
  "avatarUrl": "https://..."
}
```

---

#### `PATCH /users/me/password` 🔒
Changer le mot de passe.

**Body** :
```json
{
  "currentPassword": "ancien",
  "newPassword": "nouveau"
}
```

---

#### `DELETE /users/me` 🔒
Supprimer le compte (soft delete, demande confirmation).

---

### 3. Génération de vidéos

#### `POST /videos/generate` 🔒
Lancer la génération d'une vidéo. Opération **asynchrone** : retourne immédiatement un `jobId`.

**Body** :
```json
{
  "topic": "Comment apprendre Python en 30 jours",
  "options": {
    "duration": 60,
    "sceneCount": 6,
    "style": "educational",
    "videoType": "tutorial",
    "videoGenre": "tech",
    "language": "fr",
    "voiceProvider": "elevenlabs",
    "voiceId": "EXAVITQu4vr4xnSDxMaL",
    "animationProvider": "veo",
    "llmProvider": "gemini",
    "imageProvider": "gemini",
    "qualityMode": "standard",
    "textOverlay": {
      "enabled": true,
      "position": "bottom"
    },
    "characterConsistency": true,
    "autoTransitions": true
  }
}
```

**Réponse 202** :
```json
{
  "jobId": "job-uuid",
  "status": "queued",
  "estimatedDuration": 180,
  "creditsRequired": 1,
  "message": "Génération en cours..."
}
```

---

#### `GET /videos/jobs/:jobId` 🔒
Suivre l'état d'un job de génération.

**Réponse 200** :
```json
{
  "jobId": "job-uuid",
  "status": "processing",
  "progress": 45,
  "currentStep": "Génération des images (scène 3/6)",
  "startedAt": "2026-03-05T08:00:00Z",
  "estimatedCompletion": "2026-03-05T08:03:00Z",
  "videoId": null
}
```

**Statuts possibles** : `queued` | `processing` | `completed` | `failed` | `cancelled`

---

#### `GET /videos` 🔒
Lister toutes les vidéos de l'utilisateur.

**Query params** :
- `page` (int, défaut 1)
- `limit` (int, défaut 20, max 100)
- `status` (`completed` | `processing` | `failed`)
- `genre` (`tech` | `business` | ...)
- `type` (`tutorial` | `listicle` | ...)
- `search` (recherche par topic)
- `sort` (`createdAt:desc` | `createdAt:asc` | `duration:asc`)

**Réponse 200** :
```json
{
  "data": [
    {
      "id": "video-uuid",
      "topic": "Comment apprendre Python",
      "status": "completed",
      "thumbnailUrl": "https://cdn.../thumb.jpg",
      "videoUrl": "https://cdn.../video.mp4",
      "duration": 63,
      "genre": "tech",
      "type": "tutorial",
      "createdAt": "2026-03-05T08:00:00Z",
      "creditsUsed": 1
    }
  ],
  "total": 47,
  "page": 1,
  "limit": 20
}
```

---

#### `GET /videos/:id` 🔒
Obtenir le détail d'une vidéo.

**Réponse 200** :
```json
{
  "id": "video-uuid",
  "topic": "Comment apprendre Python",
  "status": "completed",
  "videoUrl": "https://cdn.../video.mp4",
  "thumbnailUrl": "https://cdn.../thumb.jpg",
  "duration": 63,
  "genre": "tech",
  "type": "tutorial",
  "options": { "...paramètres originaux..." },
  "metadata": {
    "apiCalls": 19,
    "estimatedCost": 0.24,
    "generationTimeMs": 180000
  },
  "script": { "...script structuré..." },
  "scenes": [ { "...scènes avec assets..." } ],
  "createdAt": "2026-03-05T08:00:00Z"
}
```

---

#### `DELETE /videos/:id` 🔒
Supprimer une vidéo (et ses assets S3).

---

#### `POST /videos/:id/regenerate` 🔒
Relancer la génération d'une vidéo existante (en cas d'échec ou pour une nouvelle version).

---

#### `POST /videos/jobs/:jobId/cancel` 🔒
Annuler un job en cours (si encore en file d'attente).

---

### 4. Scripts

#### `POST /scripts/generate` 🔒
Générer uniquement le script (sans images ni vidéo). Permet à l'utilisateur de valider avant de consommer des crédits.

**Body** :
```json
{
  "topic": "Top 5 des erreurs de débutants en Python",
  "options": {
    "duration": 60,
    "sceneCount": 6,
    "style": "educational",
    "videoType": "listicle",
    "videoGenre": "tech"
  }
}
```

**Réponse 200** (synchrone — génération rapide ~1s) :
```json
{
  "script": {
    "title": "Top 5 erreurs Python",
    "scenes": [
      {
        "id": 1,
        "narration": "Erreur n°1 : confondre les types...",
        "duration": 10,
        "layout": "character-left-text-right"
      }
    ]
  },
  "creditsConsumed": 0,
  "estimatedGenerationCost": 1
}
```

---

#### `POST /scripts/validate` 🔒
Valider / pré-vérifier un script personnalisé avant génération.

**Body** :
```json
{
  "script": { "...script modifié par l'utilisateur..." }
}
```

---

### 5. Assets

#### `GET /videos/:id/assets` 🔒
Lister tous les assets d'une vidéo (images, audio, sous-titres).

**Réponse 200** :
```json
{
  "assets": [
    {
      "type": "image",
      "sceneId": 1,
      "url": "https://cdn.../scene1_bg.png",
      "filename": "scene1_bg.png"
    },
    {
      "type": "audio",
      "url": "https://cdn.../narration.mp3"
    },
    {
      "type": "subtitle",
      "url": "https://cdn.../captions.ass"
    }
  ]
}
```

---

#### `GET /videos/:id/download` 🔒
Obtenir une URL de téléchargement signée (S3 presigned URL, valable 1h).

**Réponse 200** :
```json
{
  "downloadUrl": "https://s3.amazonaws.com/...?signature=...",
  "expiresAt": "2026-03-05T09:00:00Z"
}
```

---

### 6. Crédits & Abonnements

#### `GET /billing/credits` 🔒
Obtenir le solde de crédits.

**Réponse 200** :
```json
{
  "balance": 85,
  "plan": "professional",
  "videosThisMonth": 15,
  "videosLimit": 100,
  "resetDate": "2026-04-01"
}
```

---

#### `GET /billing/subscription` 🔒
Détails de l'abonnement Stripe actuel.

**Réponse 200** :
```json
{
  "planId": "professional",
  "planName": "Professional",
  "status": "active",
  "currentPeriodStart": "2026-03-01",
  "currentPeriodEnd": "2026-04-01",
  "cancelAtPeriodEnd": false,
  "amount": 149,
  "currency": "usd",
  "nextPaymentDate": "2026-04-01"
}
```

---

#### `POST /billing/checkout` 🔒
Créer une session Stripe Checkout pour s'abonner ou changer de plan.

**Body** :
```json
{
  "planId": "professional",
  "successUrl": "https://app.stickman-generator.com/billing?success=true",
  "cancelUrl": "https://app.stickman-generator.com/pricing"
}
```

**Réponse 200** :
```json
{
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_...",
  "sessionId": "cs_..."
}
```

---

#### `POST /billing/portal` 🔒
Accéder au portail Stripe Customer Portal (gestion des paiements, historique, annulation).

**Réponse 200** :
```json
{
  "portalUrl": "https://billing.stripe.com/session/..."
}
```

---

#### `GET /billing/invoices` 🔒
Historique des factures.

**Réponse 200** :
```json
{
  "invoices": [
    {
      "id": "in_...",
      "date": "2026-03-01",
      "amount": 149,
      "currency": "usd",
      "status": "paid",
      "pdfUrl": "https://invoice.stripe.com/..."
    }
  ]
}
```

---

### 7. Modèles & Paramètres

#### `GET /config/video-types`
Retourner les types de vidéo disponibles (public, pas d'auth requise).

**Réponse 200** :
```json
{
  "videoTypes": [
    { "id": "tutorial", "label": "Tutoriel", "description": "Guide étape par étape" },
    { "id": "listicle", "label": "Liste", "description": "Top 5/10, classements" },
    { "id": "faceless", "label": "Sans visage", "description": "Narration + visuels" },
    { "id": "story", "label": "Histoire", "description": "Récit, mini-mystère" },
    { "id": "news", "label": "Actualité", "description": "Résumé d'actualités" },
    { "id": "review", "label": "Avis", "description": "Revue de produit" },
    { "id": "motivational", "label": "Motivation", "description": "Citations inspirantes" },
    { "id": "animation", "label": "Animation", "description": "Motion graphics" },
    { "id": "entertainment", "label": "Entertainment", "description": "Tendances, humour" }
  ]
}
```

---

#### `GET /config/genres`
Genres / niches disponibles (public).

**Réponse 200** :
```json
{
  "genres": [
    { "id": "tech", "label": "Tech", "emoji": "💻" },
    { "id": "business", "label": "Business", "emoji": "💼" },
    { "id": "educational", "label": "Éducation", "emoji": "📚" },
    { "id": "finance", "label": "Finance", "emoji": "💰" },
    { "id": "health", "label": "Santé", "emoji": "💪" },
    { "id": "lifestyle", "label": "Lifestyle", "emoji": "🌟" },
    { "id": "fun", "label": "Humour", "emoji": "😂" },
    { "id": "gaming", "label": "Gaming", "emoji": "🎮" },
    { "id": "travel", "label": "Voyage", "emoji": "✈️" },
    { "id": "food", "label": "Cuisine", "emoji": "🍕" },
    { "id": "sports", "label": "Sports", "emoji": "⚽" },
    { "id": "science", "label": "Science", "emoji": "🔬" },
    { "id": "history", "label": "Histoire", "emoji": "📜" },
    { "id": "self-improvement", "label": "Développement perso", "emoji": "🚀" },
    { "id": "mystery", "label": "Mystère", "emoji": "🔍" },
    { "id": "general", "label": "Général", "emoji": "🌐" }
  ]
}
```

---

#### `GET /config/voices`
Voix disponibles par provider (public).

**Réponse 200** :
```json
{
  "providers": [
    {
      "id": "demo",
      "label": "Demo (Gratuit)",
      "available": true,
      "voices": [{ "id": "default", "label": "Voix par défaut", "lang": "fr" }]
    },
    {
      "id": "elevenlabs",
      "label": "ElevenLabs",
      "available": true,
      "voices": [
        { "id": "EXAVITQu4vr4xnSDxMaL", "label": "Bella", "lang": "en" },
        { "id": "21m00Tcm4TlvDq8ikWAM", "label": "Rachel", "lang": "en" }
      ]
    },
    {
      "id": "google-tts",
      "label": "Google TTS",
      "available": true,
      "voices": [
        { "id": "fr-FR-Neural2-A", "label": "French Female", "lang": "fr" },
        { "id": "en-US-Neural2-C", "label": "English Female", "lang": "en" }
      ]
    },
    {
      "id": "kokoro",
      "label": "Kokoro (Local)",
      "available": true,
      "voices": [
        { "id": "af_heart", "label": "Heart (US Female)", "lang": "en" },
        { "id": "am_adam", "label": "Adam (US Male)", "lang": "en" },
        { "id": "bf_emma", "label": "Emma (UK Female)", "lang": "en" }
      ]
    }
  ]
}
```

---

#### `GET /config/plans`
Plans tarifaires disponibles (public).

**Réponse 200** :
```json
{
  "plans": [
    {
      "id": "creator",
      "name": "Creator",
      "price": 49,
      "currency": "usd",
      "videosPerMonth": 30,
      "features": ["30 vidéos/mois", "Durée max 2 min", "Voix standard", "Export HD"],
      "stripePriceId": "price_..."
    },
    {
      "id": "professional",
      "name": "Professional",
      "price": 149,
      "currency": "usd",
      "videosPerMonth": 100,
      "features": ["100 vidéos/mois", "Durée max 5 min", "ElevenLabs inclus", "Export 4K", "Sous-titres avancés"],
      "stripePriceId": "price_..."
    },
    {
      "id": "business",
      "name": "Business",
      "price": 399,
      "currency": "usd",
      "videosPerMonth": 300,
      "features": ["300 vidéos/mois", "Durée illimitée", "White-label", "API Access", "Support prioritaire"],
      "stripePriceId": "price_..."
    }
  ]
}
```

---

### 8. Webhooks

#### `POST /webhooks/stripe`
Recevoir les événements Stripe (paiement réussi, abonnement annulé, etc.).
- `payment_intent.succeeded` → activer/renouveler abonnement
- `customer.subscription.deleted` → désactiver le plan
- `invoice.payment_failed` → notifier l'utilisateur

> ⚠️ Vérifier la signature Stripe avec `stripe.webhooks.constructEvent()`

---

### 9. Administration

> 🔒 Accès réservé au rôle `admin`

#### `GET /admin/users`
Liste des utilisateurs avec filtres (plan, date, status).

#### `GET /admin/users/:id`
Détail d'un utilisateur + ses vidéos + crédits.

#### `PATCH /admin/users/:id/credits`
Ajuster manuellement les crédits d'un utilisateur.

#### `GET /admin/stats`
Statistiques globales (MRR, vidéos générées, utilisateurs actifs, coûts API).

#### `GET /admin/jobs`
File d'attente des jobs (en cours, en échec).

---

## Frontend — Pages & Sections

> **Convention** : chaque page est décrite avec ses sections principales, leur contenu et leur rôle.

---

### Page 1 : Landing Page

**Route** : `/`  
**Audience** : Visiteurs non connectés  
**Objectif** : Convertir en inscription ou essai gratuit

#### Sections

**1.1 — Hero**
- Titre accrocheur : "Créez des vidéos stickman animées en 3 minutes avec l'IA"
- Sous-titre : bénéfice clé (automatique, 1 clic, aucune compétence requise)
- Bouton CTA principal : "Commencer gratuitement" → `/register`
- Bouton secondaire : "Voir une démo" → ouvre une modale avec une vidéo exemple
- Vidéo ou GIF d'exemple jouant en arrière-plan ou en side-preview

**1.2 — Démo en direct**
- Champ texte : "Entrez votre sujet…"
- Sélecteurs : Genre, Type de vidéo, Langue
- Bouton "Générer un exemple" → redirige vers `/register` avec les paramètres pré-remplis
- Aperçu statique d'un résultat exemple (thumbnail ou courte vidéo)

**1.3 — Fonctionnalités clés**
- 3 à 4 cartes avec icône + titre + description :
  - ⚡ "100% automatique" — Saisissez un sujet, l'IA fait le reste
  - 🎨 "9 types de vidéos" — Tutorial, listicle, story, news…
  - 🌍 "Multi-langue" — Anglais, Français, Espagnol…
  - 🎙️ "Voix IA de qualité" — ElevenLabs, Google TTS, Kokoro

**1.4 — Comment ça marche (3 étapes)**
- Étape 1 : Entrez votre sujet
- Étape 2 : Choisissez vos options (type, genre, voix)
- Étape 3 : Téléchargez votre vidéo en MP4
- Visuel / illustration pour chaque étape

**1.5 — Galerie d'exemples**
- Grille 3×2 de vidéos exemple avec lecteur intégré
- Filtres par genre : Tech, Business, Éducation, etc.
- Chaque carte : thumbnail, titre, durée, bouton "Voir"

**1.6 — Pricing**
- 3 cartes de plan (Creator / Professional / Business)
- Mise en avant du plan le plus populaire
- Bouton "Commencer" sur chaque carte
- Lien "Voir tous les détails" → `/pricing`

**1.7 — Témoignages / Preuves sociales**
- 3 à 5 témoignages de clients (avatar, nom, rôle, citation)
- Logos de marques utilisant le produit (si disponibles)

**1.8 — FAQ**
- 5 à 8 questions fréquentes (accordion)
- Ex : "Quelle qualité sont les vidéos ?", "Puis-je utiliser mes propres images ?", etc.

**1.9 — CTA Final**
- Répétition du message hero
- Bouton "Essayer maintenant — Gratuit" en grand

**1.10 — Footer**
- Liens : Pricing, Documentation, Contact, CGU, Politique de confidentialité
- Liens réseaux sociaux (Twitter/X, LinkedIn, YouTube)
- Copyright

---

### Page 2 : Authentification

#### 2.1 — Page Login (`/login`)
- Logo + titre "Connexion"
- Champ email
- Champ mot de passe (avec bouton voir/masquer)
- Bouton "Se connecter"
- Lien "Mot de passe oublié ?" → `/forgot-password`
- Séparateur "ou"
- Bouton "Continuer avec Google" (OAuth optionnel)
- Lien "Pas encore de compte ? S'inscrire" → `/register`

#### 2.2 — Page Register (`/register`)
- Logo + titre "Créer un compte"
- Champ nom complet
- Champ email
- Champ mot de passe (avec indicateur de force)
- Champ confirmer le mot de passe
- Checkbox "J'accepte les CGU"
- Bouton "Créer mon compte"
- Séparateur "ou"
- Bouton "Continuer avec Google"
- Lien "Déjà inscrit ? Se connecter" → `/login`

#### 2.3 — Page Forgot Password (`/forgot-password`)
- Champ email
- Bouton "Envoyer le lien de réinitialisation"
- Message de confirmation après envoi

#### 2.4 — Page Reset Password (`/reset-password?token=...`)
- Nouveau mot de passe
- Confirmer le mot de passe
- Bouton "Réinitialiser"
- Redirection vers `/login` après succès

---

### Page 3 : Dashboard

**Route** : `/dashboard` (protégée, authentification requise)  
**Objectif** : Vue d'ensemble et accès rapide

#### Sections

**3.1 — Header / Barre de navigation principale**
- Logo à gauche
- Navigation : Dashboard, Mes vidéos, Générateur, Pricing
- À droite : crédits restants (badge), avatar + dropdown (profil, paramètres, déconnexion)

**3.2 — Résumé utilisateur**
- Salutation personnalisée : "Bonjour Jean 👋"
- Plan actuel + crédits restants : "Plan Professional — 85/100 vidéos ce mois-ci"
- Barre de progression des crédits
- Bouton "Upgrade" si plan insuffisant

**3.3 — Actions rapides**
- Carte principale : "Créer une nouvelle vidéo" avec bouton CTA → `/generate`
- Cartes secondaires (accès rapide) :
  - Mes dernières vidéos
  - Paramètres de compte
  - Gérer mon abonnement

**3.4 — Statistiques personnelles**
- Compteurs : Vidéos créées ce mois / Total vidéos / Durée totale générée
- Mini graphique : vidéos créées par semaine (derniers 30j)

**3.5 — Dernières vidéos**
- Liste des 5 dernières vidéos (thumbnail, titre, statut, date)
- Bouton "Voir toutes mes vidéos" → `/videos`
- Indicateurs de statut visuels : ✅ Complété, ⏳ En cours, ❌ Échoué

**3.6 — Jobs en cours (si applicable)**
- Section visible uniquement si un job est actif
- Barre de progression animée + étape en cours
- Bouton "Annuler"

---

### Page 4 : Générateur de vidéo

**Route** : `/generate`  
**Objectif** : Interface principale de création de vidéo

#### Sections

**4.1 — Étape 1 : Sujet**
- Champ texte grand format : "Quel est le sujet de votre vidéo ?"
- Placeholder avec exemples : "Comment investir en bourse pour débutants"
- Compteur de caractères (max 200)
- Boutons de suggestions de sujets tendance (optionnel)

**4.2 — Étape 2 : Type & Genre**
- Sélecteur de Type de vidéo (9 options avec icône + description)
  - Tutorial, Listicle, Story, News, Animation, Review, Motivational, Entertainment, Faceless
- Sélecteur de Genre / Niche (16 options avec emoji)
  - Tech, Business, Finance, Santé, Education, Gaming, etc.

**4.3 — Étape 3 : Paramètres avancés** (accordéon / section rétractable)
- Durée : slider ou input (30s / 60s / 2min / 5min)
- Nombre de scènes : 3, 6, 10, 15, 20, 30
- Langue : sélecteur (Français, Anglais, Espagnol, Allemand…)
- Voix : sélecteur provider + sélecteur voix avec bouton "Écouter aperçu"
- Mode qualité : 🟢 Standard | ⭐ Haute qualité | 💰 Économique
- Provider d'animation : Veo (Google) | Grok (xAI)
- Provider LLM : Gemini | Claude | Grok
- Sous-titres : activé/désactivé + position (haut/centre/bas)
- Cohérence personnage : activé/désactivé

**4.4 — Prévisualisation du script (optionnel)**
- Bouton "Générer le script uniquement" → appelle `POST /scripts/generate`
- Affichage du script scène par scène avant génération complète
- Bouton "Modifier" par scène
- Bouton "Approuver et générer la vidéo" → consomme les crédits

**4.5 — Résumé & lancement**
- Récapitulatif des paramètres choisis
- Crédits requis : "Cette vidéo coûtera 1 crédit"
- Solde actuel : "Vous avez 85 crédits"
- Bouton principal "🎬 Générer ma vidéo" (disabled si pas assez de crédits)
- Si crédits insuffisants : message + bouton "Acheter des crédits"

**4.6 — Progression (après soumission)**
- Remplacement du formulaire par une vue de progression
- Barre de progression avec pourcentage
- Étape en cours : "Génération du script… | Création des images… | Assemblage vidéo…"
- Temps restant estimé
- Bouton "Annuler" (disponible seulement si job encore en file)
- Animation / illustration pendant l'attente

---

### Page 5 : Bibliothèque de vidéos

**Route** : `/videos`  
**Objectif** : Gérer toutes ses vidéos générées

#### Sections

**5.1 — En-tête**
- Titre "Mes vidéos"
- Compteur total : "47 vidéos"
- Bouton "Nouvelle vidéo" → `/generate`

**5.2 — Filtres & Recherche**
- Barre de recherche (par sujet/titre)
- Filtres :
  - Statut : Tous | Complétés | En cours | Échoués
  - Genre : dropdown multi-sélection
  - Type : dropdown
  - Période : Ce mois / Les 3 derniers mois / Tout
- Tri : Plus récent | Plus ancien | Durée
- Toggle affichage : Grille | Liste

**5.3 — Grille / Liste de vidéos**

*Mode Grille* :
- Cartes de 3 à 4 par ligne
- Chaque carte :
  - Thumbnail cliquable (avec bouton play au hover)
  - Titre (tronqué)
  - Badge statut coloré
  - Durée
  - Date de création
  - Menu contextuel (3 points) : Télécharger, Supprimer, Régénérer

*Mode Liste* :
- Tableau avec colonnes : Aperçu | Titre | Type | Genre | Durée | Statut | Date | Actions

**5.4 — États vides**
- Si aucune vidéo : illustration + message "Créez votre première vidéo !" + bouton CTA
- Si filtre actif sans résultat : "Aucune vidéo ne correspond à vos filtres"

**5.5 — Pagination**
- Pagination numérotée ou "Charger plus"
- Indication : "Affichage de 1-20 sur 47 vidéos"

---

### Page 6 : Détail d'une vidéo

**Route** : `/videos/:id`  
**Objectif** : Visionner, télécharger et gérer une vidéo

#### Sections

**6.1 — Lecteur vidéo**
- Lecteur grand format (16:9)
- Contrôles : Play/Pause, volume, plein écran, vitesse de lecture
- Timeline avec miniatures des scènes

**6.2 — Informations**
- Titre / Topic
- Statut, durée, date de création
- Type de vidéo, Genre
- Voix utilisée, Provider

**6.3 — Actions**
- Bouton "📥 Télécharger la vidéo" → génère un lien signé S3
- Bouton "🔄 Régénérer" → relance avec les mêmes paramètres
- Bouton "🗑️ Supprimer" → confirmation + suppression

**6.4 — Script & Scènes**
- Accordéon listant chaque scène :
  - Numéro de scène + narration
  - Thumbnail de l'image générée
  - Durée de la scène
  - Layout utilisé
- Bouton "Copier le script" (texte brut)

**6.5 — Métadonnées techniques**
- Coût estimé en USD
- Nombre d'appels API
- Temps de génération
- Providers utilisés (LLM, Image, Animation, TTS)

**6.6 — Partage** (optionnel, plan Professional+)
- Lien de partage public (viewer-only)
- Bouton "Copier le lien"

---

### Page 7 : Pricing

**Route** : `/pricing`  
**Audience** : Visiteurs + utilisateurs connectés

#### Sections

**7.1 — En-tête**
- Titre "Tarifs transparents"
- Toggle Mensuel / Annuel (avec économie -20% annuel)

**7.2 — Cartes des plans**

*Pour chaque plan (Creator / Professional / Business / Enterprise)* :
- Nom du plan + badge "Populaire" sur Professional
- Prix mensuel (ou annuel)
- Description courte (1 ligne)
- Quota : "30 vidéos / mois"
- Liste des fonctionnalités (✅ inclus / ❌ non inclus)
- Bouton : "Commencer" (si non connecté → `/register`) ou "Choisir ce plan" (si connecté → checkout Stripe)
- Plan actuel mis en avant avec badge "Plan actuel"

**7.3 — Tableau de comparaison détaillé**

| Fonctionnalité | Creator | Professional | Business |
|---|---|---|---|
| Vidéos / mois | 30 | 100 | 300 |
| Durée max | 2 min | 5 min | Illimitée |
| Voix ElevenLabs | ❌ | ✅ | ✅ |
| White-label | ❌ | ❌ | ✅ |
| Accès API | ❌ | ❌ | ✅ |
| Support | Email | Prioritaire | Dédié |

**7.4 — FAQ Pricing**
- "Puis-je changer de plan à tout moment ?" → Oui
- "Qu'arrive-t-il à mes vidéos si j'annule ?" → Accès 30 jours
- "Y a-t-il un remboursement ?" → 14 jours satisfait ou remboursé
- "Puis-je avoir une facture ?" → Oui, via le portail de facturation

**7.5 — Contact pour Enterprise**
- Formulaire de contact ou bouton "Contacter l'équipe commerciale"

---

### Page 8 : Profil & Compte

**Route** : `/account`  
**Objectif** : Gérer les informations personnelles

#### Sections

**8.1 — Informations personnelles**
- Photo de profil (upload ou URL)
- Champ nom complet
- Champ email (lecture seule, avec bouton "Modifier")
- Bouton "Enregistrer les modifications"

**8.2 — Sécurité**
- Changer le mot de passe (ancien + nouveau + confirmation)
- Connexions OAuth actives (Google, etc.)
- Sessions actives (avec bouton "Déconnecter toutes les sessions")

**8.3 — Préférences de notification**
- Toggle : "Notifier quand ma vidéo est prête" (email)
- Toggle : "Alertes de crédits faibles" (email)
- Toggle : "Newsletter & nouvelles fonctionnalités" (email)

**8.4 — Danger Zone**
- Bouton "Supprimer mon compte" (rouge, avec confirmation modale)
- Texte explicatif sur les conséquences

---

### Page 9 : Facturation

**Route** : `/billing`  
**Objectif** : Gérer l'abonnement et consulter les factures

#### Sections

**9.1 — Abonnement actuel**
- Plan actuel, prix, renouvellement
- Prochaine date de facturation
- Bouton "Gérer mon abonnement" → portail Stripe
- Bouton "Changer de plan" → `/pricing`
- Bouton "Annuler l'abonnement" (avec confirmation + explication des conséquences)

**9.2 — Utilisation du mois**
- Barre de progression : vidéos utilisées / quota
- Date de réinitialisation des crédits
- Historique d'utilisation (7 derniers jours)

**9.3 — Méthode de paiement**
- Affichage de la carte enregistrée (4 derniers chiffres, expiration)
- Bouton "Modifier la carte" → portail Stripe

**9.4 — Historique des factures**
- Tableau : Date | Montant | Statut | Lien de téléchargement PDF
- Pagination si plus de 10 entrées

---

### Page 10 : Paramètres

**Route** : `/settings`  
**Objectif** : Personnaliser l'expérience

#### Sections

**10.1 — Paramètres par défaut de génération**
- Langue par défaut
- Voix par défaut (provider + voix)
- Durée par défaut
- Type de vidéo par défaut
- Genre par défaut
- Ces valeurs pré-remplissent le générateur à chaque nouvelle vidéo

**10.2 — Clés API personnelles** (plan Business / Enterprise uniquement)
- Affichage de la clé API du compte (masquée, bouton "Révéler")
- Bouton "Régénérer la clé API"
- Lien vers la documentation API
- Log des derniers appels API

**10.3 — Intégrations** (optionnel, phase 2)
- YouTube : connexion OAuth → publication directe
- TikTok : connexion OAuth → publication directe
- Google Drive : export automatique

---

### Page 11 : Aide & Documentation

**Route** : `/help`  
**Objectif** : Réduire les tickets support et onboarder les utilisateurs

#### Sections

**11.1 — Recherche**
- Barre de recherche dans les articles d'aide

**11.2 — Catégories**
- 🚀 Démarrage rapide
- 🎬 Générer des vidéos
- 💰 Facturation & Plans
- 🔧 Paramètres avancés
- 🐛 Problèmes courants

**11.3 — Articles populaires**
- "Comment créer ma première vidéo ?"
- "Quels sont les crédits et comment fonctionnent-ils ?"
- "Comment choisir le bon type de vidéo ?"
- "Puis-je utiliser le produit pour YouTube / TikTok ?"

**11.4 — Contact support**
- Formulaire de contact (avec upload screenshot)
- Lien vers Discord / Slack communautaire (optionnel)
- Email support : support@stickman-generator.com

---

### Page 12 : Administration Panel

**Route** : `/admin` (accès rôle `admin` uniquement)  
**Objectif** : Gérer la plateforme et les utilisateurs

#### Sections

**12.1 — Tableau de bord admin**
- KPIs en temps réel :
  - MRR / ARR
  - Utilisateurs actifs (30j)
  - Vidéos générées ce mois
  - Coûts API totaux
  - Taux de churn
- Graphiques d'évolution (30j, 90j, 12 mois)

**12.2 — Gestion des utilisateurs**
- Tableau de recherche par email / nom
- Filtres : plan, statut, date d'inscription
- Actions par ligne : Voir détail, Modifier crédits, Suspendre, Supprimer

**12.3 — Gestion des jobs**
- File d'attente en temps réel (pending / processing / failed)
- Bouton "Retry" sur les jobs échoués
- Logs d'erreurs par job

**12.4 — Analytiques**
- Vidéos par genre (camembert)
- Vidéos par type (barres)
- Distributions de durée
- Top sujets générés

**12.5 — Configuration système**
- Activer / désactiver des providers (LLM, Image, Animation, TTS)
- Limites de rate-limiting par plan
- Messages de maintenance (banner sitewide)

---

## Modèles de données

### User
```typescript
interface User {
  id: string;             // UUID
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl?: string;
  role: 'user' | 'admin';
  plan: 'creator' | 'professional' | 'business' | 'enterprise' | 'free';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  creditsUsedThisMonth: number;
  creditsLimit: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;       // soft delete
}
```

### Video
```typescript
interface Video {
  id: string;
  userId: string;
  topic: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  jobId?: string;         // BullMQ job ID
  videoUrl?: string;      // S3 URL
  thumbnailUrl?: string;  // S3 URL
  duration?: number;      // en secondes
  genre?: string;
  videoType?: string;
  options: VideoGenerationOptions;
  script?: object;        // CompleteVideoScript
  metadata?: {
    apiCalls: number;
    estimatedCost: number;
    generationTimeMs: number;
  };
  creditsUsed: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Job (BullMQ)
```typescript
interface GenerationJob {
  id: string;
  userId: string;
  videoId: string;
  topic: string;
  options: VideoGenerationOptions;
  progress: number;       // 0-100
  currentStep: string;
  attempts: number;
  createdAt: Date;
}
```

### Subscription
```typescript
interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
}
```

---

## Flux utilisateur clés

### Flux 1 : Nouvel utilisateur → Première vidéo

```
Landing page → Register → Dashboard (welcome) → /generate → 
Formulaire rempli → Script preview (optionnel) → Lancement →
Progression en temps réel → Vidéo prête → Page détail → Téléchargement
```

### Flux 2 : Mise à niveau de plan

```
Dashboard (crédits épuisés) → Banner "Upgrade" → /pricing → 
Sélection plan → Checkout Stripe → Retour /billing?success=true →
Dashboard avec nouveaux crédits
```

### Flux 3 : Suivi de génération (temps réel)

```
POST /videos/generate → jobId reçu → polling GET /videos/jobs/:jobId
toutes les 3s → progress 0→100% → status "completed" → videoId → 
Redirection vers /videos/:videoId
```

---

## Planning d'implémentation

### Phase 1 — MVP Backend (Semaines 1-3)
- [ ] Setup projet Express/Fastify + TypeScript + PostgreSQL
- [ ] Auth (register, login, JWT)
- [ ] `POST /videos/generate` + job BullMQ + worker
- [ ] `GET /videos/jobs/:jobId` (polling status)
- [ ] `GET /videos` + `GET /videos/:id`
- [ ] Upload S3 des vidéos générées
- [ ] `GET /config/*` (types, genres, voices)

### Phase 2 — Paiement (Semaines 4-5)
- [ ] Intégration Stripe (plans, checkout, portail)
- [ ] Webhooks Stripe
- [ ] Système de crédits par plan
- [ ] `GET /billing/*`

### Phase 3 — Frontend MVP (Semaines 4-6)
- [ ] Setup Next.js 14 + Tailwind + shadcn/ui
- [ ] Pages Auth (login, register, forgot/reset password)
- [ ] Dashboard
- [ ] Page Générateur (`/generate`) avec formulaire complet
- [ ] Page Bibliothèque (`/videos`) avec grille
- [ ] Page Détail vidéo (`/videos/:id`) avec lecteur
- [ ] Composant de progression temps réel (polling)

### Phase 4 — Polish & Complétion (Semaines 7-8)
- [ ] Landing page complète
- [ ] Page Pricing
- [ ] Pages Compte / Facturation / Paramètres
- [ ] Page Aide
- [ ] Admin Panel (basique)
- [ ] Tests end-to-end (Playwright)
- [ ] Optimisations SEO et performance

### Phase 5 — Lancement (Semaine 9+)
- [ ] Déploiement staging → production
- [ ] Tests de charge
- [ ] Product Hunt launch
- [ ] Monitoring (Sentry, Datadog ou équivalent)

---

**Document préparé par** : Copilot / Équipe Stickman Generator  
**Date** : Mars 2026  
**Version** : 1.0  
**Statut** : ✅ Prêt pour l'équipe développement
