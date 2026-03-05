# Analyse MVP — Moteur de Génération Vidéo

**Date** : Février 2026  
**Version** : 1.0  
**Périmètre** : Moteur de génération uniquement (sans UI ni API REST)

---

## 📋 Table des matières

1. [Résumé Exécutif](#résumé-exécutif)
2. [Périmètre du MVP](#périmètre-du-mvp)
3. [Architecture Technique](#architecture-technique)
4. [Fonctionnalités Implémentées](#fonctionnalités-implémentées)
5. [Fonctionnalités Manquantes (Hors Périmètre MVP)](#fonctionnalités-manquantes-hors-périmètre-mvp)
6. [Flux de Génération Complet](#flux-de-génération-complet)
7. [Capacités Actuelles du Moteur](#capacités-actuelles-du-moteur)
8. [Dépendances Externes](#dépendances-externes)
9. [Coûts API Estimés](#coûts-api-estimés)
10. [Limitations Connues](#limitations-connues)
11. [Guide d'Utilisation Rapide](#guide-dutilisation-rapide)
12. [Prochaines Étapes vers le Produit Complet](#prochaines-étapes-vers-le-produit-complet)
13. [Conclusion](#conclusion)

---

## 🎯 Résumé Exécutif

### Statut MVP

✅ **Le moteur de génération vidéo est prêt pour un MVP.**

Le cœur du produit — la pipeline de génération automatique de vidéos stickman — est **pleinement fonctionnel** en ligne de commande. Il est possible de générer une vidéo complète (script + images + audio + animation + assemblage final) à partir d'un simple sujet en texte, sans intervention humaine.

### Ce qui est prêt

| Composant | Statut | Détail |
|-----------|--------|--------|
| Génération de script | ✅ Prêt | LLM Gemini / Grok |
| Génération d'images | ✅ Prêt | Gemini / Grok |
| Synthèse vocale | ✅ Prêt | Demo TTS / Google TTS / ElevenLabs |
| Animation IA | ✅ Prêt | Veo 3.1 / Grok |
| Assemblage vidéo | ✅ Prêt | FFmpeg (panning, transitions, overlays) |
| Export | ✅ Prêt | JSON + Markdown + MP4 |

### Ce qui n'est PAS inclus dans ce MVP

- ❌ Interface utilisateur (UI web)
- ❌ API REST exposée
- ❌ Authentification utilisateur
- ❌ Stockage cloud (S3, GCS)
- ❌ Base de données
- ❌ Facturation / Stripe
- ❌ Gestion multi-tenant

---

## 📐 Périmètre du MVP

Le MVP se limite au **moteur de génération** (`src/`). Il est utilisable directement via TypeScript ou via les scripts `npm run`.

```
┌─────────────────────────────────────────────────────────┐
│                    MVP ENGINE (src/)                    │
│                                                         │
│  Input: topic (string) + options                        │
│                    │                                    │
│                    ▼                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │              NanoBananaEngine                    │  │
│  │                                                  │  │
│  │  VideoScriptGenerator  →  Script JSON/MD         │  │
│  │  PromptGenerator       →  Prompts visuels        │  │
│  │  ImageService          →  Images PNG             │  │
│  │  AudioService          →  Narration MP3          │  │
│  │  AnimationService      →  Clips MP4              │  │
│  │  VideoAssembler        →  Vidéo finale MP4       │  │
│  └──────────────────────────────────────────────────┘  │
│                    │                                    │
│                    ▼                                    │
│  Output: dossier output/{video-id}/                     │
│    ├─ final_video.mp4                                   │
│    ├─ script.json                                       │
│    ├─ script.md                                         │
│    └─ scenes/{scene_id}/                               │
│         ├─ scene.png                                    │
│         ├─ narration.mp3                               │
│         ├─ animation.mp4                               │
│         └─ manifest.json                               │
└─────────────────────────────────────────────────────────┘

   ╔═══════════════════╗      ╔═══════════════════════╗
   ║ HORS PÉRIMÈTRE    ║      ║ HORS PÉRIMÈTRE        ║
   ║   UI / Frontend   ║      ║   API REST / Backend  ║
   ╚═══════════════════╝      ╚═══════════════════════╝
```

---

## 🏗️ Architecture Technique

### Stack

| Couche | Technologie |
|--------|-------------|
| Langage | TypeScript 5.3 / Node.js |
| Validation | Zod |
| Traitement image | Sharp |
| Traitement vidéo | FFmpeg (fluent-ffmpeg) |
| LLM | Google Gemini / xAI Grok |
| Image IA | Google Gemini Imagen / xAI Grok |
| Animation IA | Google Veo 3.1 / xAI Grok |
| TTS | Google TTS / ElevenLabs / Demo |

### Pattern Architectural

Le moteur utilise le **Factory Pattern** pour abstraire chaque type de service. Il est ainsi possible de changer de provider (Gemini → Grok, Google TTS → ElevenLabs) via configuration, sans modifier le code métier.

```
src/
├── core/
│   ├── nano-banana-engine.ts      # Orchestrateur principal
│   ├── video-script-generator.ts  # Génération de script LLM
│   ├── prompt-generator.ts        # Génération de prompts visuels
│   └── layout-catalog.ts          # Catalogue de 47 layouts visuels
├── services/
│   ├── llm/                       # Gemini LLM | Grok LLM
│   ├── image/                     # Gemini Image | Grok Image
│   ├── animation/                 # Veo 3.1 | Grok Animation
│   ├── audio/                     # Demo TTS | Google TTS | ElevenLabs
│   └── video/                     # VideoAssembler (FFmpeg)
├── types/
│   └── video-script.types.ts      # Schémas Zod partagés
└── utils/
    └── task-queue.ts              # File d'attente interne (concurrence 1)
```

---

## ✅ Fonctionnalités Implémentées

### 1. Génération de Script (LLM)

- Génération d'un script structuré JSON à partir d'un sujet libre
- Contrôle précis : durée, nombre de scènes, style narratif
- 9 **types de vidéo** : `tutorial`, `story`, `listicle`, `news`, `animation`, `review`, `motivational`, `entertainment`, `faceless`
- 16 **genres / niches** : `educational`, `tech`, `business`, `finance`, `health`, `travel`, `food`, `gaming`, `sports`, `science`, `history`, `self-improvement`, `mystery`, `lifestyle`, `fun`, `general`
- Arc narratif automatique : hook → contexte → exploration → insight → résolution → closing
- Sélection automatique de layout par scène (parmi 47 layouts)
- Choix du provider LLM : `gemini` ou `grok`

### 2. Catalogue de Layouts Visuels

47 compositions visuelles prédéfinies couvrant :
- Scènes personnage seul (`character-center-bottom-text`, `full-frame-action`)
- Scènes dual-personnage (`dual-character-split`, `dual-character-dialogue`)
- Scènes texte seul (`text-only-center`, `text-columns-multi`)
- Scènes avec props (`character-with-scene-prop`, `character-at-desk-workstation`)
- Visualisations de données (`data-viz-comparison`, `circular-process-cycle`)
- Bandes dessinées (`three-panel-comic-strip`)
- Roadmaps (`roadmap-winding-path`, `character-besides-signpost`)
- Et bien d'autres…

### 3. Génération d'Images

- Génération automatique d'une image par scène via prompt paragraphe
- Cohérence du personnage entre scènes (images de référence)
- 7 **variantes de personnage** : `standard`, `globe-head`, `professor`, `farmer`, `robot`, `baby`, `investor`
- Support du ratio d'aspect : `16:9`, `9:16`, `1:1`
- Choix du provider : `gemini` ou `grok`

### 4. Synthèse Vocale (TTS)

| Provider | Statut | Qualité |
|----------|--------|---------|
| `demo` (Google Translate) | ✅ Gratuit | Basique |
| `google-tts` (Cloud TTS) | ✅ Implémenté | Élevée |
| `elevenlabs` | ✅ Implémenté | Très élevée |
| `openai-tts` | ⚠️ Non implémenté | — |

- Génération de narration MP3 par scène
- Word timings disponibles (Google TTS / ElevenLabs) pour synchronisation future

### 5. Animation

| Mode | Description |
|------|-------------|
| `ai` | Génération IA via Veo 3.1 ou Grok (clip loopé) |
| `panning` | Effet Ken Burns (zoom/pan) sur image statique |
| `composition` | Animation par couches d'entrée |
| `static` | Image fixe sans effet |
| `none` | Pas d'assemblage vidéo |

- Support des actions caméra : `zoom-in`, `zoom-out`, `pan-left`, `pan-right`, `shake`, `static`
- 11 types de transitions entre scènes : `cut`, `fade`, `slide-left`, `slide-right`, `slide-up`, `slide-down`, `wipe`, `zoom-in`, `pop`, `swish`, `none`

### 6. Assemblage Vidéo (FFmpeg)

- Assemblage des clips de scènes en vidéo finale MP4
- Application des transitions visuelles entre scènes
- **Text overlays** (sous-titres/captions) : 7 positions supportées (`top`, `center`, `bottom`, `top-left`, `top-right`, `bottom-left`, `bottom-right`)
- 6 styles de sous-titres : `classic`, `remotion`, `karaoke`, `minimal`, `sentence`, `vibrant`
- Mixage audio (narration + musique de fond + effets sonores)
- Support de 10 effets sonores : `swish`, `pop`, `scratch`, `click`, `whoosh`, `ding`, `jump`, `thud`, `sparkle`, `tick`

### 7. Export et Reporting

- Export `script.json` — Script structuré complet
- Export `script.md` — Rapport de production lisible (breakdowns techniques + prompts)
- Export `metadata.json` — Stats (appels API, coût estimé, temps de génération)
- Mode `scriptOnly` — Génère uniquement le script sans assets (rapide et économique)

---

## ❌ Fonctionnalités Manquantes (Hors Périmètre MVP)

Ces fonctionnalités sont nécessaires pour un **produit complet** mais délibérément exclues du MVP moteur :

### Couche Produit

| Fonctionnalité | Raison d'exclusion |
|----------------|-------------------|
| Interface web (UI) | Hors périmètre moteur |
| API REST (endpoints HTTP) | Hors périmètre moteur |
| Authentification / JWT / OAuth | Hors périmètre moteur |
| Gestion de compte utilisateur | Hors périmètre moteur |
| Dashboard utilisateur | Hors périmètre moteur |

### Infrastructure

| Fonctionnalité | Raison d'exclusion |
|----------------|-------------------|
| Stockage cloud (S3, GCS) | Actuellement fichiers locaux uniquement |
| Base de données (projets, historique) | Non implémentée |
| File d'attente distribuée (Bull, SQS) | Queue interne simple (max 1 concurrent) |
| Déploiement / containerisation | Aucun Dockerfile fourni |

### Fonctionnalités Produit Avancées

| Fonctionnalité | Raison d'exclusion |
|----------------|-------------------|
| Gestion de personnages personnalisés | Pas d'interface d'upload |
| Bibliothèque de musique étendue | Service musique basique |
| Prévisualisation temps réel | Nécessite une UI |
| Collaboration équipe | Nécessite une couche multi-tenant |
| Webhooks / notifications | Nécessite une API |
| Facturation / Stripe | Hors périmètre moteur |
| `openai-tts` | Non implémenté |

---

## 🔄 Flux de Génération Complet

```
                    ENTRÉE
                 topic (string)
                 options (JSON)
                      │
                      ▼
        ┌─────────────────────────────┐
        │    VideoScriptGenerator     │
        │                             │
        │  1. generateVideoStructure  │ ← LLM (Gemini/Grok)
        │     → Scènes + layouts      │
        │                             │
        │  2. enrichScenes            │ ← PromptGenerator
        │     → imagePrompt           │   + LayoutCatalog
        │     → animationPrompt       │
        └─────────────────────────────┘
                      │
                      ▼
              CompleteVideoScript
                      │
          ┌───────────┴──────────────┐
          │   Pour chaque scène :    │
          │                          │
          │  a. generateAsset        │ ← ImageService
          │     → scene.png          │   (Gemini/Grok)
          │                          │
          │  b. generateSpeech       │ ← AudioService
          │     → narration.mp3      │   (Demo/Google/ElevenLabs)
          │                          │
          │  c. animateImage         │ ← AnimationService
          │     → animation.mp4      │   (Veo/Grok) [mode ai]
          │                          │
          │  d. writeManifest        │
          │     → manifest.json      │
          └──────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │       VideoAssembler        │
        │                             │
        │  - Clips par scène          │ ← FFmpeg
        │  - Transitions              │
        │  - Text overlays            │
        │  - Mixage audio             │
        │  → final_video.mp4          │
        └─────────────────────────────┘
                      │
                      ▼
                   SORTIE
            output/{video-id}/
```

---

## 🎬 Capacités Actuelles du Moteur

### Ce que le moteur peut générer aujourd'hui

- ✅ Vidéos de **30 à 300 secondes** (configurable)
- ✅ De **1 à 10 scènes** par vidéo
- ✅ **3 ratios d'aspect** : 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 (Instagram)
- ✅ **4 styles narratifs** : `motivational`, `educational`, `storytelling`, `tutorial`
- ✅ **9 types × 16 genres** = 144 combinaisons thématiques possibles
- ✅ **47 layouts** visuels différents par scène
- ✅ Cohérence du personnage via images de référence
- ✅ Sous-titres automatiques sur 7 positions

### Exemples de combinaisons possibles

| Sujet | Type | Genre | Durée | Scènes |
|-------|------|-------|-------|--------|
| "Comment apprendre Python en 30 jours" | `tutorial` | `tech` | 60s | 6 |
| "Top 5 habitudes des millionnaires" | `listicle` | `finance` | 59s | 5 |
| "L'affaire Jack the Ripper" | `story` | `mystery` | 90s | 8 |
| "Boostez votre énergie le matin" | `motivational` | `health` | 45s | 5 |
| "Les dernières actus IA" | `news` | `tech` | 30s | 4 |

---

## 🔗 Dépendances Externes

### APIs tierces requises

| Service | Usage | Variable d'environnement | Obligatoire |
|---------|-------|--------------------------|-------------|
| Google Gemini | LLM + Images | `GOOGLE_API_KEY` | ✅ Oui |
| Google Veo 3.1 | Animation IA | `GOOGLE_API_KEY` | ⚠️ Mode `ai` seulement |
| xAI Grok | LLM / Images / Animation (alternative) | `XAI_API_KEY` | ❌ Non |
| Google Cloud TTS | Synthèse vocale haute qualité | `GOOGLE_TTS_API_KEY` | ❌ Non |
| ElevenLabs | Synthèse vocale premium | `ELEVENLABS_API_KEY` | ❌ Non |

### Dépendances système

| Outil | Usage | Installation |
|-------|-------|-------------|
| **FFmpeg** | Assemblage vidéo | Requis sur le système hôte |
| **Node.js 20+** | Runtime | Requis |
| **npm** | Gestion dépendances | Requis |

### Configuration minimale

Pour démarrer avec le moteur (mode panning, sans animation IA) :

```bash
# .env
GOOGLE_API_KEY=your_gemini_api_key
```

---

## 💰 Coûts API Estimés

### Par vidéo générée

| Mode | Appels API | Coût estimé |
|------|-----------|-------------|
| Script seul (`scriptOnly: true`) | 1–2 | ~$0.0002 |
| Panning (6 scènes, images Gemini) | ~14 | ~$0.24 |
| AI Animation (6 scènes, Veo) | ~14 + 6 Veo | ~$0.54 |
| Vidéo 5min (30 scènes, panning) | ~51 | ~$0.41 |

### Détail du coût par composant (vidéo 60s, 6 scènes)

| Composant | Coût unitaire | Quantité | Total |
|-----------|---------------|----------|-------|
| Script LLM (Gemini Flash) | $0.0002 | 1 | $0.0002 |
| Enrichissement scènes | $0.0002 | 6 | $0.0012 |
| Images (Gemini Pro Image) | $0.02 | 6 | $0.12 |
| TTS Demo | $0.00 | 6 | $0.00 |
| Animation Veo (mode ai) | $0.05 | 6 | $0.30 |
| **Total mode panning** | | | **~$0.12** |
| **Total mode AI** | | | **~$0.42** |

---

## ⚠️ Limitations Connues

### Performances

| Limitation | Impact | Priorité de correction |
|------------|--------|----------------------|
| **File d'attente séquentielle** (max 1 concurrent) | Génération lente pour plusieurs vidéos en parallèle | Haute |
| **Stockage fichiers locaux** uniquement | Pas scalable en production | Haute |
| **Pas de retry** sur erreur pipeline complète | Perte de travail si erreur tardive | Moyenne |

### Fonctionnelles

| Limitation | Impact | Priorité de correction |
|------------|--------|----------------------|
| **`openai-tts` non implémenté** | Provider TTS manquant | Faible |
| **Pas de streaming** vidéo | L'utilisateur attend la fin complète | Moyenne |
| **Pas de preview** de script avant génération assets | Difficile à intégrer sans UI | Faible (besoin UI) |
| **Personnages hardcodés** (7 variantes) | Pas de personnage personnalisé uploadé | Moyenne |
| **Musique de fond basique** | `MusicService` non connecté à une vraie bibliothèque | Faible |

### Qualité

| Limitation | Impact |
|------------|--------|
| Cohérence visuelle dépend de la qualité du provider image | Variable selon Gemini/Grok |
| Synchronisation lèvres / audio non gérée | Normal pour stickman |
| Résolution vidéo fixe à celle du provider image | Non configurable |

---

## 🚀 Guide d'Utilisation Rapide

### Prérequis

```bash
# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env : ajouter GOOGLE_API_KEY
```

### Usage TypeScript direct

```typescript
import { NanoBananaEngine } from './src/core/nano-banana-engine';
import { AudioServiceConfig, AnimationServiceConfig } from './src';

const engine = new NanoBananaEngine(
    process.env.GOOGLE_API_KEY!,
    '',        // styleSuffix (optionnel)
    '',        // systemPrompt personnalisé (optionnel)
    { provider: 'demo', lang: 'en' },          // AudioConfig
    { provider: 'veo', apiKey: process.env.GOOGLE_API_KEY }  // AnimationConfig
);

// Option A : Script uniquement (rapide, ~$0.0002)
const script = await engine.generateStructuredScript(
    "5 habitudes matinales des entrepreneurs",
    { duration: 59, sceneCount: 6, style: 'motivational', scriptOnly: true }
);
await engine.exportVideoPackage(script, './output/mon-script');

// Option B : Vidéo complète (mode panning, ~$0.12)
const video = await engine.generateVideoFromTopic(
    "5 habitudes matinales des entrepreneurs",
    {
        duration: 59,
        sceneCount: 6,
        style: 'motivational',
        videoType: 'listicle',
        videoGenre: 'self-improvement',
        animationMode: 'panning',
        aspectRatio: '9:16',
        textOverlay: { enabled: true, position: 'bottom', style: 'classic' }
    }
);
console.log(`Vidéo générée : ${video.outputPath}/final_video.mp4`);
```

### Via npm scripts

```bash
# Démo de génération vidéo complète
npm run demo:video

# Démo types et genres de vidéos
npm run demo:types

# Démo text overlays
npm run demo:text

# Test des services audio
npm run test:audio
```

---

## 🗺️ Prochaines Étapes vers le Produit Complet

Pour passer du moteur MVP à un produit SaaS complet, voici les étapes par priorité :

### Phase 1 — Infrastructure (Semaines 1-4)

- [ ] **Stockage cloud** : Upload des assets vers S3/GCS au lieu du système de fichiers local
- [ ] **Queue distribuée** : Bull (Redis) pour traitement asynchrone multi-tenant
- [ ] **Base de données** : PostgreSQL pour projets, utilisateurs, historique
- [ ] **Containerisation** : Dockerfile + docker-compose pour déploiement reproductible

### Phase 2 — API REST (Semaines 3-6)

- [ ] **Endpoints POST /videos** : Lancer une génération
- [ ] **Endpoints GET /videos/{id}** : Récupérer statut et résultat
- [ ] **Webhooks** : Notification de fin de génération
- [ ] **Authentification** : JWT / API Keys
- [ ] **Rate limiting** : Contrôle d'utilisation par plan

### Phase 3 — Interface Utilisateur (Semaines 5-10)

- [ ] **Dashboard** : Liste des vidéos générées
- [ ] **Formulaire de création** : Topic, type, genre, options
- [ ] **Preview de script** : Validation avant génération assets
- [ ] **Lecteur vidéo** : Preview de la vidéo finale
- [ ] **Gestion de compte** : Profil, quota, facturation

### Phase 4 — Produit (Semaines 8-16)

- [ ] **Upload personnage** : Images de référence uploadées par l'utilisateur
- [ ] **Bibliothèque musique** : Intégration avec une bibliothèque libre de droits
- [ ] **Templates** : Combinaisons type/genre pré-configurées
- [ ] **Facturation Stripe** : Plans Creator / Professional / Business
- [ ] **White-label** : Branding personnalisé pour plans Business

---

## ✅ Conclusion

### Le moteur est MVP-ready

Le moteur de génération vidéo couvre l'**ensemble de la pipeline** nécessaire à un MVP fonctionnel :

```
Topic (texte) → Script structuré → Images → Audio → Animation → Vidéo finale
```

Il est **utilisable aujourd'hui** via TypeScript ou CLI, avec :
- 2 providers LLM interchangeables
- 2 providers image interchangeables
- 2 providers animation interchangeables
- 3 providers audio (dont 2 qualité production)
- 5 modes d'animation
- 47 layouts visuels
- 144 combinaisons type/genre
- Assemblage vidéo final avec FFmpeg

### Ce qui reste à construire

La **couche produit** (UI, API REST, authentification, stockage cloud, facturation) n'est pas incluse et représente environ **8 à 16 semaines de développement** supplémentaires pour atteindre un SaaS complet.

### Recommandation

> Le moteur peut être exposé immédiatement à des **beta testeurs techniques** via CLI ou intégration TypeScript directe. Cela permet de valider la qualité des vidéos générées et le product-market fit **avant** d'investir dans la couche produit.

---

**Document préparé par** : Équipe Stickman Generator  
**Date** : Février 2026  
**Version** : 1.0  
**Classification** : Interne — Technique
