import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type {
  CharacterState,
  ContinuityReport,
  CrossLayerValidation,
  FinalAuditResult,
  MidpointAuditResult,
  PlotContract,
  SceneMemory,
  SceneValidation,
  VimaxScene
} from '../types'

/**
 * ContinuityAuditor (Script Supervisor)
 * Relit l'ensemble des scènes d'un épisode pour détecter les contradictions.
 */
export class VimaxContinuityAuditor extends VimaxBaseAgent {
  private getSystem(): string {
    return `
Tu es un Auditor de Continuité (Script Supervisor) pour une série d'animation.
Ta mission est de relire l'ensemble des scènes d'un épisode pour détecter toute faille de cohérence.

[CRITÈRES D'AUDIT]
1. CONTRADICTIONS PHYSIQUES : Un personnage ne peut pas être mort/blessé puis parfaitement sain sans explication. Les objets ne peuvent pas changer de couleur ou de forme sans raison.
2. RÉSOLUTIONS MANQUANTES : Si un objet ou un mystère est introduit (ex: "la clé USB rouge"), il doit être soit résolu, soit mentionné comme restant en suspens.
3. RUPTURES DE TON : Un épisode doit garder une cohérence émotionnelle. Une scène de comédie pure au milieu d'un drame psychologique intense sans justification est une rupture de ton.
4. COHÉRENCE SPATIALE : Si l'action se déplace, le trajet doit être logique.

[FORMAT DE RÉPONSE]
Renvoie UNIQUEMENT du JSON valide :
{
  "contradictions": ["description..."],
  "missingResolutions": ["description..."],
  "toneBreaks": ["description..."],
  "approved": boolean
}
`.trim()
  }

  async audit(scenes: VimaxScene[]): Promise<ContinuityReport> {
    const scenesSummary = scenes
      .map((s) => `[SCÈNE ${s.sceneNumber}]\nNarration: ${s.narration}\nVisual: ${s.imagePrompt}`)
      .join('\n\n')

    const prompt = `
Voici les scènes de l'épisode :

${scenesSummary}

Réalise un audit complet de continuité.
`.trim()

    const result = await this.generateStructured<ContinuityReport>(prompt, this.getSystem(), {
      contradictions: [],
      missingResolutions: [],
      toneBreaks: [],
      approved: true
    })

    return result.data
  }

  /**
   * Point 1 : Validation et Correction immédiate après chaque scène.
   */
  async validateAndCorrect(
    narration: string,
    sceneMemories: SceneMemory[],
    characterStates: CharacterState[]
  ): Promise<SceneValidation> {
    const memory =
      sceneMemories.length > 0
        ? `[MÉMOIRE NARRATIVE RÉCENTE]\n${sceneMemories
            .slice(-3)
            .map((m) => `- ${m.summary}`)
            .join('\n')}`
        : "[PREMIÈRE SCÈNE DE L'ÉPISODE]"

    const charContext = characterStates
      .map((c) => `- ${c.identifier} : ${c.physicalState} (${c.emotionalState})`)
      .join('\n')

    const prompt = `
Tu es un Script Supervisor. Valide cette nouvelle narration contre la mémoire de l'épisode pour éviter les contradictions locales.

${memory}

[ÉTAT PHYSIQUE ACTUEL DES PERSONNAGES]
${charContext}

<NOUVELLE_NARRATION_A_VALIDER>
${narration}
</NOUVELLE_NARRATION_A_VALIDER>

CHERCHE : 
1. Répétition d'une action déjà faite (ex: @Banane ouvre la porte alors qu'elle est déjà ouverte).
2. Résurrection miraculeuse (ex: @Banane parle alors qu'il est mort ou évanoui).
3. Téléportation (ex: @Banane est à la cave alors qu'il était au grenier sans transition).

Si invalide, propose une "correctedNarration" qui résout le problème tout en gardant le même punch.
Renvoie du JSON : { "isValid": boolean, "issues": string[], "correctedNarration": string | null }
`.trim()

    const result = await this.generateStructured<SceneValidation>(prompt, this.getSystem(), {
      isValid: true,
      issues: []
    })

    return result.data
  }

  /**
   * Point 2 : Audit de mi-parcours pour vérifier la trajectoire globale.
   */
  async midpointAudit(
    scenesGenerated: VimaxScene[],
    tensionCurve: number[],
    plotContracts: PlotContract[]
  ): Promise<MidpointAuditResult> {
    const summary = scenesGenerated.map((s) => `Scène ${s.sceneNumber} : ${s.narration}`).join('\n')
    const prompt = `
AUDIT DE MI-PARCOURS. Analyse si l'épisode respecte la trajectoire prévue.

[SCÈNES DÉJÀ GÉNÉRÉES]
${summary}

[COURBE DE TENSION PRÉVUE]
${tensionCurve.join(' -> ')}

CONSIGNE :
- Si la tension s'est effondrée, liste les scènes à régénérer.
- Si l'intent (ton) a dérivé, signale-le.
- Liste les indices (1-indexed) des scènes qui nuisent à la cohérence globale.

Renvoie du JSON : { "scenesToRegenerate": number[], "globalIssues": string[] }
`.trim()

    const result = await this.generateStructured<MidpointAuditResult>(prompt, this.getSystem(), {
      scenesToRegenerate: [],
      globalIssues: []
    })

    return result.data
  }

  /**
   * Point 3 : Audit final avec système de Patch ciblé.
   */
  async finalAuditEnhanced(scenes: VimaxScene[]): Promise<FinalAuditResult> {
    const summary = scenes.map((s) => `[SCÈNE ${s.sceneNumber}]\n${s.narration}`).join('\n')
    const prompt = `
AUDIT FINAL & PATCHING. Relis tout l'épisode.
Si des contradictions mineures subsistent, propose des PATCHS (modifications de narration partielles) pour corriger sans tout régénérer.

[ÉPISODE COMPLET]
${summary}

L'objectif est d'avoir un "approved": true. Si tu proposes des patchs, explique pourquoi dans "contradictions".
Renvoie du JSON : { 
  "approved": boolean, 
  "contradictions": string[], 
  "scenesToPatch": [{ "sceneIndex": number, "patch": { "narration": "nouvelle narration corrigée" } }] 
}
`.trim()

    const result = await this.generateStructured<FinalAuditResult>(prompt, this.getSystem(), {
      approved: true,
      contradictions: [],
      scenesToPatch: []
    })

    return result.data
  }

  /**
   * CrossLayerValidator : Analyse la cohérence entre toutes les couches d'une scène.
   * LA NARRATION EST LA SOURCE DE VÉRITÉ.
   */
  async crossLayerAudit(
    narration: string,
    imagePrompt: string,
    cameraAction: any,
    dialogue: any[],
    animationPrompt: string
  ): Promise<CrossLayerValidation> {
    const prompt = `
Tu es un Script Supervisor. Analyse la cohérence inter-couches de cette scène.
LA NARRATION EST LA SOURCE DE VÉRITÉ ABSOLUE. Toutes les autres couches doivent s'y conformer méticuleusement.

<NARRATION_VERROUILLÉE>
${narration}
</NARRATION_VERROUILLÉE>

[COUCHES À VÉRIFIER]
- Image Prompt : ${imagePrompt}
- Camera Action : ${JSON.stringify(cameraAction)}
- Dialogue : ${JSON.stringify(dialogue)}
- Animation : ${animationPrompt}

CHERCHE :
1. Narration vs Image : @Banane est projeté (narration) mais l'image le montre debout ou calme.
2. Narration vs Camera : Action intense narrée mais caméra fixe lente/standard.
3. Narration vs Dialogue : Personnage évanoui/baillonné/mort qui parle.
4. Narration vs Animation : Membre cassé ou entrave physique (bras cassé, menottes) ignorée par le mouvement.

Si une couche contredit la narration, propose un PATCH (une version corrigée de la couche concernée).
Renvoie du JSON : { 
  "narrationVsImage": boolean, 
  "narrationVsCamera": boolean, 
  "narrationVsDialogue": boolean, 
  "narrationVsAnimation": boolean, 
  "issues": string[], 
  "patches": { "imagePrompt": "...", "cameraAction": {}, "dialogue": [], "animationPrompt": "..." } 
}
`.trim()

    const result = await this.generateStructured<CrossLayerValidation>(prompt, this.getSystem(), {
      narrationVsImage: true,
      narrationVsCamera: true,
      narrationVsDialogue: true,
      narrationVsAnimation: true,
      issues: [],
      patches: {}
    })

    return result.data
  }

  /**
   * MetadataCompleteness & CulturalGuard.
   * Vérifie que tous les champs obligatoires sont présents et cohérents linguistiquement.
   */
  async validateMetadata(scene: VimaxScene): Promise<{ isValid: boolean; issues: string[] }> {
    const requiredFields = ['narration', 'imagePrompt', 'locationId', 'tensionState', 'cameraAction']
    const issues: string[] = []

    for (const field of requiredFields) {
      const val = (scene as any)[field]
      if (!val || (Array.isArray(val) && val.length === 0) || val === 'unknown') {
        issues.push(`Champ manquant ou invalide : ${field}`)
      }
    }

    // Cultural Guard : Vérification sommaire fr/en (on pourrait déléguer au LLM si besoin)
    if (scene.narration && /[\u4E00-\u9FA5]/.test(scene.narration)) {
      issues.push('Détection de caractères non autorisés (Chinois/Japonais) dans la narration.')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}
