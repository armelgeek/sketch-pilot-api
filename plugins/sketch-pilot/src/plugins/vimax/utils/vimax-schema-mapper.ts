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
  public static toRecord<T extends { id?: string; name?: string; identifier?: string }>(items: T[]): Record<string, T> {
    const record: Record<string, T> = {}
    for (const item of items) {
      // Priorité à l'ID, puis au nom, puis à l'identifiant (cas des personnages).
      const rawKey = item.id || item.name || item.identifier
      if (!rawKey) continue

      // Nettoyage du préfixe @ ou # pour la clé technique
      const cleanKey = rawKey.startsWith('@') || rawKey.startsWith('#') ? rawKey.slice(1) : rawKey

      record[cleanKey] = item
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
}
