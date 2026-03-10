#!/usr/bin/env ts-node

/**
 * Simple validation test for video types and genres
 * This test validates that the new types compile correctly and can be used
 */

import {
  videoGenerationOptionsSchema,
  videoGenreSchema,
  videoTypeSchema,
  type VideoGenerationOptions,
  type VideoGenre,
  type VideoType
} from '../src/types/video-script.types'

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('Testing Video Types & Genres Schema Validation')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// Test 1: Validate all video types
console.log('✅ Test 1: Video Types Validation')
const videoTypes: VideoType[] = [
  'faceless',
  'tutorial',
  'listicle',
  'news',
  'animation',
  'review',
  'story',
  'motivational',
  'entertainment'
]

videoTypes.forEach((type) => {
  const result = videoTypeSchema.safeParse(type)
  if (result.success) {
    console.log(`   ✓ ${type} - valid`)
  } else {
    console.error(`   ✗ ${type} - invalid`)
    process.exit(1)
  }
})

// Test 2: Validate all video genres
console.log('\n✅ Test 2: Video Genres Validation')
const videoGenres: VideoGenre[] = [
  'educational',
  'fun',
  'business',
  'lifestyle',
  'tech',
  'finance',
  'health',
  'travel',
  'food',
  'gaming',
  'sports',
  'science',
  'history',
  'self-improvement',
  'mystery',
  'general'
]

videoGenres.forEach((genre) => {
  const result = videoGenreSchema.safeParse(genre)
  if (result.success) {
    console.log(`   ✓ ${genre} - valid`)
  } else {
    console.error(`   ✗ ${genre} - invalid`)
    process.exit(1)
  }
})

// Test 3: Validate VideoGenerationOptions with types and genres
console.log('\n✅ Test 3: VideoGenerationOptions with Type & Genre')

const testOptions1: VideoGenerationOptions = {
  duration: 60,
  sceneCount: 6,
  style: 'educational',
  videoType: 'tutorial',
  videoGenre: 'tech',
  characterConsistency: true,
  animationClipDuration: 6,
  animationMode: 'ai'
}

const result1 = videoGenerationOptionsSchema.safeParse(testOptions1)
if (result1.success) {
  console.log('   ✓ Options with type & genre - valid')
} else {
  console.error('   ✗ Options with type & genre - invalid:', result1.error)
  process.exit(1)
}

// Test 4: Validate VideoGenerationOptions without types and genres (should be optional)
console.log('\n✅ Test 4: VideoGenerationOptions without Type & Genre (Optional)')

const testOptions2: VideoGenerationOptions = {
  duration: 60,
  sceneCount: 6,
  style: 'motivational',
  characterConsistency: true,
  animationClipDuration: 6,
  animationMode: 'ai'
}

// Additional test: autoTransitions field defaults to true and accepts false
const testOptionsAuto: VideoGenerationOptions = {
  duration: 30,
  animationMode: 'ai',
  autoTransitions: false // explicit disable
}
const resultAuto = videoGenerationOptionsSchema.safeParse(testOptionsAuto)
if (resultAuto.success) {
  console.log('   ✓ autoTransitions field - valid')
} else {
  console.error('   ✗ autoTransitions field - invalid:', resultAuto.error)
  process.exit(1)
}

const result2 = videoGenerationOptionsSchema.safeParse(testOptions2)
if (result2.success) {
  console.log('   ✓ Options without type & genre - valid (optional fields work)')
} else {
  console.error('   ✗ Options without type & genre - invalid:', result2.error)
  process.exit(1)
}

// Test 5: Test various combinations
console.log('\n✅ Test 5: Testing Various Type & Genre Combinations')

const combinations = [
  { type: 'tutorial' as VideoType, genre: 'tech' as VideoGenre, desc: 'Tutorial + Tech' },
  { type: 'listicle' as VideoType, genre: 'business' as VideoGenre, desc: 'Listicle + Business' },
  { type: 'story' as VideoType, genre: 'mystery' as VideoGenre, desc: 'Story + Mystery' },
  { type: 'review' as VideoType, genre: 'health' as VideoGenre, desc: 'Review + Health' },
  {
    type: 'motivational' as VideoType,
    genre: 'self-improvement' as VideoGenre,
    desc: 'Motivational + Self-improvement'
  }
]

combinations.forEach((combo) => {
  const options: VideoGenerationOptions = {
    duration: 60,
    sceneCount: 6,
    style: 'educational',
    videoType: combo.type,
    videoGenre: combo.genre,
    characterConsistency: true,
    animationClipDuration: 6,
    animationMode: 'ai'
  }

  const result = videoGenerationOptionsSchema.safeParse(options)
  if (result.success) {
    console.log(`   ✓ ${combo.desc} - valid`)
  } else {
    console.error(`   ✗ ${combo.desc} - invalid:`, result.error)
    process.exit(1)
  }
})

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('✅ All validation tests passed!')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

console.log('Summary:')
console.log(`- ${videoTypes.length} video types validated`)
console.log(`- ${videoGenres.length} video genres validated`)
console.log(`- ${combinations.length} type-genre combinations tested`)
console.log('- Optional fields work correctly\n')
