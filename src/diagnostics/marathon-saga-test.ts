import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { SeriesVideoGenerator } from '../../plugins/sketch-pilot/src/core/generators/series-video-generator'
import 'dotenv/config'

async function runMarathonSaga() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return

  const seriesId = `chronos-breach-${Date.now()}`
  const totalArcs = 10
  let currentArc = 1

  // BIBLE INITIALE
  let context: any = {
    seriesId,
    episodeNumber: 1,
    totalEpisodes: totalArcs,
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

  while (currentArc <= totalArcs) {
    console.log(`🎬 GENERATING MARATHON ARC ${currentArc}/${totalArcs}...`)

    context.episodeNumber = currentArc
    context.isFirstEpisode = currentArc === 1
    context.isFinalEpisode = currentArc === totalArcs

    const generator = new (SeriesVideoGenerator as any)(
      {
        apiKey,
        model: 'gpt-4o-mini',
        scriptSpec: { instructions: ['Noir', 'Cyberpunk', 'Dramatique'], visualRules: [], orchestration: [] }
      },
      context
    )

    const arcTopics = [
      'Vance et Maya découvrent la première fuite de Chronos dans une ruelle sombre de Neo-Noir City.',
      'Un assassin temporel venu du futur les attaque. Vance utilise son bras cybernétique.',
      'Maya découvre que le Chronomètre est en train de se briser. Ils doivent trouver un réparateur en 1924.',
      'Saut temporel réussi. Ils sont dans un club de jazz enfumé. Maya y rencontre son propre ancêtre.',
      "Trahison ! L'ancêtre de Maya est de mèche avec l'Ombre. Ils perdent le Chronomètre.",
      "Vance est coincé dans une boucle temporelle. Il doit revivre la mort de son partenaire pour s'échapper.",
      'Maya construit une version instable du Chronomètre. Ils reviennent à Neo-Noir City, dévastée.',
      "La Brèche s'élargit. Des monstres de pur vide apparaissent. Mort de @Drax (un allié introduit ici).",
      "Le face-à-face final se prépare au sommet de la Tour Arasaka. Vorg (l'Ombre) se révèle être Vance du futur.",
      'Suture finale. Vance sacrifie son futur (Vorg) pour sauver le présent. La Brèche est close. Maya pleure Vance.'
    ]

    const topic = arcTopics[currentArc - 1]

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
    const user2 = `Structurez cet Arc ${currentArc} en JSON :\n\n${narration}`
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

    console.log(`✅ Arc ${currentArc} done.`)

    const dir = path.join(process.cwd(), 'storage', 'narrations', seriesId)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `arc_${currentArc}_MARATHON.txt`), `ARC ${currentArc}\n---\n${narration}`, 'utf8')
    fs.writeFileSync(path.join(dir, `arc_${currentArc}_METADATA.json`), scriptJson, 'utf8')

    // EVOLVE
    context = (SeriesVideoGenerator as any).updateContext(JSON.parse(scriptJson), context)
    currentArc++
  }

  console.log(`\n🎊 MARATHON COMPLETE: storage/narrations/${seriesId}`)
}

runMarathonSaga()
