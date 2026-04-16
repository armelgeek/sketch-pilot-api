import type { SeriesContext } from '../series-video-generator'
import { normalizeId } from './series-registry.utils'
import type { LLMScriptOutput } from './series-script.schema'

export interface AuditIssue {
  type: 'character' | 'location' | 'asset' | 'logic' | 'technical'
  severity: 'error' | 'warning'
  message: string
  hallucinatedId?: string
  suggestedAction?: string
}

export interface AuditReport {
  isValid: boolean
  issues: AuditIssue[]
}

/**
 * SeriesHallucinationSentinel
 *
 * Hardcore audit system to prevent narrative drift and hallucinations.
 * Cross-references LLM output against the ground truth (Registries).
 */
export const SeriesHallucinationSentinel = {
  /**
   * Performs a deep audit of the generated script.
   */
  audit(script: LLMScriptOutput, context: SeriesContext): AuditReport {
    const issues: AuditIssue[] = []

    const characterRegistry = context.characterRegistry || {}
    const locationRegistry = context.locationRegistry || {}
    const assetRegistry = context.assetRegistry || {}

    // 1. Identify "Ground Truth" handles
    const knownCharacters = new Set(Object.keys(characterRegistry).map(normalizeId))
    const knownLocations = new Set(Object.keys(locationRegistry).map(normalizeId))
    const knownAssets = new Set(Object.keys(assetRegistry).map(normalizeId))

    // Include newly introduced ones in this episode's metadata (to allow discovery)
    if (script.seriesMetadata?.newCharacters) {
      Object.keys(script.seriesMetadata.newCharacters).forEach((name) => knownCharacters.add(normalizeId(name)))
    }
    if (script.seriesMetadata?.newLocations) {
      Object.keys(script.seriesMetadata.newLocations).forEach((id) => knownLocations.add(normalizeId(id)))
    }
    if (script.seriesMetadata?.newAssets) {
      Object.keys(script.seriesMetadata.newAssets).forEach((id) => knownAssets.add(normalizeId(id)))
    }

    // 2. Audit Scenes for Hallucinations
    for (const scene of script.scenes) {
      // Character Hallucination
      const charactersInScene = scene.charactersInScene || []
      for (const charHandle of charactersInScene) {
        const normalized = normalizeId(charHandle)
        if (!knownCharacters.has(normalized)) {
          issues.push({
            type: 'character',
            severity: 'error',
            message: `Hallucination de personnage: "${charHandle}" n'est pas dans le registre.`,
            hallucinatedId: charHandle,
            suggestedAction: `Utilisez uniquement les personnages du registre : ${Array.from(knownCharacters).join(', ')}`
          })
        }
      }

      // Location Hallucination
      if (scene.locationId) {
        const normalizedLoc = normalizeId(scene.locationId)
        if (!knownLocations.has(normalizedLoc)) {
          issues.push({
            type: 'location',
            severity: 'error',
            message: `Hallucination de lieu: "${scene.locationId}" n'est pas dans le registre.`,
            hallucinatedId: scene.locationId,
            suggestedAction: `Utilisez un lieu existant ou déclarez-le dans seriesMetadata.newLocations. Lieux valides: ${Array.from(knownLocations).join(', ')}`
          })
        }
      }

      // 3. Mentions Audit in Narration (Hardcore)
      const mentions = scene.narration.match(/@\w+/g) || []
      for (const mention of mentions) {
        const normalizedMention = normalizeId(mention)
        if (
          !knownCharacters.has(normalizedMention) &&
          !knownLocations.has(normalizedMention) &&
          !knownAssets.has(normalizedMention)
        ) {
          issues.push({
            type: 'technical',
            severity: 'warning',
            message: `Mention @ suspecte: "${mention}" ne correspond à aucune entité connue.`,
            hallucinatedId: mention
          })
        }
      }

      // 4. Dead Character Guard
      for (const charHandle of charactersInScene) {
        const normalized = normalizeId(charHandle)
        const charData = (characterRegistry as any)[normalized] || (characterRegistry as any)[charHandle]
        if (charData?.status === 'dead') {
          issues.push({
            type: 'logic',
            severity: 'error',
            message: `Violation Anti-Résurrection: ${charHandle} est MORT. Il ne peut pas apparaître en scène ${scene.id}.`
          })
        }
      }

      // 5. Visual State Lock (Physical-Only Enforcement)
      if (scene.simulationPatch.worldPatch?.locks) {
        const abstractKeywords = ['secret', 'vérité', 'destinée', 'amour', 'peur', 'mystère', 'aura', 'force']
        for (const item of scene.simulationPatch.worldPatch.locks) {
          if (abstractKeywords.some((k) => item.toLowerCase().includes(k))) {
            issues.push({
              type: 'technical',
              severity: 'warning',
              message: `VisualStateLock trop abstrait: "${item}". Un lock doit être un état physique observable (ex: "cicatrice", "métal brisé").`
            })
          }
        }
      }

      // 7. Location ID Format
      if (scene.locationId && scene.locationId.startsWith('@')) {
        issues.push({
          type: 'technical',
          severity: 'error',
          message: `Format LocationId invalide: "${scene.locationId}". N'utilisez pas de "@" pour les lieux, réservez-les aux personnages. Use snake_case IDs.`
        })
      }

      // 9. Narrative Delta Rule (v9.0 SIMULATION)
      if (!scene.sceneDelta) {
        issues.push({
          type: 'logic',
          severity: 'error',
          message: `Violation de la Narrative Delta Rule en scène ${scene.id}: le champ 'sceneDelta' est OBLIGATOIRE.`
        })
      }

      // 10. Information Novelty Check (v9.0)
      const currentDelta = scene.sceneDelta?.toLowerCase()
      if (currentDelta) {
        const previousScenes = script.scenes.slice(0, script.scenes.indexOf(scene))
        for (const prev of previousScenes) {
          const prevDelta = prev.sceneDelta?.toLowerCase()
          if (prevDelta === currentDelta) {
            issues.push({
              type: 'logic',
              severity: 'error',
              message: `Répétition Narrative: La scène ${scene.id} apporte la MÊME information delta que la scène ${prev.id}. Chaque scène doit être unique.`
            })
          }
        }
      }

      // 11. Scene Intent Audit (v9.0)
      if (!scene.scenePurpose) {
        issues.push({
          type: 'technical',
          severity: 'error',
          message: `Scene Purpose manquant en scène ${scene.id}.`
        })
      }

      // 12. Tension State Dynamics (v9.0)
      const tensionState = scene.tensionState
      if (tensionState) {
        const { level, type } = tensionState
        if (level < 0 || level > 10) {
          issues.push({
            type: 'technical',
            severity: 'error',
            message: `Tension level hors limites (0-10) en scène ${scene.id}: ${level}`
          })
        }
        if (!['build', 'sustain', 'spike', 'release'].includes(type)) {
          issues.push({
            type: 'technical',
            severity: 'error',
            message: `Type de tension invalide en scène ${scene.id}: ${type}`
          })
        }
      }
    }

    // 5. Global Metadata Audit
    if (script.seriesMetadata?.characterEvolution) {
      for (const charHandle of Object.keys(script.seriesMetadata.characterEvolution)) {
        if (!knownCharacters.has(normalizeId(charHandle))) {
          issues.push({
            type: 'character',
            severity: 'error',
            message: `Evolution d'un personnage inexistant: "${charHandle}".`,
            hallucinatedId: charHandle
          })
        }
      }
    }

    return {
      isValid: !issues.some((i) => i.severity === 'error'),
      issues
    }
  },

  /**
   * Generates a surgical prompt to tell the LLM exactly what to fix.
   */
  generateCorrectionPrompt(report: AuditReport): string {
    if (report.isValid && report.issues.length === 0) return ''

    const errorBlock = report.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `- ❌ ${i.message} ${i.suggestedAction ? ` -> ${i.suggestedAction}` : ''}`)
      .join('\n')

    const warningBlock = report.issues
      .filter((i) => i.severity === 'warning')
      .map((i) => `- ⚠️ ${i.message}`)
      .join('\n')

    return `
🚨 AUDIT DE SÉCURITÉ NARRATIVE ÉCHOUÉ (HALLUCINATIONS DÉTECTÉES) 🚨

Votre précédent output JSON contient des erreurs critiques de continuité ou des hallucinations :
${errorBlock}

${warningBlock.length > 0 ? `Alertes mineures :\n${warningBlock}` : ''}

TÂCHE : Corrigez IMMÉDIATEMENT ces erreurs dans le JSON. 
RÈGLE D'OR : Ne mentionnez JAMAIS de personnages ou de lieux qui ne sont pas dans le registre reçu.
Si vous avez créé un nouveau lieu ou personnage, vous DEVEZ l'avoir enregistré dans 'seriesMetadata.newCharacters' ou 'seriesMetadata.newLocations'.
`.trim()
  }
}
