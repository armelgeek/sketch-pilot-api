import type { EnrichedScene, VideoGenerationOptions } from '../../types/video-script.types'
import { StandaloneVideoGenerator } from './standalone-video-generator'
import type { VideoGeneratorConfig } from './video-generator.abstract'

/**
 * QuotesVideoGenerator
 *
 * Specialized generator for philosophical, motivational, or wisdom-based content (e.g., Stoicism).
 * Focuses on high-impact visuals (marble statues, moody lighting) and authoritative narration.
 */
export class QuotesVideoGenerator extends StandaloneVideoGenerator {
  protected override readonly cameraActions: string[] = [
    'zoom-in',
    'zoom-out',
    'pan-right',
    'pan-left',
    'pan-up',
    'pan-down',
    'breathing'
  ] // No snap-zoom to keep it heavy/moody
  protected override readonly transitionTypes: string[] = [
    'fade',
    'dissolve',
    'fade-black',
    'blur',
    'crossfade',
    'distance'
  ] // Avoid snappy/glitchy ones

  constructor(config: VideoGeneratorConfig = {}) {
    super(config)
  }

  public override getType(): string {
    return 'quotes'
  }

  protected getDefaultOutputFormat(): string {
    return `
{
  "titles": ["Sagesse Stoïcienne", "Leçons de Marc Aurèle"],
  "fullNarration": "Le bloc complet de sagesse...",
  "scenes": [
    {
      "id": "scene-1",
      "sceneNumber": 1,
      "summary": "Introduction philosophique",
      "narration": "Texte de la citation...",
      "locationId": "temple-grec",
      "persistentDecorTokens": ["buste en marbre", "lumière tamisée"],
      "imagePrompt": "Buste en marbre de Marc Aurèle, éclairage cinématique Chiaroscuro",
      "animationPrompt": "Légère rotation de caméra, fumée mystérieuse en arrière-plan",
      "cameraAction": "zoom-in",
      "preset": "hook",
      "transition": "fade-black"
    }
  ],
  "quotesMetadata": {
    "author": "Marc Aurèle",
    "philosophicalSchool": "Stoïcisme",
    "visualVibe": "Cinematic, Moody, Marble, Dark Academia"
  }
}`.trim()
  }

  public async buildScriptGenerationPrompts(
    topic: string,
    options: VideoGenerationOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    const targetWords = Math.round(
      this.getEffectiveDuration(options) * this.getWordsPerSecond(options) * this.getSafetyFactor(options)
    )
    const spec = this.getEffectiveSpec(options)

    const quoteSpec = {
      ...spec,
      role: 'Mentor et Philosophe expert en Sagesse',
      task: `Écrire une vidéo de sagesse captivante sur : ${topic}.`,
      instructions: [
        ...(spec.instructions || []),
        'Utilisez un ton grave, puissant et autoritaire.',
        'Découpez la pensée en segments respiratoires profonds.',
        'IMPORTANT: La narration doit être fluide et percutante pour un format type TikTok/Reels de motivation.'
      ]
    }

    return {
      systemPrompt: this.buildSystemInstructions(quoteSpec as any),
      userPrompt: this.buildUserData(
        {
          subject: topic,
          targetWordCount: targetWords,
          duration: options.duration,
          aspectRatio: options.aspectRatio,
          language: options.language
        },
        quoteSpec as any
      )
    }
  }

  public async buildImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages?: boolean,
    aspectRatio?: string
  ): Promise<any> {
    // Enforce the Stoic/Marble aesthetic even if the LLM didn't mention it
    const marblePrefix = hasReferenceImages
      ? 'Subject from reference, '
      : 'White marble statue bust, ancient Greek style, '

    const marbleSuffix = hasReferenceImages
      ? ', maintain style and color from reference.'
      : ', cinematic lighting, dark moody background, high contrast, extreme detail, 8k.'

    return {
      sceneId: scene.id,
      prompt: `${marblePrefix}${scene.imagePrompt || ''}${marbleSuffix}`
    }
  }

  public async buildImageSystemInstruction(hasReferenceImages: boolean): Promise<string> {
    return this.buildImageGenerationInstructions(hasReferenceImages, {
      styleAnchor:
        "Esthétique Cinematic Dark Academia. Focus sur les textures de marbre, l'éclairage chiaroscuro (contraste extrême)."
    })
  }

  public async buildThumbnailPrompt(title: string): Promise<string> {
    return `Vignette Stoïcienne puissante : Statue de marbre d'un philosophe, yeux brillants ou fissures dorées, fond sombre, texte dramatique 'SAGESSE'.`
  }
}
