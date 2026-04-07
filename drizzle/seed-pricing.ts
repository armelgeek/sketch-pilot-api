import { exit } from 'node:process'
import { PricingRepository } from '../src/infrastructure/repositories/pricing.repository'
import 'dotenv/config'

const pricingRepository = new PricingRepository()

async function seed() {
  console.log('⏳ Seeding Pricing Data...')

  // 1. Subscription Plans
  const plans = [
    {
      id: 'pro-plan',
      name: 'Pro',
      description: 'Pour les créateurs sérieux publiant régulièrement.',
      monthlyLimit: 400,
      priceMonthlyAmount: '19',
      priceYearlyAmount: '180',
      currency: 'eur',
      isDefault: false,
      isFeatured: true,
      features: [
        '400 crédits / mois inclus',
        'Exportation 1080p / 4K',
        'Sans filigrane',
        'Rendu prioritaire',
        'Voix narrateurs Premium'
      ]
    },
    {
      id: 'studio-plan',
      name: 'Studio',
      description: "Pour les agences et l'automatisation massive.",
      monthlyLimit: 1200,
      priceMonthlyAmount: '49',
      priceYearlyAmount: '468',
      currency: 'eur',
      isDefault: false,
      isFeatured: false,
      features: [
        '1 200 crédits / mois inclus',
        'Exportation 4K Ultra HD',
        'Sans filigrane',
        'Accès API complet',
        'Génération en masse'
      ]
    }
  ]

  for (const plan of plans) {
    console.log(`Creating plan: ${plan.name}...`)
    try {
      await pricingRepository.createPlan(plan)
      console.log(`✅ Plan ${plan.name} created and synced with Stripe.`)
    } catch (error) {
      console.error(`❌ Failed to create plan ${plan.name}:`, error)
    }
  }

  // 2. Credit Packs
  const packs = [
    {
      id: 'pack-starter',
      name: 'Pack Découverte',
      credits: 100,
      priceAmount: '5',
      currency: 'eur',
      isFeatured: false,
      description: 'Idéal pour tester une nouvelle niche.'
    },
    {
      id: 'pack-pro',
      name: 'Pack Pro',
      credits: 500,
      priceAmount: '20',
      currency: 'eur',
      isFeatured: true,
      description: 'Le meilleur rapport qualité/prix pour vos projets.'
    },
    {
      id: 'pack-studio',
      name: 'Pack Studio',
      credits: 1500,
      priceAmount: '50',
      currency: 'eur',
      isFeatured: false,
      description: 'Pour les besoins importants en génération.'
    }
  ]

  for (const pack of packs) {
    console.log(`Creating pack: ${pack.name}...`)
    try {
      await pricingRepository.createCreditPack(pack)
      console.log(`✅ Pack ${pack.name} created and synced with Stripe.`)
    } catch (error) {
      console.error(`❌ Failed to create pack ${pack.name}:`, error)
    }
  }

  console.log('🏁 Seeding finished!')
}

seed()
  .then(() => exit(0))
  .catch((error) => {
    console.error(error)
    exit(1)
  })
