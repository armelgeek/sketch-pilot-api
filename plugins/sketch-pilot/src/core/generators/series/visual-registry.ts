export type CharacterVisual = {
  id: string
  basePrompt: string
  appearance: string
  outfit: string
  uniqueTraits: string[]
}

export type LocationVisual = {
  id: string
  basePrompt: string
  atmosphere: string
  decorTokens: string[]
}

export type VisualStyle = {
  style: string
  lighting: string
  camera: string
  colorGrading: string
}

export type VisualRegistry = {
  characters: Record<string, CharacterVisual>
  locations: Record<string, LocationVisual>
  style: VisualStyle
}

// ─────────────────────────────
// INIT REGISTRY
// ─────────────────────────────

export function createVisualRegistry(): VisualRegistry {
  return {
    characters: {},
    locations: {},
    style: {
      style: 'cinematic realistic',
      lighting: 'soft dramatic lighting',
      camera: '35mm lens',
      colorGrading: 'moody contrast'
    }
  }
}
