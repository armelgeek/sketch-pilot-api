#!/usr/bin/env bun

/**
 * Script d'initialisation de la configuration système
 * Usage: bun scripts/init-system-config.ts
 */

import process from 'node:process'

import { eq } from 'drizzle-orm'

import { db } from '../src/infrastructure/database/db'
import { systemConfig } from '../src/infrastructure/database/schema/schema'

async function initSystemConfig() {
  console.log('🔧 Initialisation de la Configuration Système\n')

  const now = new Date()
  const configs = [
    {
      id: 'config_isTrialRequired',
      key: 'isTrialRequired',
      value: 'false',
      description: "Détermine si une période d'essai est obligatoire",
      isActive: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'config_maintenanceMode',
      key: 'maintenanceMode',
      value: 'false',
      description: "Active le mode maintenance (bloque l'accès utilisateur)",
      isActive: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'config_allowNewRegistrations',
      key: 'allowNewRegistrations',
      value: 'true',
      description: 'Autorise ou bloque les nouvelles inscriptions',
      isActive: true,
      createdAt: now,
      updatedAt: now
    }
  ]

  for (const config of configs) {
    try {
      // Vérifier si la configuration existe déjà
      const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, config.key)).limit(1)

      if (existing.length > 0) {
        console.log(`✅ Configuration "${config.key}" existe déjà`)
      } else {
        // Insérer la nouvelle configuration
        await db.insert(systemConfig).values(config)
        console.log(`✨ Configuration "${config.key}" créée avec valeur: ${config.value}`)
      }
    } catch (error) {
      console.error(`❌ Erreur lors de l'initialisation de "${config.key}":`, error)
    }
  }

  console.log('\n🎉 Initialisation terminée !')

  // Afficher la configuration finale
  console.log('\n📋 Configuration actuelle :')
  const allConfigs = await db.select().from(systemConfig).where(eq(systemConfig.isActive, true))
  for (const config of allConfigs) {
    console.log(`  ${config.key}: ${config.value}`)
  }
}

// Exécution du script
try {
  await initSystemConfig()
  process.exit(0)
} catch (error) {
  console.error("❌ Erreur lors de l'initialisation:", error)
  process.exit(1)
}
