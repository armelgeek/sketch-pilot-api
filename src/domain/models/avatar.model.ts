import { z } from 'zod'

// eslint-disable-next-line unused-imports/no-unused-vars
const AvatarType = z.object({
  id: z.string().uuid(),
  path: z.string(),
  type: z.enum(['webp', 'jpeg', 'png']).default('webp')
})

export type Avatar = z.infer<typeof AvatarType>
