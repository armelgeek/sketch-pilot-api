import { buildCharacterPrompt } from './character-consistency'
import { buildLocationPrompt } from './location-consistency'
import type { VisualRegistry } from './visual-registry'

/**
 * buildConsistencyPrompt
 *
 * Generates natural language production directives.
 * NO diagnostic tags, NO lore, NO JSON.
 */
export function buildConsistencyPrompt(registry: VisualRegistry, scene: any, language?: string) {
  const style = registry.style
  const isFrench = (language || 'fr').startsWith('fr')

  // 1. Production Context (Atmosphere & Lighting)
  const stylePrompt = `${style.style}, ${style.lighting}, ${style.camera}, ${style.colorGrading}.`

  // 2. Location (Visual Environment)
  const location = buildLocationPrompt(registry, scene.locationId)
  const locLabel = isFrench ? 'Décor :' : 'Scene set in'
  const locationPrompt = location && location !== 'unknown location' ? `${locLabel} ${location.trim()}.` : ''

  // 3. Identification (Subjects in Frame)
  const characters = (scene.charactersInScene || [])
    .map((c: string) => buildCharacterPrompt(registry, c.replace('@', '')))
    .filter(Boolean)
    .join(', ')
  const subjectsLabel = isFrench ? 'Sujets :' : 'Subjects:'
  const characterPrompt = characters ? `${subjectsLabel} ${characters}.` : ''

  // 4. Composition Details
  const comp = scene.composition || {}
  const shotTypeLabel = isFrench ? 'PLAN' : 'SHOT'
  const shotType = comp.shotType ? `${comp.shotType} ${shotTypeLabel}` : `MEDIUM ${shotTypeLabel}`

  const motionLabel = isFrench ? 'Mouvement :' : 'Motion:'
  const cameraAction = scene.cameraAction
    ? `${motionLabel} ${typeof scene.cameraAction === 'string' ? scene.cameraAction : JSON.stringify(scene.cameraAction)}`
    : ''
  const compositionPrompt = `${shotType}${cameraAction ? `, ${cameraAction}` : ''}.`

  return [stylePrompt, locationPrompt, characterPrompt, compositionPrompt].filter(Boolean).join(' ')
}

/**
 * buildVisualPrompt
 *
 * Assembles the final prompt for the Image Generator.
 * Enforces strict decoupling between "Why" (Narrative) and "What" (Visual).
 */
export function buildVisualPrompt(registry: VisualRegistry, scene: any, language?: string) {
  const consistency = buildConsistencyPrompt(registry, scene, language)
  const projections = scene.projections?.visualDescription || scene.imagePrompt || scene.summary || ''
  const visualLabel = (language || 'fr').startsWith('fr') ? 'Visuel :' : 'Visual:'

  // FINAL RENDER: [Consistency Directives] [Scene Description]
  return `${consistency} ${visualLabel} ${projections.trim()}`
}
/**
 * applyVisualAnchors
 *
 * Universal Identity Locking: Ensures characters and assets are anchored
 * to their reference definitions and images.
 */
export function applyVisualAnchors(
  paragraph: string,
  registries: { character?: Record<string, any>; asset?: Record<string, any> },
  hasReferenceImages: boolean = false
): string {
  let result = paragraph.trim()

  // 1. Character Locking
  if (registries.character) {
    for (const [name, data] of Object.entries(registries.character)) {
      if (hasReferenceImages) {
        // More aggressive stripping if name leaks in technical description
        const nameRegex = new RegExp(`\\b${name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}\\b`, 'gi')
        result = result.replace(nameRegex, '').trim()

        // LIVING IDENTITY: Anchor to reference images
        if (paragraph.toLowerCase().includes(name.toLowerCase())) {
          result = `[LIVING IDENTITY: ${name}] (REFERENCE GUIDED). ${result}`
        }
      }
    }
  }

  // 2. Asset Locking
  if (registries.asset) {
    for (const [name, asset] of Object.entries(registries.asset)) {
      const desc = (asset as any).description
      if (hasReferenceImages && (asset as any).thumbnailUrl && desc) {
        if (result.toLowerCase().includes(desc.toLowerCase().slice(0, 20))) {
          result = result
            .replaceAll(new RegExp(desc.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'gi'), '')
            .trim()
        }
        result = `Reference (${name}), ${result}`
      } else if (desc && !result.toLowerCase().includes(desc.toLowerCase().slice(0, 20))) {
        result += `, Recurring Asset ${name}: ${desc}`
      }
    }
  }

  return result.replaceAll(/,\s*,/g, ',').replaceAll(/\s+/g, ' ').replace(/^,\s*/, '').replace(/,\s*$/, '').trim()
}
