import type { CliffhangerType, SeriesContext } from '../series-video-generator'

export class NarrativePacingSentinel {
  public static getPhaseInstructions(seriesContext: SeriesContext): string[] {
    const instructions: string[] = []
    const episodeNumber = seriesContext.episodeNumber
    const totalEpisodes = seriesContext.totalEpisodes || 10
    const progress = episodeNumber / totalEpisodes
    const isSequel = episodeNumber > totalEpisodes

    instructions.push(
      `Génère l'Épisode nº${episodeNumber}${seriesContext.totalEpisodes ? ` sur ${seriesContext.totalEpisodes}` : ''} de la saga : "${seriesContext.videoGenre || 'Horreur Historique'}".`
    )

    if (seriesContext.currentEpisodePitch) {
      instructions.push(`🚨 MISSION NARRATIVE (PLAN REÇU) : Suivez ce pitch : "${seriesContext.currentEpisodePitch}".`)
    } else if (!seriesContext.isFinalEpisode && episodeNumber > 1) {
      instructions.push(
        `🚨 MISSION NARRATIVE (IMPROVISATION DIRIGÉE) : Le plan initial est épuisé. Vous DEVEZ improviser une suite logique en exploitant les mystères non résolus (@unresolvedThreads). Maintenez la tension sans conclure prématurément.`
      )
    }

    let phaseInstruction = ''
    if (isSequel) {
      phaseInstruction = `🌀 MODE SÉQUELLE / NOUVEAU CYCLE : Vous avez dépassé la fin prévue. RELANCEZ l'intrigue avec un nouvel Arc. Introduisez une menace résurgente, un saut dans le temps ou un changement de paradigme. Le monde a changé, montrez-le.`
    } else if (progress <= 0.25) {
      phaseInstruction = `🔹 PHASE 1 (SETUP) : Établissez le monde et les enjeux. INTERDICTION de résoudre l'intrigue principale. Introduisez au moins 2 nouveaux mystères ou personnages intrigants.`
    } else if (progress <= 0.75) {
      phaseInstruction = `🔹 PHASE 2 (ESCALADE) : La situation DOIT s'aggraver. Enchaînez les complications. Évitez toute victoire définitive. Si une solution semble proche, introduisez un obstacle imprévu ou une trahison.`
    } else if (progress < 1) {
      phaseInstruction = `🔹 PHASE 3 (CLIMAX) : On approche de la fin. Les fils narratifs commencent à se croiser. La tension est à son maximum. Le cliffhanger DOIT être de type 'péril' ou 'révélation' majeure.`
    } else {
      phaseInstruction = `🏆 PHASE FINALE (RÉSOLUTION) : Concluez les intrigues majeures de ce cycle. Focus sur l'impact émotionnel. 🚨 GRAINE DE SUITE : Laissez un infime indice "post-générique" suggérant qu'une menace plus grande sommeille encore.`
    }
    instructions.push(phaseInstruction)

    const threadCount = seriesContext.unresolvedThreads?.length || 0
    if (threadCount < 2 && !seriesContext.isFinalEpisode) {
      instructions.push(
        `🚨 ALERTE NARRATIVE : Trop peu de mystères actifs. Vous DEVEZ introduire un NOUVEAU fil narratif (@unresolvedThreads) ou une découverte énigmatique dans cet épisode.`
      )
    }

    if (episodeNumber > 3 && threadCount > 0 && !seriesContext.isFinalEpisode) {
      instructions.push(
        `🧩 COMPLEXITÉ : Un des secrets existants doit s'épaissir. Ce qu'on croyait savoir est remis en question par un nouvel élément de lore.`
      )
    }

    return instructions
  }

  public static getBridgeInstruction(seriesContext: SeriesContext): string {
    const { lastCliffhanger, episodeNumber, lastEpisodeFinalScene } = seriesContext
    if (episodeNumber <= 1 || (!lastCliffhanger && !lastEpisodeFinalScene)) return ''

    let prompt =
      "\n\n🆘 TRANSITION VS CAMERA ACTION (STRICT) : \n- TRANSITION : Changement de scène. 'shake', 'static', 'breathing' ne sont PAS des transitions.\n- CAMERA ACTION : Mouvement DANS la scène. 'shake' est une CAMERA ACTION.\nSi vous voulez une secousse, utilisez 'cameraAction': 'shake' et 'transition': 'none'.\n\n⚠️ PONT NARRATIF OBLIGATOIRE :"

    if (lastEpisodeFinalScene) {
      prompt += `\nL'épisode précédent s'est arrêté EXACTEMENT sur cette scène : "${lastEpisodeFinalScene.summary || lastEpisodeFinalScene.imagePrompt}"`
      if (lastEpisodeFinalScene.locationId)
        prompt += `\nLieu de reprise OBLIGATOIRE : "${lastEpisodeFinalScene.locationId}" (Vous DEVEZ démarrer ici).`
      if (lastEpisodeFinalScene.persistentDecorTokens?.length > 0) {
        prompt += `\nAmbiance & Lumière à maintenir : ${lastEpisodeFinalScene.persistentDecorTokens.join(', ')}`
      }

      prompt += `\n🆘 ANTI-SAUT TEMPOREL (CRITICAL) : Interdiction absolue de commencer par 'Mais alors qu'ils discutaient', 'Quelques heures plus tard', ou toute ellipse. Vous reprenez au MÊME ENDROIT, à la MÊME SECONDE.`
      prompt += `\n- HÉRITAGE TECHNIQUE [S1] (CLONAGE) : La Scène 1 DOIT être l'héritière technique de l'épisode précédent :`
      prompt += `\n    * locationId : "${lastEpisodeFinalScene.locationId}" (Utilisez cet ID EXACT)`
      prompt += `\n    * charactersInScene : [${(lastEpisodeFinalScene.charactersInScene || []).join(', ')}]`
      prompt += `\n    * persistentDecorTokens : [${(lastEpisodeFinalScene.persistentDecorTokens || []).join(', ')}]`
      prompt += `\n    * shotType : "${lastEpisodeFinalScene.shotType || 'WIDE'}"`
      prompt += `\n- ECHO DU DERNIER SOUFFLE : L'épisode précédent s'est achevé sur : "${lastEpisodeFinalScene.narration}".`
      prompt += `\n  ⚠️ LA PREMIÈRE PHRASE DE SCÈNE 1 DOIT RÉPONDRE DIRECTEMENT À CES MOTS (Action immediate ou Ressenti sensoriel).`
      prompt += `\n- RÉACTION VISCÉRALE : Lars (ou le perso actuel) doit être dans le MÊME état émotionnel (Peur, Choc, Détermination).`
      prompt += `\n⚠️ IMAGE : La Scène 1 réutilisera PHYSIQUEMENT l'image finale. Votre description d'image DOIT être identique à la finale précédente.`
    }

    if (lastCliffhanger) {
      if (typeof lastCliffhanger === 'string') {
        prompt += `\nCliffhanger à résoudre : "${lastCliffhanger}"`
      } else {
        const typeInstructions: Record<CliffhangerType, string> = {
          revelation: `Le personnage ou le lecteur vient d'apprendre une vérité qui change tout. L'épisode doit s'ouvrir sur les CONSÉQUENCES émotionnelles immédiates de cette révélation, pas sur une autre action. Le choc doit résonner.`,
          peril: `Un personnage est en danger immédiat. L'épisode DOIT s'ouvrir en plein milieu de ce danger (In Media Res). NE PAS résoudre le péril en deux lignes — laissez la tension monter au moins 2 scènes avant toute issue.`,
          choice: `Un personnage fait face à un choix impossible. L'épisode DOIT montrer le processus de décision dans ses moindres contradictions — pas seulement la décision elle-même. La souffrance du choix est le coeur de cette ouverture.`,
          betrayal: `Une trahison vient d'être révélée ou commise. L'épisode s'ouvre sur la réaction viscérale du personnage trahi ou du traître face aux conséquences. Evitez les explications immédiates — laissez l'ambiguïté respirer.`,
          unknown: `L'épisode doit reconnecter avec la tension précédente de façon directe et immersive.`
        }
        prompt += `\n[Type: ${(lastCliffhanger.type || 'unknown').toUpperCase()}] : "${lastCliffhanger.description}"`
        if (lastCliffhanger.audienceQuestion) prompt += `\nQuestion du public : "${lastCliffhanger.audienceQuestion}"`
        prompt += `\nInstruction de reprise : ${typeInstructions[lastCliffhanger.type as CliffhangerType] || typeInstructions.unknown}`
      }
    }

    return prompt
  }
}
