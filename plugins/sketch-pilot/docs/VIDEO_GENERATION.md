# Générateur de Scripts Vidéo - Guide d'Utilisation

## 🎯 Vue d'ensemble

Le système `NanoBananaEngine` génère automatiquement des scripts vidéo complets avec :
- ✅ **Scènes structurées** (timing, narration, actions)
- ✅ **Prompts d'images** au format paragraphe
- ✅ **Instructions d'animation** pour chaque mouvement
- ✅ **Assets visuels** (personnages stickman + props)

## 🚀 Utilisation Rapide

### Option A: Générer uniquement le script (rapide et économique)

```typescript
import { NanoBananaEngine } from './models/nano-banana-engine';

const engine = new NanoBananaEngine(apiKey, styleSuffix, systemPrompt);

const script = await engine.generateStructuredScript(
  "The Power of Starting Small",
  { duration: 59, sceneCount: 6, style: 'motivational' }
);

await engine.exportVideoPackage(script, './output/my-video');
```

**Résultat** :
- `script.json` - Script structuré en JSON
- `script.md` - Format lisible (PART 1, 2, 3)

**Coût estimé** : ~$0.0002 (1 appel Gemini Flash)

---

### Option B: Générer le package vidéo complet avec assets

```typescript
const videoPackage = await engine.generateVideoFromTopic(
  "The Power of Starting Small",
  { 
    duration: 59, 
    sceneCount: 6, 
    style: 'motivational',
    characterConsistency: true 
  },
  baseImages // Images de référence pour le personnage
);

console.log(`Projet créé : ${videoPackage.projectId}`);
console.log(`Dossier : ${videoPackage.outputPath}`);
```

**Résultat** :
```
output/video-{timestamp}/
├── script.json
├── script.md
├── metadata.json
└── scenes/
    ├── scene_1/
    │   ├── manifest.json
    │   ├── animation.json
    │   ├── characters/
    │   │   └── character_0.png
    │   └── props/
    │       └── prop_0.png
    ├── scene_2/
    └── ...
```

**Coût estimé** : ~$0.20-0.30 (script + layouts + 10-15 images)

---

## 🎬 Démo

Exécutez la démo complète :

```bash
npm run demo:video
```

La démo génère :
1. Un script structuré pour "The Power of Starting Small"
2. Export au format Markdown (PART 1, 2, 3)
3. Aperçu des premières scènes

---

## 📋 Format de Sortie

### PART 1: VIDEO SCRIPT
```markdown
### Scene 1 (0:00 - 0:10)
The stickman sits at a desk, staring at a blank laptop screen...
```

### PART 2: IMAGE PROMPTS
```markdown
### Scene 1 - Image Prompt
Use the same stickman character as before. He is sitting on a simple 
chair at a desk with a laptop in front of him. His body is slightly 
hunched forward with slumped shoulders showing worry...
```

### PART 3: VIDEO/MOTION PROMPTS
```markdown
### Scene 1 - Animation
Move stickman's hand slowly from trackpad to chin in thinking motion. 
Body stays static...
```

---

## ⚙️ Options de Configuration

```typescript
interface VideoGenerationOptions {
  duration: number;        // Durée totale (défaut: 59s)
  sceneCount: number;      // Nombre de scènes (défaut: 6)
  style: 'motivational' | 'educational' | 'storytelling' | 'tutorial';
  characterConsistency: boolean; // Cohérence du personnage
}
```

---

## 📊 Coûts API

| Action | Appels API | Coût estimé |
|--------|-----------|-------------|
| Script seul | 1 (Flash) | ~$0.0002 |
| Script + 6 layouts | 7 (Flash) | ~$0.0014 |
| Vidéo 59s (6 scènes, ~12 images) | ~19 (Flash + Pro Image) | ~$0.24 |
| Vidéo 5min (30 scènes, ~20 images optimisé) | ~51 (Flash + Pro Image) | ~$0.41 |

---

## 🔧 Architecture

```
VideoScriptGenerator
  ├─ generateCompleteScript()  → Script structuré
  └─ exportToMarkdown()         → Format PART 1/2/3

PromptGenerator
  ├─ generateImagePrompt()      → "Use the same stickman..."
  └─ generateAnimationPrompt()  → Instructions de mouvement

NanoBananaEngine
  ├─ generateStructuredScript() → Script seul (rapide)
  ├─ generateVideoFromTopic()   → Workflow complet
  └─ composeScene()              → Génération d'assets
```

---

## 💡 Cas d'Usage

### Validation avant génération
1. Générer le script uniquement
2. Reviewer le contenu
3. Si OK → Générer les assets

### Production batch
```typescript
const topics = [
  "Morning Productivity Routine",
  "5 Steps to Learn Anything",
  "The Compound Effect"
];

for (const topic of topics) {
  await engine.generateVideoFromTopic(topic, options, baseImages);
}
```

---

## 🐛 Dépannage

**Erreur : "Missing API key"**
→ Vérifiez que `GOOGLE_API_KEY` est défini dans `.env`

**Caractère identique entre scènes**
→ Assurez-vous de passer les `baseImages` de référence

**Coûts élevés**
→ Utilisez `generateStructuredScript()` pour validation avant génération complète

---

## 📚 Ressources

- **Exemples** : `/examples/video-generation-demo.ts`
- **Schemas** : `/models/video-script-schemas.ts`
- **Engine** : `/models/nano-banana-engine.ts`

---

**Créé par** : NanoBananaEngine v1.0  
**Licence** : ISC
