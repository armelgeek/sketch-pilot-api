import { z } from 'zod'
import type { LLMService } from '@/application/services/llm.service'

// --- Interfaces (Translated from Vimax Python) ---

export const cameraParentItemSchema = z.object({
  parentCamIdx: z
    .number()
    .nullable()
    .describe('The index of the parent camera. Set to null if the camera has no parent.'),
  parentShotIdx: z.number().nullable().describe('The index of the dependent shot in the parent camera.'),
  reason: z.string().describe('The reason for the selection of the parent camera.'),
  isParentFullyCoversChild: z
    .boolean()
    .nullable()
    .describe("Whether the parent camera fully covers the child camera's content."),
  missingInfo: z
    .string()
    .nullable()
    .describe('The missing elements in the child shot that are not covered by the parent shot.')
})

export type CameraParentItem = z.infer<typeof cameraParentItemSchema>

export interface VimaxShot {
  idx: number
  camIdx: number
  visualDesc: string
}

export interface VimaxCamera {
  idx: number
  activeShotIdxs: number[]
  parentCamIdx?: number | null
  parentShotIdx?: number | null
  reason?: string | null
  isParentFullyCoversChild?: boolean | null
  missingInfo?: string | null
}

// --- Prompts (Translated from Vimax Python) ---

const SYSTEM_PROMPT = `
[Role]
You are a professional video editing expert specializing in multi-camera shot analysis and scene structure modeling. 

[Task]
Analyze the input camera position data to construct a "camera position tree". 
This tree structure represents a relationship where a parent camera's content encompasses that of a child camera. 
Identify the parent camera for each camera position and determine the dependent shot indices.

[Guidelines]
- Content Inclusion Check: The parent camera should fully contain the child camera's content in certain shots.
- Transition Smoothness Priority: Larger shot size as parent camera is preferred (Wide -> Medium -> Close-up).
- Temporal Proximity: The parent shot index should be as close as possible to the child's first shot index.
- Only one camera can exist without a parent (the root).
- The first camera must be the root of the camera tree.

{format_instructions}
`

/**
 * VimaxCameraTreeDirector
 * Translated from agents/camera_image_generator.py
 */
export class VimaxCameraTreeDirector {
  constructor(private readonly llmService: LLMService) {}

  async constructCameraTree(cameras: VimaxCamera[], shotDescs: VimaxShot[]): Promise<VimaxCamera[]> {
    let cameraSeqStr = '<CAMERA_SEQ>\n'
    for (const cam of cameras) {
      cameraSeqStr += `<CAMERA_${cam.idx}>\n`
      for (const shotIdx of cam.activeShotIdxs) {
        cameraSeqStr += `Shot ${shotIdx}: ${shotDescs.find((s) => s.idx === shotIdx)?.visualDesc || ''}\n`
      }
      cameraSeqStr += `</CAMERA_${cam.idx}>\n`
    }
    cameraSeqStr += '</CAMERA_SEQ>'

    const systemPrompt = `${SYSTEM_PROMPT}\n\nYou must return a valid JSON object following this JSON Schema:
{
  "type": "object",
  "properties": {
    "cameraParentItems": {
      "type": "array",
      "items": { "type": ["object", "null"] }
    }
  }
}`

    const response = await this.llmService.generateContent(
      `<CAMERA_SEQ>\n${cameraSeqStr}\n</CAMERA_SEQ>`,
      systemPrompt,
      'application/json'
    )

    const parsed = JSON.parse(response)

    return cameras.map((cam, i) => {
      const item = parsed.cameraParentItems[i]
      if (item) {
        return {
          ...cam,
          parentCamIdx: item.parentCamIdx ?? item.parent_cam_idx,
          parentShotIdx: item.parentShotIdx ?? item.parent_shot_idx,
          reason: item.reason,
          isParentFullyCoversChild: item.isParentFullyCoversChild ?? item.is_parent_fully_covers_child,
          missingInfo: item.missingInfo ?? item.missing_info
        }
      }
      return cam
    })
  }
}
