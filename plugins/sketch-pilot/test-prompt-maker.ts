import { PromptMaker } from './src/core/prompt-maker'
import { PSYCHOLOGY_VIDEO_SPEC } from './src/core/specs/psychology.spec'

const maker = new PromptMaker(PSYCHOLOGY_VIDEO_SPEC)
const prompt = maker.build({
  subject: 'discipline mentale',
  duration: '5 minutes',
  audience: 'jeunes entrepreneurs 18-35 ans'
})

console.log('=== GENERATED PROMPT ===')
console.log(prompt)
console.log('========================')
