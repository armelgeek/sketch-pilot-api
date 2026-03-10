import { PromptManager } from './src/core/prompt-manager'
import type { VideoGenerationOptions } from './src/types/video-script.types'

const pm = new PromptManager()
const opts: VideoGenerationOptions = {} as any
console.log(pm.buildScriptSystemPrompt(opts))
