import { createGunzip, createInflate, createInflateRaw } from 'node:zlib'

class CustomDecompressionStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(format: 'gzip' | 'deflate' | 'deflate-raw') {
    let zlibStream: any
    if (format === 'gzip') {
      zlibStream = createGunzip()
    } else if (format === 'deflate') {
      zlibStream = createInflate()
    } else if (format === 'deflate-raw') {
      zlibStream = createInflateRaw()
    } else {
      throw new TypeError(`Unsupported format: ${format}`)
    }

    super({
      start(controller) {
        zlibStream.on('data', (chunk: Uint8Array) => controller.enqueue(chunk))
        zlibStream.on('error', (err: Error) => controller.error(err))
        zlibStream.on('end', () => {
          try {
            controller.terminate()
          } catch {
            // Already closed
          }
        })
      },
      transform(chunk) {
        return new Promise<void>((resolve, reject) => {
          const isFull = !zlibStream.write(chunk, (err: Error | null) => (err ? reject(err) : resolve()))
          if (isFull) {
            zlibStream.once('drain', resolve)
          }
        })
      },
      flush() {
        return new Promise<void>((resolve, reject) => {
          zlibStream.once('end', resolve)
          zlibStream.once('error', reject)
          zlibStream.end()
        })
      }
    })
  }
}

if (typeof globalThis.DecompressionStream === 'undefined') {
  // @ts-ignore
  globalThis.DecompressionStream = CustomDecompressionStream
  console.info('[Polyfill] Custom DecompressionStream added to globalThis')
}
