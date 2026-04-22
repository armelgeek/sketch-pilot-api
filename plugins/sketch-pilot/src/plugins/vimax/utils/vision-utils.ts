import axios from 'axios'

/**
 * Utilitaires pour la manipulation d'images dans le contexte multimodal (Vision).
 */
export const VimaxVisionUtils = {
  /**
   * Télécharge une image depuis une URL et la convertit en Base64.
   * Utile pour envoyer des images aux LLM (GPT-4o, Gemini).
   */
  async imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string }> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(response.data, 'binary')
      const mimeType = response.headers['content-type'] || 'image/jpeg'

      return {
        data: buffer.toString('base64'),
        mimeType
      }
    } catch (error: any) {
      console.error(`[VimaxVisionUtils] Erreur lors de la conversion de l'image: ${url}`, error.message)
      throw error
    }
  },

  /**
   * Extrait les URLs d'images d'un texte (format markdown ou brut).
   */
  extractImageUrls(text: string): string[] {
    const urls: string[] = []
    const regex = /(https?:\/\/\S+?\.(?:png|jpg|jpeg|webp))/gi
    let match
    while ((match = regex.exec(text)) !== null) {
      urls.push(match[1])
    }
    return urls
  }
}
