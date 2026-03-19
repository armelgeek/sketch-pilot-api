const fs = require('node:fs')
let content = fs.readFileSync('/tmp/ass-base.ts', 'utf8')

// 1. In buildStandardLine
content = content.replace(
  `    line.words.forEach((activeWord, activeIdx) => {\n      const t0 = msToAss(activeWord.startMs)\n      const t1 = msToAss(activeWord.startMs + activeWord.durationMs)`,
  `    line.words.forEach((activeWord, activeIdx) => {\n      const nextWord = line.words[activeIdx + 1]\n      const endTimeMs = Math.min(activeWord.startMs + activeWord.durationMs, nextWord?.startMs ?? Infinity)\n      const t0 = msToAss(activeWord.startMs)\n      const t1 = msToAss(endTimeMs)`
)

// 2. In buildNeonLine
content = content.replace(
  `    line.words.forEach((activeWord, activeIdx) => {\n      const t0 = msToAss(activeWord.startMs)\n      const t1 = msToAss(activeWord.startMs + activeWord.durationMs)`,
  `    line.words.forEach((activeWord, activeIdx) => {\n      const nextWord = line.words[activeIdx + 1]\n      const endTimeMs = Math.min(activeWord.startMs + activeWord.durationMs, nextWord?.startMs ?? Infinity)\n      const t0 = msToAss(activeWord.startMs)\n      const t1 = msToAss(endTimeMs)`
)

// 3. In buildTypewriterLine
content = content.replace(
  `    line.words.forEach((activeWord, activeIdx) => {\n      const t0 = msToAss(activeWord.startMs)\n      const t1 = msToAss(activeWord.startMs + activeWord.durationMs)`,
  `    line.words.forEach((activeWord, activeIdx) => {\n      const nextWord = line.words[activeIdx + 1]\n      const endTimeMs = Math.min(activeWord.startMs + activeWord.durationMs, nextWord?.startMs ?? Infinity)\n      const t0 = msToAss(activeWord.startMs)\n      const t1 = msToAss(endTimeMs)`
)
content = content.replace(
  `          } else if (i === activeIdx) {\n            return \`{\\\\c\${this.highlightColor}\\\\bord\${this.borderSize}\\\\shad\${this.shadowSize}\\\\fad(\${FADE_MS},0)}\${this.cleanWord(w.word)}\``,
  `          } else if (i === activeIdx) {\n            return \`{\\\\c\${this.highlightColor}\\\\bord\${this.borderSize}\\\\shad\${this.shadowSize}\\\\alpha&HFF&\\\\t(0,\${FADE_MS},\\\\alpha&H00&)}\${this.cleanWord(w.word)}\``
)

// 4. In buildScalingLine
content = content.replace(
  `    line.words.forEach((activeWord, activeIdx) => {\n      const totalMs = activeWord.durationMs`,
  `    line.words.forEach((activeWord, activeIdx) => {\n      const nextWord = line.words[activeIdx + 1]\n      const totalMs = Math.min(activeWord.durationMs, (nextWord?.startMs ?? Infinity) - activeWord.startMs)\n`
)

// 5. In buildBounceLine
content = content.replace(
  `    line.words.forEach((activeWord, activeIdx) => {\n      const layout = layouts[activeIdx]`,
  `    line.words.forEach((activeWord, activeIdx) => {\n      const nextWord = line.words[activeIdx + 1]\n      const durationMs = Math.min(activeWord.durationMs, (nextWord?.startMs ?? Infinity) - activeWord.startMs)\n      const layout = layouts[activeIdx]`
)
content = content.replace(
  `const yFrames = springKeyframes(fromY, toY, activeWord.durationMs, {`,
  `const yFrames = springKeyframes(fromY, toY, durationMs, {`
)

// 6. In buildAnimatedBgLine
content = content.replace(
  `    line.words.forEach((activeWord, activeIdx) => {\n      const wordStartMs = activeWord.startMs\n      const wordEndMs = activeWord.startMs + activeWord.durationMs`,
  `    line.words.forEach((activeWord, activeIdx) => {\n      const nextWord = line.words[activeIdx + 1]\n      const wordStartMs = activeWord.startMs\n      const wordEndMs = Math.min(activeWord.startMs + activeWord.durationMs, nextWord?.startMs ?? Infinity)`
)

content = content.replace(
  `      // Word text — still per-word so it aligns with the pill\n      layouts.forEach((wLayout, i) => {\n        const isActive = i === activeIdx\n        const color = isActive ? \`{\\\\c\${C_WHITE}}\` : \`{\\\\c\${this.inactiveColor}}\`\n        const bord = isActive ? 0 : this.borderSize\n        events.push(\n          \`Dialogue: 1,\${msToAss(wordStartMs)},\${msToAss(wordEndMs)},Words,,0,0,0,,\` +\n            \`{\\\\an5\\\\pos(\${wLayout.centerX},\${this.lineY})\` +\n            \`\\\\fs\${this.fontSize}\\\\bord\${bord}\\\\shad\${this.shadowSize}}\${color}\${this.cleanWord(wLayout.word)}\`\n        )\n      })`,
  `      // Layer 1: inactive words as a single line (active slot invisible)\n      const baseText = line.words\n        .map((w, i) => {\n          if (i === activeIdx) return \`{\\\\alpha&HFF&}\${this.cleanWord(w.word)}\`\n          return \`{\\\\c\${this.inactiveColor}\\\\bord\${this.borderSize}\\\\shad\${this.shadowSize}}\${this.cleanWord(w.word)}\`\n        })\n        .join(' ')\n\n      events.push(\n        \`Dialogue: 1,\${msToAss(wordStartMs)},\${msToAss(wordEndMs)},Words,,0,0,0,,\` +\n          \`{\\\\an\${alignment}\\\\pos(\${x},\${this.lineY})\\\\fs\${this.fontSize}}\${baseText}\`\n      )\n\n      // Layer 2: animated active word properly positioned\n      const wLayout = layouts[activeIdx]\n      events.push(\n        \`Dialogue: 2,\${msToAss(wordStartMs)},\${msToAss(wordEndMs)},Words,,0,0,0,,\` +\n          \`{\\\\an5\\\\pos(\${wLayout.centerX},\${this.lineY})\` +\n          \`\\\\fs\${this.fontSize}\\\\bord0\\\\shad\${this.shadowSize}\\\\c\${C_WHITE}}\${this.cleanWord(wLayout.word)}\`\n      )`
)

fs.writeFileSync(
  '/home/armel/dev/griboo/sketch-pilot-api/plugins/sketch-pilot/src/services/video/ass-caption.service.ts',
  content
)
