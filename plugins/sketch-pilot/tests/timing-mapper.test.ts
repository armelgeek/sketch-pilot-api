import { TimingMapper } from '../src/utils/timing-mapper';
import { WordTiming } from '../src/services/audio';

async function testTimingMapper() {
    console.log("Testing TimingMapper...");

    const sceneNarrations = [
        { sceneId: "scene-1", narration: "Hello world. This is the first scene." },
        { sceneId: "scene-2", narration: "And this is the second one, with more text." },
    ];

    const transcribedWords: WordTiming[] = [
        { word: "hello", start: 0.1, end: 0.5, startMs: 100, durationMs: 400 },
        { word: "world", start: 0.6, end: 1.0, startMs: 600, durationMs: 400 },
        { word: "this", start: 1.1, end: 1.4, startMs: 1100, durationMs: 300 },
        { word: "is", start: 1.5, end: 1.7, startMs: 1500, durationMs: 200 },
        { word: "the", start: 1.8, end: 2.0, startMs: 1800, durationMs: 200 },
        { word: "first", start: 2.1, end: 2.5, startMs: 2100, durationMs: 400 },
        { word: "scene", start: 2.6, end: 3.0, startMs: 2600, durationMs: 400 },
        { word: "and", start: 3.5, end: 3.8, startMs: 3500, durationMs: 300 },
        { word: "this", start: 3.9, end: 4.2, startMs: 3900, durationMs: 300 },
        { word: "is", start: 4.3, end: 4.5, startMs: 4300, durationMs: 200 },
        { word: "the", start: 4.6, end: 4.8, startMs: 4600, durationMs: 200 },
        { word: "second", start: 4.9, end: 5.4, startMs: 4900, durationMs: 500 },
        { word: "one", start: 5.5, end: 5.8, startMs: 5500, durationMs: 300 },
        { word: "with", start: 5.9, end: 6.2, startMs: 5900, durationMs: 300 },
        { word: "more", start: 6.3, end: 6.6, startMs: 6300, durationMs: 300 },
        { word: "text", start: 6.7, end: 7.2, startMs: 6700, durationMs: 500 },
    ];

    const results = TimingMapper.mapScenes(sceneNarrations, transcribedWords);

    console.log("Results:");
    results.forEach(r => {
        console.log(`Scene ${r.sceneId}: ${r.start.toFixed(2)}s - ${r.end.toFixed(2)}s (${r.wordTimings.length} words)`);
    });

    // Validations
    if (results.length !== 2) throw new Error(`Expected 2 scenes, got ${results.length}`);

    // Scene 1: "Hello world. This is the first scene." (7 words)
    if (results[0].wordTimings.length !== 7) throw new Error(`Scene 1 should have 7 words, got ${results[0].wordTimings.length}`);
    if (results[0].start !== 0.1) throw new Error(`Scene 1 start should be 0.1, got ${results[0].start}`);
    if (results[0].end !== 3.0) throw new Error(`Scene 1 end should be 3.0, got ${results[0].end}`);

    // Scene 2: "And this is the second one, with more text." (9 words)
    if (results[1].wordTimings.length !== 9) throw new Error(`Scene 2 should have 9 words, got ${results[1].wordTimings.length}`);
    if (results[1].start !== 3.5) throw new Error(`Scene 2 start should be 3.5, got ${results[1].start}`);
    if (results[1].end !== 7.2) throw new Error(`Scene 2 end should be 7.2, got ${results[1].end}`);

    console.log("✅ TimingMapper test passed!");
}

testTimingMapper().catch(err => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
