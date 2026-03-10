import { detectAndTrimSilence } from './src/utils/audio-trimmer'

async function main() {
  const input =
    '/home/armel/dev/griboo/sketch-pilot/output/video-1772366573347-zgobhb/scenes/scene-5-47voaxy/narration.mp3'
  const output =
    '/home/armel/dev/griboo/sketch-pilot/output/video-1772366573347-zgobhb/scenes/scene-5-47voaxy/narration_trimmed.mp3'
  console.log('Trimming...')
  const res = await detectAndTrimSilence(input, output, '-45dB', '0.05')
  console.log('Result:', res)
}
main()
