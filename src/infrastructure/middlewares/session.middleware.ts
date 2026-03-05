import { auth } from '../config/auth.config'
import type { Context, Next } from 'hono'

const addSession = async (c: Context, next: Next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    c.set('user', null as any)
    c.set('session', null)
    return next()
  }

  c.set('user', session.user as any)
  c.set('session', session.session)

  return next()
}

export default addSession
