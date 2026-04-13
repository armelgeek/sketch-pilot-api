import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { SeriesVideoGenerator } from '../../plugins/sketch-pilot/src/core/generators/series-video-generator'
import 'dotenv/config'

async function robustFetch(url: string, body: any, apiKey: string, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000) // 180s timeout for complex saga generation
      })
      const data = (await resp.json()) as any
      if (data.error) throw new Error(JSON.stringify(data.error))
      return data
    } catch (error) {
      console.warn(`⚠️ Fetch failed (Attempt ${i + 1}/${retries}): ${error}`)
      if (i === retries - 1) throw error
      await new Promise((r) => setTimeout(r, 5000 * (i + 1))) // Longer backoff
    }
  }
}

async function runMarathonSagaV3() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return

  const seriesId = `chronos-breach-v3-${Date.now()}`
  const totalArcs = 10
  const epsPerArc = 2
  const dir = path.join(process.cwd(), 'storage', 'narrations', seriesId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const checkpointPath = path.join(dir, 'checkpoint.json')
  let context: any
  let startArc = 1
  let startEp = 1

  if (fs.existsSync(checkpointPath)) {
    console.info('🔄 RESUMING FROM CHECKPOINT...')
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
    context = checkpoint.context
    startArc = checkpoint.nextArc
    startEp = checkpoint.nextEp
  } else {
    // BIBLE INITIALE
    context = {
      seriesId,
      episodeNumber: 1,
      totalEpisodes: totalArcs * epsPerArc,
      characterRegistry: {
        '@Vance': {
          description: 'Un détective en trench-coat avec un bras cybernétique.',
          backstory: 'Ancien flic de la Chrono-Police.',
          personalGoal: 'Fermer la Brèche qui a tué son partenaire.',
          motivation: 'Justice.',
          fate: 'ALIVE'
        },
        '@Maya': {
          description: "Une prodige de l'informatique quantique.",
          backstory: 'Créatrice accidentelle de la première fuite temporelle.',
          personalGoal: 'Réparer ses erreurs.',
          motivation: 'Culpabilité.',
          status: 'alive'
        },
        '@Alexandre': {
          description: 'Ancien partenaire de Vance, détective chevronné.',
          status: 'dead',
          deathEpisode: 0,
          backstory: 'Disparu lors de la première Brèche de Chronos.'
        }
      },
      locationRegistry: {
        'neo-noir-city': { description: 'Une métropole pluvieuse et cyberpunk.' }
      },
      assetRegistry: {
        '@Le_Chronomètre': { description: 'Appareil de stabilisation du temps.', type: 'artifact' }
      },
      globalContext: 'La Brèche de Chronos mélange les époques. Cyberpunk et Noir 1920.',
      roadmap: {
        majorBeats: ['Saut', 'Trahison', 'Suture'],
        unresolvedStakes: ['La réalité'],
        genreConstraints: { technologyLevel: 'Hybride', magicLevel: 'None', forbiddenElements: [] }
      }
    }
  }

  const arcTitles = [
    'Fuite',
    'Assassin',
    'Gearbox',
    'Club',
    'Paradoxe',
    'Boucle',
    'Ruines',
    'Invasion',
    'Miroir',
    'Suture'
  ]

  for (let arc = startArc; arc <= totalArcs; arc++) {
    for (let ep = arc === startArc ? startEp : 1; ep <= epsPerArc; ep++) {
      const globalEp = (arc - 1) * epsPerArc + ep
      console.info(`🎬 ARC ${arc} EPISODE ${ep} (Global ${globalEp}/20)...`)

      context.episodeNumber = globalEp
      context.isFirstEpisode = globalEp === 1
      context.isFinalEpisode = globalEp === 20

      const generator = new (SeriesVideoGenerator as any)(
        {
          apiKey,
          model: 'gpt-4o-mini',
          scriptSpec: { instructions: ['Noir', 'Cyberpunk'], visualRules: [], orchestration: [] }
        },
        context
      )

      const topic = `ÉPISODE GLOBAL N°${globalEp} (Arc ${arc}: ${arcTitles[arc - 1]}, Épisode ${ep}/2). Focus sur Vance et Maya. ${ep === 1 ? 'Installation du mystère' : 'Action et cliffhanger'}.`

      // Pass 1: Generate Narration
      const p1 = generator.buildTwoPassPrompts(topic, { type: 'series', seriesId }, 350)
      const d1 = await robustFetch(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o', // Upgrading to gpt-4o for better logic in marathon
          messages: [
            { role: 'system', content: p1.pass1.system },
            { role: 'user', content: p1.pass1.user }
          ]
        },
        apiKey
      )
      const narration = d1.choices[0].message.content

      // Pass 2: Structuring & Metadata
      const p2 = generator.buildPass2Prompts(narration, topic, { type: 'series', seriesId, preset: 'spectacle' })
      const d2 = await robustFetch(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o', // Upgrading to gpt-4o for maximum structural reliability
          messages: [
            { role: 'system', content: p2.system },
            { role: 'user', content: p2.user }
          ],
          response_format: { type: 'json_object' }
        },
        apiKey
      )
      const scriptJson = d2.choices[0].message.content

      // Metadata Validation
      if (!scriptJson.includes('seriesMetadata')) {
        console.error(`❌ CRITICAL: Episode ${globalEp} missing seriesMetadata!`)
        // Force a retry or handle error
      }

      console.info(`✅ Episode ${globalEp} done.`)
      fs.writeFileSync(path.join(dir, `arc_${arc}_ep_${ep}_MARATHON.txt`), narration, 'utf8')
      fs.writeFileSync(path.join(dir, `arc_${arc}_ep_${ep}_METADATA.json`), scriptJson, 'utf8')

      // EVOLVE & CHECKPOINT
      context = (SeriesVideoGenerator as any).updateContext(context, JSON.parse(scriptJson))

      let nextArc = arc
      let nextEp = ep + 1
      if (nextEp > epsPerArc) {
        nextArc++
        nextEp = 1
      }

      fs.writeFileSync(checkpointPath, JSON.stringify({ context, nextArc, nextEp }), 'utf8')
    }
  }

  console.info(`\n🎊 MARATHON V3 COMPLETE: storage/narrations/${seriesId}`)
}

runMarathonSagaV3()
