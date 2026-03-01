import type { VerificationCode } from '../models/verification-code.model'

export interface VerificationCodeRepositoryInterface {
  save: (verificationCode: VerificationCode) => Promise<VerificationCode>
  findLatestByChildId: (childId: string) => Promise<VerificationCode | null>
  remove: (id: string) => Promise<boolean>
  removeExpired: () => Promise<void>
}
