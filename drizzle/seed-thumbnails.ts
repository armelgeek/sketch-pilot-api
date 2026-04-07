import { exit } from 'node:process'
import { db } from '../src/infrastructure/database/db/index'
import { thumbnailTemplates } from '../src/infrastructure/database/schema/assets-config.schema'

const templates = [
  {
    id: 'th-1',
    name: 'Impact Viral',
    imageUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=800',
    niche: 'entertainment'
  },
  {
    id: 'th-2',
    name: 'Cinématique Dark',
    imageUrl: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?auto=format&fit=crop&q=80&w=800',
    niche: 'storytelling'
  },
  {
    id: 'th-3',
    name: 'Gaming / Neon',
    imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800',
    niche: 'gaming'
  },
  {
    id: 'th-4',
    name: 'High Tech',
    imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800',
    niche: 'tech'
  },
  {
    id: 'th-5',
    name: 'Modern Business',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800',
    niche: 'business'
  },
  {
    id: 'th-6',
    name: 'Clean Lab',
    imageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800',
    niche: 'science'
  }
]

async function seed() {
  console.log('⏳ Seeding thumbnail templates...')
  for (const template of templates) {
    try {
      await db
        .insert(thumbnailTemplates)
        .values(template)
        .onConflictDoUpdate({
          target: thumbnailTemplates.id,
          set: { imageUrl: template.imageUrl, name: template.name, niche: template.niche }
        })
      console.log(`✅ Seeded: ${template.name}`)
    } catch (error) {
      console.error(`❌ Failed standard seed for ${template.name}:`, error.message)
    }
  }
}

seed()
  .then(() => {
    console.log('✨ All templates seeded!')
    exit(0)
  })
  .catch((error) => {
    console.error('💥 Fatal seeding error:', error)
    exit(1)
  })
