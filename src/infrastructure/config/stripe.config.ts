import Stripe from 'stripe'
export function absoluteUrl(path: string) {
  return `${Bun.env.REACT_APP_URL}${path}`
}

export const stripe = new Stripe(Bun.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
  typescript: true
})
