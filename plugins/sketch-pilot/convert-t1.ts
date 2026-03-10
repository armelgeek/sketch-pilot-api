import sharp from 'sharp'

async function convertImage() {
  console.log('Converting t1.webp to t1.jpg...')
  try {
    await sharp('models/t1.webp').jpeg({ quality: 90 }).toFile('models/t1.jpg')
    console.log('Conversion complete!')
  } catch (error) {
    console.error('Conversion failed:', error)
  }
}

convertImage()
