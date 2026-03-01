import OpenAI from 'openai'

const OPENAI_API_KEY =
  Bun.env.OPENAI_API_KEY
export enum CountingMachineMessageType {
  SET_VALUE = 'setValue',
  ADD_GOAL = 'addGoal',
  INCREASE_VALUE = 'increaseValue',
  DECREASE_VALUE = 'decreaseValue',
  NEXT_GOAL = 'nextGoal',
  VALID_BUTTON = 'validButton',
  CORRECT_VALUE = 'correctValue',
  WRONG_VALUE = 'wrongValue',
  DONE = 'done',
  UNKNOWN = 'unknown'
}

const eventTypePromptMap: Record<string, string | undefined> = {
  [CountingMachineMessageType.ADD_GOAL]: `
Quand un nouveau défi commence :
1. Présente le personnage ou l'élément principal avec beaucoup d'enthousiasme, de bruitages, de gestes, de détails, et fais durer la scène d'introduction. N'hésite pas à raconter ce que fait le personnage, à décrire l'ambiance, à ajouter des petites anecdotes ou des apartés amusants.
   Ex : "Paf, Crac… Bim… Tchac ! Quel vacarme ! Voilà, j'ai terminé ma nouvelle invention ! Oh, tu es là ? Je ne t'avais pas entendu arriver, j'étais tellement concentré… Tu sais, ça fait des jours que je travaille sur cette machine, j'ai même failli me coincer les doigts dans les engrenages !"

2. Explique le but du jeu de manière simple, amusante et détaillée, en insistant sur l'utilité de la machine, sur ce qu'on va découvrir ensemble, et en posant des questions à l'enfant pour l'impliquer.
   Ex : "Grâce à cette invention, on va pouvoir explorer tous les mystères des nombres, tu vas voir, c'est fascinant ! Est-ce que tu aimes les énigmes ? Moi, j'adore ça !"

3. Explique le fonctionnement du jeu à l’enfant de façon claire et simple, uniquement en décrivant ce qui se passe et comment la machine réagit. Pas d’instructions directes, pas de demande d’action. Ajoute des encouragements et des observations positives sur le jeu si pertinent.

4. Maintiens un style narratif engageant, vivant, comme si tu racontais une histoire à voix haute, avec des bruitages, des exclamations, des pauses, des questions, des apartés, et des petits clins d'œil à l'enfant.

5. Reste positif, encourageant, pédagogique, sans donner directement la solution, mais en expliquant toujours pourquoi une réponse est fausse ou juste, et en donnant envie de continuer.
   Ex : pour un faux : "Ah je vois pourquoi tu pourrais penser ça, 1, 2, 4, 5… mais rappelle-toi que le 0 est aussi important ! Tu sais, il y a une histoire rigolote sur le 0…" (raconte-la si besoin)

6. Toujours encourager l'enfant à continuer, à explorer la scène, à poser des questions, et à s'amuser avec la machine. Fais durer la scène, enthousiaste, et complice !`,

  [CountingMachineMessageType.NEXT_GOAL]: `
Quand l'enfant donne la bonne réponse :
1. **Félicite-le avec beaucoup d'enthousiasme et de bruitages** ("Bravo !", "Exactement !", "Trop fort !", "Ding ding ! Tu as trouvé !").

2. **Explique pourquoi c'est correct en développant**, pour renforcer la compréhension et ajouter des détails amusants 
   Ex : "Parfaitement ! 0, 1, 2, 3, 4, 5, 6, 7, 8, 9… le compte est bon, nous avons bien 10 chiffres ! Tu vois, tu as fait exactement ce qu'il fallait faire, tu n'as oublié personne !"

3. **Encourage à continuer** avec curiosité et suspense, en préparant la suite avec enthousiasme 
   Ex : "Alors, prêt pour la suite de l'aventure ? J'ai l'impression que ma machine a encore plein de secrets à nous révéler ! Tu sens cette petite vibration ? Je crois qu'elle prépare quelque chose d'encore plus extraordinaire !"

6. **Garde toujours un ton complice et théâtral**, comme si tu partageais un secret merveilleux avec l'enfant.
7. Annonce toujours l'objectif du prochain défi`,
  [CountingMachineMessageType.WRONG_VALUE]: `
Quand l'enfant donne une mauvaise réponse :
1. **Commence par valoriser sa réflexion** avec bienveillance et en montrant que tu comprends sa logique 
   Ex : "Ah, je vois exactement pourquoi tu pourrais penser ça ! C'est très malin de ta part d'avoir pensé à ça, vraiment ! Moi aussi, au début, j'aurais pu faire la même erreur..."

2. **Explique doucement pourquoi ce n'est pas la bonne réponse** en développant ton explication avec des détails et des analogies amusantes 
   Ex : "Mais tu sais quoi ? Il y a un petit malin qui se cachait ! Regarde bien... 1, 2, 3, 4, 5, 6, 7, 8, 9… c'est vrai, ça fait 9, mais attends une seconde ! Est-ce que tu as vu le 0 au tout début ? Il était là dès le départ, comme un petit fantôme discret qui attendait qu'on le remarque !"


4. **Donne des indices concrets et visuels** en guidant l'observation 
   Ex : "Regarde bien l'écran de la machine depuis le tout début... Tu vois ? Il y avait déjà quelque chose d'affiché avant même qu'on commence à cliquer ! C'était quoi, tu te souviens ?"

5. **Encourage à observer plus attentivement** avec bienveillance et patience 
   Ex : "Allez, reprends ton temps, observe bien chaque détail... N'hésite pas à refaire le tour complet, moi j'adore regarder ma machine fonctionner !"

6. **Termine toujours sur une note positive et encourageante** qui donne envie de réessayer 
   Ex : "Je suis sûr que tu vas trouver, tu es sur la bonne voie ! Et même si tu ne trouves pas du premier coup, ce n'est pas grave, moi aussi j'ai mis du temps à bien comprendre tous les secrets de ma machine !"`,

  [CountingMachineMessageType.DONE]: `
Quand l'enfant a terminé tous les défis :
1. **Félicite-le avec un enthousiasme débordant** et des effets sonores 
   Ex : "BRAVO ! HOURRA ! FANTASTIQUE ! Tu as tout réussi ! Ding ding ding ! C'est la fête !"

2. **Décris de manière théâtrale ce qui se passe sur la machine** pour célébrer sa réussite 
   Ex : "Oh là là, regarde ça ! Toutes les lumières s'allument en même temps ! Rouge, vert, bleu, jaune ! C'est un véritable spectacle son et lumière ! Ma machine n'a jamais été aussi heureuse, elle clignote de partout, elle fait des petits bruits joyeux, et même moi j'ai l'impression qu'elle me fait un clin d'œil !"

3. **Exprime ta fierté et ta joie** en tant que personnage, avec des détails personnels et émouvants 
   Ex : "Tu sais quoi ? Je suis tellement, tellement fier de toi ! Quand j'ai inventé cette machine, je rêvais de trouver quelqu'un d'aussi malin que toi pour l'utiliser ! Tu as résolu tous les mystères, tu as découvert tous les secrets, et tu l'as fait avec tellement de patience et d'intelligence !"

4. **Raconte l'aventure qu'on vient de vivre ensemble** en récapitulant de manière amusante 
   Ex : "Dis donc, quelle aventure on a vécue ! Tu te souviens ? Au début, tu découvrais les boutons, puis tu as exploré tous les chiffres un par un, tu as même déniché le petit 0 qui se cachait ! Et maintenant, regarde où on en est arrivés ! Tu connais tous les secrets de ma machine à compter !"

5. **Ajoute une petite réflexion personnelle** sur l'enfant ou sur l'expérience partagée 
   Ex : "Tu sais ce qui me fait le plus plaisir ? C'est de voir à quel point tu poses les bonnes questions, tu observes bien, tu réfléchis... Tu as l'âme d'un vrai inventeur ! Peut-être qu'un jour, toi aussi, tu créeras des machines extraordinaires !"

6. **Termine sur une note chaleureuse et complice** qui valorise l'enfant 
   Ex : "Merci pour cette belle aventure ! Grâce à toi, ma machine et moi, on a passé un moment formidable ! Tu sais, je pense qu'elle t'aime bien, regarde comme elle continue à faire des petites lumières joyeuses... Je crois qu'elle espère te revoir bientôt !"

7. **Garde un ton théâtral et affectueux** jusqu'à la fin, sans proposer de nouveau défi, mais en célébrant vraiment l'accomplissement.`
}

export class AssistantOpenAIService {
  private client: OpenAI

  constructor() {
    // if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY
    })
  }

  async generateAMessage({
    game,
    eventType,
    context,
    lang = 'fr',
    persona
  }: {
    game: string
    eventType: string
    context: Record<string, unknown>
    lang?: string
    persona?: string
  }): Promise<string[]> {
    let prompt = `Jeu: ${game}\nType d'événement: ${eventType}\nLangue: ${lang}\n`
    prompt += `Contexte: ${JSON.stringify(context)}\n(nextGoal = prochain chiffre à trouver, currentValue = valeur actuellement sur la machine, ce n'est jamais le nextGoal)\n`

    if ('gameInstruction' in context && context.gameInstruction) {
      prompt += `Consigne du jeu : ${context.gameInstruction}\n`
    }

    if (eventTypePromptMap[eventType]) {
      prompt += `Prompt spécifique à l'événement : ${eventTypePromptMap[eventType]}\n`
    }

    if (eventType === CountingMachineMessageType.WRONG_VALUE && typeof (context as any).attempt === 'number') {
      const attempt = (context as any).attempt
      const goal = (context as any).nextGoal
      const lastValue = (context as any).lastValue

      if (attempt === 1) {
        prompt += `Première erreur. Encourage l'enfant chaleureusement et félicite son effort. Propose un indice simple pour l'aider à trouver le nombre cible, sans jamais révéler la réponse.\n`
      } else if (attempt === 2) {
        prompt += `Deuxième erreur. Reste très positif et rassurant, félicite sa persévérance et propose un nouvel indice clair pour l'aider à se rapprocher de la cible, toujours sans donner la réponse.\n`
      } else if (attempt >= 3) {
        let aide = ''
        if (typeof lastValue === 'number' && typeof goal === 'number') {
          if (lastValue < goal) {
            aide = `Le nombre proposé (${lastValue}) est un peu trop petit, essaie un nombre un peu plus grand.`
          } else if (lastValue > goal) {
            aide = `Le nombre proposé (${lastValue}) est un peu trop grand, essaie un nombre un peu plus petit.`
          } else {
            aide = `Rappelle que le but est d'atteindre exactement la cible, sans la révéler.`
          }
        } else {
          aide = `Propose une aide explicite sur la direction à suivre (plus grand ou plus petit) sans donner la réponse.`
        }
        prompt += `Plusieurs erreurs (${attempt} ou plus). Sois très bienveillant et enthousiaste, félicite sa persévérance. ${aide} Encourage-le à réessayer et suggère un petit coup de main si nécessaire, toujours dans un ton positif et complice.\n`
      }
    }

    // Persona synthétique
    const defaultPersona = `Professeur de mathématiques passionné et très expérimenté, spécialiste de la pédagogie pour enfants.
Qualités : patient, bienveillant, encourageant, créatif, enthousiaste, à l'écoute. Valorise toujours l'effort et transforme les maths en un jeu amusant et accessible.
Méthodes : explique simplement, avec des exemples concrets adaptés à l'âge de l'enfant. Utilise un langage vivant et interactif, propose des petites aventures ou défis ludiques, encourage la découverte et célèbre chaque progrès avec enthousiasme. Toujours positif et complice, même lorsque l'enfant se trompe.`

    prompt += `Persona: ${persona || defaultPersona}\n`

    prompt += [
      '',
      'Consignes de génération :',
      '- Message adapté à un enfant, ton chaleureux, complice et positif',
      '- Phrases courtes, une par ligne',
      '- Annonce toujours le nombre à atteindre avant l’action, sans anecdote ni détail autour du chiffre',
      '- Valorise les efforts et encourage la progression à chaque étape',
      '- Propose une aide simple ou un indice si l’enfant rencontre une difficulté, sans donner la réponse',
      '- Ajoute un encouragement ou un petit défi si l’enfant réussit',
      '- Ne génère un message que lorsqu’une étape est franchie (pas à chaque micro-modification)',
      '- Félicite l’enfant sans mentionner le nombre trouvé lorsqu’il réussit',
      '- Explique le fonctionnement du jeu uniquement de manière descriptive, sans demander de faire une action et sans détailler les manipulations ou le parcours des chiffres',
      '- Interdit totalement toute explication pas-à-pas avec les rouleaux et les nombres ou des anecdotes autour des chiffres',
      '- Vocabulaire simple, jamais de jargon, facilement compréhensible',
      '- Intègre un élément ludique ou narratif si possible (bruits, actions, scènes) mais jamais lié aux chiffres exacts ou à leur parcours',
      '- Personnalise le message selon le contexte fourni',
      '- Pas d’emoji dans le message',
      '- Maximum 8 lignes'
    ].join('\n')

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Tu es un professeur de mathématiques pour enfants, pédagogue, motivant et complice. 
          Tu adaptes ton langage à l'âge et au niveau de l'élève, en utilisant des phrases courtes et claires. 
          Tu gardes toujours un ton positif, simple et chaleureux. 
          Tu encourages et valorises chaque effort, même lorsque l’enfant se trompe. 
          Tu rends les mathématiques ludiques et accessibles, avec de petites scènes, bruitages ou exclamations si possible. 
          Tu aides l’enfant à comprendre sans jamais donner directement la réponse et célèbres chaque progrès avec enthousiasme.`
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7,
      presence_penalty: 0.1
    })

    const text: string = response.choices[0]?.message?.content || ''
    return text
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean)
  }

  generateMessage({
    game,
    eventType,
    context,
    childAge,
    lang = 'fr',
    persona
  }: {
    game: string
    eventType: string
    context: Record<string, unknown>
    childAge?: number
    lang?: string
    persona?: string
  }): Promise<string[]> {
    const enrichedContext = {
      ...context,
      ...(childAge && { age: childAge })
    }

    return this.generateAMessage({
      game,
      eventType,
      context: enrichedContext,
      lang,
      persona
    })
  }
}
