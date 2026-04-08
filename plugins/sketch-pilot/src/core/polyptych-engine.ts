import * as fs from 'node:fs'
import * as path from 'node:path'
import sharp from 'sharp'
import type { ImageService } from '../services/image'
import type { EnrichedScene, VideoGenerationOptions } from '../types/video-script.types'

export interface PolyptychGroup {
  id: string
  scenes: EnrichedScene[]
  masterImagePath?: string
  compositePrompt: string
}

/**
 * PolyptychEngine handles the generation of single multi-panel images
 * and splitting them into individual scene assets.
 */
export class PolyptychEngine {
  constructor(private imageService: ImageService) {}

  /**
   * Process a group of scenes that share a polyptych image.
   * 1. Generate the master image (PNG lossless) if not already done.
   * 2. Split into panels via sharp (single encode, AVIF 4:4:4).
   * 3. Save each panel to the scene directory.
   */
  async processGroup(
    group: PolyptychGroup,
    outputBaseDir: string,
    options: VideoGenerationOptions,
    extra?: {
      referenceImages?: any[]
      systemInstruction?: string
      baseStyle?: string
    }
  ): Promise<void> {
    const { id } = group
    const scenes = [...group.scenes].sort((a, b) => (a.panelIndex ?? 0) - (b.panelIndex ?? 0))

    // Polyptych is only valid for exactly 4 scenes in a 2×2 grid.
    // For groups < 4, fall back to individual image generation per scene.
    if (scenes.length !== 4) {
      console.log(
        `[PolyptychEngine] ⚠️  Group ${id} has ${scenes.length} scene(s) — bypassing polyptych, generating individually.`
      )
      await this.processSoloScenes(scenes, outputBaseDir, options, extra)
      return
    }

    const compositePrompt = PolyptychEngine.buildCompositePrompt(scenes, extra?.baseStyle)
    const masterPath = path.join(outputBaseDir, `polyptych_${id}_master.png`)

    // 1. Generate 2×2 master image
    if (!fs.existsSync(masterPath)) {
      console.log(`[PolyptychEngine] 🎨 Generating 2×2 master for group ${id}...`)
      await this.imageService.generateImage(compositePrompt, masterPath, {
        aspectRatio: options.aspectRatio ?? '16:9',
        format: 'png',
        referenceImages: extra?.referenceImages,
        systemInstruction: extra?.systemInstruction
      })
    }

    // 2. Split master into 4 panels (2 cols × 2 rows)
    console.log(`[PolyptychEngine] ✂️  Splitting 2×2 master into 4 panels...`)
    await this.splitMaster(masterPath, scenes, outputBaseDir, options, { cols: 2, rows: 2 })
  }

  /**
   * Generates individual images for scenes that don't qualify for polyptych (count != 4).
   */
  private async processSoloScenes(
    scenes: EnrichedScene[],
    outputBaseDir: string,
    options: VideoGenerationOptions,
    extra?: { referenceImages?: any[]; systemInstruction?: string; baseStyle?: string }
  ): Promise<void> {
    for (const scene of scenes) {
      const sceneDir = path.join(outputBaseDir, scene.id)
      fs.mkdirSync(sceneDir, { recursive: true })
      const sceneImgPath = path.join(sceneDir, 'scene.avif')

      if (fs.existsSync(sceneImgPath)) {
        console.log(`[PolyptychEngine] ⏭️  Solo scene already exists: ${scene.id}`)
        scene.imageUrl = sceneImgPath
        continue
      }

      console.log(`[PolyptychEngine] 🎨 Generating solo image for scene ${scene.id}...`)
      const prompt = scene.imagePrompt ?? 'A clean professional illustration'
      const tmpPng = path.join(outputBaseDir, `solo_${scene.id}.png`)

      await this.imageService.generateImage(prompt, tmpPng, {
        aspectRatio: options.aspectRatio ?? '16:9',
        format: 'png',
        referenceImages: extra?.referenceImages,
        systemInstruction: extra?.systemInstruction
      })

      // Convert PNG → WebP with same quality settings as panel splits
      const [targetW, targetH] = options.aspectRatio === '9:16' ? [720, 1280] : [1280, 720]
      await this.encodePanel(tmpPng, sceneImgPath, targetW, targetH)
      fs.unlinkSync(tmpPng)

      scene.imageUrl = sceneImgPath
      console.log(`[PolyptychEngine] ✅ Solo scene → ${scene.id}`)
    }
  }

  /**
   * Splits a master PNG into panels and saves each as scene.avif.
   */
  private async splitMaster(
    masterPath: string,
    scenes: EnrichedScene[],
    outputBaseDir: string,
    options: VideoGenerationOptions,
    grid: { cols: number; rows: number }
  ): Promise<void> {
    const { cols, rows } = grid
    const metadata = await sharp(masterPath).metadata()
    const masterWidth = metadata.width ?? 2048
    const masterHeight = metadata.height ?? 1152
    const [targetW, targetH] = options.aspectRatio === '9:16' ? [720, 1280] : [1280, 720]

    // Base panel size — last col/row gets the remainder to avoid pixel leaks
    const basePanelW = Math.floor(masterWidth / cols)
    const basePanelH = Math.floor(masterHeight / rows)

    for (const [i, scene] of scenes.entries()) {
      const sceneDir = path.join(outputBaseDir, scene.id)
      fs.mkdirSync(sceneDir, { recursive: true })

      const col = i % cols
      const row = Math.floor(i / cols)

      // Last col/row absorbs remainder pixels
      const panelW = col === cols - 1 ? masterWidth - col * basePanelW : basePanelW
      const panelH = row === rows - 1 ? masterHeight - row * basePanelH : basePanelH

      const tmpPanel = path.join(outputBaseDir, `panel_${i}_tmp.png`)
      await sharp(masterPath)
        .extract({ left: col * basePanelW, top: row * basePanelH, width: panelW, height: panelH })
        .png()
        .toFile(tmpPanel)

      const sceneImgPath = path.join(sceneDir, 'scene.avif')
      await this.encodePanel(tmpPanel, sceneImgPath, targetW, targetH)
      fs.unlinkSync(tmpPanel)

      scene.imageUrl = sceneImgPath
      console.log(`[PolyptychEngine] ✅ Panel ${i} (col=${col}, row=${row}) → ${scene.id}`)
    }
  }

  /**
   * Encodes a source PNG to AVIF at the exact target dimensions.
   * Uses lanczos3 downscale + centered white padding — no distortion, no halos.
   * AVIF 4:4:4 at quality 70 ≈ WebP 92 in file size, better fidelity on line art.
   */
  private async encodePanel(src: string, dest: string, targetW: number, targetH: number): Promise<void> {
    await sharp(src)
      .removeAlpha()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({
        width: targetW,
        height: targetH,
        fit: 'contain',
        kernel: 'lanczos3',
        background: { r: 255, g: 255, b: 255 }
      })
      .avif({ quality: 70, effort: 6, chromaSubsampling: '4:4:4' })
      .toFile(dest)
  }

  /**
   * Automatically groups scenes into batches of 4 for polyptych generation.
   * Only groups scenes that don't have an image path yet and aren't already grouped.
   */
  static autoGroup(scenes: any[]): any[] {
    // Collect eligible scenes (no existing image, no manual group)
    const eligible = scenes.filter((s) => !s.imagePath && !s.polyptychGroupId)

    // Only form complete groups of 4 — remainder scenes stay ungrouped (→ solo path)
    const completeGroups = Math.floor(eligible.length / 4)
    const groupableCount = completeGroups * 4

    let groupId = `auto_${Date.now()}`
    let counter = 0

    for (const [i, element] of eligible.entries()) {
      if (i >= groupableCount) break // remainder scenes: leave ungrouped

      element.polyptychGroupId = groupId
      element.panelIndex = counter

      counter++
      if (counter >= 4) {
        counter = 0
        groupId = `auto_${Date.now()}_${i}`
      }
    }

    return scenes
  }

  /**
   * Groups scenes by their polyptychGroupId.
   */
  static groupScenes(scenes: any[]): PolyptychGroup[] {
    const groupsMap = new Map<string, any[]>()

    for (const scene of scenes) {
      if (scene.polyptychGroupId) {
        const group = groupsMap.get(scene.polyptychGroupId) ?? []
        group.push(scene)
        groupsMap.set(scene.polyptychGroupId, group)
      }
    }

    return Array.from(groupsMap.entries()).map(([id, groupScenes]) => {
      const sorted = [...groupScenes].sort((a, b) => (a.panelIndex ?? 0) - (b.panelIndex ?? 0))

      // IF the group is an auto-group, build a composite prompt from individual prompts
      let compositePrompt = sorted[0].polyptychPrompt ?? ''
      if (id.startsWith('auto_')) {
        compositePrompt = this.buildCompositePrompt(sorted)
      }

      return {
        id,
        scenes: sorted,
        compositePrompt
      }
    })
  }

  /**
   * Builds a composite image prompt adapted to the actual number of scenes and grid layout.
   */
  /**
   * Builds a 2×2 composite prompt. Only called for groups of exactly 4 scenes.
   */
  private static buildCompositePrompt(scenes: any[], baseStyle?: string): string {
    const firstPrompt = scenes[0]?.imagePrompt ?? ''
    const colonIdx = firstPrompt.indexOf(':')
    const extractedStyle = colonIdx > 0 ? firstPrompt.slice(0, colonIdx).trim() : 'Clean professional illustration'

    const effectiveStyle =
      baseStyle ?? `${extractedStyle}, minimalist hand-drawn stick figure, thick uniform black outlines, no shading`

    const positions = ['TOP-LEFT', 'TOP-RIGHT', 'BOTTOM-LEFT', 'BOTTOM-RIGHT']

    let prompt =
      `A single illustration with 4 scenes in a 2×2 grid, on a seamless white canvas. ` +
      `Style: ${effectiveStyle}. ` +
      `No borders, frames, dividing lines, or boxes between scenes. ` +
      `Each scene occupies its area organically. Wide shots with clear breathing room around subjects.\n\n`

    for (let i = 0; i < 4; i++) {
      const rawPrompt = scenes[i]?.imagePrompt ?? 'A stickman activity'
      const cleanPrompt = rawPrompt
        .replace(/^.{0,40}?:\s*/, '')
        .replace(/[.!?]+$/, '')
        .trim()
      prompt += `${i + 1}. ${positions[i]}: ${cleanPrompt}.\n`
    }

    prompt += `\nEach scene centered in its quadrant. No decorative borders or separators.`
    return prompt
  }
}
