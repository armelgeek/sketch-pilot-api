import type { ModuleCoverService } from '@/application/services/module-cover.service'

export class UploadModuleCoverUseCase {
  constructor(private moduleCoverService: ModuleCoverService) {}

  async execute(data: {
    file: File
  }): Promise<{ success: boolean; data?: { id: string; url: string }; error?: string }> {
    try {
      const result = await this.moduleCoverService.uploadModuleCover(data.file)

      return {
        success: true,
        data: result
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to upload module cover'
      }
    }
  }
}
