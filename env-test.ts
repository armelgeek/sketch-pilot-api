import process from 'node:process'

console.info('--- ENV TEST ---')
console.info('OPENAI_API_KEY EXISTS:', !!process.env.OPENAI_API_KEY)
console.info('----------------')
