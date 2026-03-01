import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { db } from '@/infrastructure/database/db'
import { userRoles, users } from '@/infrastructure/database/schema'

interface Params {
  firstname: string | null
  lastname: string | null
  email: string
  roleIds: string[]
}

interface Response {
  success: boolean
  data?: {
    id: string
    name: string
    firstname: string | null
    lastname: string | null
    email: string
    lastLoginAt: string | null
    createdAt: string
    updatedAt: string
    tempPassword: string
  }
  error?: string
}

export class CreateAdminUserUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly db: any,
    private readonly auth: any,
    private readonly sendEmail: (args: any) => Promise<void>
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const { firstname, lastname, email, roleIds } = params
    const now = new Date()
    const tempPassword = `temp${Math.random().toString(36).slice(2, 15)}!A1`
    try {
      // Vérifier si l'utilisateur existe déjà
      const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) })
      if (existingUser) {
        return { success: false, error: 'Un utilisateur avec cet email existe déjà' }
      }
      // Création via auth
      const signUpResult = await this.auth.api.signUpEmail({
        body: {
          name: `${firstname ?? ''} ${lastname ?? ''}`.trim(),
          firstname,
          lastname,
          email,
          password: tempPassword,
          role: 'admin',
          banned: false,
          banReason: '',
          banExpires: null,
          isAdmin: true,
          isTrialActive: false,
          trialStartDate: null,
          trialEndDate: null,
          lastLoginAt: null,
          stripeCustomerId: '',
          stripeSubscriptionId: '',
          stripeCurrentPeriodEnd: null
        }
      })
      if (!signUpResult.user) {
        return { success: false, error: "Échec de la création de l'utilisateur" }
      }
      const createdUser = signUpResult.user
      await this.db
        .update(users)
        .set({
          role: 'admin',
          isAdmin: true,
          emailVerified: true,
          updatedAt: now
        })
        .where(eq(users.id, createdUser.id))
      for (const roleId of roleIds) {
        await db.insert(userRoles).values({
          id: crypto.randomUUID(),
          userId: createdUser.id,
          roleId,
          createdAt: now,
          updatedAt: now
        })
      }
      try {
        await this.sendEmail({
          to: email,
          subject: 'Bienvenue sur Meko Academy',
          text: `Bonjour ${firstname ?? ''},\n\nVotre compte administrateur a été créé sur Meko Academy.\n\nVous pouvez désormais vous connecter avec votre adresse email (${email}).\n\nBienvenue dans l'équipe !\n\nL'équipe Meko Academy`
        })
      } catch (mailError) {
        // Logging only, ne bloque pas la création
        console.error("Erreur lors de l'envoi de l'email de bienvenue:", mailError)
      }
      return {
        success: true,
        data: {
          id: createdUser.id,
          name: `${firstname ?? ''} ${lastname ?? ''}`.trim(),
          firstname,
          lastname,
          email,
          lastLoginAt: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          tempPassword
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Internal server error' }
    }
  }
  log(): ActivityType {
    return ActivityType.CREATE_USER
  }
}
