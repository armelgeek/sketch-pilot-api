const crypto = require('node:crypto')
const { eq } = require('drizzle-orm')
const { Actions, Subjects } = require('../src/domain/types/permission.type')
const { auth } = require('../src/infrastructure/config/auth.config')
const { db } = require('../src/infrastructure/database/db/index')
const { roleResources, roles, userRoles, users } = require('../src/infrastructure/database/schema')

const SUPER_ADMINS = [
  {
    name: 'Yves',
    firstname: 'Perraudin',
    lastname: 'Yves',
    email: 'yves.perraudin@gmail.com'
  },
  {
    name: 'Fety Faraniarijaona',
    firstname: 'Fety',
    lastname: 'Faraniarijaona',
    email: 'fety.faraniarijaona@relia-consulting.com'
  },
  {
    name: 'Harena Fifaliana',
    firstname: 'Harena',
    lastname: 'Fifaliana',
    email: 'fifaliana.harena@relia-consulting.com'
  },
  {
    name: 'Armel Wanes',
    firstname: 'Armel',
    lastname: 'Wanes',
    email: 'armelgeek5@gmail.com'
  },
  {
    name: 'Andriniaina Ravaka RADIMY JEAN',
    firstname: 'Andriniaina',
    lastname: 'Ravaka RADIMY JEAN',
    email: 'andriniaina.radimy@relia-consulting.com'
  },
  {
    name: 'Nancia Rajerison',
    firstname: 'Nancia',
    lastname: 'Rajerison',
    email: 'rajerisonnancia@gmail.com'
  }
]

async function createSuperAdminRole() {
  const now = new Date()

  const existingRole = await db.query.roles.findFirst({
    where: eq(roles.name, 'Super Administrator')
  })

  if (existingRole) {
    console.log('✅ Rôle Super Administrator existe déjà:', existingRole.id)
    return existingRole
  }

  const [superAdminRole] = await db
    .insert(roles)
    .values({
      id: crypto.randomUUID(),
      name: 'Super Administrator',
      description: 'Full system access with all permissions',
      createdAt: now,
      updatedAt: now
    })
    .returning()

  const resources = Object.values(Subjects).map((subject) => ({
    id: crypto.randomUUID(),
    roleId: superAdminRole.id,
    resourceType: subject,
    actions: Object.values(Actions),
    conditions: {},
    createdAt: now,
    updatedAt: now
  }))

  await db.insert(roleResources).values(resources)

  console.log('✅ Rôle Super Administrator créé:', superAdminRole.id)
  return superAdminRole
}

async function createSuperAdmin(adminData, superAdminRole) {
  const now = new Date()
  const tempPassword = `password1234!`

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, adminData.email)
    })

    if (existingUser) {
      console.log(`📝 Utilisateur ${adminData.email} existe déjà`)

      const existingUserRole = await db.query.userRoles.findFirst({
        where: eq(userRoles.userId, existingUser.id)
      })

      if (!existingUserRole || existingUserRole.roleId !== superAdminRole.id) {
        await db.insert(userRoles).values({
          id: crypto.randomUUID(),
          userId: existingUser.id,
          roleId: superAdminRole.id,
          createdAt: now,
          updatedAt: now
        })
        console.log(`✅ Rôle super admin assigné à ${adminData.email}`)
      }

      return { user: existingUser, password: null, isExisting: true }
    }

    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: adminData.name,
        firstname: adminData.firstname,
        lastname: adminData.lastname,
        email: adminData.email,
        password: tempPassword,
        role: 'admin',
        banned: false,
        banReason: '',
        banExpires: new Date(0),
        isAdmin: true,
        isTrialActive: false,
        trialStartDate: new Date(0),
        trialEndDate: new Date(0),
        stripeCustomerId: ``,
        stripeSubscriptionId: ``,
        stripeCurrentPeriodEnd: new Date(0)
      }
    })

    if (!signUpResult.user) {
      throw new Error(`Échec de la création de l'utilisateur ${adminData.email}`)
    }

    const createdUser = signUpResult.user

    await db
      .update(users)
      .set({
        role: 'admin',
        isAdmin: true,
        emailVerified: true,
        updatedAt: now
      })
      .where(eq(users.id, createdUser.id))

    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      userId: createdUser.id,
      roleId: superAdminRole.id,
      createdAt: now,
      updatedAt: now
    })

    console.log(`✅ Super admin créé: ${createdUser.email}`)
    return { user: createdUser, password: tempPassword, isExisting: false }
  } catch (error) {
    console.error(`❌ Erreur lors de la création de ${adminData.email}:`, error)
    throw error
  }
}

async function main() {
  console.log(`🚀 Création de ${SUPER_ADMINS.length} super administrateur(s)...`)

  try {
    const superAdminRole = await createSuperAdminRole()

    const results = []

    for (const adminData of SUPER_ADMINS) {
      try {
        const result = await createSuperAdmin(adminData, superAdminRole)
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

    console.log(`✅ Succès: ${successful.length}`)
    console.log(`❌ Échecs: ${failed.length}`)

    if (successful.length > 0) {
      console.log('\n✅ SUPER ADMINS CRÉÉS/CONFIGURÉS:')
      successful.forEach((result) => {
        console.log(`📧 ${result.email}`)
        console.log(`🆔 ID: ${result.user.id}`)
        if (!result.isExisting && result.password) {
          console.log(`🔐 Mot de passe temporaire: ${result.password}`)
        }
        console.log('---')
      })

      if (successful.some((r) => !r.isExisting)) {
        console.log("⚠️ N'oubliez pas de changer les mots de passe lors de la première connexion!")
      }
    }

    if (failed.length > 0) {
      console.log('\n❌ ÉCHECS:')
      failed.forEach((result) => {
        console.log(`📧 ${result.email}: ${result.error}`)
      })
    }
  } catch (error) {
    console.error('❌ Erreur générale:', error)
    throw error
  }
}

main().catch(console.error)
