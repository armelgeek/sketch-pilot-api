import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CharacterProfile } from '../types'

/**
 * CharacterUniverseStore
 * La Mémoire Éternelle des Personnages.
 * Conserve les profils des personnages à travers toutes les sagas.
 */
export class CharacterUniverseStore {
  private static instance: CharacterUniverseStore
  private storePath: string
  private data: { characters: Record<string, CharacterProfile> } = { characters: {} }

  private constructor() {
    const root = process.cwd()
    const dataDir = path.join(root, 'plugins', 'sketch-pilot', 'src', 'plugins', 'vimax', 'data')
    this.storePath = path.join(dataDir, 'vimax-character-universe.json')
  }

  public static getInstance(): CharacterUniverseStore {
    if (!CharacterUniverseStore.instance) {
      CharacterUniverseStore.instance = new CharacterUniverseStore()
    }
    return CharacterUniverseStore.instance
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8')
      this.data = JSON.parse(raw)
    } catch {
      this.data = { characters: {} }
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true })
    await fs.writeFile(this.storePath, JSON.stringify(this.data, null, 2), 'utf8')
  }

  /**
   * Enregistre ou met à jour un personnage dans l'univers global.
   * Consolide les nouveaux traits avec les anciens.
   */
  async recordEvolution(profile: CharacterProfile): Promise<void> {
    const identifier = profile.identifier // @Nom
    const existing = this.data.characters[identifier]

    if (!existing) {
      this.data.characters[identifier] = { ...profile }
    } else {
      // Fusion intelligente pour ne rien perdre de l'historique
      this.data.characters[identifier] = {
        ...existing,
        ...profile,
        personalityTraits: [...new Set([...(existing.personalityTraits || []), ...(profile.personalityTraits || [])])],
        physicalDescription:
          profile.physicalDescription || profile.static_features || existing.physicalDescription || '',
        // On garde la description la plus longue pour la richesse
        roleInSaga:
          (profile.roleInSaga?.length || 0) > (existing.roleInSaga?.length || 0)
            ? profile.roleInSaga || existing.roleInSaga
            : existing.roleInSaga || profile.roleInSaga || 'unknown',
        // [V5.5] Accumulation des traces (cicatrices, vieillissement)
        traces: [
          ...(existing.traces || []),
          ...(profile.traces || []).filter((nt) => !(existing.traces || []).some((et) => et.id === nt.id))
        ]
      }
    }
    await this.save()
  }

  /**
   * Récupère le profil universel d'un personnage.
   */
  getCharacter(identifier: string): CharacterProfile | undefined {
    return this.data.characters[identifier]
  }

  /**
   * Liste tous les habitants de l'univers Vimax.
   */
  getAllCharacters(): CharacterProfile[] {
    return Object.values(this.data.characters)
  }
}
