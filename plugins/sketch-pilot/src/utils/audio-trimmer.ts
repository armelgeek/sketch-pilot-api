import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface TrimResult {
    startTrimmedMs: number;
    endTrimmedMs: number;
    newDurationMs: number;
}

/**
 * Detects and trims silence at the beginning and end of an audio file.
 * Returns the amount of time trimmed from start and end in milliseconds.
 */
export async function detectAndTrimSilence(inputPath: string, outputPath: string, threshold = '-40dB', duration = '0.1'): Promise<TrimResult> {
    let stdout = '', stderr = '';
    try {
        const { stdout: out, stderr: err } = await execAsync(`ffmpeg -i "${inputPath}" -af "silencedetect=noise=${threshold}:d=${duration}" -f null -`);
        stdout = out;
        stderr = err;
    } catch (error: any) {
        // ffmpeg can exit with non-zero or throw when writing to null sometimes, gather stderr anyway
        stdout = error.stdout || '';
        stderr = error.stderr || '';
    }

    // Both stdout and stderr from ffmpeg should be checked
    const output = stdout + '\n' + stderr;

    let startTrimSec = 0;

    try {
        let totalDurationSec = 0;
        try {
            const probeResult = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`);
            totalDurationSec = parseFloat(probeResult.stdout.trim());
        } catch (e) {
            // fallback
            const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d+)/);
            if (durationMatch) {
                totalDurationSec = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
            }
        }

        const silenceStarts = [...output.matchAll(/silence_start: ([\d\.\-]+)/g)].map(m => parseFloat(m[1]));
        const silenceEnds = [...output.matchAll(/silence_end: ([\d\.\-]+)/g)].map(m => parseFloat(m[1]));

        let endTrimSec = 0;

        for (let i = 0; i < Math.min(silenceStarts.length, silenceEnds.length); i++) {
            let sStart = silenceStarts[i];
            if (sStart < 0) sStart = 0;
            const sEnd = silenceEnds[i];

            // Allow anything that starts before 0.1s to be considered "start silence"
            if (sStart <= 0.1) {
                startTrimSec = sEnd;
            }

            // If silence reaches the end
            if (totalDurationSec > 0 && Math.abs(sEnd - totalDurationSec) < 0.2) {
                endTrimSec = totalDurationSec - sStart;
            }
        }

        // Safety bounds to avoid trimming perfectly valid audio if the detection is flaky
        if (startTrimSec < 0.02) startTrimSec = 0;
        if (endTrimSec < 0.02) endTrimSec = 0;

        if (startTrimSec > 0 || endTrimSec > 0) {
            let trimFilter = '';
            if (startTrimSec > 0 && endTrimSec > 0 && totalDurationSec > 0) {
                const endPos = totalDurationSec - endTrimSec;
                trimFilter = `atrim=start=${startTrimSec}:end=${endPos}`;
            } else if (startTrimSec > 0) {
                trimFilter = `atrim=start=${startTrimSec}`;
            } else if (endTrimSec > 0 && totalDurationSec > 0) {
                const endPos = totalDurationSec - endTrimSec;
                trimFilter = `atrim=end=${endPos}`;
            }

            if (trimFilter) {
                await execAsync(`ffmpeg -i "${inputPath}" -af "${trimFilter}" -y "${outputPath}"`);
            } else {
                fs.copyFileSync(inputPath, outputPath);
            }
        } else {
            fs.copyFileSync(inputPath, outputPath);
        }

        return {
            startTrimmedMs: Math.round(startTrimSec * 1000),
            endTrimmedMs: Math.round(endTrimSec * 1000),
            newDurationMs: Math.round(Math.max(0, totalDurationSec - startTrimSec - endTrimSec) * 1000)
        };
    } catch (parseOrTrimError) {
        console.error("[AudioTrimmer] Error", parseOrTrimError);
        fs.copyFileSync(inputPath, outputPath);
        return { startTrimmedMs: 0, endTrimmedMs: 0, newDurationMs: 0 };
    }
}
