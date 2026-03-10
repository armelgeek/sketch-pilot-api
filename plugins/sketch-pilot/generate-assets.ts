import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import sharp from 'sharp'
import { GeminiImageService } from './src/services/image/gemini-image.service'

dotenv.config()

const apiKey = process.env.GOOGLE_API_KEY
if (!apiKey) {
  console.error('GOOGLE_API_KEY not found in .env')
  process.exit(1)
}

const imageService = new GeminiImageService({
  provider: 'gemini',
  apiKey,
  styleSuffix:
    'Minimalist whiteboard animation style. Clean black ink strokes, hand-drawn sketch aesthetic on paper texture.',
  systemPrompt:
    'You are a professional whiteboard animation illustrator. Create high-quality, elegant, and clean black marker drawings. No text, no speech bubbles, no UI elements. High contrast.'
})

const BACKGROUNDS = [
  { id: 'OFFICE', prompt: 'A minimalist professional office space with a desk, computer monitor, and a simple lamp.' },
  { id: 'STREET', prompt: 'A quiet city street with a few stylized buildings, a lamppost, and a distant tree.' },
  { id: 'HOME', prompt: 'A cozy living room with a simple couch, a small coffee table, and a window.' },
  { id: 'BEDROOM', prompt: 'A sparse bedroom with a bed, a nightstand, and a simple window frame.' },
  { id: 'PARK', prompt: 'A park scene with a bench, a single elegant tree, and some grass tufts.' },
  { id: 'KITCHEN', prompt: 'A minimalist kitchen area with a counter, a sink, and a clean cabinets.' },
  { id: 'STUDIO', prompt: 'An artist studio or creative workspace with an easel and some boxes.' },
  { id: 'ABSTR-DARK', prompt: 'An abstract dark minimalist background with subtle geometric depth and high contrast.' },
  {
    id: 'ABSTR-LIGHT',
    prompt: 'An abstract light minimalist background with clean open space and subtle sketch lines.'
  },
  { id: 'CAFETERIA', prompt: 'A minimalist cafeteria or restaurant interior with a few tables and chairs.' }
]

const POSES = [
  { id: 'STAND', prompt: 'A single minimalist stickman character standing still, relaxed posture.' },
  { id: 'WALK', prompt: 'A single minimalist stickman character walking forward, mid-stride.' },
  { id: 'RUN', prompt: 'A single minimalist stickman character running fast, dynamic posture.' },
  { id: 'THINK', prompt: 'A single minimalist stickman character in a thinking pose, hand on chin.' },
  { id: 'POINT', prompt: 'A single minimalist stickman character pointing forward with one arm extended.' },
  { id: 'SAD', prompt: 'A single minimalist stickman character sitting or standing with head down, looking sad.' },
  { id: 'JUMP', prompt: 'A single minimalist stickman character jumping with joy, arms raised.' },
  { id: 'SIT', prompt: 'A single minimalist stickman character sitting on an invisible chair or ledge.' },
  { id: 'TYPE', prompt: 'A single minimalist stickman character typing on a laptop or keyboard, focused.' },
  { id: 'EXHAUSTED', prompt: 'A single minimalist stickman character slumped over, extremely tired or burnt out.' },
  { id: 'NOTEBOOK', prompt: 'A single minimalist stickman character writing in a small notebook.' },
  { id: 'PHONE', prompt: 'A single minimalist stickman character looking at a smartphone.' },
  {
    id: 'ANGRY',
    prompt: 'A single minimalist stickman character with clenched fists, looking aggressive or frustrated.'
  },
  { id: 'SHOCK', prompt: 'A single minimalist stickman character with arms out, looking surprised or shocked.' },
  { id: 'MEDITATE', prompt: 'A single minimalist stickman character sitting cross-legged, meditating in peace.' },
  { id: 'LOOK-BACK', prompt: 'A single minimalist stickman character looking back over their shoulder while walking.' },
  { id: 'CARRY-BOX', prompt: 'A single minimalist stickman character carrying a heavy cardboard moving box.' },
  { id: 'FALL', prompt: 'A single minimalist stickman character falling backwards or down, dynamic losing balance.' }
]

async function generateBackgrounds() {
  console.log('--- Generating Background Library ---')
  const outDir = path.join(process.cwd(), 'src/assets/backgrounds')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  for (const bg of BACKGROUNDS) {
    const targetPath = path.join(outDir, `${bg.id}.png`)
    if (fs.existsSync(targetPath)) {
      console.log(`Skipping ${bg.id}, already exists.`)
      continue
    }
    try {
      await imageService.generateImage(
        `${bg.prompt} Minimalist whiteboard drawing, black marker on white paper.`,
        targetPath,
        { aspectRatio: '16:9', format: 'png' }
      )
    } catch (error) {
      console.error(`Failed to generate background ${bg.id}:`, error)
    }
  }
}

async function generatePoses() {
  console.log('--- Generating Pose Library (with character model) ---')
  const outDir = path.join(process.cwd(), 'src/assets/stickmen')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const modelPath = path.join(process.cwd(), 'models/model.jpg')
  let referenceImages: string[] = []
  if (fs.existsSync(modelPath)) {
    const modelBuffer = fs.readFileSync(modelPath)
    referenceImages = [modelBuffer.toString('base64')]
    console.log('Using models/model.jpg as character reference.')
  }

  for (const pose of POSES) {
    const tempPath = path.join(outDir, `${pose.id}_temp.png`)
    const finalPath = path.join(outDir, `${pose.id}.png`)

    // We overwrite existing poses to ensure they match the model.jpg character
    try {
      // Generate on white background
      await imageService.generateImage(
        `${pose.prompt} Isolated on pure white background. Simple thick black strokes. No colors.`,
        tempPath,
        {
          aspectRatio: '1:1',
          format: 'png',
          removeBackground: true,
          referenceImages
        }
      )

      if (fs.existsSync(tempPath)) {
        console.log(`Making ${pose.id} transparent...`)
        // Use sharp to make white (or very near white) transparent
        // Since it's whiteboard ink (black) on white paper, thresholding works well.
        const buffer = fs.readFileSync(tempPath)
        const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]

          // If near white, make transparent
          if (r > 240 && g > 240 && b > 240) {
            data[i + 3] = 0
          }
        }

        await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
          .png()
          .toFile(finalPath)

        fs.unlinkSync(tempPath)
        console.log(`✅ ${pose.id} ready.`)
      }
    } catch (error) {
      console.error(`Failed to generate pose ${pose.id}:`, error)
    }
  }
}

async function main() {
  await generateBackgrounds()
  await generatePoses()
  console.log('--- All assets generated ---')
}

main().catch(console.error)
