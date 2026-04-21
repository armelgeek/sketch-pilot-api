import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { AssetProfile } from '../types'

/**
 * VimaxAssetExtractor
 * Extrait les objets, artefacts et entités non-humaines (assets) d'un script.
 */
export class VimaxAssetExtractor extends VimaxBaseAgent {
  public id = 'asset-extractor'

  async extractAssets(script: string): Promise<AssetProfile[]> {
    return []
  }
}
