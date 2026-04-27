import { CharacterUniverseStore } from '../core/character-universe-store'
import { VimaxBaseAgent } from '../core/vimax-base.agent'
import { VimaxVisionUtils } from '../utils/vision-utils'
import type { CharacterProfile } from '../types'

// ─────────────────────────────────────────────
// VimaxCharacterExtractor
// Extrait les profils visuels des personnages depuis un script.
// Utilisé une fois par épisode — les profils sont injectés
// dans les imagePrompts pour garantir la cohérence visuelle.
// ─────────────────────────────────────────────

export class VimaxCharacterExtractor extends VimaxBaseAgent {
  public id = 'character-extractor'
  private styleLock: any | null = null

  setStyleLock(lock: any) {
    this.styleLock = lock
  }

  private getSystem(): string {
    const styleBlock = this.styleLock
      ? `
[STYLE VISUEL LOCKÉ - OBLIGATOIRE]
- Style : ${this.styleLock.visualStyle}
- Termes requis : ${this.styleLock.mandatoryTerms.join(', ')}
- Termes interdits : ${this.styleLock.forbiddenTerms.join(', ')}
`.trim()
      : ''

    const universe = CharacterUniverseStore.getInstance()
    const legacyCharacters = universe.getAllCharacters()
    const legacyBlock =
      legacyCharacters.length > 0
        ? `\n[MÉMOIRE DE L'UNIVERS VIMAX - PERSONNAGES RÉCURRENTS]\n${legacyCharacters.map((c) => `- ${c.identifier}: ${c.physicalDescription}`).join('\n')}\n`
        : ''

    return `
Tu es un expert en analyse de scripts cinématographiques.
${styleBlock}
${legacyBlock}
[DIRECTIVE D'IDENTIFICATION : LOI DE L'IDENTITÉ TOTALE]
- RÉCURRENCE : Tout personnage qui agit sur plus d'un beat doit avoir un identifiant @Nom (ex: @VieilHomme, @FigureCapuche).
- [OBLIGATION] PERSONNAGES SECONDAIRES : Tu DOIS extraire et nommer (@PascalCase) TOUS les personnages secondaires, même s'ils n'ont qu'une seule action ou ligne de dialogue.
- GROUPES DÉTAILLÉS : Si un groupe (ex: @Gardes) effectue des actions distinctes, crée des identifiants séparés (ex: @GardeChef, @GardeSentinelle).
- NE FILTRE AUCUN RÔLE : Interdiction de laisser des "personnages inconnus". Chaque présence humaine doit être rattachée à un profil visuel stable.
- REGISTRE PRIORITAIRE : Si un personnage existe déjà dans la [MÉMOIRE DE l'UNIVERS VIMAX], respecte strictement son identité.

[DIRECTIVE DE STYLE]
Le champ "portrait_prompt" DOIT ABSOLUMENT intégrer les termes requis du STYLE LOCKÉ. 
Exemple si whiteboard/sketch : "personnage dessiné au feutre noir, lignes claires, [IDENTITÉ : ${this.styleLock ? 'intègre ici les traits de @Nom' : 'traits physiques'}], fond blanc".
L'identité visuelle (cheveux, yeux, accessoires) doit être préservée mais ADAPTÉE au médium (ex: ne pas demander de réalisme photo si c'est un croquis).

[FORMAT]
Réponds UNIQUEMENT du JSON valide :
{
  "characters": [
    {
      "index": 0,
      "identifier": "@NomDuPersonnage",
      "physicalDescription": "Description physique permanente (vêtements, traits, accessoires)",
      "personalityTraits": ["trait 1", "trait 2"],
      "roleInSaga": "Rôle dramatique",
      "currentMood": "Humeur actuelle",
      "static_features": "Description physique (alias)",
      "dynamic_features": "Humeur/Pose actuelle pour ce segment",
      "portrait_prompt": "Prompt d'identité absolue incluant le STYLE LOCKÉ",
      "arc_plan": "Trajectoire narrative (3-5 mots, ex: 'Rédemption par le sacrifice')",
      "narrative_memory": ["Fait marquant 1", "Fait marquant 2"],
      "off_screen_state": "Ce qu'il fait quand il n'est pas filmé (ex: 'monte la garde à l'entrée')"
    }
  ]
}
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Analyse chirurgicale d'un portrait pour fixer l'identité visuelle d'un personnage.
   */
  async refineCharacterIdentity(identifier: string, referenceImageUrl: string): Promise<string> {
    const prompt = `
[MISSION : ANALYSE D'IDENTITÉ CHIRURGICALE]
Analyse le portrait de ${identifier} et génère un "portrait_prompt" ABSOLU et VERROUILLÉ.
Ce prompt doit capturer les traits uniques (forme du visage, accessoires, style de trait) pour garantir la cohérence par personne.

[DIRECTIVES]
- Détaille les éléments fixes (chapeau, lunettes, forme du nez).
- Précise le style de dessin (ex: "traits de feutre noirs épais").
- NE FAIS PAS de métaphores.

[FORMAT]
Renvoie UNIQUEMENT du JSON : { "portrait_prompt": "..." }
`.trim()

    let images: { data: string; mimeType: string }[] | undefined = undefined
    try {
      const img = await VimaxVisionUtils.imageUrlToBase64(referenceImageUrl)
      images = [img]
    } catch {
      console.warn(
        `[VimaxCharacterExtractor] Impossible de charger l'image ${referenceImageUrl}, passage en mode texte seul.`
      )
    }

    const result = await this.generateStructured<{ portrait_prompt: string }>(
      `[CHARACTER_IDENTITY_PROMPT]\n${prompt}`,
      'Tu es un portraitiste expert en identification visuelle.',
      { portrait_prompt: '' },
      images
    )

    return result.data.portrait_prompt
  }

  /**
   * Extrait les profils visuels de tous les personnages d'un script.
   * @param script La narration ou le script source
   */
  async extractCharacters(script: string): Promise<CharacterProfile[]> {
    const prompt = `
<SCRIPT>
${script}
</SCRIPT>

Extraits tous les profils visuels des personnages en suivant les directives strictes.
Réponds uniquement en JSON.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(), 'application/json')
    const parsed = this.parseJSONSafe<{ characters: CharacterProfile[] }>(raw, { characters: [] })

    // Normalisation post-extraction (indexation séquentielle et @PascalCase)
    const normalized = parsed.characters.map((char, i) => ({
      ...char,
      index: i,
      identifier: this.normalizeIdentifier(char.identifier)
    }))

    // [V48] Enregistrement de l'évolution dans l'univers global
    const universe = CharacterUniverseStore.getInstance()
    for (const char of normalized) {
      await universe.recordEvolution(char)
    }

    return normalized
  }

  /**
   * Formate les profils en string injectable dans un imagePrompt.
   * Inclut l'Héritage Physique (Traces) pour garantir la continuité des blessures/états.
   */
  formatForPrompt(profiles: CharacterProfile[]): string {
    return profiles
      .filter(
        (p) =>
          p.static_features?.trim() ||
          p.dynamic_features?.trim() ||
          p.portrait_prompt?.trim() ||
          (p.traces && p.traces.length > 0)
      )
      .map((p) => {
        const traceBlock =
          p.traces && p.traces.length > 0 ? `[TRACES PHYSIQUES : ${p.traces.map((t) => t.description).join(', ')}]` : ''

        const memoryBlock =
          p.narrative_memory && p.narrative_memory.length > 0
            ? `[MÉMOIRE NARRATIVE : ${p.narrative_memory.slice(-3).join('. ')}]`
            : ''

        const arcBlock = p.arc_plan ? `[OBJECTIF ARC : ${p.arc_plan}]` : ''

        const parts = [
          p.portrait_prompt,
          p.static_features,
          p.dynamic_features,
          traceBlock,
          arcBlock,
          memoryBlock
        ].filter((f) => f?.trim())
        return `${p.identifier}: ${parts.join(', ')}`
      })
      .join('\n')
  }
}
