import { LLMServiceFactory } from '../../services/llm'

async function main() {
  const API_KEY = process.env.OPENAI_API_KEY
  if (!API_KEY) {
    console.error('OPENAI_API_KEY is missing')
    return
  }

  try {
    const llm = await LLMServiceFactory.create({
      provider: 'openai',
      apiKey: API_KEY,
      modelId: 'gpt-4o'
    })

    const response = await llm.generateContent('Dis bonjour en JSON', 'Tu es un assistant JSON.', 'application/json')
    console.log('Response:', response)
  } catch (error) {
    console.error('LLM Error:', error)
  }
}

main()
