/**
 * series-image-prompt.builder.ts
 *
 * Refactored buildImagePrompt extracted from SeriesVideoGenerator.
 *
 * Architecture: Sequential pipeline of pure builder functions.
 * Each stage receives context and returns a string fragment.
 * The main builder assembles them in order — no mutable paragraph cascade.
 *
 * Stages:
 *   1. Shot directive (composition/camera)
 *   2. Atmosphere (weather, time of day)
 *   3. Persistent decor tokens
 *   4. Evolution state (characters + assets)
 *   5. Social context (relationships, interactions)
 *   6. Emotions
 *   7. Spatial context (location lock + anchor)
 *   8. Continuity bridge (sequel / internal sequence)
 *   9. Subject (action, core prompt)
 *  10. Art direction (palette, motifs, camera style)
 *  11. Layout (montage, split-screen)
 */

import type { EnrichedScene } from '../../../types/video-script.types'
import { findInRegistry, mergeEvolution, normalizeId, type EvolutionState } from './series-registry.utils'
import { buildConsistencyPrompt } from './visual-engine'
import type { VisualRegistry } from './visual-registry'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImagePromptContext {
  scene: EnrichedScene
  episodeNumber: number
  characterRegistry: Record<string, any>
  locationRegistry: Record<string, any>
  assetRegistry: Record<string, any>
  visualEvolution?: Record<string, string | EvolutionState>
  assetEvolution?: Record<string, string | EvolutionState>
  relationshipMap?: Record<string, Record<string, string>>
  globalContext?: string
  colorPalette?: string
  symbolicMotifs?: string[]
  cameraStyle?: string
  timeOfDay?: string
  weatherState?: string
  lastEpisodeFinalImage?: string
  lastEpisodeFinalScene?: any
  hasReferenceImages?: boolean
  hasLocationReference?: boolean
  previousScene?: any // passed by caller (SceneMemory)
  loreUpdates?: string[]
  roadmapNarrativeHints?: string[]
  visualRegistry?: VisualRegistry
}

export interface ImagePromptResult {
  sceneId: string
  prompt: string
  referenceImage?: string
  referenceImages: (string | { name?: string; data: string })[]
  characterSheets: { name: string; appearance: { description: string }; role: string }[]
  reuseReferenceImage: boolean
}

// ─── Shot Map ─────────────────────────────────────────────────────────────────

const SHOT_MAP: Record<string, string> = {
  CLOSEUP: 'CLOSE-UP SHOT: Focus on face and expression.',
  MEDIUM: 'MEDIUM SHOT: Character from waist up, showing some environment.',
  WIDE: 'WIDE SHOT: Full body and environment, character in context.',
  ESTABLISHING: 'ESTABLISHING SHOT: Extreme wide view to set the location.',
  PANORAMIC: 'PANORAMIC VIEW: Ultra-wide cinematic view.',
  POV: 'POV SHOT: Seen through the eyes of the character.',
  OVERSHOULDER: 'OVER-THE-SHOULDER SHOT: Looking at subject over another character shoulder.'
}

// ─── Stage Builders ───────────────────────────────────────────────────────────

function buildShotDirective(scene: EnrichedScene): string {
  const comp = (scene as any).projections?.composition || scene.composition || { shotType: 'MEDIUM' }
  let directive = SHOT_MAP[comp.shotType || 'MEDIUM'] || SHOT_MAP.MEDIUM

  if (comp.foregroundAnchor) directive += ` Foreground: ${comp.foregroundAnchor} (blurry dirty frame).`
  if (comp.lightingMood) directive += ` Lighting/Mood: ${comp.lightingMood}.`
  if (comp.focusTarget) directive += ` Focus on ${comp.focusTarget}.`

  return directive
}

function buildAtmosphere(ctx: ImagePromptContext): string {
  const time = ctx.timeOfDay || ''
  const weather = ctx.weatherState || ''
  if (!time && !weather) return ''
  return `Atmosphère : ${time}${time && weather ? ', ' : ''}${weather}.`
}

function buildDecorTokens(scene: EnrichedScene): string {
  if (!scene.persistentDecorTokens?.length) return ''
  return `PERSISTENT ELEMENTS: ${scene.persistentDecorTokens.join(', ')}.`
}

function getEvolutionString(data: any): string {
  if (typeof data === 'string') return data
  if (typeof data?.state === 'string') return data.state
  if (typeof data?.state === 'object') return JSON.stringify(data.state)
  return ''
}

function buildEvolutionState(ctx: ImagePromptContext, activeCharacters: string[]): string {
  const evolution = mergeEvolution(ctx.visualEvolution || {}, ctx.scene.visualEvolution || {})
  const assetState = mergeEvolution(ctx.assetEvolution || {}, ctx.scene.assetEvolution || {})
  const parts: string[] = []

  // Characters in scene + Global Identity Locks
  for (const name of activeCharacters) {
    const char = findInRegistry(ctx.characterRegistry, name) as any
    const evolutionData = findInRegistry(evolution as any, name)
    const traits: string[] = []

    if (char?.locks) {
      Object.entries(char.locks).forEach(([k, v]) => traits.push(`${k}: ${v}`))
    }
    if (evolutionData) {
      const s = getEvolutionString(evolutionData)
      if (s) traits.push(s)
    }

    if (traits.length) parts.push(`${name} [${traits.join(', ')}]`)
  }

  // Assets referenced in the subject
  const subject = (
    (ctx.scene as any).projections?.visualDescription ||
    ctx.scene.imagePrompt ||
    ctx.scene.summary ||
    ''
  ).toLowerCase()
  for (const [assetName, evolutionData] of Object.entries(assetState)) {
    if (subject.includes(assetName.toLowerCase()) || subject.includes(normalizeId(assetName))) {
      const s = getEvolutionString(evolutionData)
      if (s) parts.push(`${assetName} (${s})`)
    }
  }

  return parts.length ? `État de Simulation : ${parts.join('; ')}.` : ''
}

function buildSocialContext(ctx: ImagePromptContext, scene: EnrichedScene): string {
  const parts: string[] = []

  const relationships = ctx.relationshipMap || {}
  if (Object.keys(relationships).length > 0) {
    const relStr = Object.entries(relationships)
      .map(([char, targets]) =>
        Object.entries(targets)
          .map(([target, rel]) => `${char} → ${target} : ${rel}`)
          .join(', ')
      )
      .join('. ')
    if (relStr) parts.push(`Interaction : ${relStr}.`)
  }

  if (scene.interactions && Object.keys(scene.interactions).length > 0) {
    const interactions = Object.entries(scene.interactions)
      .map(([pair, tension]) => `${pair} : ${tension}`)
      .join(', ')
    parts.push(`Dynamique : ${interactions}.`)
  }

  return parts.join(' ')
}

function buildEmotions(scene: EnrichedScene): string {
  if (!scene.emotionalTokens || Object.keys(scene.emotionalTokens).length === 0) return ''
  const emotions = Object.entries(scene.emotionalTokens)
    .map(([charId, tokens]) => `${charId} est ${(tokens as string[]).join(', ')}`)
    .join(', ')
  return `Expressions : ${emotions}.`
}

function buildSpatialContext(
  ctx: ImagePromptContext,
  effectiveLocationId: string | undefined
): { text: string; locationMasterUrl: string | undefined } {
  let locationMasterUrl: string | undefined
  let text = ''

  if (ctx.scene.spatialAnchor) {
    text += `[ANCRE SPATIALE: ${ctx.scene.spatialAnchor}] `
  }

  if (effectiveLocationId) {
    const loc = findInRegistry(ctx.locationRegistry, effectiveLocationId)
    locationMasterUrl = (loc as any)?.thumbnailUrl

    if (loc) {
      const referenceMark = ctx.hasLocationReference ? 'REFERENCE VISUELLE ACTIVE' : 'RÉFÉRENCE TEXTUELLE'
      const locDesc = (loc as any).description || (loc as any).atmosphere || ''
      const showFullDesc = !locationMasterUrl

      text += `LIEU : ${normalizeId(effectiveLocationId)} (${referenceMark}). `
      if (showFullDesc) text += `${locDesc.trim()}. `
      if (locationMasterUrl) {
        text += `✨ CONTINUITÉ ATMOSPHÉRIQUE : Capturez l'essence de ${effectiveLocationId} en vous basant sur l'image de référence, tout en restant ouvert à l'évolution de la scène. `
      }
    }
  }

  return { text, locationMasterUrl }
}

function buildContinuityBridge(
  ctx: ImagePromptContext,
  isFirstScene: boolean,
  referenceImageUrl: string | undefined,
  previousScene: any
): { text: string; updatedReferenceImageUrl: string | undefined } {
  if (!previousScene) return { text: '', updatedReferenceImageUrl: referenceImageUrl }

  const isSequelBridge = isFirstScene && ctx.episodeNumber > 1
  const isInternalSequence = !isFirstScene && ctx.scene.continueFromPrevious

  if (!isSequelBridge && !isInternalSequence) return { text: '', updatedReferenceImageUrl: referenceImageUrl }

  let updatedRef = referenceImageUrl
  if (isInternalSequence && previousScene.imageUrl) {
    updatedRef = previousScene.imageUrl
  }

  let text = `CONTINUATION DIRECTE : ${previousScene.summary || previousScene.imagePrompt}. `

  if (previousScene.persistentDecorTokens?.length > 0) {
    const label = isSequelBridge ? 'épisode précédent' : 'scène précédente'
    text += `Lumière héritée de la ${label}: ${previousScene.persistentDecorTokens.join(', ')}. `
  }

  const refLabel = isSequelBridge ? 'Sequel Bridge (DYNAMIQUE)' : `Scene ${previousScene.id}`
  const fidelityInstruction = isSequelBridge
    ? "🌟 ALIGNEMENT NARRATIF : L'image de référence est votre guide pour l'atmosphère et les détails clés. "
    : '🌊 FLUIDITÉ VISUELLE : Priorité au mouvement et à la vie. Maintenez la cohérence des éléments majeurs tout en autorisant le décor à respirer. '

  // v12 Update: Visual Contrast Injection
  const sameLocation = ctx.scene.locationId && ctx.scene.locationId === previousScene.locationId
  const contrastTip =
    isInternalSequence && sameLocation
      ? "🌓 CONTRASTE DE SÉQUENCE : Puisque nous sommes dans le même lieu, variez l'échelle ou l'angle pour éviter la redondance visuelle. "
      : ''

  text += `Reference (${refLabel}). ${fidelityInstruction}${contrastTip}TRANSITION FLUIDE. `

  return { text, updatedReferenceImageUrl: updatedRef }
}

function buildSubject(scene: EnrichedScene): string {
  const desc = (scene as any).projections?.visualDescription || scene.imagePrompt || scene.summary || ''
  return `VISUAL : ${desc.trim()}`
}

function buildArtDirection(ctx: ImagePromptContext, scene: EnrichedScene): string {
  const palette = ctx.colorPalette
  const motifs = [...(ctx.symbolicMotifs || []), ...(scene.symbolicMotifs || [])]
  const camStyle = ctx.cameraStyle

  if (!palette && motifs.length === 0 && !camStyle) return ''

  let style = ''
  if (palette) style += `Color Palette: ${palette}. `
  if (motifs.length > 0) style += `Symbolic Motifs: ${motifs.join(', ')}. `
  if (camStyle) style += `Camera Technique: ${camStyle}. `

  return `Direction Artistique : ${style}`
}

function buildLayout(scene: EnrichedScene): string {
  const layout = (scene as any).projections?.composition?.layout || scene.composition?.layout || 'SINGLE'
  if (layout === 'MONTAGE') return 'COMPOSITION : polyptych / multi-panels separating characters.'
  if (layout === 'SPLIT' || layout === 'DIAGONAL') return 'COMPOSITION : split-screen separating characters.'
  return ''
}

function buildLoreContext(ctx: ImagePromptContext): string {
  // v9.1 CLEANUP: Do NOT dump the entire bible into the visual prompt.
  // Only include specific roadmap hints if they have visual impact.
  const parts: string[] = []
  if (ctx.loreUpdates?.length) parts.push(`Visual Lore: ${ctx.loreUpdates.join('; ')}.`)
  return parts.join(' ')
}

// ─── Character Sanitizer ───────────────────────────────────────────────────────

/**
 * Remove references to characters not in the current scene.
 * STRICT version: only strips exact @handle or full name matches.
 * Avoids the original substring-collision bug.
 */
function sanitizeInactiveCharacters(
  text: string,
  activeCharacters: Set<string>,
  characterRegistry: Record<string, any>
): string {
  let result = text

  for (const charId of Object.keys(characterRegistry)) {
    const normalizedId = normalizeId(charId)
    const isActive = activeCharacters.has(normalizedId.toLowerCase())
    if (isActive) continue

    // Only strip the @handle exactly — not substrings
    // This prevents "@Alexander" stripping "Alexander" from "Alexander the Great"
    const handlePattern = normalizedId.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
    result = result.replaceAll(new RegExp(`\\b${handlePattern}\\b`, 'gi'), '').trim()
  }

  return result
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

export async function buildImagePrompt(ctx: ImagePromptContext): Promise<ImagePromptResult> {
  const { scene, episodeNumber, characterRegistry, locationRegistry, assetRegistry } = ctx

  const isFirstScene = scene.sceneNumber === 1 || scene.id === 'scene-1' || scene.id === '1'
  const sequelBridgeUrl = isFirstScene && episodeNumber > 1 ? ctx.lastEpisodeFinalImage : undefined

  const previousScene = isFirstScene ? ctx.lastEpisodeFinalScene : ctx.previousScene

  // Fallback: reuse previous locationId if scene doesn't declare one
  const effectiveLocationId = scene.locationId || previousScene?.locationId

  // Active characters (normalized set for fast lookup)
  const activeCharacters = new Set((scene.charactersInScene || []).map((id: string) => normalizeId(id).toLowerCase()))
  const activeCharacterNames = Array.from(activeCharacters)

  // ─── Build all stages ────────────────────────────────────────────────────────

  const shotDirective = buildShotDirective(scene)
  const atmosphere = buildAtmosphere(ctx)
  const decorTokens = buildDecorTokens(scene)
  const evolutionState = buildEvolutionState(ctx, activeCharacterNames as string[])
  const socialContext = buildSocialContext(ctx, scene)
  const emotions = buildEmotions(scene)
  const { text: spatialText, locationMasterUrl } = buildSpatialContext(ctx, effectiveLocationId)
  const subject = buildSubject(scene)
  const artDirection = buildArtDirection(ctx, scene)
  const layout = buildLayout(scene)
  const loreContext = buildLoreContext(ctx)

  // ─── Visual Consistency Engine Pipeline ─────────────────────────────────────
  let visualEnginePrompt = ''
  if (ctx.visualRegistry) {
    visualEnginePrompt = buildConsistencyPrompt(ctx.visualRegistry, scene, previousScene)
  }

  // Continuity bridge (updates referenceImageUrl for internal sequences)
  const { text: bridgeText, updatedReferenceImageUrl: referenceImageUrl } = buildContinuityBridge(
    ctx,
    isFirstScene,
    sequelBridgeUrl,
    previousScene
  )

  // Assemble in semantic order
  const parts = [
    layout,
    artDirection,
    shotDirective,
    atmosphere,
    decorTokens,
    evolutionState,
    socialContext,
    emotions,
    spatialText,
    bridgeText,
    loreContext,
    visualEnginePrompt,
    subject
  ].filter(Boolean)

  let paragraph = parts.join(' ')

  // Sanitize inactive characters (strict @handle removal only)
  paragraph = sanitizeInactiveCharacters(paragraph, activeCharacters as Set<string>, characterRegistry)

  // ─── Build reference images ──────────────────────────────────────────────────

  const allReferenceImages: (string | { name?: string; data: string })[] = []
  const characterSheets: { name: string; appearance: { description: string }; role: string }[] = []

  // 1. Primary continuity reference (sequel bridge or internal sequence)
  if (referenceImageUrl) {
    allReferenceImages.push(referenceImageUrl)
  }

  // 2. Character thumbnails + metadata sheets
  for (const normalizedName of activeCharacterNames) {
    const char = findInRegistry(characterRegistry, normalizedName as string) as any
    if (char) {
      if (char.thumbnailUrl) allReferenceImages.push({ name: normalizedName as string, data: char.thumbnailUrl })
      characterSheets.push({
        name: (normalizedName as string).replace(/^@/, ''),
        appearance: { description: char.description || '' },
        role: char.role || ''
      })
    }
  }

  // 3. Asset thumbnails (if referenced in the final prompt)
  const lowerParagraph = paragraph.toLowerCase()
  for (const name of Object.keys(assetRegistry)) {
    if (lowerParagraph.includes(name.toLowerCase())) {
      const asset = findInRegistry(assetRegistry, name) as any
      if (asset?.thumbnailUrl) allReferenceImages.push({ name, data: asset.thumbnailUrl })
    }
  }

  // 4. Location master as background anchor (only if no continuity reference available)
  if (!referenceImageUrl && locationMasterUrl) {
    allReferenceImages.push({ name: 'Location Reference', data: locationMasterUrl })
  }

  return {
    sceneId: scene.id,
    prompt: paragraph,
    referenceImage: referenceImageUrl,
    referenceImages: allReferenceImages,
    characterSheets,
    reuseReferenceImage: !!sequelBridgeUrl
  }
}
