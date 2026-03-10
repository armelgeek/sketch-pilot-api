const { eq } = require('drizzle-orm')
const { auth } = require('../src/infrastructure/config/auth.config')
const { db } = require('../src/infrastructure/database/db/index')
const { users } = require('../src/infrastructure/database/schema')

const SUPER_ADMINS = [
  {
    name: 'Armel Wanes',
    firstname: 'Armel',
    lastname: 'Wanes',
    email: 'armelgeek5@gmail.com'
  }
]

async function createSuperAdmin(adminData) {
  const now = new Date()
  const tempPassword = `password1234!`

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, adminData.email)
    })

    if (existingUser) {
      console.log(`📝 Utilisateur ${adminData.email} existe déjà`)

      // Ensure they have admin privileges
      await db
        .update(users)
        .set({
          role: 'admin',
          isAdmin: true,
          emailVerified: true,
          updatedAt: now
        })
        .where(eq(users.id, existingUser.id))

      return { user: existingUser, password: null, isExisting: true }
    }

    // Create user via better-auth
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: adminData.name,
        email: adminData.email,
        password: tempPassword
      }
    })

    if (!signUpResult.user) {
      throw new Error(`Échec de la création de l'utilisateur ${adminData.email}`)
    }

    const createdUser = signUpResult.user

    // Update user with admin privileges and additional fields
    await db
      .update(users)
      .set({
        firstname: adminData.firstname,
        lastname: adminData.lastname,
        role: 'admin',
        isAdmin: true,
        emailVerified: true,
        updatedAt: now
      })
      .where(eq(users.id, createdUser.id))

    console.log(`✅ Admin créé: ${createdUser.email}`)
    return { user: createdUser, password: tempPassword, isExisting: false }
  } catch (error) {
    console.error(`❌ Erreur lors de la création de ${adminData.email}:`, error)
    throw error
  }
}

async function main() {
  console.log(`🚀 Création de ${SUPER_ADMINS.length} administrateur(s)...`)
  console.log('='.repeat(50))

  try {
    const results = []

    for (const adminData of SUPER_ADMINS) {
      try {
        const result = await createSuperAdmin(adminData)
        results.push({
          email: adminData.email,
          success: true,
          ...result
        })
      } catch (error) {
        results.push({
          email: adminData.email,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    console.log('\n📊 RÉSUMÉ DE LA CRÉATION:')
    console.log('='.repeat(50))

    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    console.log(`✅ Succès: ${successful.length}/${results.length}`)
    console.log(`❌ Échecs: ${failed.length}/${results.length}`)

    if (successful.length > 0) {
      console.log('\n✅ ADMINS CRÉÉS/CONFIGURÉS:')
      console.log('='.repeat(50))
      successful.forEach((result) => {
        console.log(`📧 ${result.email}`)
        console.log(`🆔 ID: ${result.user.id}`)
        console.log(`👤 Nom: ${result.user.name}`)
        if (!result.isExisting && result.password) {
          console.log(`🔐 Mot de passe temporaire: ${result.password}`)
        } else {
          console.log(`✓ Admin existant, privileges assignés`)
        }
        console.log('---')
      })

      if (successful.some((r) => !r.isExisting)) {
        console.log("\n⚠️ N'oubliez pas de changer les mots de passe temporaires lors de la première connexion!")
      }
    }

    if (failed.length > 0) {
      console.log('\n❌ ÉCHECS:')
      console.log('='.repeat(50))
      failed.forEach((result) => {
        console.log(`📧 ${result.email}: ${result.error}`)
      })
    }

    console.log('\n✅ Création terminée avec succès!')
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

main().catch(console.error)
