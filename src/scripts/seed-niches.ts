import process from 'node:process'
import { db } from '../infrastructure/database/db'
import { promptCategories, prompts } from '../infrastructure/database/schema/prompt.schema'

const categories = [
  { id: 'series', name: 'Series & Sagas', description: 'Multi-episode stories with narrative continuity.' },
  { id: 'standalone', name: 'One-Shot & Facts', description: 'Single videos, quick facts, and quotes.' },
  { id: 'marketing', name: 'Marketing & Business', description: 'Promotional content and product demos.' }
]

const niches = [
  // --- SERIES ---
  {
    name: 'True Crime',
    categoryId: 'series',
    description: 'Cold and factual investigative series.',
    config: {
      role: 'Tu es un narrateur de true crime. Voix froide, précise, fascinée par les détails factuels.',
      narrativeProgression: 'hook → contexte → faits → tension → révélation → verdict',
      instructions: [
        'PRIME DIRECTIVE: Commence par un fait choquant.',
        'Utilise des dates, lieux et noms exacts.',
        'Laisse le silence parler — phrases courtes.',
        'Ne juge jamais — les faits parlent seuls.'
      ],
      visualRules: ['Chiaroscuro lighting', 'Cold tones', 'VHS grain']
    }
  },
  {
    name: 'Banana Jalouse',
    categoryId: 'series',
    description: 'The iconic romantic drama series.',
    config: {
      role: 'Tu es un expert en psychologie des relations. Ton intense et passionné.',
      narrativeProgression: 'désir → doute → trahison → confrontation → amertume',
      instructions: [
        'Met en avant les silences et les regards.',
        'Utilise des mots comme "obsession", "secret", "clivage".',
        'Le narrateur doit sembler savoir ce que les personnages cachent.',
        'Chaque scène doit augmenter la jalousie ressentie.'
      ],
      visualRules: ['Golden hour romance', 'Stormy backgrounds', 'Extreme close-ups']
    }
  },
  {
    name: 'Scary Stories',
    categoryId: 'series',
    description: 'Horror series focusing on suspense and scares.',
    config: {
      role: 'Tu es une entité anonyme racontant des horreurs.',
      narrativeProgression: 'normalité → malaise → apparition → horreur → fin ouverte',
      visualRules: ['Flickering lights', 'Deep shadows', 'Noir sketch style']
    }
  },

  // --- STANDALONE ---
  {
    name: 'Stoicism',
    categoryId: 'standalone',
    description: 'Daily wisdom for one-shot videos.',
    config: {
      role: 'Tu es Marc Aurèle. Ton autoritaire mais apaisant.',
      visualRules: ['Marble statues', 'Black backgrounds', 'Dramatic museum lighting']
    }
  },
  {
    name: 'Psychology Facts',
    categoryId: 'standalone',
    config: {
      role: 'Tu es un chercheur en neurologie.',
      visualRules: ['Abstract neural networks']
    }
  },

  // --- MARKETING ---
  {
    name: 'Business Stories',
    categoryId: 'marketing',
    config: {
      role: 'Tu es un analyste de Forbes.',
      visualRules: ['Corporate minimalism', 'Glass buildings']
    }
  }
]

async function seed() {
  console.log('🌱 Seeding Normalized Niche Specifications (Series included)...')

  // 1. Seed Categories
  for (const cat of categories) {
    await db
      .insert(promptCategories)
      .values({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        isActive: true
      })
      .onConflictDoUpdate({
        target: promptCategories.id,
        set: { name: cat.name, description: cat.description, updatedAt: new Date() }
      })
    console.log(`📂 Seeded category: ${cat.name}`)
  }

  // 2. Seed Niches
  for (const niche of niches) {
    const id = niche.name.toLowerCase().replaceAll(' ', '-')
    await db
      .insert(prompts)
      .values({
        id,
        name: niche.name,
        categoryId: niche.categoryId,
        description: niche.description || `Official ${niche.name} specification.`,
        config: niche.config,
        isActive: true
      })
      .onConflictDoUpdate({
        target: prompts.id,
        set: {
          categoryId: niche.categoryId,
          config: niche.config,
          description: niche.description || `Official ${niche.name} specification.`,
          updatedAt: new Date()
        }
      })
    console.log(`✅ Seeded niche: ${niche.name}`)
  }

  console.log('✨ Seeding completed!')
  process.exit(0)
}

seed().catch((error) => {
  console.error('❌ Seeding failed:', error)
  process.exit(1)
})
