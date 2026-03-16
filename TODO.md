# TODO — Sketch Pilot API

Analyse complète du projet et liste des tâches restantes.

---

## 1. Tests unitaires (`src/`)

> **Priorité : Haute**

Il n'existe actuellement **aucun fichier `.spec.ts`** dans le répertoire `src/`. La configuration Vitest (`vitest.config.ts`) cible `src/**/*.spec.ts` avec un seuil de couverture de **100 %**, mais la couverture est désactivée :

```ts
// vitest.config.ts
coverage: {
  enabled: false, // TODO: enable coverage once all tests are passing
  thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }
}
```

### Use Cases à couvrir (`src/application/use-cases/`)

#### Prompts
- [ ] `create-prompt.use-case.ts`
- [ ] `delete-prompt.use-case.ts`
- [ ] `get-prompt.use-case.ts`
- [ ] `list-prompts.use-case.ts`
- [ ] `render-prompt.use-case.ts`
- [ ] `update-prompt.use-case.ts`

#### Utilisateurs
- [ ] `check-email-exists.use-case.ts`
- [ ] `create-admin-user.use-case.ts`
- [ ] `delete-user.use-case.ts`
- [ ] `update-user.use-case.ts`

#### Vidéos
- [ ] `choose-background-music.use-case.ts`
- [ ] `choose-voiceover.use-case.ts`
- [ ] `configure-branding.use-case.ts`
- [ ] `configure-captions.use-case.ts`
- [ ] `generate-character-image.use-case.ts`
- [ ] `generate-final-video.use-case.ts`
- [ ] `generate-narration.use-case.ts`
- [ ] `generate-scenes.use-case.ts`
- [ ] `generate-script.use-case.ts`
- [ ] `generate-video.use-case.ts`
- [ ] `regenerate-video.use-case.ts`
- [ ] `render-video.use-case.ts`
- [ ] `reprompt-scene-image.use-case.ts`
- [ ] `suggest-topics.use-case.ts`
- [ ] `update-video.use-case.ts`
- [ ] `validate-script.use-case.ts`

### Services applicatifs à couvrir (`src/application/services/`)
- [ ] `animation.service.ts`
- [ ] `audio.service.ts`
- [ ] `checkpoint-storage.service.ts`
- [ ] `image.service.ts`
- [ ] `llm.service.ts`
- [ ] `prompt.service.ts`
- [ ] `script-generation.service.ts`
- [ ] `simple-checkpoint.service.ts`
- [ ] `stripe-plan.service.ts`
- [ ] `video-checkpoint.service.ts`
- [ ] `video-generation.service.ts`

### Repositories à couvrir (`src/infrastructure/repositories/`)
- [ ] `assets-config.repository.ts`
- [ ] `character-model.repository.ts`
- [ ] `credits.repository.ts`
- [ ] `prompt.repository.ts`
- [ ] `user.repository.ts`
- [ ] `video.repository.ts`

---

## 2. Tests d'intégration

> **Priorité : Haute**

Aucun test d'intégration HTTP n'existe pour les contrôleurs. Chaque route doit être testée end-to-end avec Vitest + Hono test helpers.

### Contrôleurs à couvrir (`src/infrastructure/controllers/`)
- [ ] `auth.controller.ts` — login, register, logout, verify-email, reset-password
- [ ] `character-model.controller.ts` — upload, update, delete, list
- [ ] `config.controller.ts` — voices, music, video-types, genres, plans
- [ ] `credits.controller.ts` — balance, checkout, history, admin adjustment
- [ ] `email-check.controller.ts` — email existence check
- [ ] `prompt.controller.ts` — CRUD + render
- [ ] `scripts.controller.ts` — script generation
- [ ] `user.controller.ts` — session, get user, update character model
- [ ] `video-admin.controller.ts` — stats, jobs queue
- [ ] `videos.controller.ts` — generate, regenerate, render, narrate, assemble, reprompt, voiceover, music, captions, list, get, delete, update

---

## 3. Activer la couverture de tests

> **Priorité : Normale** (une fois les tests écrits)

Une fois les tests en place, activer la couverture dans `vitest.config.ts` :

```ts
coverage: {
  enabled: true, // ← décommenter
  include: ['src/application', 'src/infrastructure'],
  exclude: ['src/domain/**'],
  provider: 'v8',
  thresholds: {
    statements: 100,
    branches: 100,
    functions: 100,
    lines: 100
  }
}
```

---

## 4. CHANGELOG.md

> **Priorité : Normale**

Le fichier `CHANGELOG.md` est vide. Il doit être alimenté avec l'historique des versions selon la convention [Keep a Changelog](https://keepachangelog.com/) :

- [ ] Documenter la version `0.1.2` actuelle (voice/music dynamique, crédits, génération vidéo, etc.)
- [ ] Configurer `changelog.config.ts` pour générer automatiquement le CHANGELOG à chaque release

---

## 5. TODO dans le code

> **Priorité : Normale**

| Fichier | Ligne | Description |
|---|---|---|
| `plugins/sketch-pilot/examples/test-assembly.ts` | 74 | `// TODO: Test AI Mode (requires existing video files)` — implémenter le test en mode IA une fois les fichiers vidéo disponibles |
| `vitest.config.ts` | 13 | `// TODO: enable coverage once all tests are passing` — activer après les tests |

---

## 6. Interfaces de repository manquantes dans le domaine

> **Priorité : Normale**

Seules deux interfaces de repository existent dans `src/domain/repositories/` :
- `user.repository.interface.ts`
- `prompt.repository.interface.ts`

Les repositories suivants sont implémentés dans l'infrastructure **sans interface de domaine** :
- [ ] `AssetsConfigRepository` → créer `assets-config.repository.interface.ts`
- [ ] `CharacterModelRepository` → créer `character-model.repository.interface.ts`
- [ ] `CreditsRepository` → créer `credits.repository.interface.ts`
- [ ] `VideoRepository` → créer `video.repository.interface.ts`

---

## 7. Tests du plugin `sketch-pilot`

> **Priorité : Normale**

Le répertoire `plugins/sketch-pilot/tests/` contient 10 fichiers de test, mais seulement **3 sont de vrais fichiers Vitest** (`.test.ts`) :

| Fichier | Statut |
|---|---|
| `speed-model.test.ts` | ✅ Vitest |
| `timing-mapper.test.ts` | ✅ Vitest |
| `video-script-generator.test.ts` | ✅ Vitest |
| `duration-test.ts` | ⚠️ Script manuel (pas de `describe`/`it`) |
| `enriched-layouts-test.ts` | ⚠️ Script manuel |
| `extract-frames.ts` | ⚠️ Script manuel |
| `test-layer-generation.ts` | ⚠️ Script manuel |
| `test-sharp-text.ts` | ⚠️ Script manuel |
| `test-trim.ts` | ⚠️ Script manuel |
| `verify-pro-features.ts` | ⚠️ Script manuel |

- [ ] Convertir les scripts manuels en tests Vitest formels
- [ ] Implémenter le test AI Mode dans `test-assembly.ts`

---

## 8. Documentation

> **Priorité : Basse**

- [ ] Compléter `documentation/architecture/` pour les nouvelles fonctionnalités (voice/music dynamique, credits, BullMQ worker)
- [ ] Mettre à jour `documentation/admin_api_list.md` si de nouveaux endpoints sont ajoutés
- [ ] Documenter le processus de déploiement dans `deploy.yml`
- [ ] Ajouter une section dans le README sur Stripe webhook local (`bun run stripe:listen`)

---

## 9. Améliorations techniques identifiées

> **Priorité : Basse**

### Repository `assets-config.repository.ts`
- [ ] Corriger la requête `getAllVoices(provider)` : la condition `&&` de Drizzle ORM n'est pas correcte (ligne `eq(voicePresets.isActive, true) && (eq(voicePresets.provider, provider) as any)`) — utiliser `and()` de Drizzle

### Schedulers
- [ ] Le fichier `src/infrastructure/schedulers/index.ts` signale que les schedulers ont été simplifiés. Vérifier si des tâches CRON sont encore nécessaires (ex: nettoyage des fichiers temporaires, purge des jobs échoués Redis)

### Worker BullMQ
- [ ] Ajouter des métriques de monitoring (temps de génération, taux d'erreur) dans `video-generation.worker.ts`
- [ ] Ajouter une politique de Dead Letter Queue pour les jobs échoués de manière répétée

---

## Récapitulatif

| Catégorie | Tâches | Priorité |
|---|---|---|
| Tests unitaires use cases | 26 fichiers | 🔴 Haute |
| Tests unitaires services | 11 fichiers | 🔴 Haute |
| Tests unitaires repositories | 6 fichiers | 🔴 Haute |
| Tests d'intégration contrôleurs | 10 contrôleurs | 🔴 Haute |
| Activer couverture de tests | 1 tâche | 🟡 Normale |
| CHANGELOG.md | 2 tâches | 🟡 Normale |
| TODO dans le code | 2 tâches | 🟡 Normale |
| Interfaces domaine manquantes | 4 interfaces | 🟡 Normale |
| Tests plugin sketch-pilot | 7 fichiers | 🟡 Normale |
| Documentation | 4 tâches | 🟢 Basse |
| Améliorations techniques | 5 tâches | 🟢 Basse |
