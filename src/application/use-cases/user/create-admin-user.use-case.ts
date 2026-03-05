import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types/use-case.type'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'

interface Params {
  firstname: string | null
  lastname: string | null
  email: string
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
    private readonly auth: any,
    private readonly sendEmail: (args: any) => Promise<void>
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    const { firstname, lastname, email } = params
    const now = new Date()
    const tempPassword = `temp${Math.random().toString(36).slice(2, 15)}!A1`
    try {
      const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) })
      if (existingUser) {
        return { success: false, error: 'Un utilisateur avec cet email existe déjà' }
      }

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
          lastLoginAt: null
        }
      })
      if (!signUpResult.user) {
        return { success: false, error: "Échec de la création de l'utilisateur" }
      }

      const createdUser = signUpResult.user
      await db.update(users)
        .set({ role: 'admin', isAdmin: true, emailVerified: true, updatedAt: now })
        .where(eq(users.id, createdUser.id))

      try {
        await this.sendEmail({
          to: email,
          subject: 'Welcome',
          text: `Hello ${firstname ?? ''},\n\nYour administrator account has been created.\n\nYou can log in with your email (${email}).\n\nWelcome!`
        })
      } catch (mailError) {
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
}
