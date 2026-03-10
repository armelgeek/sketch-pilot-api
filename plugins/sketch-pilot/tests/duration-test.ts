import { computeSceneCount, computeSceneRange, videoGenerationOptionsSchema } from '../src/types/video-script.types'

const opts1 = videoGenerationOptionsSchema.parse({ duration: 120 })
console.log('opts1', opts1)

const opts2 = videoGenerationOptionsSchema.parse({ minDuration: 90, maxDuration: 120 })
console.log('opts2', opts2)

console.log('scene count for opts2', computeSceneCount(opts2.duration), computeSceneRange(opts2.duration))
