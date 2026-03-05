import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { auth } from '../config/auth.config'
import { UserRepository } from '../repositories/user.repository'
import type { Routes } from '../../domain/types'

export class AuthController implements Routes {
  public controller: OpenAPIHono
  private userRepository: UserRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.userRepository = new UserRepository()
    this.initRoutes()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/auth/verify-otp',
        tags: ['Auth'],
        summary: 'Vérifie un OTP et met à jour le profil utilisateur si besoin',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  email: z.string().email(),
                  otp: z.string().min(4),
                  isSignUp: z.boolean().optional(),
                  firstName: z.string().optional(),
                  lastName: z.string().optional()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'OTP vérifié et profil éventuellement mis à jour',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.any().optional(),
                  error: z.string().optional()
                })
              }
            }
          },
          400: {
            description: 'Erreur de vérification',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  error: z.string()
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { email, otp, isSignUp, firstName, lastName } = await c.req.json()
          // Vérifier l'OTP via l'API Better Auth
          // Utiliser la bonne méthode de Better Auth pour vérifier l'OTP
          const result = await (auth.api as any).signInEmailOTP({ body: { email, otp } })
          if (!result?.user) {
            return c.json({ success: false, error: `OTP invalide ou expiré` }, 400)
          }

          // Mettre à jour le profil utilisateur si besoin
          if (isSignUp && (firstName || lastName)) {
            const user = await this.userRepository.findByEmail(email)
            if (!user) {
              return c.json({ success: false, error: `Utilisateur non trouvé` }, 400)
            }
            const name = [firstName, lastName].filter(Boolean).join(' ')
            await this.userRepository.update(user.id, {
              name: name.trim() || user.name,
              firstname: firstName ?? user.firstname,
              lastname: lastName ?? user.lastname
            })
          }

          return c.json({ success: true })
        } catch (error: any) {
          return c.json({ success: false, error: error.message || 'Erreur interne' }, 400)
        }
      }
    )
  }
}
