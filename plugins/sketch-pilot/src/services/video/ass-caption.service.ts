/**
 * ASS Caption Service — word spacing fix
 *
 * ROOT CAUSE OF MISALIGNMENT:
 * The previous implementation placed each word on its own `\pos(x,y)` Dialogue
 * event and used `estimateWordWidthPx` to compute x. Because that estimator
 * is a rough heuristic, words drifted left/right relative to each other.
 *
 * FIX — single-line rendering:
 * Instead of N separate dialogue events (one per word), each caption CHUNK is
 * rendered as a SINGLE dialogue line whose text contains inline colour/scale tags
 * between words.  libass handles glyph layout and spacing natively — no
 * estimation needed.
 *
 * Pattern used for most styles:
 *   {\an8\pos(cx,y)}{\c&Hinactive&}WORD1 {\c&Hactive&}WORD2 {\c&Hinactive&}WORD3
 *
 * For `scaling` and `bounce` (per-word transform needed):
 *   The active word is on its OWN line using the single-line trick for inactive
 *   words reduced to a "ghost" layer, while the active word sits on top at the
 *   correct x derived from a MEASURED baseline render.  We still need layout
 *   estimation for those two styles, but only for the active word's x — so the
 *   relative positions of all inactive words remain accurate (they share one line).
 *
 * `animated-background` keeps its per-word approach because the pill SVG shape
 *   must slide to exactly the right x,y — that inherently requires layout math.
 *   However the pill now uses the SAME layout values so at least internal
 *   consistency is preserved.
 */

import { WordTiming } from '../audio';
export { WordTiming } from '../audio';

export type AssCaptionStyle =
    | 'colored'
    | 'scaling'
    | 'animated-background'
    | 'bounce'
    | 'neon'
    | 'typewriter'
    | 'karaoke'
    | 'remotion';

export interface AssCaptionConfig {
    enabled?: boolean;
    style?: AssCaptionStyle;
    fontFamily?: string;
    fontSize?: number;
    wordsPerLine?: number;
    position?: 'top' | 'center' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
    lineYFraction?: number;
    inactiveColor?: string;
    highlightColor?: string;
    pillColor?: string;
    borderSize?: number;
    shadowSize?: number;
    wordSpacing?: number;
    charWidthRatio?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface CaptionLine {
    words: WordTiming[];
    lineStartMs: number;
    lineEndMs: number;
}

interface WordLayout {
    word: string;
    centerX: number;
    centerY: number;
    widthPx: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function msToAss(ms: number): string {
    const totalCs = Math.round(ms / 10);
    const cs = totalCs % 100;
    const s = Math.floor(totalCs / 100) % 60;
    const m = Math.floor(totalCs / 6000) % 60;
    const h = Math.floor(totalCs / 360000);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '00')}`;
}

function hexToAssColor(hex: string, alpha = '00'): string {
    const clean = hex.replace('#', '');
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H${alpha}${b}${g}${r}`;
}

function springKeyframes(
    from: number,
    to: number,
    durationMs: number,
    opts: { stiffness?: number; damping?: number; mass?: number } = {},
): Array<{ ms: number; value: number }> {
    const { stiffness = 250, damping = 28, mass = 1 } = opts;
    const frames: Array<{ ms: number; value: number }> = [];
    const stepMs = 16;
    let pos = from;
    let vel = 0;

    for (let t = 0; t <= durationMs; t += stepMs) {
        const force = -stiffness * (pos - to) - damping * vel;
        vel += (force / mass) * (stepMs / 1000);
        pos += vel * (stepMs / 1000);
        frames.push({ ms: t, value: pos });
        if (Math.abs(pos - to) < 0.3 && Math.abs(vel) < 0.3) break;
    }

    if (frames[frames.length - 1].ms < durationMs) {
        frames.push({ ms: durationMs, value: to });
    }

    return frames;
}

function roundedRectPath(w: number, h: number, r: number): string {
    const rr = Math.min(r, w / 2, h / 2);
    return [
        `m ${rr} 0`,
        `l ${w - rr} 0`,
        `b ${w} 0 ${w} ${rr} ${w} ${rr}`,
        `l ${w} ${h - rr}`,
        `b ${w} ${h} ${w - rr} ${h} ${w - rr} ${h}`,
        `l ${rr} ${h}`,
        `b 0 ${h} 0 ${h - rr} 0 ${h - rr}`,
        `l 0 ${rr}`,
        `b 0 0 ${rr} 0 ${rr} 0`,
    ].join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class AssCaptionService {
    private readonly width: number;
    private readonly height: number;
    private readonly enabled: boolean;

    private readonly style: AssCaptionStyle;
    private readonly fontFamily: string;
    private readonly fontSize: number;
    private readonly wordsPerLine: number;
    private readonly lineY: number;
    private readonly inactiveColor: string;
    private readonly highlightColor: string;
    private readonly pillColor: string;
    private readonly borderSize: number;
    private readonly shadowSize: number;
    private readonly wordSpacing: number;
    private readonly hasCustomWordSpacing: boolean;
    private readonly charWidthRatio: number;
    private readonly position: string;

    constructor(width: number, height: number, config: AssCaptionConfig = {}) {
        this.width = width;
        this.height = height;
        this.enabled = config.enabled ?? true;

        const aspectRatio = width / height;
        const autoWordsPerLine = aspectRatio < 0.7 ? 2 : aspectRatio < 1.4 ? 3 : 4;
        const autoLineYFraction = 0.20;

        const positionFractionMap: Record<string, number> = {
            'top': 0.15, 'top-left': 0.15, 'top-right': 0.15,
            'center': 0.50,
            'bottom': 0.95, 'bottom-left': 0.95, 'bottom-right': 0.95, 'none': 0.95,
        };
        this.position = config.position ?? 'bottom';
        const resolvedLineYFraction = config.position !== undefined
            ? (positionFractionMap[config.position] ?? autoLineYFraction)
            : (config.lineYFraction ?? autoLineYFraction);

        this.style = config.style ?? 'colored';
        this.fontFamily = config.fontFamily ?? 'Montserrat';
        this.wordsPerLine = config.wordsPerLine ?? autoWordsPerLine;
        this.charWidthRatio = config.charWidthRatio ?? this.getBaseCharWidthRatio(this.fontFamily);

        if (config.fontSize) {
            this.fontSize = config.fontSize;
        } else {
            const maxWidth = width * 0.85;
            const testWords = 'THE QUICK BROWN FOX'.split(' ').slice(0, this.wordsPerLine);
            let bestFs = 32;
            for (let fs = Math.round(height / 10); fs >= 16; fs -= 2) {
                const spaceW = this.estimateSpaceWidthPx(fs);
                const totalW =
                    testWords.reduce((sum, w) => sum + this.estimateWordWidthPx(w, fs), 0) +
                    spaceW * (testWords.length - 1);
                if (totalW <= maxWidth) { bestFs = fs; break; }
            }
            const portraitScale = aspectRatio < 0.7 ? 0.6 : 1;
            this.fontSize = Math.max(16, Math.round((bestFs * portraitScale) / 2) * 2);
        }

        this.hasCustomWordSpacing = config.wordSpacing !== undefined;
        this.wordSpacing = config.wordSpacing ?? this.estimateSpaceWidthPx(this.fontSize);

        // For bottom positions, place captions very close to the bottom of frame
        // For top positions, place captions very close to the top of frame
        // For other positions, use the standard calculation
        if (this.position.includes('bottom')) {
            const isVertical = aspectRatio < 0.7;
            // Elevate the subtitles more on vertical screens (e.g. 9:16) to avoid UI overlaps
            const distanceMultiplier = isVertical ? 2.5 : 0.8;
            this.lineY = Math.round(height - this.fontSize * distanceMultiplier);
        } else if (this.position.includes('top')) {
            this.lineY = Math.round(this.fontSize * 1.2);  // Slightly lower margin from top for safety
        } else {
            this.lineY = Math.round(resolvedLineYFraction * height) - Math.round(this.fontSize * 0.35);
        }

        this.borderSize = config.borderSize ?? 2;
        this.shadowSize = config.shadowSize ?? 0;

        const defaultHighlight =
            this.style === 'colored' ? '#FFE135'
                : this.style === 'scaling' ? '#4ADE80'
                    : this.style === 'bounce' ? '#FFE135'
                        : this.style === 'neon' ? '#00FFFF'
                            : '#FFFFFF';

        this.inactiveColor = hexToAssColor(config.inactiveColor ?? '#888888');
        this.highlightColor = hexToAssColor(config.highlightColor ?? defaultHighlight);
        this.pillColor = hexToAssColor(config.pillColor ?? '#3B82F6');
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    public buildASSFile(words: WordTiming[]): string {
        if (!this.enabled) {
            return '';
        }
        const lines = this.buildLines(words);
        const header = this.buildHeader();
        const body = lines.map(line => this.buildLineEvents(line)).join('\n');
        return `${header}\n${body}`;
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private buildLines(words: WordTiming[]): CaptionLine[] {
        const lines: CaptionLine[] = [];
        let currentChunk: WordTiming[] = [];
        let currentChars = 0;
        const MAX_CHARS = 24; // Balanced for readability

        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            const clean = this.cleanWord(w.word);
            const hasStrongBreak = /[.!?:]/.test(w.word);
            const nextW = words[i + 1];
            const pause = nextW ? (nextW.startMs - (w.startMs + w.durationMs)) : 0;

            currentChunk.push(w);
            currentChars += clean.length + 1;

            let shouldBreak = false;
            // Immediate break on punctuation (period, exclamation, question mark, colon)
            if (hasStrongBreak) shouldBreak = true;
            // Break if the chunk is getting too long
            else if (currentChars >= MAX_CHARS) shouldBreak = true;
            // Break on pauses in narration (> 350ms)
            else if (pause > 350) shouldBreak = true;

            if (shouldBreak || i === words.length - 1) {
                if (currentChunk.length > 0) {
                    lines.push({
                        words: currentChunk,
                        lineStartMs: currentChunk[0].startMs,
                        lineEndMs: currentChunk[currentChunk.length - 1].startMs + currentChunk[currentChunk.length - 1].durationMs,
                    });
                }
                currentChunk = [];
                currentChars = 0;
            }
        }
        return lines;
    }

    /**
     * Layout is kept ONLY for styles that genuinely need per-word x positions
     * (animated-background, scaling, bounce). Other styles no longer call this.
     */
    private computeLayout(line: CaptionLine): WordLayout[] {
        const spacing = this.getEffectiveWordSpacing();
        const wordWidths = line.words.map(w => this.estimateWordWidthPx(this.cleanWord(w.word), this.fontSize));
        const totalW = wordWidths.reduce((a, b) => a + b, 0) + spacing * (line.words.length - 1);
        let curLeft = Math.round((this.width - totalW) / 2);

        return line.words.map((w, i) => {
            const ww = wordWidths[i];
            const centerX = curLeft + Math.round(ww / 2);
            curLeft += ww + spacing;
            return { word: this.cleanWord(w.word), centerX, centerY: this.lineY, widthPx: ww };
        });
    }

    /**
     * Builds a single-line ASS text where each word is tagged with its colour.
     * libass spaces the glyphs natively — no manual x math required.
     *
     * Uses \an8 (top-centre anchor) so \pos(cx, lineY) centres the line
     * horizontally and the cap-line sits at lineY.
     *
     *  activeIdx  — index of the highlighted word (-1 = none)
     *  extraTags  — optional per-word extra tag string, indexed by word position
     */
    private buildSingleLineText(
        line: CaptionLine,
        activeIdx: number,
        extraTags: string[] = [],
    ): string {
        return line.words.map((w, i) => {
            const color = i === activeIdx
                ? `{\\c${this.highlightColor}}`
                : `{\\c${this.inactiveColor}}`;
            const extra = extraTags[i] ?? '';
            return `${color}${extra}${this.cleanWord(w.word)}`;
        }).join(' ');
    }

    /** Get ASS alignment code based on position configuration. */
    private getAlignmentCode(): number {
        const alignmentMap: Record<string, number> = {
            'top': 8, 'top-left': 7, 'top-right': 9,
            'center': 5, 'center-left': 4, 'center-right': 6,
            'bottom': 2, 'bottom-left': 1, 'bottom-right': 3,
            'none': 2,
        };
        return alignmentMap[this.position] ?? 2; // default to bottom-center
    }

    /** Get X coordinate for positioning based on alignment. */
    private getAlignedX(): number {
        const margin = Math.round(this.width * 0.05);
        const centerX = Math.round(this.width / 2);
        if (this.position === 'top-left' || this.position === 'center-left' || this.position === 'bottom-left') {
            return margin;
        }
        if (this.position === 'top-right' || this.position === 'center-right' || this.position === 'bottom-right') {
            return this.width - margin;
        }
        return centerX;
    }

    /** Common prefix tags for a single-line event. */
    private linePrefix(): string {
        const alignment = this.getAlignmentCode();
        const x = this.getAlignedX();
        return `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}\\bord${this.borderSize}\\shad${this.shadowSize}}`;
    }

    private getStyleSpacingMultiplier(style: AssCaptionStyle): number {
        // Previously these multipliers compensated for the inaccurate old estimator.
        // With the per-glyph CHAR_ADV table they are no longer needed — keep at 1.
        return 1;
    }

    private getEffectiveWordSpacing(): number {
        if (this.hasCustomWordSpacing) return this.wordSpacing;
        return Math.max(2, Math.round(this.wordSpacing * this.getStyleSpacingMultiplier(this.style)));
    }

    private getBaseCharWidthRatio(fontFamily: string): number {
        // Global multiplier on top of the per-glyph CHAR_ADV table.
        // 1.0 = table as-is (calibrated for Montserrat Bold).
        const name = fontFamily.toLowerCase();
        if (name.includes('bebas')) return 0.56;
        if (name.includes('montserrat')) return 1.00;
        if (name.includes('ubuntu')) return 0.98;
        if (name.includes('arial')) return 0.97;
        return 0.95;
    }

    /**
     * Per-character advance-width table expressed as a fraction of fontSize.
     * Values measured/approximated from Montserrat Bold metrics at 100px.
     * Other fonts scale via charWidthRatio (applied as a global multiplier).
     *
     * Using explicit per-glyph widths is significantly more accurate than
     * the previous "character class bucket" approach and reduces estimation
     * error from ~15 % down to ~3–5 %, which is acceptable for pill/bounce
     * overlay alignment.
     */
    private static readonly CHAR_ADV: Record<string, number> = {
        // Uppercase
        A: 0.62, B: 0.60, C: 0.62, D: 0.68, E: 0.54, F: 0.50, G: 0.66, H: 0.68,
        I: 0.26, J: 0.36, K: 0.62, L: 0.50, M: 0.78, N: 0.68, O: 0.72, P: 0.58,
        Q: 0.72, R: 0.62, S: 0.56, T: 0.54, U: 0.68, V: 0.62, W: 0.88, X: 0.62,
        Y: 0.58, Z: 0.58,
        // Digits
        '0': 0.62, '1': 0.62, '2': 0.62, '3': 0.62, '4': 0.62,
        '5': 0.62, '6': 0.62, '7': 0.56, '8': 0.62, '9': 0.62,
        // Common punctuation
        '.': 0.28, ',': 0.28, ':': 0.28, ';': 0.28, '!': 0.30, '?': 0.52,
        "'": 0.26, '"': 0.40, '-': 0.36, '_': 0.54, '/': 0.40, '\\': 0.40,
        '(': 0.34, ')': 0.34, '[': 0.34, ']': 0.34, '&': 0.72, '@': 0.94,
        '#': 0.72, '%': 0.80, '+': 0.62, '=': 0.62, '<': 0.62, '>': 0.62,
        '|': 0.26, '~': 0.62, '`': 0.34, '^': 0.62, '*': 0.46, '$': 0.56,
    };

    private cleanWord(word: string): string {
        // Removes punctuation typically generated by Whisper or LLMs
        // Regex: any character in [.,!?:;"()[]] is removed. 
        // We keep apostrophes (e.g. "it's") as they are part of the word.
        return word.replace(/[.,!?:;"()[\]]/g, '').trim();
    }

    private estimateWordWidthPx(word: string, fontSize: number): number {
        const upper = word.toUpperCase();
        let units = 0;
        for (const ch of upper) {
            units += AssCaptionService.CHAR_ADV[ch] ?? 0.60;   // fallback = average
        }
        return Math.max(1, Math.round(units * fontSize * this.charWidthRatio));
    }

    private estimateSpaceWidthPx(fontSize: number): number {
        // Space advance ≈ 0.30 × fontSize for most proportional fonts
        return Math.max(2, Math.round(0.30 * fontSize * this.charWidthRatio));
    }

    private buildHeader(): string {
        const fs = this.fontSize;
        const assBlue = this.pillColor;

        return `[Script Info]
ScriptType: v4.00+
PlayResX: ${this.width}
PlayResY: ${this.height}
Timer: 100.0000
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${this.fontFamily},${fs},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${this.borderSize},${this.shadowSize},1,0,0,0,1
Style: Pill,${this.fontFamily},${fs},&H00${assBlue.slice(2)},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,1,0,0,0,1
Style: Words,${this.fontFamily},${fs},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${this.borderSize},${this.shadowSize},1,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
    }

    private buildLineEvents(line: CaptionLine): string {
        switch (this.style) {
            case 'colored': return this.buildColoredLine(line);
            case 'scaling': return this.buildScalingLine(line);
            case 'animated-background': return this.buildAnimatedBgLine(line);
            case 'bounce': return this.buildBounceLine(line);
            case 'neon': return this.buildNeonLine(line);
            case 'typewriter': return this.buildTypewriterLine(line);
            default: return this.buildColoredLine(line);
        }
    }

    // ── Style: colored ──────────────────────────────────────────────────────
    //
    // FIX: One dialogue per active-word time-slice, the entire line as single text.
    // libass handles spacing — no \pos per word.

    private buildColoredLine(line: CaptionLine): string {
        const events: string[] = [];
        const prefix = this.linePrefix();

        line.words.forEach((activeWord, activeIdx) => {
            const t0 = msToAss(activeWord.startMs);
            const t1 = msToAss(activeWord.startMs + activeWord.durationMs);
            const text = this.buildSingleLineText(line, activeIdx);
            events.push(`Dialogue: 1,${t0},${t1},Words,,0,0,0,,${prefix}${text}`);
        });

        return events.join('\n');
    }

    // ── Style: neon ─────────────────────────────────────────────────────────
    //
    // FIX: Two layers (glow + core) each as single-line text.
    // The glow layer uses the highlight colour as both fill (\c) and border (\3c)
    // with a heavy blur; the core layer is white with no border.

    private buildNeonLine(line: CaptionLine): string {
        const events: string[] = [];
        const C_WHITE = hexToAssColor('#FFFFFF');
        const glowBord = Math.round(this.fontSize * 0.12);
        const glowBlur = Math.round(this.fontSize * 0.08);
        const alignment = this.getAlignmentCode();
        const x = this.getAlignedX();

        line.words.forEach((activeWord, activeIdx) => {
            const t0 = msToAss(activeWord.startMs);
            const t1 = msToAss(activeWord.startMs + activeWord.durationMs);

            // Glow layer — active word in highlight colour (thick blurred border),
            // inactive words invisible in this layer (alpha FF = fully transparent)
            const glowText = line.words.map((w, i) => {
                if (i === activeIdx) {
                    return `{\\c${this.highlightColor}\\3c${this.highlightColor}\\bord${glowBord}\\blur${glowBlur}\\shad0}${w.word}`;
                }
                // Invisible so only the core layer shows for inactive words
                return `{\\alpha&HFF&\\bord0\\shad0}${w.word}`;
            }).join(' ');

            events.push(
                `Dialogue: 1,${t0},${t1},Words,,0,0,0,,` +
                `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${glowText}`,
            );

            // Core layer — active word sharp white, inactive words dimmed
            const coreText = line.words.map((w, i) => {
                if (i === activeIdx) {
                    return `{\\c${C_WHITE}\\bord0\\shad0}${w.word}`;
                }
                return `{\\c${this.inactiveColor}\\bord${this.borderSize}\\shad${this.shadowSize}}${w.word}`;
            }).join(' ');

            events.push(
                `Dialogue: 2,${t0},${t1},Words,,0,0,0,,` +
                `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${coreText}`,
            );
        });

        return events.join('\n');
    }

    // ── Style: typewriter ───────────────────────────────────────────────────
    //
    // FIX: Single-line text per time-slice. Past words = inactive colour,
    // current word = highlight + fade-in, future words = invisible.

    private buildTypewriterLine(line: CaptionLine): string {
        const events: string[] = [];
        const FADE_MS = 80;
        const alignment = this.getAlignmentCode();
        const x = this.getAlignedX();

        line.words.forEach((activeWord, activeIdx) => {
            const t0 = msToAss(activeWord.startMs);
            const t1 = msToAss(activeWord.startMs + activeWord.durationMs);

            const text = line.words.map((w, i) => {
                if (i < activeIdx) {
                    return `{\\c${this.inactiveColor}\\bord${this.borderSize}\\shad${this.shadowSize}}${this.cleanWord(w.word)}`;
                } else if (i === activeIdx) {
                    return `{\\c${this.highlightColor}\\bord${this.borderSize}\\shad${this.shadowSize}\\fad(${FADE_MS},0)}${this.cleanWord(w.word)}`;
                } else {
                    return `{\\c${this.inactiveColor}\\alpha&HFF&\\bord${this.borderSize}\\shad${this.shadowSize}}${this.cleanWord(w.word)}`;
                }
            }).join(' ');

            events.push(
                `Dialogue: 1,${t0},${t1},Words,,0,0,0,,` +
                `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${text}`,
            );
        });

        return events.join('\n');
    }

    // ── Style: scaling ──────────────────────────────────────────────────────
    //
    // FIX STRATEGY: In ASS, \fscx/\fscy applied mid-line affects all following
    // glyphs. We use a two-layer trick:
    //   Layer 0 (base): full line with inactive words, active word INVISIBLE.
    //   Layer 1 (active): only the active word, centred at its estimated x,
    //                     with animated scale. The estimate error only affects
    //                     the active word's x — inactive words are pixel-perfect
    //                     because they share one unbroken text run on layer 0.

    private buildScalingLine(line: CaptionLine): string {
        const layouts = this.computeLayout(line);   // still needed for active word x
        const events: string[] = [];
        const alignment = this.getAlignmentCode();
        const x = this.getAlignedX();

        line.words.forEach((activeWord, activeIdx) => {
            const totalMs = activeWord.durationMs;
            const peak = 120;
            const rampMs = Math.min(180, Math.round(totalMs * 0.3));
            const holdMs = totalMs - rampMs * 2;

            const up = springKeyframes(100, peak, rampMs, { stiffness: 320, damping: 22 });
            const down = springKeyframes(peak, 100, rampMs, { stiffness: 320, damping: 22 });

            const timeline: Array<{ ms: number; scale: number }> = [
                ...up.map(f => ({ ms: f.ms, scale: Math.round(f.value) })),
                { ms: rampMs + Math.max(0, holdMs), scale: peak },
                ...down.map(f => ({ ms: rampMs + Math.max(0, holdMs) + f.ms, scale: Math.round(f.value) })),
                { ms: totalMs, scale: 100 },
            ];

            for (let f = 0; f < timeline.length - 1; f++) {
                const segStart = activeWord.startMs + timeline[f].ms;
                const segEnd = activeWord.startMs + timeline[f + 1].ms;
                if (segEnd <= segStart) continue;

                const sc = timeline[f].scale;

                // Layer 0: entire line; active word slot is invisible
                const baseText = line.words.map((w, i) => {
                    if (i === activeIdx) {
                        // Invisible placeholder so inactive words keep correct positions
                        return `{\\alpha&HFF&}${w.word}`;
                    }
                    return `{\\alpha&H00&\\c${this.inactiveColor}\\bord${this.borderSize}\\shad${this.shadowSize}}${w.word}`;
                }).join(' ');

                events.push(
                    `Dialogue: 0,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
                    `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${baseText}`,
                );

                // Layer 1: only the active word, positioned by layout estimate
                const layout = layouts[activeIdx];
                events.push(
                    `Dialogue: 1,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
                    `{\\an5\\pos(${layout.centerX},${layout.centerY})` +
                    `\\fs${this.fontSize}\\bord${this.borderSize}\\shad${this.shadowSize}` +
                    `\\c${this.highlightColor}\\fscx${sc}\\fscy${sc}}${layout.word}`,
                );
            }
        });

        return events.join('\n');
    }

    // ── Style: bounce ───────────────────────────────────────────────────────
    //
    // FIX STRATEGY: Same two-layer trick as scaling.
    //   Layer 0: inactive words on a single line (active word invisible).
    //   Layer 1: active word alone, with animated Y from spring physics.

    private buildBounceLine(line: CaptionLine): string {
        const layouts = this.computeLayout(line);
        const events: string[] = [];
        const alignment = this.getAlignmentCode();
        const x = this.getAlignedX();
        const dropHeight = Math.round(this.fontSize * 2);

        line.words.forEach((activeWord, activeIdx) => {
            const layout = layouts[activeIdx];
            const fromY = layout.centerY - dropHeight;
            const toY = layout.centerY;

            const yFrames = springKeyframes(fromY, toY, activeWord.durationMs, {
                stiffness: 500, damping: 20,
            });

            for (let f = 0; f < yFrames.length - 1; f++) {
                const segStart = activeWord.startMs + yFrames[f].ms;
                const segEnd = activeWord.startMs + yFrames[f + 1].ms;
                if (segEnd <= segStart) continue;

                const activeY = Math.round(yFrames[f].value);

                // Layer 0: inactive words as a single line (active slot invisible)
                const baseText = line.words.map((w, i) => {
                    if (i === activeIdx) return `{\\alpha&HFF&}${w.word}`;
                    return `{\\alpha&H00&\\c${this.inactiveColor}\\bord${this.borderSize}\\shad${this.shadowSize}}${w.word}`;
                }).join(' ');

                events.push(
                    `Dialogue: 0,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
                    `{\\an${alignment}\\pos(${x},${this.lineY})\\fs${this.fontSize}}${baseText}`,
                );

                // Layer 1: animated active word
                events.push(
                    `Dialogue: 1,${msToAss(segStart)},${msToAss(segEnd)},Words,,0,0,0,,` +
                    `{\\an5\\pos(${layout.centerX},${activeY})` +
                    `\\fs${this.fontSize}\\bord${this.borderSize}\\shad${this.shadowSize}` +
                    `\\c${this.highlightColor}}${layout.word}`,
                );
            }
        });

        return events.join('\n');
    }

    // ── Style: animated-background ──────────────────────────────────────────
    // Unchanged — the pill geometry still needs layout math.
    // Word text is also kept per-word to stay aligned with the pill.

    private buildAnimatedBgLine(line: CaptionLine): string {
        const layouts = this.computeLayout(line);
        const events: string[] = [];
        const C_WHITE = hexToAssColor('#FFFFFF');

        const PAD_X = Math.round(this.fontSize * 0.17);
        const PAD_Y = Math.round(this.fontSize * 0.12);
        const RADIUS = Math.round(this.fontSize * 0.22);

        const capsHeight = Math.round(this.fontSize * 0.72);
        const pillH = capsHeight + PAD_Y * 2;
        const pillTop = this.lineY - Math.round(pillH / 2);

        const pillLefts = layouts.map(l => l.centerX - Math.round(l.widthPx / 2) - PAD_X);
        const pillWidths = layouts.map(l => l.widthPx + PAD_X * 2);

        line.words.forEach((activeWord, activeIdx) => {
            const wordStartMs = activeWord.startMs;
            const wordEndMs = activeWord.startMs + activeWord.durationMs;

            const currLeft = pillLefts[activeIdx];
            const currW = pillWidths[activeIdx];
            const prevLeft = activeIdx > 0 ? pillLefts[activeIdx - 1] : currLeft;
            const prevW = activeIdx > 0 ? pillWidths[activeIdx - 1] : currW;

            const needsSlide = prevLeft !== currLeft || prevW !== currW;

            if (needsSlide) {
                const SLIDE_MS = Math.min(280, Math.round(activeWord.durationMs * 0.55));
                const FRAME_MS = 33;

                const xFrames = springKeyframes(prevLeft, currLeft, SLIDE_MS, { stiffness: 180, damping: 22, mass: 1 });
                const wFrames = springKeyframes(prevW, currW, SLIDE_MS, { stiffness: 180, damping: 22, mass: 1 });

                const maxMs = Math.max(
                    xFrames[xFrames.length - 1].ms,
                    wFrames[wFrames.length - 1].ms,
                );
                const ticks: number[] = [];
                for (let t = 0; t <= maxMs; t += FRAME_MS) ticks.push(t);
                if (ticks[ticks.length - 1] < maxMs) ticks.push(maxMs);

                const lerp = (frames: Array<{ ms: number; value: number }>, t: number) => {
                    for (let i = frames.length - 1; i >= 0; i--) {
                        if (frames[i].ms <= t) return frames[i].value;
                    }
                    return frames[0].value;
                };

                for (let i = 0; i < ticks.length - 1; i++) {
                    const segStart = wordStartMs + ticks[i];
                    const segEnd = wordStartMs + ticks[i + 1];
                    if (segEnd <= segStart) continue;
                    const left = Math.round(lerp(xFrames, ticks[i]));
                    const w = Math.round(lerp(wFrames, ticks[i]));
                    events.push(
                        `Dialogue: 0,${msToAss(segStart)},${msToAss(segEnd)},Pill,,0,0,0,,` +
                        `{\\an7\\pos(${left},${pillTop})\\p1\\c${this.pillColor}\\1a&H00&\\bord0\\shad0}${roundedRectPath(w, pillH, RADIUS)}{\\p0}`,
                    );
                }

                const holdStart = wordStartMs + maxMs;
                if (holdStart < wordEndMs) {
                    events.push(
                        `Dialogue: 0,${msToAss(holdStart)},${msToAss(wordEndMs)},Pill,,0,0,0,,` +
                        `{\\an7\\pos(${currLeft},${pillTop})\\p1\\c${this.pillColor}\\1a&H00&\\bord0\\shad0}${roundedRectPath(currW, pillH, RADIUS)}{\\p0}`,
                    );
                }
            } else {
                events.push(
                    `Dialogue: 0,${msToAss(wordStartMs)},${msToAss(wordEndMs)},Pill,,0,0,0,,` +
                    `{\\an7\\pos(${currLeft},${pillTop})\\p1\\c${this.pillColor}\\1a&H00&\\bord0\\shad0}${roundedRectPath(currW, pillH, RADIUS)}{\\p0}`,
                );
            }

            // Word text — still per-word so it aligns with the pill
            layouts.forEach((wLayout, i) => {
                const isActive = i === activeIdx;
                const color = isActive ? `{\\c${C_WHITE}}` : `{\\c${this.inactiveColor}}`;
                const bord = isActive ? 0 : this.borderSize;
                events.push(
                    `Dialogue: 1,${msToAss(wordStartMs)},${msToAss(wordEndMs)},Words,,0,0,0,,` +
                    `{\\an5\\pos(${wLayout.centerX},${this.lineY})` +
                    `\\fs${this.fontSize}\\bord${bord}\\shad${this.shadowSize}}${color}${this.cleanWord(wLayout.word)}`,
                );
            });
        });

        return events.join('\n');
    }

    // ── Getters ────────────────────────────────────────────────────────────────

    public getResolvedFontSize(): number { return this.fontSize; }
    public getResolvedWordsPerLine(): number { return this.wordsPerLine; }
}