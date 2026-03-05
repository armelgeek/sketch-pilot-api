#!/usr/bin/env ts-node

/**
 * sync-timings-from-whisper.ts
 *
 * Transcribes the global_narration.mp3 using the local WhisperLocalService,
 * aligns each scene's narration to the word-level timestamps,
 * and updates timeRange in script.json.
 *
 * Also saves an intermediate transcript.json for re-use.
 *
 * Usage:
 *   npm run sync:timings -- <output-dir>
 *   npm run sync:timings -- ./output/video-1772612824667-kb9nf8
 *
 * Options (env vars):
 *   WHISPER_MODEL=base   (default: base)
 *   WHISPER_DEVICE=cpu   (default: cpu)
 *   WHISPER_LANG=en      (optional)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { WhisperLocalService } from '../src/services/audio/whisper-local.service';
import { WordTiming } from '../src/services/audio/index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptJson {
    generatedAt: string;
    audioFile: string;
    words: WordTiming[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize text for fuzzy matching: lowercase, strip punctuation */
function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/['']/g, "'")
        .replace(/[^a-z0-9\s']/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function toWords(text: string): string[] {
    return normalize(text).split(' ').filter(Boolean);
}

/**
 * Find the best window of Whisper words matching a scene narration.
 * Searches the full remaining array (from searchFrom to end) to avoid
 * cascading errors from one bad match breaking all subsequent scenes.
 */
function findBestMatch(
    narrationWords: string[],
    whisperWords: WordTiming[],
    searchFrom: number
): { startIdx: number; endIdx: number; score: number } | null {
    const n = narrationWords.length;
    if (n === 0) return null;

    let bestScore = -1;
    let bestStart = -1;
    let bestEndIdx = -1;

    // Search the full remaining array — no artificial window limit
    for (let i = searchFrom; i < whisperWords.length - 1; i++) {
        let narIdx = 0;
        let wIdx = i;
        let matchCount = 0;
        // Allow a generous tolerance: up to 1.5x the expected word count
        const windowEnd = Math.min(i + Math.ceil(n * 1.5) + 5, whisperWords.length);

        while (narIdx < n && wIdx < windowEnd) {
            const ww = normalize(whisperWords[wIdx].word);
            const nw = narrationWords[narIdx];
            if (ww === nw || ww.startsWith(nw) || nw.startsWith(ww)) {
                matchCount++;
                narIdx++;
            }
            wIdx++;
        }

        const score = matchCount / n;
        if (score > bestScore) {
            bestScore = score;
            bestStart = i;
            bestEndIdx = wIdx - 1;
        }

        // Early exit if we found a near-perfect match
        if (bestScore >= 0.85) break;
    }

    return bestStart >= 0 ? { startIdx: bestStart, endIdx: bestEndIdx, score: bestScore } : null;
}


// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const outputDir = process.argv[2];
    if (!outputDir) {
        console.error('❌ Usage: npm run sync:timings -- <output-dir>');
        process.exit(1);
    }

    const resolvedDir = path.resolve(outputDir);
    const narrationPath = path.join(resolvedDir, 'global_narration.mp3');
    const scriptPath = path.join(resolvedDir, 'script.json');
    const transcriptPath = path.join(resolvedDir, 'transcript.json');

    if (!fs.existsSync(narrationPath)) {
        console.error(`❌ global_narration.mp3 not found in: ${resolvedDir}`);
        process.exit(1);
    }
    if (!fs.existsSync(scriptPath)) {
        console.error(`❌ script.json not found in: ${resolvedDir}`);
        process.exit(1);
    }

    // ── Step 1: Transcribe (or load cache) ────────────────────────────────────

    let whisperWords: WordTiming[];

    if (fs.existsSync(transcriptPath)) {
        console.log(`\n📄 Loaded existing transcript.json (skipping Whisper run)`);
        const cached = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8')) as TranscriptJson;
        whisperWords = cached.words;
        console.log(`   ${whisperWords.length} words`);
    } else {
        const model = process.env.WHISPER_MODEL || 'base';
        const device = process.env.WHISPER_DEVICE || 'cpu';
        const language = process.env.WHISPER_LANG;

        console.log(`\n🎙️  Running Whisper local (model=${model} device=${device})...`);

        const service = new WhisperLocalService({ model, device, language });
        const result = await service.transcribe(narrationPath);

        whisperWords = result.wordTimings;
        console.log(`   ✅ ${whisperWords.length} words transcribed`);

        const transcript: TranscriptJson = {
            generatedAt: new Date().toISOString(),
            audioFile: narrationPath,
            words: whisperWords,
        };
        fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2), 'utf-8');
        console.log(`   💾 Saved → ${transcriptPath}`);
    }

    // ── Step 2: Align each scene ──────────────────────────────────────────────

    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    const scenes: any[] = script.scenes;

    console.log(`\n🔗 Syncing timeRanges for ${scenes.length} scenes...\n`);

    let searchFrom = 0;
    let updated = 0;

    for (const scene of scenes) {
        const narration: string = scene.narration || '';
        const narWords = toWords(narration);

        process.stdout.write(`  Scene ${String(scene.sceneNumber).padStart(2)}: `);

        if (narWords.length === 0) {
            console.log('(no narration — skipped)');
            continue;
        }

        const match = findBestMatch(narWords, whisperWords, searchFrom);

        if (!match) {
            console.log('❌ No match found');
            continue;
        }

        const startTime = whisperWords[match.startIdx].start;
        const endTime = whisperWords[match.endIdx].end;
        const scoreStr = match.score < 0.5 ? ` ⚠️ (${(match.score * 100).toFixed(0)}%)` : '';

        console.log(
            `${startTime.toFixed(2)}s → ${endTime.toFixed(2)}s ` +
            `(${(endTime - startTime).toFixed(2)}s)${scoreStr} — "${narration.slice(0, 50)}..."`
        );

        scene.timeRange = {
            start: Math.round(startTime * 100) / 100,
            end: Math.round(endTime * 100) / 100,
        };

        // ── Step 2.5: Update manifest.json wordTimings ──────────────────────
        const sceneDir = path.join(resolvedDir, 'scenes', scene.id);
        const manifestPath = path.join(sceneDir, 'manifest.json');

        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

                // Compute both relative (for clip effects) and absolute (for global sync) timings
                const sceneWordTimings = whisperWords.slice(match.startIdx, match.endIdx + 1).map(w => {
                    const relStart = Math.max(0, w.start - startTime);
                    const relEnd = w.end - startTime;
                    return {
                        word: w.word,
                        start: Math.round(relStart * 100) / 100,
                        end: Math.round(relEnd * 100) / 100,
                        startMs: Math.round(relStart * 1000),
                        durationMs: Math.round((w.end - w.start) * 1000)
                    };
                });

                const sceneGlobalWordTimings = whisperWords.slice(match.startIdx, match.endIdx + 1).map(w => {
                    return {
                        word: w.word,
                        start: Math.round(w.start * 100) / 100,
                        end: Math.round(w.end * 100) / 100,
                        startMs: Math.round(w.startMs),
                        durationMs: Math.round(w.durationMs)
                    };
                });

                manifest.wordTimings = sceneWordTimings;
                (manifest as any).globalWordTimings = sceneGlobalWordTimings;
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
                process.stdout.write(` ✅ manifest updated (rel + global)`);
            } catch (e) {
                process.stdout.write(` ❌ manifest error: ${e instanceof Error ? e.message : String(e)}`);
            }
        } else {
            process.stdout.write(` ⚠️ manifest not found`);
        }

        console.log(''); // newline

        // Only advance searchFrom if we have a reasonable match
        // to avoid cascading errors from bad matches
        if (match.score >= 0.5) {
            searchFrom = match.endIdx + 1;
        }
        updated++;
    }

    // ── Step 3: Save script.json ──────────────────────────────────────────────

    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2), 'utf-8');
    console.log(`\n✅ Updated ${updated}/${scenes.length} scenes in script.json`);

    // ── Step 4: Summary table ─────────────────────────────────────────────────

    console.log('\n┌─────────┬───────────┬───────────┬──────────┐');
    console.log('│  Scene  │   Start   │    End    │ Duration │');
    console.log('├─────────┼───────────┼───────────┼──────────┤');
    for (const scene of scenes) {
        if (!scene.timeRange) continue;
        const dur = (scene.timeRange.end - scene.timeRange.start).toFixed(2);
        console.log(
            `│  ${String(scene.sceneNumber).padEnd(5)}  │ ` +
            `${String(scene.timeRange.start.toFixed(2)).padEnd(9)} │ ` +
            `${String(scene.timeRange.end.toFixed(2)).padEnd(9)} │ ` +
            `${String(dur + 's').padEnd(8)} │`
        );
    }
    console.log('└─────────┴───────────┴───────────┴──────────┘');
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
