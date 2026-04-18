import { z } from 'zod'

// ─── Primitives ───────────────────────────────────────────────────────────────

const CliffhangerTypeSchema = z.enum(['revelation', 'peril', 'choice', 'betrayal', 'unknown'])
const AtomTypeSchema = z.enum(['hook', 'build', 'pivot', 'reveal', 'close'])

export const AtomicFrameSchema = z.object({
  sceneNumber: z.number(),
  atomType: AtomTypeSchema.describe("Type intentionnel de l'atome (hook, build, pivot, reveal, close)"),
  narration: z.string().describe('Narration percutante et immersive pour ce segment'),
  visualPrompt: z.string().describe('Description visuelle riche et évocatrice (40-60 mots)'),
  locationId: z.string().describe('ID du lieu (ex: @Labo, @Cuisine)'),
  characters: z.array(z.string()).describe('Handles des personnages présents (ex: ["@Alexandre"])'),
  pacingHint: z.string().optional().describe('Indication de rythme (ex: lent, saccadé, crescendo)'),
  logicJustification: z.string().optional().describe('Justification du découpage (ex: Changement Lieu + Lumière)')
})

export const SequenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string().describe('Objectif de la séquence (ex: Le Problème, La Solution)'),
  atoms: z.array(AtomicFrameSchema).min(1)
})

export const SeriesArcSchema = z.object({
  seriesTitle: z.string(),
  globalSynopsis: z.string(),
  episodes: z
    .array(
      z.object({
        episodeNumber: z.number(),
        mainConflict: z.string(),
        keyPlotPoint: z.string(),
        cliffhangerIntent: z.string()
      })
    )
    .min(3),
  unresolvedThreads: z.array(z.string()).optional()
})

export const EpisodePlanSchema = z.object({
  episodeNumber: z.number(),
  title: z.string(),
  sections: z
    .array(
      z.object({
        title: z.string(),
        intent: z.string().describe('Intention narrative pour cette section'),
        estimatedAtoms: z.number().optional()
      })
    )
    .min(1),
  cliffhangerIntent: z.string().optional()
})

export const Pass1OutputSchema = z.object({
  sequences: z.array(SequenceSchema).min(1),
  analysis: z
    .object({
      thematicArch: z.string().optional(),
      visualVarietyScore: z.number().min(0).max(10).optional()
    })
    .optional()
})

const TypedCliffhangerSchema = z.object({
  type: CliffhangerTypeSchema,
  description: z.string().min(1),
  audienceQuestion: z.string().min(1)
})

const NarrativeThreadSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  status: z.enum(['open', 'partial', 'resolved', 'new']),
  description: z.string().default(''),
  lastUpdatedEpisode: z.number().optional(),
  mustResolveBy: z.number().optional(),
  resolutionSceneId: z.string().optional(),
  importance: z.number().min(1).max(10).optional(),
  maturity: z.number().min(0).max(100).optional()
})

// ─── Scene ────────────────────────────────────────────────────────────────────

const CameraActionSchema = z.object({
  type: z.enum([
    'none',
    'pan-left',
    'pan-right',
    'pan-up',
    'pan-down',
    'zoom-in',
    'zoom-out',
    'shake',
    'breathing',
    'snap-zoom',
    'dutch-tilt'
  ]),
  intensity: z.enum(['low', 'medium', 'high']).optional()
})

const CompositionSchema = z.object({
  shotType: z.enum(['CLOSEUP', 'MEDIUM', 'WIDE', 'ESTABLISHING', 'PANORAMIC', 'POV', 'OVERSHOULDER']).optional(),
  foregroundAnchor: z.string().optional(),
  lightingMood: z.string().optional(),
  focusTarget: z.string().optional(),
  layout: z.enum(['SINGLE', 'MONTAGE', 'SPLIT', 'DIAGONAL']).optional()
})

const TransitionSchema = z.enum([
  'none',
  'fade',
  'blur',
  'crossfade',
  'zoom-in',
  'zoom-out',
  'dissolve',
  'fade-black',
  'fade-white',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'circleopen',
  'circleclose',
  'pixelize',
  'radial',
  'smooth-left',
  'smooth-right',
  'smooth-up',
  'smooth-down',
  'squeezev',
  'squeezeh',
  'zoomin',
  'zoomout',
  'diagtl',
  'diagtr',
  'diagbl',
  'diagbr'
])

export const ActingSchema = z.object({
  physicalIntent: z.string().describe('Concrete physical action or intention'),
  microExpression: z.string().describe('Facial micro-expression'),
  energyLevel: z.enum(['low', 'medium', 'high', 'explosive']),
  bodyDynamics: z.enum(['stable', 'tension', 'unstable', 'release'])
})

export const MomentumSchema = z.object({
  type: z.enum(['increasing', 'unstable', 'breaking', 'release']),
  vector: z.enum(['forward', 'backward', 'locked'])
})

// ─── Layered Architecture v9.0 ───────────────────────────────────────────────

const SceneStoryLayerSchema = z.object({
  scenePurpose: z
    .string()
    .transform((val) => {
      const lower = val.toLowerCase()
      if (['reveal', 'escalate', 'misdirect', 'stabilize', 'collapse'].includes(lower)) return lower as any
      if (['build', 'tension', 'suspense'].includes(lower)) return 'escalate' as const
      if (['resolution', 'end', 'final'].includes(lower)) return 'stabilize' as const
      return 'reveal' as const
    })
    .describe('reveal | escalate | misdirect | stabilize | collapse'),
  sceneDelta: z.string().min(1).describe('New information or causal change introduced by this scene')
})

const SceneProjectionsLayerSchema = z.object({
  camera: z.array(CameraActionSchema).optional(),
  composition: CompositionSchema.optional(),
  pacing: z
    .union([z.number(), z.string()])
    .transform((val) => {
      if (typeof val === 'number') return Math.min(10, Math.max(1, val))
      return 5
    })
    .default(5),
  mood: z.string().optional(),
  characters: z
    .array(z.string())
    .default([])
    .describe('Handles of characters present in this scene (e.g. ["@Alexandre"])'),
  visualDescription: z.string().min(1).describe('Telegraphic description of the visual scene for the Render Layer'),
  tensionState: z
    .object({
      level: z.number().min(0).max(10),
      type: z.enum(['build', 'sustain', 'spike', 'release'])
    })
    .optional()
})

const SceneSimulationLayerSchema = z.object({
  charactersPatch: z
    .record(
      z.object({
        status: z.string().optional(),
        evolution: z.string().optional(),
        location: z.string().optional()
      })
    )
    .optional(),
  worldPatch: z
    .object({
      weather: z.string().optional(),
      time: z.string().optional(),
      locks: z.array(z.string()).optional()
    })
    .optional(),
  assetPatch: z.record(z.string()).optional()
})

export const SceneSchema = z.object({
  id: z.string(),
  sceneNumber: z.number(),
  sequenceId: z.string().optional().describe('ID grouping scenes into a continuous sequence'),
  sequenceProgress: z
    .number()
    .optional()
    .describe('Step number within the sequence (1: setup, 2: tension, 3: action, 4: emotion)'),
  shotType: z
    .enum(['CLOSEUP', 'EXTREME_CLOSEUP', 'MEDIUM', 'WIDE', 'ESTABLISHING', 'PANORAMIC', 'POV', 'OVERSHOULDER'])
    .optional(),

  // Story (Flattened)
  scenePurpose: z
    .union([z.string().min(1), z.object({ function: z.string() })])
    .describe(
      'Brief sentence explaining why this scene is necessary for the plot (reveal, escalate, setup, twist, etc.)'
    ),

  sceneDelta: z
    .union([
      z.string().min(1),
      z.object({
        newInformation: z.string().min(1),
        consequence: z.string().min(1)
      })
    ])
    .describe('New information or causal change introduced by this scene'),

  // Projections (Flattened)
  imagePrompt: z.string().min(1).describe('Telegraphic description of the visual scene'),
  charactersInScene: z
    .array(z.string())
    .default([])
    .describe('Handles of characters present in this scene (e.g. ["@Alexandre"])'),
  composition: CompositionSchema.optional(),
  cameraAction: z.array(CameraActionSchema).optional(),
  pacing: z
    .union([z.number(), z.string()])
    .transform((val) => {
      if (typeof val === 'number') return Math.min(10, Math.max(1, val))
      return 5
    })
    .default(5),
  tensionState: z
    .object({
      level: z.number().min(0).max(10),
      type: z.enum(['build', 'sustain', 'spike', 'release'])
    })
    .optional(),

  // v17.0 Living Engine
  acting: ActingSchema.optional(),
  momentum: MomentumSchema.optional(),

  // Simulation Update (Keep root but clean up)
  simulationPatch: SceneSimulationLayerSchema,

  // Script legacy
  narration: z.string().min(1),
  locationId: z.string().min(1),
  metadata: z.record(z.any()).optional(),

  // Runtime fields
  imageUrl: z.string().optional(),
  audioUrl: z.string().optional()
})

// ─── Series Metadata ──────────────────────────────────────────────────────────

export const ContinuityAnalysisSchema = z.object({
  soudureBrute: z.string().optional(),
  logicGap: z.string().optional(),
  threatVagueness: z.string().optional(),
  pacingIssue: z.string().optional(),
  assetFantome: z.string().optional(),
  filsMuets: z.array(z.string()).optional(),
  defects: z.array(z.string()).optional(),
  lastVisualBridge: z.string().optional(),
  promesseNonTenue: z.string().optional()
})

export const SeriesMetadataSchema = z.object({
  seriesNarrativeArc: z.string().optional().describe('Arc narratif global de la série (Passe 0)'),
  episodeSummary: z.string().default(''),
  cliffhanger: TypedCliffhangerSchema.optional(),
  characterContinuity: z
    .record(
      z.object({
        description: z.string().optional(),
        isNew: z.boolean().optional(),
        backstory: z.string().optional(),
        personalGoal: z.string().optional(),
        motivation: z.string().optional(),
        abilities: z.array(z.string()).optional(),
        knownFacts: z.array(z.string()).optional(),
        fate: z.string().optional(),
        status: z.enum(['alive', 'dead', 'missing', 'injured', 'captured', 'corrupted', 'unknown']).optional(),
        deathEpisode: z.number().optional()
      })
    )
    .optional(),
  locationContinuity: z
    .record(
      z.object({
        description: z.string().optional(),
        atmosphere: z.string().optional(),
        isNew: z.boolean().optional()
      })
    )
    .optional(),
  newCharacters: z.record(z.string()).optional(),
  newLocations: z.record(z.string()).optional(),
  newAssets: z.record(z.string()).optional(),
  characterEvolution: z.record(z.string()).optional(),
  assetEvolution: z.record(z.string()).optional(),
  visualEvolution: z.record(z.string()).optional(),
  relationshipMap: z.record(z.record(z.string())).optional(),
  nextEpisodeTease: z.string().optional(),
  unresolvedThreads: z.array(NarrativeThreadSchema).optional(),
  loreUpdates: z.array(z.string()).optional(),
  continuityAnalysis: ContinuityAnalysisSchema.optional(),
  roadmapUpdate: z.record(z.unknown()).optional(),
  // Final episode fields
  resolution: z.string().optional(),
  characterFinalState: z.record(z.string()).optional()
})

// ─── Full LLM Script Output ───────────────────────────────────────────────────

export const LLMScriptOutputSchema = z.object({
  seriesMetadata: SeriesMetadataSchema,
  titles: z
    .union([
      z.array(z.string()),
      z.string().transform((s) => [s]),
      z.record(z.string()).transform((r) => Object.values(r))
    ])
    .default([]),
  // REMOVED v19.0: fullNarration is now distributed across scenes
  scenes: z.array(SceneSchema).min(1, 'At least one scene is required')
})

export type LLMScriptOutput = z.infer<typeof LLMScriptOutputSchema>
export type SceneData = z.infer<typeof SceneSchema>
export type SeriesMetadataData = z.infer<typeof SeriesMetadataSchema>
export type NarrativeThreadData = z.infer<typeof NarrativeThreadSchema>

// ─── Validation Helper ────────────────────────────────────────────────────────

export interface ValidationResult {
  success: true
  data: LLMScriptOutput
  warnings: string[]
}

export interface ValidationError {
  success: false
  error: string
  issues: { path: string; message: string }[]
  raw: unknown
}

/**
 * Parse and validate raw LLM JSON output.
 * Returns a typed result with warnings for non-blocking issues.
 *
 * Usage:
 *   const result = validateLLMOutput(rawJson)
 *   if (!result.success) throw new Error(result.error)
 *   const { data, warnings } = result
 */
export function validateLLMOutput(raw: unknown): ValidationResult | ValidationError {
  // Strip markdown fences if present (common LLM artifact)
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const clean = raw
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim()
    try {
      parsed = JSON.parse(clean)
    } catch {
      return {
        success: false,
        error: 'Failed to parse LLM output as JSON',
        issues: [{ path: 'root', message: 'Invalid JSON string' }],
        raw
      }
    }
  }

  const result = LLMScriptOutputSchema.safeParse(parsed)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }))

    return {
      success: false,
      error: `LLM output validation failed: ${issues.map((i) => `[${i.path}] ${i.message}`).join('; ')}`,
      issues,
      raw: parsed
    }
  }

  // Non-blocking warnings
  const warnings: string[] = []
  const data = result.data

  if (!data.seriesMetadata) {
    warnings.push('[validateLLMOutput] seriesMetadata is missing — context update will be skipped')
  }

  if (data.scenes.length < 3) {
    warnings.push(`[validateLLMOutput] Only ${data.scenes.length} scene(s) — episode may be too short`)
  }

  const scenesWithoutLocation = data.scenes.filter((s) => !s.locationId)
  if (scenesWithoutLocation.length > 0) {
    warnings.push(
      `[validateLLMOutput] ${scenesWithoutLocation.length} scene(s) missing locationId: ${scenesWithoutLocation.map((s) => s.id).join(', ')}`
    )
  }

  const scenesWithoutNarration = data.scenes.filter((s) => !s.narration.trim())
  if (scenesWithoutNarration.length > 0) {
    warnings.push(
      `[validateLLMOutput] ${scenesWithoutNarration.length} scene(s) with empty narration: ${scenesWithoutNarration.map((s) => s.id).join(', ')}`
    )
  }

  return { success: true, data, warnings }
}
