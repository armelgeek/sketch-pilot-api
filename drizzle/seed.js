function seed() {
  console.log('⏳ Seeding database...')
  console.log('✅ Database seeded')
}

await seed().catch((error) => {
  console.error('❌ Seeding failed:', error)
})
