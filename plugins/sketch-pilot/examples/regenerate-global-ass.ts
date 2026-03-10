import * as fs from 'node:fs'
import * as path from 'node:path'
import { AssCaptionService } from '../src/services/video/ass-caption.service'
import type { WordTiming } from '../src/services/audio'

async function main() {
  const projectDir = process.argv[2]
  if (!projectDir) {
    console.error('Usage: ts-node examples/regenerate-global-ass.ts <project-dir>')
    process.exit(1)
  }

  const scriptPath = path.join(projectDir, 'script.json')
  if (!fs.existsSync(scriptPath)) {
    console.error('script.json missing in:', projectDir)
    process.exit(1)
  }

  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'))
  const allWordTimings: WordTiming[] = []

  // Collect all word timings from all scenes
  const scenesDir = path.join(projectDir, 'scenes')
  for (const scene of script.scenes) {
    const manifestPath = path.join(scenesDir, scene.id, 'manifest.json')
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (manifest.wordTimings) {
        allWordTimings.push(...manifest.wordTimings)
      }
    }
  }

  if (allWordTimings.length === 0) {
    console.error('No word timings found in manifests.')
    process.exit(1)
  }

  // Determine dimensions from script or default
  const aspectRatio = script.aspectRatio || '16:9'
  const dimensions = aspectRatio === '9:16' ? [720, 1280] : aspectRatio === '1:1' ? [1080, 1080] : [1280, 720]

  // Get caption options from script if any
  const options = script.assCaptions || {
    enabled: true,
    style: 'colored',
    fontSize: 32,
    primaryColor: '&H00FFFF&', // Yellow
    outlineColor: '&H000000&',
    backColor: '&H000000&',
    bold: true,
    position: 'bottom'
  }

  console.log(`Regenerating global ASS for ${aspectRatio} resolution: ${dimensions[0]}x${dimensions[1]}`)
  const assService = new AssCaptionService(dimensions[0], dimensions[1], options)
  const assContent = assService.buildASSFile(allWordTimings)

  const outputPath = path.join(projectDir, 'global_subtitles.ass')
  fs.writeFileSync(outputPath, assContent)

  console.log(`Global ASS regenerated successfully: ${outputPath}`)
}

main().catch(console.error)
