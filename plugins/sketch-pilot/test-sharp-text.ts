import fs from 'node:fs'

async function main() {
  const width = 1280
  const height = 720

  // Save SVG directly instead of rendering to PNG
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
        <rect x="100" y="500" width="300" height="80" rx="20" ry="20" fill="green" />
        <text x="120" y="550" font-family="Arial" font-weight="bold" font-size="40" fill="white">Hello World</text>
    </svg>`

  fs.writeFileSync('test-svg-sharp.svg', svg)
  console.log('Saved test-svg-sharp.svg')
}

main().catch(console.error)
