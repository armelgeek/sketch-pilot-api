export enum ExtractionStatus {
  PENDING = 'pending', // En attente d'extraction
  PROCESSING = 'processing', // En cours d'extraction
  COMPLETED = 'completed', // Extraction terminée avec succès
  FAILED = 'failed' // Échec de l'extraction
}

export const ExtractionStatusSchema = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const

export type ExtractionStatusType = (typeof ExtractionStatusSchema)[keyof typeof ExtractionStatusSchema]
