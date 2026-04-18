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

import { VisualDNAManager } from '../../visual-dna-manager'
import type { EnrichedScene } from '../../../types/video-script.types'
import { findInRegistry, mergeEvolution, normalizeId, type EvolutionState } from './series-registry.utils'
import { applyVisualAnchors, buildConsistencyPrompt } from './visual-engine'
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
  language?: string
  artisticStyle?: string // Style DNA immuable
  spec?: any // VideoTypeSpecification
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

const LOCALES: Record<string, any> = {
  fr: {
    shot: {
      CLOSEUP: 'Un plan rapproché',
      MEDIUM: 'Un plan moyen',
      WIDE: 'Un plan large',
      ESTABLISHING: 'Un plan d’ensemble',
      PANORAMIC: 'Une vue panoramique',
      POV: 'Une vue subjective',
      OVERSHOULDER: 'Un plan par-dessus l’épaule'
    },
    setting: {
      in: 'dans le décor de',
      captured: 'capturé',
      at: 'à',
      under: 'sous',
      suspended: 'un moment suspendu',
      precisely: 'situé précisément'
    },
    details: 'On distingue clairement',
    emotions: (chars: string) => `On peut lire l'émotion sur les visages de ${chars}.`,
    evolution: (name: string, traits: string) => `${name} présente ${traits}`,
    asset: (name: string, state: string) => `${name} est ${state}`,
    bridge: {
      follows: 'Cet instant fait suite à :',
      inherited: 'On retrouve la même lumière héritée de l’instant précédent.',
      aligned: "Le style et l'atmosphère respectent l'alignement narratif établi.",
      fluid: 'La transition est fluide et organique.',
      contrast: "L'angle de vue varie pour offrir une nouvelle perspective."
    },
    art: {
      palette: (p: string) => `L’ensemble est baigné par une palette colorimétrique ${p}.`,
      motifs: (m: string) => `On remarque des motifs symboliques tels que ${m} présents de manière subtile.`,
      style: (s: string) => `Le style visuel est caractérisé par une technique ${s}.`
    },
    layout: {
      polyptych: 'La composition est un polyptyque montrant plusieurs personnages.',
      split: 'L’écran est divisé pour séparer les personnages.'
    }
  },
  en: {
    shot: {
      CLOSEUP: 'A close-up shot',
      MEDIUM: 'A medium shot',
      WIDE: 'A wide shot',
      ESTABLISHING: 'An establishing shot',
      PANORAMIC: 'A panoramic view',
      POV: 'A point-of-view shot',
      OVERSHOULDER: 'An over-the-shoulder shot'
    },
    setting: {
      in: 'in',
      captured: 'captured',
      at: 'at',
      under: 'under',
      suspended: 'a suspended moment',
      precisely: 'located precisely'
    },
    details: 'One can clearly see',
    emotions: (chars: string) => `Emotion is visible on the faces of ${chars}.`,
    evolution: (name: string, traits: string) => `${name} features ${traits}`,
    asset: (name: string, state: string) => `${name} is ${state}`,
    bridge: {
      follows: 'This moment follows:',
      inherited: 'The lighting is inherited from the previous moment.',
      aligned: 'The style and atmosphere respect the established narrative alignment.',
      fluid: 'The transition is fluid and organic.',
      contrast: 'The viewing angle varies to provide a new perspective.'
    },
    art: {
      palette: (p: string) => `The entire scene is bathed in a ${p} color palette.`,
      motifs: (m: string) => `Symbolic motifs such as ${m} are subtly present.`,
      style: (s: string) => `The visual style is characterized by a ${s} technique.`
    },
    layout: {
      polyptych: 'The composition is a polyptych showing multiple characters.',
      split: 'The screen is split to separate characters.'
    }
  }
}

function getLocale(language?: string) {
  const code = (language || 'fr').split('-')[0].toLowerCase()
  return LOCALES[code] || LOCALES.en // Fallback to English for better AI compatibility
}

// ─── Stage Builders ───────────────────────────────────────────────────────────

function buildDecorTokens(scene: EnrichedScene, language?: string): string {
  if (!scene.persistentDecorTokens?.length) return ''
  const t = getLocale(language)
  const and = t.details.includes('distinct') ? ' et ' : ' and '
  return `${t.details} ${scene.persistentDecorTokens.join(and)} ${t.setting.in.includes('décor') ? 'dans l’environnement' : 'in the environment'}.`
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
  const t = getLocale(ctx.language)

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

    if (traits.length) parts.push(t.evolution(name, traits.join(', ')))
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
      if (s) parts.push(t.asset(assetName, s))
    }
  }

  return parts.length ? `${parts.join('. ')}.` : ''
}

function buildEmotions(scene: EnrichedScene, language?: string): string {
  if (!scene.emotionalTokens || Object.keys(scene.emotionalTokens).length === 0) return ''
  const t = getLocale(language)
  const emotions = Object.entries(scene.emotionalTokens)
    .map(([charId, tokens]) => {
      const joined = (tokens as string[]).join(t.details.includes('distinct') ? ' et ' : ' and ')
      return `${charId} ${t.setting.in.includes('décor') ? 'qui semble' : 'who seems'} ${joined}`
    })
    .join(', ')
  return t.emotions(emotions)
}

function buildContinuityBridge(
  ctx: ImagePromptContext,
  isFirstScene: boolean,
  referenceImageUrl: string | undefined,
  previousScene: any,
  language?: string
): { text: string; updatedReferenceImageUrl: string | undefined } {
  const t = getLocale(language)
  let text = ''

  // [VIMAX] FF/LF Temporal Chaining: Inject Vimax continuity cues
  if (ctx.scene.ffDesc) {
    const ffLabel = (language || 'fr').startsWith('fr') ? 'État initial (FF) :' : 'Initial state (FF):'
    text += `${ffLabel} ${ctx.scene.ffDesc}. `
  }
  if (ctx.scene.lfDesc) {
    const lfLabel = (language || 'fr').startsWith('fr') ? 'État final (LF) :' : 'Final state (LF):'
    text += `${lfLabel} ${ctx.scene.lfDesc}. `
  }

  if (!previousScene) return { text, updatedReferenceImageUrl: referenceImageUrl }

  const isSequelBridge = isFirstScene && ctx.episodeNumber > 1
  const isInternalSequence = !isFirstScene && ctx.scene.continueFromPrevious

  if (!isSequelBridge && !isInternalSequence) return { text, updatedReferenceImageUrl: referenceImageUrl }

  let updatedRef = referenceImageUrl
  if (isInternalSequence && previousScene.imageUrl) {
    updatedRef = previousScene.imageUrl
  }

  text += `${t.bridge.follows} ${previousScene.summary || previousScene.imagePrompt}. `

  if (previousScene.persistentDecorTokens?.length > 0) {
    text += `${t.bridge.inherited} `
  }

  const fidelityInstruction = isSequelBridge ? t.bridge.aligned : t.bridge.fluid

  // v12 Update: Visual Contrast Injection
  const sameLocation = ctx.scene.locationId && ctx.scene.locationId === previousScene.locationId
  const contrastTip = isInternalSequence && sameLocation ? t.bridge.contrast : ''

  text += `${fidelityInstruction}${contrastTip} `

  return { text, updatedReferenceImageUrl: updatedRef }
}

function buildSubject(scene: EnrichedScene): string {
  // Use imagePrompt as priority, fallback to a truncated summary
  const desc = (scene as any).projections?.visualDescription || scene.imagePrompt || scene.summary || ''
  const cleanDesc = desc.trim()

  // If it falls back to summary, we might want to truncate if it's too narrative
  if (!scene.imagePrompt && cleanDesc.length > 150) {
    return `${cleanDesc.slice(0, 150)}...`
  }
  return cleanDesc
}

function buildArtDirection(ctx: ImagePromptContext, scene: EnrichedScene): string {
  const palette = ctx.colorPalette
  const motifs = [...(ctx.symbolicMotifs || []), ...(scene.symbolicMotifs || [])]
  const camStyle = ctx.cameraStyle
  const t = getLocale(ctx.language)

  if (!palette && motifs.length === 0 && !camStyle) return ''

  let style = ''
  if (palette) style += `${t.art.palette(palette)} `
  if (motifs.length > 0) style += `${t.art.motifs(motifs.join(', '))} `
  if (camStyle) style += `${t.art.style(camStyle)} `

  return style
}

function buildLayout(scene: EnrichedScene, language?: string): string {
  const layout = (scene as any).projections?.composition?.layout || scene.composition?.layout || 'SINGLE'
  const t = getLocale(language)
  if (layout === 'MONTAGE') return t.layout.polyptych
  if (layout === 'SPLIT' || layout === 'DIAGONAL') return t.layout.split
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
  const effectiveLocationId = scene.locationId || previousScene?.locationId

  // Active characters
  const activeCharacters = new Set((scene.charactersInScene || []).map((id: string) => normalizeId(id).toLowerCase()))
  const activeCharacterNames = Array.from(activeCharacters)

  // ─── Build all components ───────────────────────────────────────────────────

  const t = getLocale(ctx.language)
  const shot = t.shot[scene.composition?.shotType || 'MEDIUM'] || t.shot.MEDIUM
  const time = ctx.timeOfDay || ''
  const weather = ctx.weatherState || ''
  const subject = (scene as any).projections?.visualDescription || scene.imagePrompt || scene.summary || ''
  const locationName = effectiveLocationId ? normalizeId(effectiveLocationId) : ''

  // 1. Setting the Stage (Shot + Location + Atmosphere + Anchor)
  // Weave these into a single descriptive sentence
  let opening = `${shot}`
  if (locationName) {
    const isFrench = (ctx.language || 'fr').startsWith('fr')
    const isInternal = !isFirstScene && scene.continueFromPrevious && scene.locationId === previousScene?.locationId

    if (isInternal) {
      const stillLabel = isFrench ? 'Toujours dans le même décor de' : 'Still in the same setting of'
      opening += ` ${stillLabel} ${locationName}`
    } else {
      const captureLabel = isFrench ? 'Capturé dans' : 'Captured in'
      const settingLabel = isFrench ? 'le décor de' : 'the setting of'
      opening += ` ${captureLabel} ${settingLabel} ${locationName}`
    }
  }
  if (scene.spatialAnchor) opening += `, ${t.setting.precisely} ${scene.spatialAnchor}`
  if (time || weather) {
    opening += ` ${t.setting.at} ${time || t.setting.suspended}`
    if (weather) opening += ` ${t.setting.under} ${weather}`
  }
  opening += '. '

  // 2. Character & Emotional Layer
  const evolutions = buildEvolutionState(ctx, activeCharacterNames as string[])
  const emotions = buildEmotions(scene, ctx.language)
  const charactersPart = [evolutions, emotions].filter(Boolean).join(' ')

  // 3. Narrative & Visual Context
  const bridge = buildContinuityBridge(ctx, isFirstScene, sequelBridgeUrl, previousScene, ctx.language).text
  const artDir = buildArtDirection(ctx, scene)
  const decor = buildDecorTokens(scene, ctx.language)

  // 4. Assemble final Integrated Paragraph
  let finalPrompt = `${opening}${charactersPart ? `${charactersPart} ` : ''}${subject.trim()}`

  // v18.4: Legacy Style DNA Injection removed, now handled by styleFingerprint in getEnrichedImagePrompt

  if (!finalPrompt.endsWith('.')) finalPrompt += '.'

  if (bridge || decor || artDir) {
    finalPrompt += ` ${[bridge, decor, artDir].filter(Boolean).join(' ')}`
  }

  // 4. Identity Locking (Character & Asset Anchor Engine)
  finalPrompt = applyVisualAnchors(
    finalPrompt,
    { character: characterRegistry, asset: assetRegistry },
    ctx.hasReferenceImages
  )

  // 5. Visual Consistency Engine (Technical suffix stays separate as it is a guide)
  if (ctx.visualRegistry) {
    const consistency = buildConsistencyPrompt(ctx.visualRegistry, scene, ctx.language)
    if (consistency) finalPrompt += ` ${consistency}`
  }

  // v19.0: VisualDNA & Style Fingerprint Injection
  const spec = (ctx as any).spec || (ctx as any).videoTypeSpecification
  finalPrompt = VisualDNAManager.inject(finalPrompt, scene, characterRegistry, locationRegistry, spec)

  // Sanitize
  finalPrompt = sanitizeInactiveCharacters(finalPrompt, activeCharacters as Set<string>, characterRegistry)

  // ─── Build reference images ──────────────────────────────────────────────────

  const allReferenceImages: (string | { name?: string; data: string })[] = []
  const characterSheets: { name: string; appearance: { description: string }; role: string }[] = []

  const { updatedReferenceImageUrl: referenceImageUrl } = buildContinuityBridge(
    ctx,
    isFirstScene,
    sequelBridgeUrl,
    previousScene,
    ctx.language
  )

  if (referenceImageUrl) allReferenceImages.push(referenceImageUrl)

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

  const lowerPrompt = finalPrompt.toLowerCase()
  for (const name of Object.keys(assetRegistry)) {
    if (lowerPrompt.includes(name.toLowerCase())) {
      const asset = findInRegistry(assetRegistry, name) as any
      if (asset?.thumbnailUrl) allReferenceImages.push({ name, data: asset.thumbnailUrl })
    }
  }

  const locationMasterUrl = effectiveLocationId
    ? (findInRegistry(locationRegistry, effectiveLocationId) as any)?.thumbnailUrl
    : undefined
  if (locationMasterUrl) {
    // [V19.1] PERSISTENT BACKGROUND: Always include the location reference to prevent drift,
    // even if we have a continuity bridge image.
    const hasBridge = !!referenceImageUrl
    allReferenceImages.push({
      name: hasBridge ? 'Original Location Reference' : 'Location Reference',
      data: locationMasterUrl
    })
  }

  return {
    sceneId: scene.id,
    prompt: finalPrompt,
    referenceImage: referenceImageUrl,
    referenceImages: allReferenceImages,
    characterSheets,
    reuseReferenceImage: !!sequelBridgeUrl
  }
}
