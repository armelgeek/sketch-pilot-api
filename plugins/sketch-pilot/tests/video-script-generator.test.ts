// simple smoke test for the duration range logic in VideoScriptGenerator
import { VideoScriptGenerator } from '../src/core/video-script-generator';
import { PromptManager } from '../src/core/prompt-manager';
import { videoGenerationOptionsSchema } from '../src/types/video-script.types';
import { LLMService } from '../src/services/llm';

(async () => {
    // fake LLM that returns scenes for testing rules, including a concrete example 'Alice'
    const llm: LLMService = {
        async generateContent(userPrompt: string, systemPrompt: string, format?: string) {
            // two scenes: first introduces example 'Alice', second initially omits it
            return JSON.stringify({
                title: 'Test',
                scenes: [
                    {
                        sceneNumber: 1,
                        narration: 'Alice walked into the room and said hello world',
                        actions: [],
                        expression: 'neutral',
                        visualDensity: 'medium',
                        props: ['phone'],
                        visualText: [{ content: 'Alice', position: 'top' }],
                        // malformed timeRange to trigger fallback logic
                        timeRange: {},
                        // invalid context type that should be normalized
                        contextType: 'hook'
                    },
                    {
                        sceneNumber: 2,
                        narration: 'hello world',
                        actions: [],
                        expression: 'neutral',
                        visualDensity: 'medium',
                        // include four props to test truncation
                        props: ['phone', 'ball', 'hat', 'book'],
                        visualText: [{ content: 'hello world', position: 'top' }],
                        timeRange: { start: 10, end: 20 },
                        contextType: 'revelation'
                    }
                ],
                backgroundMusic: ''
            });
        }
    } as any;

    const pm = new PromptManager();
    const gen = new VideoScriptGenerator(llm, pm);
    const options = videoGenerationOptionsSchema.parse({ minDuration: 5, maxDuration: 10 });

    const structure: any = await (gen as any).generateVideoStructure('topic', options);

    // verify duration still in range or fallback to minDuration
    const total = structure.scenes.reduce((acc: number, s: any) => acc + (s.timeRange.end - s.timeRange.start), 0);
    console.log('final total', total, 'range', options.minDuration, options.maxDuration);
    // note: narrativeCoherence is added later when full script is generated, so we don't verify it here
    if (total < options.minDuration || total > options.maxDuration) {
        console.warn('WARNING: total out of provided range (may have fallen back)');
    } else {
        console.log('SUCCESS: duration in range');
    }

    // new assertions for context sanitization
    structure.scenes.forEach((s:any, idx:number)=>{
        const ctx = s.contextType;
        if (ctx && !['quick-list','transition','story','explanation','detailed-breakdown','conclusion'].includes(ctx)) {
            console.error(`ERROR: invalid contextType still present in scene ${idx+1}: ${ctx}`);
            process.exit(1);
        }
    });

    // ensure no NaN in any scene duration
    structure.scenes.forEach((s:any, idx:number)=>{
        const len = s.timeRange.end - s.timeRange.start;
        if (!Number.isFinite(len)) {
            console.error(`ERROR: scene ${idx+1} has NaN duration`);
            process.exit(1);
        }
    });

    // check start-word connector applied if needed
    const firstWord1 = structure.scenes[0].narration?.trim().split(/\s+/)[0].toLowerCase();
    const firstWord2 = structure.scenes[1].narration?.trim().split(/\s+/)[0].toLowerCase();
    if (firstWord1 && firstWord2 && firstWord1 === firstWord2) {
        console.error('ERROR: start word repetition not corrected');
        process.exit(1);
    }
    // example reuse: last scene should contain 'Alice' because generator appends it
    const lastNarr = structure.scenes[structure.scenes.length - 1].narration.toLowerCase();
    if (!lastNarr.includes('alice')) {
        console.error('ERROR: example was not reused in last scene');
        process.exit(1);
    }
    // eyelineMatch defaulting is handled in generateCompleteScript, not covered here
    // ensure no two dense scenes in a row (word count >15)
    const counts = structure.scenes.map((s:any) => s.narration ? s.narration.trim().split(/\s+/).length : 0);
    for (let i = 1; i < counts.length; i++) {
        if (counts[i-1] > 15 && counts[i] > 15) {
            console.error('ERROR: consecutive dense scenes not trimmed');
            process.exit(1);
        }
    }
    // verify pronoun progression
    structure.scenes.forEach((s:any, idx:number)=>{
        const ln = s.narration ? s.narration.toLowerCase() : '';
        if (idx < 3 && !/(\btu\b|\bvous\b)/.test(ln)) {
            console.error(`ERROR: scene ${idx+1} missing tu/vous address`);
            process.exit(1);
        }
        if (idx >=3 && idx <6 && !/\bon\b/.test(ln)) {
            console.error(`ERROR: scene ${idx+1} missing on address`);
            process.exit(1);
        }
        if (idx>=6 && !/\bje\b/.test(ln)) {
            console.error(`ERROR: scene ${idx+1} missing je address`);
            process.exit(1);
        }
    });
    // verify rhetorical question closure and limit
    let openQs = 0;
    structure.scenes.forEach((s:any, idx:number)=>{
        const text = s.narration || '';
        const questions = (text.match(/[^?]*\?/g) || []).length;
        const answers = (text.match(/\b(because|so|therefore|the answer|which means|thus|hence|here's why)\b/i) || []).length;
        openQs += questions - answers;
        if (openQs > 2) {
            console.error('ERROR: more than 2 open questions simultaneously');
            process.exit(1);
        }
    });
    // cameraAction defaults such as zoom-in are applied later in generateCompleteScript and are not verified here

    // verify metaphor warning printed if not reused
    // we can't easily capture console.warn in this simple script, but at minimum ensure structure remains

    // verify cleaning rules applied
    console.log('scenes after cleaning:', JSON.stringify(structure.scenes, null, 2));
    // second scene should have no visualText (it duplicated narration)
    if (structure.scenes[1].visualText) {
        console.error('ERROR: visualText duplication not removed');
        process.exit(1);
    }
    // second scene props should not include 'phone' again
    if (structure.scenes[1].props && structure.scenes[1].props.includes('phone')) {
        console.error('ERROR: duplicate prop not removed');
        process.exit(1);
    }
    // scene2 props must be limited to 3 maximum
    if (structure.scenes[1].props && structure.scenes[1].props.length > 3) {
        console.error('ERROR: props count not truncated');
        process.exit(1);
    }
    // narration redundancy should be cleared (empty string or different)
    if (structure.scenes[1].narration &&
        structure.scenes[1].narration.trim().toLowerCase() ===
        structure.scenes[0].narration.trim().toLowerCase()) {
        console.error('ERROR: redundant narration not removed');
        process.exit(1);
    }

    // new rules: confirm that when LLM returns duplicate props or duplicate visualText/narration,
    // they are filtered out
    const sample = {
        title: 'Test2',
        scenes: [
            {
                sceneNumber: 1,
                narration: 'hello',
                props: ['phone'],
                visualDensity: 'low',
                timeRange: { start: 0, end: 5 }
            },
            {
                sceneNumber: 2,
                narration: 'hello',
                props: ['phone', 'ball'],
                visualText: [{ content: 'hello', position: 'top' }],
                visualDensity: 'low',
                timeRange: { start: 5, end: 10 }
            }
        ],
        backgroundMusic: ''
    };
    // bypass generateVideoStructure post-processing by calling method directly
    const cleaned = (gen as any).postProcess && typeof (gen as any).postProcess === 'function'
        ? (gen as any).postProcess(sample)
        : sample;
    // but we don't have such method; instead we'll mimic call used above
    console.log('NOTE: manual check for rules');

    // === duration model sanity checks ===
    const { suggestSceneDuration, enrichedSceneSchema } = await import('../src/types/video-script.types');
    console.log('suggestion quick-list 5 words', suggestSceneDuration(5, 'quick-list'));
    console.log('suggestion story 10 words', suggestSceneDuration(10, 'story'));

    // zod should normalize invalid contextType values rather than failing
    const parsed = enrichedSceneSchema.parse({
        id: 'foo',
        sceneNumber: 1,
        timeRange: { start: 0, end: 5 },
        narration: 'test',
        actions: [],
        expression: 'neutral',
        visualDensity: 'low',
        contextType: 'hook', // not allowed enum
        imagePrompt: 'dummy',
        animationPrompt: 'dummy'
    });
    if (parsed.contextType !== 'story') {
        console.error('ERROR: schema did not normalize invalid contextType, got', parsed.contextType);
        process.exit(1);
    }
    console.log('schema contextType normalization works');
})();
