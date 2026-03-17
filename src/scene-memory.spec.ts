import { describe, it, expect } from 'vitest'
import { SceneMemoryBuilder } from '@sketch-pilot/core/scene-memory'
import type { SceneMemory, SceneMemoryInput } from '@sketch-pilot/core/scene-memory'
import type { CompleteVideoScript } from '@sketch-pilot/types/video-script.types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScene(overrides: Partial<SceneMemoryInput> = {}): SceneMemoryInput {
  return {
    id: 'scene-1',
    expression: 'neutral',
    characterIds: [],
    props: [],
    ...overrides
  }
}

// ─── SceneMemoryBuilder ───────────────────────────────────────────────────────

describe('SceneMemoryBuilder', () => {
  const builder = new SceneMemoryBuilder()

  it('returns empty memory for an empty scene array', () => {
    const memory = builder.build([])
    expect(memory.locations.size).toBe(0)
    expect(memory.characters.size).toBe(0)
    expect(memory.timeOfDay).toBe('')
    expect(memory.weather).toBe('')
  })

  // ── Location tracking ───────────────────────────────────────────────────

  it('registers a new location when locationId appears for the first time', () => {
    const scene = makeScene({
      locationId: 'train-station',
      background: 'Paris train station, stone arches, glass roof'
    })
    const memory = builder.build([scene])
    expect(memory.locations.has('train-station')).toBe(true)
    expect(memory.locations.get('train-station')!.prompt).toBe('Paris train station, stone arches, glass roof')
    expect(memory.locations.get('train-station')!.referenceImageId).toBe('scene-1')
  })

  it('preserves the first location prompt when the same locationId appears again', () => {
    const scene1 = makeScene({
      id: 'scene-1',
      locationId: 'office',
      background: 'Modern open-plan office, white walls, standing desks'
    })
    const scene2 = makeScene({
      id: 'scene-5',
      locationId: 'office',
      background: 'Different office description that should be ignored'
    })
    const memory = builder.build([scene1, scene2])
    expect(memory.locations.get('office')!.prompt).toBe('Modern open-plan office, white walls, standing desks')
    expect(memory.locations.get('office')!.referenceImageId).toBe('scene-1')
  })

  it('does not register a location when background is missing', () => {
    const scene = makeScene({ locationId: 'cafe', background: undefined })
    const memory = builder.build([scene])
    expect(memory.locations.has('cafe')).toBe(false)
  })

  it('does not register a location when locationId is missing', () => {
    const scene = makeScene({ background: 'A sunny park' })
    const memory = builder.build([scene])
    expect(memory.locations.size).toBe(0)
  })

  // ── Character tracking ──────────────────────────────────────────────────

  it('registers a character on first appearance', () => {
    const scene = makeScene({
      characterIds: ['Alex'],
      props: ['backpack', 'laptop'],
      expression: 'focused'
    })
    const memory = builder.build([scene])
    expect(memory.characters.has('Alex')).toBe(true)
    expect(memory.characters.get('Alex')!.currentProps).toEqual(['backpack', 'laptop'])
    expect(memory.characters.get('Alex')!.currentEmotion).toBe('focused')
    expect(memory.characters.get('Alex')!.referenceImageId).toBe('scene-1')
  })

  it('updates character state on subsequent appearances', () => {
    const scene1 = makeScene({
      id: 'scene-1',
      characterIds: ['Alex'],
      props: ['backpack'],
      expression: 'excited'
    })
    const scene2 = makeScene({
      id: 'scene-3',
      characterIds: ['Alex'],
      props: ['backpack', 'coffee'],
      expression: 'relaxed'
    })
    const memory = builder.build([scene1, scene2])
    const alex = memory.characters.get('Alex')!
    expect(alex.currentProps).toEqual(['backpack', 'coffee'])
    expect(alex.currentEmotion).toBe('relaxed')
    // referenceImageId stays as the FIRST appearance
    expect(alex.referenceImageId).toBe('scene-1')
  })

  it('keeps existing props when a later scene has none', () => {
    const scene1 = makeScene({
      id: 'scene-1',
      characterIds: ['Sam'],
      props: ['umbrella'],
      expression: 'calm'
    })
    const scene2 = makeScene({
      id: 'scene-2',
      characterIds: ['Sam'],
      props: [],
      expression: 'happy'
    })
    const memory = builder.build([scene1, scene2])
    // Empty array in scene2 — existing props are NOT overwritten
    expect(memory.characters.get('Sam')!.currentProps).toEqual(['umbrella'])
    expect(memory.characters.get('Sam')!.currentEmotion).toBe('happy')
  })

  it('builds richer character description from CharacterSheets when a full script is passed', () => {
    const script: CompleteVideoScript = {
      titles: ['Test'],
      fullNarration: '',
      totalDuration: 20,
      sceneCount: 1,
      aspectRatio: '16:9',
      // Scenes in CompleteVideoScript require EnrichedScene; cast via `as any` since
      // this test is about character sheet lookup, not full scene shape.
      scenes: [makeScene({ id: 'scene-1', characterIds: ['CHAR-01'] })] as any,
      characterSheets: [
        {
          id: 'CHAR-01',
          name: 'Jordan',
          role: 'Protagonist',
          appearance: {
            description: 'Tall, athletic build',
            clothing: 'Blue hoodie',
            accessories: [],
            colorPalette: [],
            uniqueIdentifiers: []
          },
          expressions: ['happy', 'sad'],
          imagePrompt: ''
        }
      ]
    }
    const memory = builder.build(script)
    const char = memory.characters.get('CHAR-01')!
    expect(char.description).toContain('Jordan')
    expect(char.description).toContain('Tall, athletic build')
    expect(char.description).toContain('Blue hoodie')
  })

  // ── Temporal context ────────────────────────────────────────────────────

  it('extracts time-of-day from lighting description', () => {
    const cases: [string, string][] = [
      ['Warm morning sunlight through the window', 'morning'],
      ['Golden sunrise glow', 'morning'],
      ['Bright afternoon overhead light', 'afternoon'],
      ['Soft midday diffuse light', 'afternoon'],
      ['Orange evening sunset rays', 'evening'],
      ['Dusky low-angle lighting', 'evening'],
      ['Deep night ambient glow', 'night'],
      ['Midnight neon-lit alley', 'night']
    ]
    for (const [lighting, expected] of cases) {
      const memory = builder.build([makeScene({ lighting })])
      expect(memory.timeOfDay).toBe(expected)
    }
  })

  it('leaves timeOfDay empty when lighting has no recognised keyword', () => {
    const scene = makeScene({ lighting: 'Soft studio diffuse fill' })
    const memory = builder.build([scene])
    expect(memory.timeOfDay).toBe('')
  })

  it('only records the first time-of-day encountered', () => {
    const scene1 = makeScene({ id: 'scene-1', lighting: 'crisp morning light' })
    const scene2 = makeScene({ id: 'scene-2', lighting: 'deep night atmosphere' })
    const memory = builder.build([scene1, scene2])
    expect(memory.timeOfDay).toBe('morning')
  })

  it('extracts weather from background description', () => {
    const cases: [string, string][] = [
      ['Rainy street with puddles', 'rainy'],
      ['Snowy mountain backdrop', 'snowy'],
      ['A sunny clear sky plaza', 'sunny'],
      ['Cloudy urban rooftop', 'cloudy'],
      ['Foggy harbour at dusk', 'foggy']
    ]
    for (const [background, expected] of cases) {
      const memory = builder.build([makeScene({ background })])
      expect(memory.weather).toBe(expected)
    }
  })

  it('leaves weather empty when background has no recognised keyword', () => {
    const scene = makeScene({ background: 'A cosy living room interior' })
    const memory = builder.build([scene])
    expect(memory.weather).toBe('')
  })

  it('only records the first weather encountered', () => {
    const scene1 = makeScene({ id: 'scene-1', background: 'rainy cobblestone alley' })
    const scene2 = makeScene({ id: 'scene-2', background: 'sunny beach' })
    const memory = builder.build([scene1, scene2])
    expect(memory.weather).toBe('rainy')
  })

  // ── Multiple continuities ───────────────────────────────────────────────

  it('tracks multiple locations and characters simultaneously', () => {
    const scene1 = makeScene({ id: 's1', locationId: 'station', background: 'Train station', characterIds: ['Alice'], props: ['bag'] })
    const scene2 = makeScene({ id: 's2', locationId: 'cafe', background: 'Small cafe', characterIds: ['Bob'] })
    const scene3 = makeScene({ id: 's3', locationId: 'station', background: 'Different text', characterIds: ['Alice'], props: ['bag', 'ticket'] })
    const memory = builder.build([scene1, scene2, scene3])

    expect(memory.locations.get('station')!.prompt).toBe('Train station')
    expect(memory.locations.get('cafe')!.prompt).toBe('Small cafe')
    expect(memory.characters.get('Alice')!.currentProps).toEqual(['bag', 'ticket'])
    expect(memory.characters.get('Bob')).toBeDefined()
  })
})
