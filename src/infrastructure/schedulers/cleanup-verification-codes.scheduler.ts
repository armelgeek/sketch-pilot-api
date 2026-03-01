import type { VerificationCodeRepository } from '../repositories/verification-code.repository'

export class CleanupVerificationCodesScheduler {
  constructor(private readonly verificationCodeRepository: VerificationCodeRepository) {}

  async run(): Promise<void> {
    try {
      await this.verificationCodeRepository.removeExpired()
    } catch (error) {
      console.error('Error cleaning up expired verification codes:', error)
    }
  }
}
