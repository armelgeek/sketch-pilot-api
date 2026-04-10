import { Buffer } from 'node:buffer'
import process from 'node:process'
import axios from 'axios'
import { GeminiImageService } from '../plugins/sketch-pilot/src/services/image/gemini-image.service'

// Mocking axios for testing without real network/API key
jest.mock('axios')

async function testGeminiReferences() {
  console.log('--- Testing GeminiImageService URL Resolution ---')

  const service = new GeminiImageService({
    apiKey: 'test-key',
    provider: 'gemini'
  })

  const testUrl = 'http://example.com/image.png'
  const testBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BfAAAACQEHpkc7nQAAAABJRU5ErkJggg==' // 1x1 red dot

  // Mock axios to return a buffer
  ;(axios.get as jest.Mock).mockResolvedValue({
    data: Buffer.from(testBase64, 'base64')
  })

  console.log('Testing generateImage with URL reference...')

  // We override generateContent to check the arguments
  let capturedContents: any[] = []
  ;(service as any).client.models.generateContent = jest.fn().mockImplementation((args) => {
    capturedContents = args.contents
    return {
      candidates: [
        { content: { parts: [{ inlineData: { data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' } }] } }
      ]
    }
  })

  try {
    await service.generateImage('A test prompt', 'output.png', {
      referenceImages: [{ name: 'test-char', data: testUrl }]
    })

    console.log('Captured parts for Gemini:')
    capturedContents[1].forEach((part: any, i: number) => {
      if (part.inlineData) {
        console.log(
          `Part ${i} (Image): data length = ${part.inlineData.data.length}, starts with = ${part.inlineData.data.slice(0, 20)}`
        )
      } else if (part.text) {
        console.log(`Part ${i} (Text): ${part.text}`)
      }
    })

    const imagePart = capturedContents.find((p) => p.inlineData)
    if (imagePart && imagePart.inlineData.data === testBase64) {
      console.log('✅ URL correctly resolved to Base64!')
    } else {
      console.log('❌ URL resolution failed.')
      console.log('Actual data:', imagePart?.inlineData?.data)
    }
  } catch (error) {
    console.error('Test failed with error:', error)
  }

  process.exit(0)
}

// Since we don't have jest environment here, I'll do a simpler non-jest test if needed,
// but I'll just check if the logic in the file is correct.
// Optimization: I'll just write a script that I can run with tsx and mocks axios manually.

async function manualTest() {
  const { GeminiImageService } = await import('../plugins/sketch-pilot/src/services/image/gemini-image.service')
  new GeminiImageService({ apiKey: 'fake', provider: 'gemini' })

  // Simulate what generateImage would do
  const baseImages = [{ name: 'test', data: 'http://localhost:9000/image.png' }]

  console.log('Manual Logic Check:')
  for (const img of baseImages) {
    const isObject = typeof img === 'object'
    const raw = isObject ? (img as any).data : (img as string)
    console.log('Raw input:', raw)

    if (raw.startsWith('http')) {
      console.log('Detected URL, would download...')
    }
  }
}

testGeminiReferences()
manualTest()
