import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { verificationCodes } from '@/infrastructure/database/schema'
import type { VerificationCode } from '@/domain/models/verification-code.model'
import type { VerificationCodeRepositoryInterface } from '@/domain/repositories/verification-code.repository.interface'

export class VerificationCodeRepository implements VerificationCodeRepositoryInterface {
  async save(verificationCode: VerificationCode): Promise<VerificationCode> {
    const [result] = await db.insert(verificationCodes).values(verificationCode).returning()
    return result
  }

  async findLatestByChildId(childId: string): Promise<VerificationCode | null> {
    const result = await db.query.verificationCodes.findFirst({
      where: and(eq(verificationCodes.childId, childId), gt(verificationCodes.expiresAt, new Date())),
      orderBy: (verificationCodes, { desc }) => [desc(verificationCodes.createdAt)]
    })
    return result || null
  }

  async remove(id: string): Promise<boolean> {
    const result = await db.delete(verificationCodes).where(eq(verificationCodes.id, id))
    return result.length > 0
  }

  async removeExpired(): Promise<void> {
    await db.delete(verificationCodes).where(lt(verificationCodes.expiresAt, new Date()))
  }
}
