/**
 * test-new-submagic-styles.ts
 * 
 * Validates the three new Submagic-inspired subtitle animation styles:
 * bounce, neon, typewriter
 * 
 * Run: npx ts-node examples/test-new-submagic-styles.ts
 */

import { textOverlayConfigSchema } from '../src/types/video-script.types';
import { AssCaptionService, AssCaptionStyle } from '../src/services/video/ass-caption.service';

const newStyles: AssCaptionStyle[] = ['bounce', 'neon', 'typewriter'];

const WORDS = [
    { word: 'THE',   startMs: 0,    durationMs: 400 },
    { word: 'QUICK', startMs: 400,  durationMs: 500 },
    { word: 'BROWN', startMs: 900,  durationMs: 500 },
    { word: 'FOX',   startMs: 1400, durationMs: 600 },
];

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║   New Submagic Subtitle Styles Validation                ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Test 1: new styles accepted by schema
console.log('✓ Test 1: New styles in textOverlayConfigSchema');
for (const style of newStyles) {
    const result = textOverlayConfigSchema.safeParse({ enabled: true, style });
    if (!result.success) { console.error(`  ✗ FAIL: ${style}`, result.error); process.exit(1); }
    console.log(`  ✓ schema accepts style: ${style}`);
}

// Test 2: ASS service generates valid output for each new style
console.log('\n✓ Test 2: ASS file generation for each new style');
for (const style of newStyles) {
    const svc = new AssCaptionService(1080, 1920, { style });
    const ass = svc.buildASSFile(WORDS);
    if (!ass.includes('[Script Info]') || !ass.includes('Dialogue:')) {
        console.error(`  ✗ FAIL: ${style} produced invalid ASS output`); process.exit(1);
    }
    const count = ass.split('\n').filter((l: string) => l.startsWith('Dialogue:')).length;
    console.log(`  ✓ '${style}': ${count} dialogue events generated`);
}

// Test 3: bounce uses spring-physics (many sub-segments per word)
console.log('\n✓ Test 3: Bounce uses spring-physics sub-segments');
{
    const svc = new AssCaptionService(1080, 1920, { style: 'bounce' });
    const ass = svc.buildASSFile(WORDS);
    const count = ass.split('\n').filter((l: string) => l.startsWith('Dialogue:')).length;
    if (count < 8) { console.error(`  ✗ FAIL: expected ≥8 events, got ${count}`); process.exit(1); }
    console.log(`  ✓ bounce: ${count} events (spring-physics keyframes confirmed)`);
}

// Test 4: typewriter marks future words invisible and active word fades in
console.log('\n✓ Test 4: Typewriter invisible/fade-in behaviour');
{
    const svc = new AssCaptionService(1080, 1920, { style: 'typewriter' });
    const ass = svc.buildASSFile(WORDS);
    if (!ass.includes('\\alpha&HFF&')) {
        console.error('  ✗ FAIL: typewriter missing \\alpha&HFF& for invisible words'); process.exit(1);
    }
    if (!ass.includes('\\fad(')) {
        console.error('  ✗ FAIL: typewriter missing \\fad fade-in tag'); process.exit(1);
    }
    console.log('  ✓ typewriter: \\alpha&HFF& (invisible) and \\fad (fade-in) confirmed');
}

// Test 5: neon uses glow border (matching colour + blur)
console.log('\n✓ Test 5: Neon glow border tags');
{
    const svc = new AssCaptionService(1080, 1920, { style: 'neon' });
    const ass = svc.buildASSFile(WORDS);
    if (!ass.includes('\\blur') || !ass.includes('\\3c')) {
        console.error('  ✗ FAIL: neon missing \\blur or \\3c glow tags'); process.exit(1);
    }
    console.log('  ✓ neon: \\3c (outline colour) and \\blur (glow) tags confirmed');
}

// Test 6: custom highlight colour respected
console.log('\n✓ Test 6: Custom highlightColor respected');
{
    const svc = new AssCaptionService(1080, 1920, { style: 'neon', highlightColor: '#FF00FF' });
    const ass = svc.buildASSFile(WORDS);
    // #FF00FF → ASS &H00FF00FF → magenta
    if (!ass.includes('FF00FF')) {
        console.error('  ✗ FAIL: custom highlight colour not found in output'); process.exit(1);
    }
    console.log('  ✓ custom #FF00FF highlight colour preserved in ASS output');
}

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║   ✅ All new Submagic style tests passed!                ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');
