import * as path from 'node:path'
import * as url from 'node:url'
import { config } from 'dotenv'
import { ElevenLabsService } from '../services/audio/elevenlabs.service'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
config({ path: path.resolve(__dirname, '../../../../.env') })

async function main() {
  console.log('Testing ElevenLabs Audio Generation...')
  console.log('API Key configured:', process.env.ELEVENLABS_API_KEY ? 'YES' : 'NO')

  try {
    const service = new ElevenLabsService(process.env.ELEVENLABS_API_KEY)

    // Un petit texte pour tester la voix
    const text =
      "Bonjour ! Ceci est un test de génération vocale pour valider l'intégration de l'API ElevenLabs avec notre nouveau système sans configuration imposée."
    const outputPath = path.resolve(__dirname, '../../../../.tmp_test_audio/test_elevenlabs.mp3')

    console.log('Generating audio to', outputPath)

    const result = await service.generateSpeech(text, outputPath)
    console.log('Success! Result payload:')
    console.log(result)
  } catch (error) {
    console.error('Failed!', error)
  }
}

main()
