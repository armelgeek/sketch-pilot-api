import type { SagaPlan } from '../types'

/**
 * VimaxSchemaMapper
 * Utilitaire pour transformer les données Vimax (format agent)
 * vers le schéma de la base de données (format Record/jsonb).
 */
export class VimaxSchemaMapper {
  /**
   * Transforme un tableau de profils en un Record indexé par ID ou Nom.
   * Nettoie les préfixes @ ou # pour les clés de l'objet.
   */
  public static toRecord<T extends { id?: string; name?: string; identifier?: string; displayName?: string }>(
    items: T[]
  ): Record<string, T> {
    const record: Record<string, T> = {}
    for (const item of items) {
      // 1. Détermination de la clé candidate (Priorité à l'identifiant métier sur l'UUID technique)
      const rawKey = item.identifier || item.name || item.id
      if (!rawKey) continue

      // 2. Normalisation de la clé : minuscule et nettoyage des préfixes
      // On veut une clé stable pour le Record (ex: "clara")
      let cleanKey = rawKey.toLowerCase().trim()
      if (cleanKey.startsWith('@') || cleanKey.startsWith('#')) {
        cleanKey = cleanKey.slice(1)
      }
      cleanKey = cleanKey.replaceAll(/\s+/g, '') // "Victor Leclerc" -> "victorleclerc"

      // 3. Gestion des doublons et fusion intelligente
      const existing = record[cleanKey]
      if (existing) {
        // Simple merge par défaut
        const merged = { ...existing, ...item }

        // PROTECTION : Si le nouvel item a un displayName "pauvre" (numérique ou égal à la clé brute),
        // on préfère garder l'ancien s'il était de meilleure qualité.
        if (
          item.displayName &&
          !isNaN(Number(item.displayName)) &&
          existing.displayName &&
          isNaN(Number(existing.displayName))
        ) {
          merged.displayName = existing.displayName
        }

        // PROTECTION : Si le nom technique est générique (@0), on garde l'ancien nom (@clara)
        if (
          item.name &&
          item.name.startsWith('@') &&
          !isNaN(Number(item.name.slice(1))) &&
          existing.name &&
          !existing.name.startsWith('@0')
        ) {
          merged.name = existing.name
        }

        record[cleanKey] = merged
      } else {
        record[cleanKey] = item
      }
    }
    return record
  }

  /**
   * Mappe un SagaPlan complet vers les champs de la table 'series'.
   */
  public static mapPlanToDb(plan: SagaPlan) {
    return {
      globalContext: plan.script,
      characterRegistry: this.toRecord(plan.characterRegistry || []),
      locationRegistry: this.toRecord(plan.locationRegistry || []),
      assetRegistry: this.toRecord(plan.assetRegistry || []),
      plannedEpisodes: (plan.episodes || []).map((ep: any) => ({
        number: ep.episodeNumber,
        title: ep.title,
        hook: ep.summary
      })),
      unresolvedThreads: plan.unresolvedThreads || [],
      roadmap: plan.roadmap || {},
      relationshipMap: plan.relationshipMap || {},
      weatherState: plan.atmosphere?.weatherState || '',
      timeOfDay: plan.atmosphere?.timeOfDay || '',
      colorPalette: plan.atmosphere?.colorPalette || '',
      cameraStyle: plan.atmosphere?.cameraStyle || '',
      symbolicMotifs: plan.atmosphere?.symbolicMotifs || [],
      visualEvolution: plan.visualEvolution || {}
    }
  }

  /**
   * Mappe les données de la DB (SeriesContext) vers un SagaPlan compatible Vimax.
   */
  public static mapDbToSagaPlan(db: any): any {
    return {
      intent: {
        title: db.title || '',
        globalTone: db.videoGenre || '',
        centralConflict: '',
        climaxAction: '',
        resolutionGoal: ''
      },
      script: db.globalContext || '',
      characterRegistry: Object.values(db.characterRegistry || {}),
      locationRegistry: Object.values(db.locationRegistry || {}),
      assetRegistry: Object.values(db.assetRegistry || {}),
      episodes: (db.plannedEpisodes || []).map((ep: any) => ({
        episodeNumber: ep.number,
        title: ep.title,
        summary: ep.hook,
        eventDescription: ep.hook
      })),
      unresolvedThreads: db.unresolvedThreads || [],
      roadmap: db.roadmap || {},
      atmosphere: {
        weatherState: db.weatherState,
        timeOfDay: db.timeOfDay,
        colorPalette: db.colorPalette,
        cameraStyle: db.cameraStyle,
        symbolicMotifs: db.symbolicMotifs
      },
      visualEvolution: db.visualEvolution || {},
      relationshipMap: db.relationshipMap || {}
    }
  }

  /**
   * Extrait les événements d'épisode à partir du contexte DB.
   */
  public static mapDbToEpisodeEvents(db: any): any[] {
    return (db.plannedEpisodes || []).map((ep: any) => ({
      description: ep.hook || ep.title || 'Pas de description',
      duration: 60, // Fallback
      isClimax: false // Fallback
    }))
  }

  /**
   * Mappe les résultats d'un épisode (VimaxEpisode) vers un objet de mise à jour pour le context de la série.
   */
  public static mapEpisodeToContextUpdate(episode: any, currentContext: any) {
    const lastImage = episode.scenes?.at(-1)?.imageUrl

    // Fusion des registres
    const characterRegistry = { ...(currentContext.characterRegistry || {}) }
    if (episode.characterProfiles) {
      const episodeCharacters = this.toRecord(episode.characterProfiles)
      Object.assign(characterRegistry, episodeCharacters)
    }

    return {
      lastEpisodeNumber: episode.episodeNumber,
      episodeNumber: episode.episodeNumber + 1,
      lastEpisodeFinalImage: lastImage || currentContext.lastEpisodeFinalImage,
      lastEpisodeFinalScene: episode.scenes?.at(-1) || currentContext.lastEpisodeFinalScene,
      lastEpisodeSummary: episode.summary,
      characterRegistry,
      // On peut ajouter la persistence des lieux et assets si nécessaire
      locationRegistry: currentContext.locationRegistry || {},
      assetRegistry: currentContext.assetRegistry || {}
    }
  }
}
