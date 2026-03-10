import * as fs from 'node:fs'
import * as dotenv from 'dotenv'

dotenv.config()

async function testGeminiFetch() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('No GEMINI_API_KEY found in .env')
    return
  }

  const imagePath = 'models/t1.webp'
  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found at ${imagePath}`)
    return
  }

  const fileBuffer = fs.readFileSync(imagePath)
  const base64Data = fileBuffer.toString('base64')

  const payload = {
    contents: [
      {
        parts: [
          {
            text: 'REFERENCE IMAGES: Use the following images as the ABSOLUTE SOURCE OF TRUTH for character identity, clothing, and artistic style. All generated scenes must remain 100% consistent with these models.'
          },
          { inlineData: { mimeType: 'image/webp', data: base64Data } },
          {
            text: '2D clean vector cartoon in Crayon Capital style, consistent characters from reference, STICKMAN MATCHING: Must have EXACTLY the same visual appearance as the reference image(s) provided. Same head style, limb proportions, body structure, line thickness. STYLE CONSISTENCY: Use the exact same sketchy/line style as shown in the reference images. Maintain line weight and visual aesthetic.'
          }
        ]
      }
    ],
    generationConfig: {
      // responseModalities is currently in beta/allowlist for image generation via Gemini API
      // Let's standard text generation first to see if it even accepts the image
      temperature: 0.4
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  }

  console.log('Calling Gemini API via raw fetch...')
  try {
    // First try gemini-2.5-flash since image gen might throw errors if account isn't allowlisted
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    )

    const data = await response.json()
    console.log('Status:', response.status)
    if (data.candidates && data.candidates.length > 0) {
      console.log('Candidate Finish Reason:', data.candidates[0].finishReason)
      if (data.candidates[0].content && data.candidates[0].content.parts) {
        console.log('Text Response:', data.candidates[0].content.parts[0].text)
      }
    } else {
      console.log('Response:', JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('Fetch error:', error)
  }
}

testGeminiFetch()
