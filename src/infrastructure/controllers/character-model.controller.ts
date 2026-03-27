import { OpenAPIHono } from '@hono/zod-openapi'
import { v4 as uuidv4 } from 'uuid'
import type { Routes } from '@/domain/types'
import { authMiddleware } from '../middlewares/auth.middleware'
import { CharacterModelRepository } from '../repositories/character-model.repository'

export class CharacterModelController implements Routes {
  private repository = new CharacterModelRepository()
  public controller = new OpenAPIHono()

  constructor() {
    this.initRoutes()
  }

  public initRoutes() {
    const router = new OpenAPIHono()

    router.use('*', authMiddleware)

    router.get('/v1/characters', async (c) => {
      const user = c.get('user')
      if (!user) return c.json({ error: 'Unauthorized' }, 401)
      const models = await this.repository.findAllByUserId(user.id)
      return c.json({ data: models })
    })

    router.post('/v1/characters', async (c) => {
      const user = c.get('user')
      if (!user) return c.json({ error: 'Unauthorized' }, 401)
      const body = await c.req.json()
      const newModel = await this.repository.create({
        id: uuidv4(),
        userId: user.id,
        name: body.name,
        description: body.description,
        gender: body.gender || 'unknown',
        age: body.age || 'unknown',
        voiceId: body.voiceId,
        isStandard: String(body.isStandard || 'false'),
        stylePrefix: body.stylePrefix,
        artistPersona: body.artistPersona,
        images: body.images || [],
        createdAt: new Date(),
        updatedAt: new Date()
      })
      return c.json(newModel)
    })

    router.patch('/v1/characters/:id', async (c) => {
      const id = c.req.param('id')
      const body = await c.req.json()
      const updated = await this.repository.update(id, body)
      return c.json(updated)
    })

    router.delete('/v1/characters/:id', async (c) => {
      const id = c.req.param('id')
      await this.repository.delete(id)
      return c.json({ success: true })
    })

    this.controller.route('/', router)
  }
}
