import { IUseCase } from '@/domain/types'
import { GenerateLocationImageUseCase } from './generate-location-image.use-case'

type RegenerateSeriesLocationImageParams = {
  userId: string
  seriesId: string
  locationName: string
}

type RegenerateSeriesLocationImageResponse = {
  success: boolean
  thumbnailUrl?: string
  error?: string
  insufficientCredits?: boolean
}

export class RegenerateSeriesLocationImageUseCase extends IUseCase<
  RegenerateSeriesLocationImageParams,
  RegenerateSeriesLocationImageResponse
> {
  private readonly generateLocationImageUseCase = new GenerateLocationImageUseCase()

  async execute({
    userId,
    seriesId,
    locationName
  }: RegenerateSeriesLocationImageParams): Promise<RegenerateSeriesLocationImageResponse> {
    return await this.generateLocationImageUseCase.execute({
      userId,
      seriesId,
      locationName
    })
  }
}
