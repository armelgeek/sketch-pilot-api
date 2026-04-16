import { buildCharacterPrompt } from './character-consistency'
import { buildLocationPrompt } from './location-consistency'
import type { VisualRegistry } from './visual-registry'

/**
 * buildConsistencyPrompt
 *
 * Generates natural language production directives.
 * NO diagnostic tags, NO lore, NO JSON.
 */
export function buildConsistencyPrompt(registry: VisualRegistry, scene: any, previousScene?: any) {
  const style = registry.style

  // 1. Production Context (Atmosphere & Lighting)
  const stylePrompt = `${style.style}, ${style.lighting}, ${style.camera}, ${style.colorGrading}.`

  // 2. Location (Visual Environment)
  const location = buildLocationPrompt(registry, scene.locationId)
  const locationPrompt = location && location !== 'unknown location' ? `Scene set in ${location.trim()}.` : ''

  // 3. Identification (Subjects in Frame)
  const characters = (scene.charactersInScene || [])
    .map((c: string) => buildCharacterPrompt(registry, c.replace('@', '')))
    .filter(Boolean)
    .join(', ')
  const characterPrompt = characters ? `Subjects: ${characters}.` : ''

  // 4. Composition Details
  const comp = scene.composition || {}
  const shotType = comp.shotType ? `${comp.shotType} SHOT` : 'MEDIUM SHOT'
  const cameraAction = scene.cameraAction
    ? `Motion: ${typeof scene.cameraAction === 'string' ? scene.cameraAction : JSON.stringify(scene.cameraAction)}`
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
export function buildVisualPrompt(registry: VisualRegistry, scene: any, previousScene?: any) {
  const consistency = buildConsistencyPrompt(registry, scene, previousScene)
  const projections = scene.projections?.visualDescription || scene.imagePrompt || scene.summary || ''

  // FINAL RENDER: [Consistency Directives] [Scene Description]
  return `${consistency} Visual: ${projections.trim()}`
}
