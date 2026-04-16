import type { VisualRegistry } from './visual-registry'

export function registerCharacterVisual(registry: VisualRegistry, name: string, description: string) {
  registry.characters[name] = {
    id: name,
    basePrompt: description,
    appearance: description,
    outfit: 'same outfit',
    uniqueTraits: []
  }
}

export function buildCharacterPrompt(registry: VisualRegistry, character: string) {
  const char = registry.characters[character]
  if (!char) return 'UNKNOWN_ENTITY'

  return `
${char.appearance},
${char.outfit},
${char.uniqueTraits.join(', ')}
`.trim()
}
