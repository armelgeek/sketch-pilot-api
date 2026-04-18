import type { ImageService } from '../../services/image'

export interface PortraitOutput {
  front: string
  side: string
  back: string
}

export class VimaxCharacterPortraitGenerator {
  constructor(private imageService: ImageService) {}

  /**
   * Generates a complete 3-view character sheet.
   */
  async generateModelSheet(
    name: string,
    description: string,
    style: string,
    onProgress?: (status: string) => void,
    cameoPhotoUrl?: string // [V52]
  ): Promise<PortraitOutput> {
    let frontPath: string

    if (cameoPhotoUrl) {
      if (onProgress) onProgress(`AutoCameo : Utilisation de la photo fournie pour ${name}...`)
      frontPath = cameoPhotoUrl
    } else {
      const frontPrompt = `Full-body, front-view portrait of character ${name}. ${description}. Style: ${style}. Pure white background, centered, full frame, gazing straight ahead, arms at sides.`
      if (onProgress) onProgress(`Génération du portrait de face pour ${name}...`)
      frontPath = await this.imageService.generateImage(frontPrompt, `characters/${name}/front.webp`, {
        format: 'webp',
        aspectRatio: '1:1'
      })
    }

    const sidePrompt = `Full-body, side-view portrait of character ${name}. Facing left, arms at sides, pure white background. Must match the reference image exactly.`
    if (onProgress) onProgress(`Génération du portrait de profil pour ${name}...`)
    const sidePath = await this.imageService.generateImage(sidePrompt, `characters/${name}/side.webp`, {
      format: 'webp',
      aspectRatio: '1:1',
      referenceImages: [{ name: 'front', data: frontPath }]
    })

    const backPrompt = `Full-body, back-view portrait of character ${name}. Pure white background, arms at sides. No facial features visible. Must match the reference image exactly.`
    if (onProgress) onProgress(`Génération du portrait de dos pour ${name}...`)
    const backPath = await this.imageService.generateImage(backPrompt, `characters/${name}/back.webp`, {
      format: 'webp',
      aspectRatio: '1:1',
      referenceImages: [{ name: 'front', data: frontPath }]
    })

    return {
      front: frontPath,
      side: sidePath,
      back: backPath
    }
  }
}
