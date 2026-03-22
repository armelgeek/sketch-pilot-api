export type EventName =
  | 'user.created'
  | 'user.generated_video'
  | 'user.downloaded_video'
  | 'user.inactive'
  | 'user.credits_low'
  | 'user.trial_started'
  | 'user.trial_ending'

export interface EventPayload {
  userId: string
  userEmail: string
  userName: string
  [key: string]: unknown
}

type Listener<T extends EventPayload = EventPayload> = (payload: T) => void | Promise<void>

class EventBus {
  private readonly listeners: Partial<Record<EventName, Listener[]>> = {}

  on<T extends EventPayload = EventPayload>(event: EventName, cb: Listener<T>): void {
    const existing = this.listeners[event] ?? []
    this.listeners[event] = [...existing, cb as Listener]
  }

  async emit<T extends EventPayload = EventPayload>(event: EventName, payload: T): Promise<void> {
    const handlers = this.listeners[event] ?? []
    for (const handler of handlers) {
      try {
        await handler(payload as EventPayload)
      } catch (err) {
        console.error(`[EventBus] Handler error for "${event}":`, err)
      }
    }
  }
}

export const eventBus = new EventBus()
