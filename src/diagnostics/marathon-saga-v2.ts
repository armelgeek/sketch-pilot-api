import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { SeriesVideoGenerator } from '../../plugins/sketch-pilot/src/core/generators/series-video-generator'
import 'dotenv/config'

async function runMarathonSagaV2() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return

  const seriesId = `chronos-breach-v2-${Date.now()}`
  const totalArcs = 10
  const epsPerArc = 2

  // BIBLE INITIALE
  let context: any = {
    seriesId,
    episodeNumber: 1,
    totalEpisodes: totalArcs * epsPerArc,
    characterRegistry: {
      '@Vance': {
        description: 'Un détective en trench-coat avec un bras cybernétique.',
        backstory: 'Ancien flic de la Chrono-Police.',
        personalGoal: 'Fermer la Brèche qui a tué son partenaire.',
        abilities: ['Investigation', 'Combat rapproché'],
        motivation: 'Justice.',
        fate: 'ALIVE'
      },
      '@Maya': {
        description: "Une prodige de l'informatique quantique.",
        backstory: 'Créatrice accidentelle de la première fuite temporelle.',
        personalGoal: 'Réparer ses erreurs avant la fin du monde.',
        abilities: ['Hacking temporel', 'Physique'],
        motivation: 'Culpabilité.',
        fate: 'ALIVE'
      }
    },
    locationRegistry: {
      'neo-noir-city': { description: 'Une métropole pluvieuse où les époques se mélangent.' }
    },
    assetRegistry: {
      '@Le_Chronomètre': {
        description: 'Un appareil de poche permettant de stabiliser le temps localement.',
        type: 'artifact'
      }
    },
    globalContext:
      'La Brèche de Chronos déchire la réalité, mélangeant le futur cyberpunk et le passé noir des années 1920.',
    roadmap: {
      majorBeats: ['Le premier saut', "La trahison de l'ombre", 'La suture finale'],
      openThreads: [],
      unresolvedStakes: ['La stabilité de la réalité'],
      deceasedCharacters: [],
      irreversibleFacts: [],
      genreConstraints: {
        technologyLevel: 'Hybride (Cyberpunk / 1920s)',
        magicLevel: 'Inexistante',
        forbiddenElements: ['Magie classique', 'Aliens']
      },
      finalResolutionTarget: 'La Brèche est refermée, Vance et Maya survivent ou se sacrifient.'
    }
  }

  const arcTitles = [
    'La Fuite Liminaire',
    "L'Assassin du Futur",
    'Le Gearbox Temporel',
    'Le Club de Jazz Inversé',
    "Le Paradoxe de l'Ancêtre",
    'La Boucle de la Mort',
    'Neo-Noir en Ruines',
    "L'Invasion du Vide",
    "Le Miroir de l'Ombre",
    'La Suture Finale'
  ]

  for (let arc = 1; arc <= totalArcs; arc++) {
    for (let ep = 1; ep <= epsPerArc; ep++) {
      const globalEp = (arc - 1) * epsPerArc + ep
      console.log(`🎬 GENERATING ARC ${arc} EPISODE ${ep} (Global ${globalEp}/${totalArcs * epsPerArc})...`)

      context.episodeNumber = globalEp
      context.isFirstEpisode = globalEp === 1
      context.isFinalEpisode = globalEp === totalArcs * epsPerArc

      const generator = new (SeriesVideoGenerator as any)(
        {
          apiKey,
          model: 'gpt-4o-mini',
          scriptSpec: { instructions: ['Noir', 'Cyberpunk', 'Dramatique'], visualRules: [], orchestration: [] }
        },
        context
      )

      const topic = `Arc ${arc} (${arcTitles[arc - 1]}), Épisode ${ep}. Vance et Maya font face à de nouveaux défis liés à la Brèche. Focus sur ${ep === 1 ? 'le mystère' : "l'action et le cliffhanger"}.`

      // Pass 1: Narration
      const prompts1 = generator.buildTwoPassPrompts(topic, { type: 'series', seriesId }, 100)
      const resp1 = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: prompts1.pass1.system },
            { role: 'user', content: prompts1.pass1.user }
          ]
        })
      })
      const d1 = (await resp1.json()) as any
      const narration = d1.choices[0].message.content

      // Pass 2: Metadata
      const sys2 = generator.buildStructuringSystemPrompt({ type: 'series', seriesId, preset: 'spectacle' })
      const user2 = `Structurez cet Arc ${arc} Épisode ${ep} en JSON :\n\n${narration}`
      const resp2 = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: sys2 },
            { role: 'user', content: user2 }
          ],
          response_format: { type: 'json_object' }
        })
      })
      const d2 = (await resp2.json()) as any
      const scriptJson = d2.choices[0].message.content

      console.log(`✅ Arc ${arc} Ep ${ep} done.`)

      const dir = path.join(process.cwd(), 'storage', 'narrations', seriesId)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, `arc_${arc}_ep_${ep}_MARATHON.txt`),
        `ARC ${arc} EPISODE ${ep}\n---\n${narration}`,
        'utf8'
      )
      fs.writeFileSync(path.join(dir, `arc_${arc}_ep_${ep}_METADATA.json`), scriptJson, 'utf8')

      // EVOLVE
      context = (SeriesVideoGenerator as any).updateContext(JSON.parse(scriptJson), context)
    }
  }

  console.log(`\n🎊 MARATHON V2 COMPLETE: storage/narrations/${seriesId}`)
}

runMarathonSagaV2()
