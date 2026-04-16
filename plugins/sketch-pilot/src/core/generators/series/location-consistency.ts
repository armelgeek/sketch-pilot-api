import type { VisualRegistry } from './visual-registry'

export function registerLocationVisual(registry: VisualRegistry, id: string, description: string, decor: string[]) {
  registry.locations[id] = {
    id,
    basePrompt: description,
    atmosphere: description,
    decorTokens: decor
  }
}

export function buildLocationPrompt(registry: VisualRegistry, locationId: string) {
  const loc = registry.locations[locationId]
  if (!loc) return 'unknown location'

  return `
${loc.atmosphere},
${loc.decorTokens.join(', ')}
`.trim()
}
