const TimingMapper = {
  normalize(text: string): string {
    if (!text) return ''
    return text
      .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
      .replaceAll('-', ' ')
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}\s']/gu, '')
      .replaceAll(/\s+/g, ' ')
      .trim()
  },

  run() {
    const targetWords = this.normalize(
      "Tu te retrouves face à une montagne de tâches... mais tout ce que tu fais, c'est fixer le mur. C'est comme si un aimant invisible te clouait à ta chaise. Il te tire doucement loin de tout effort..."
    )
      .split(' ')
      .filter(Boolean)
    const transcript =
      "tu te retrouves face à une montagne de tâche mais tout ce que tu fais c'est fixer le mur c'est comme si un aimant invisible te clouait à ta chaise il te tire doucement loin de tout est fort Tu sais que tu devrais te lever".split(
        ' '
      )
    const transcribedWords = transcript.map((w, i) => ({
      word: w,
      start: i,
      end: i + 0.5,
      startMs: i * 1000,
      durationMs: 500
    }))

    const n = targetWords.length
    const GAP_LIMIT = 8

    const i = 0
    let narIdx = 0
    let wIdx = i
    let gapCount = 0
    const windowEnd = Math.min(i + Math.ceil(n * 1.5) + 10, transcribedWords.length)

    while (narIdx < n && wIdx < windowEnd) {
      const ww = this.normalize(transcribedWords[wIdx].word)
      const nw = targetWords[narIdx]
      if (ww === nw || ww.startsWith(nw) || nw.startsWith(ww)) {
        narIdx++
        gapCount = 0
        console.info(`MATCH at wIdx=${wIdx} (WW="${ww}") with narIdx=${narIdx - 1} (NW="${nw}")`)
      } else {
        gapCount++
        console.info(`GAP at wIdx=${wIdx} (WW="${ww}"), gapCount=${gapCount}`)
        if (gapCount > GAP_LIMIT) break
      }
      wIdx++
    }

    console.info(`Final wIdx=${wIdx}, bestEndIdx=${wIdx - 1}`)
  }
}
TimingMapper.run()
