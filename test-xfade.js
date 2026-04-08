import ffmpeg from 'fluent-ffmpeg'

async function testXfade() {
  // Create dummy clips
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=black:s=1280x720:r=30:d=5')
      .inputFormat('lavfi')
      .input('anullsrc=r=44100:cl=stereo:d=5')
      .inputFormat('lavfi')
      .outputOptions(['-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-t 5'])
      .save('test1.mp4')
      .on('end', resolve)
      .on('error', reject)
  })

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=blue:s=1280x720:r=30:d=3')
      .inputFormat('lavfi')
      .input('anullsrc=r=44100:cl=stereo:d=3')
      .inputFormat('lavfi')
      .outputOptions(['-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-t 3'])
      .save('test2.mp4')
      .on('end', resolve)
      .on('error', reject)
  })

  const command = ffmpeg()
  command.input('test1.mp4')
  command.input('test2.mp4')

  let filterComplex = ''
  // Replacing compand with loudnorm
  filterComplex += `[0:v]setpts=PTS-STARTPTS,settb=AVTB[v_in_0];`
  filterComplex += `[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=44100,loudnorm[a_in_0];`
  filterComplex += `[1:v]setpts=PTS-STARTPTS,settb=AVTB[v_in_1];`
  filterComplex += `[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=44100,loudnorm[a_in_1];`

  const transitionName = 'fade'
  const transitionDuration = 0.5
  const audioOverlap = 0.1
  const offset = 5 - transitionDuration

  filterComplex += `[v_in_0][v_in_1]xfade=transition=${transitionName}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}[v_out_1];`
  filterComplex += `[a_in_0][a_in_1]acrossfade=d=${audioOverlap.toFixed(3)}:c1=tri:c2=tri[a_out_1]`

  console.info('Filter:', filterComplex)

  return new Promise((resolve, reject) => {
    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map',
        '[v_out_1]',
        '-map',
        '[a_out_1]',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac'
      ])
      .on('error', (err, stdout, stderr) => {
        console.error('Error:', err.message)
        console.error('Stderr:', stderr)
        reject(err)
      })
      .on('end', () => {
        console.info('Success!')
        resolve(null)
      })
      .save('output.mp4')
  })
}

testXfade().catch(console.error)
