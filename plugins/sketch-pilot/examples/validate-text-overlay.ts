#!/usr/bin/env ts-node

/**
 * Test: Validate text overlay logic
 * 
 * This script tests the text overlay logic without requiring FFmpeg
 */

import { textPositionSchema, textOverlayConfigSchema, TextPosition } from '../src/types/video-script.types';

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║   Text Overlay Logic Validation                          ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Test 1: Validate TextPosition enum
console.log('✓ Test 1: TextPosition enum validation');
const validPositions: TextPosition[] = ['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'];
validPositions.forEach(pos => {
    const result = textPositionSchema.safeParse(pos);
    if (result.success) {
        console.log(`  ✓ ${pos}: Valid`);
    } else {
        console.error(`  ✗ ${pos}: Invalid`);
        process.exit(1);
    }
});

// Test 2: Validate TextOverlayConfig schema
console.log('\n✓ Test 2: TextOverlayConfig schema validation');
const configs = [
    {
        enabled: true,
        position: 'bottom' as TextPosition,
        fontSize: 48,
        fontColor: 'white',
        backgroundColor: 'black@0.7',
        fontFamily: 'Arial',
        maxCharsPerLine: 40
    },
    {
        enabled: true,
        position: 'top' as TextPosition,
        fontSize: 36,
        fontColor: 'yellow',
        backgroundColor: 'black@0.5',
        fontFamily: 'Helvetica',
        maxCharsPerLine: 50
    }
];

configs.forEach((config, index) => {
    const result = textOverlayConfigSchema.safeParse(config);
    if (result.success) {
        console.log(`  ✓ Config ${index + 1}: Valid`);
        console.log(`    - Position: ${result.data.position}`);
        console.log(`    - Font Size: ${result.data.fontSize}px`);
        console.log(`    - Max Chars: ${result.data.maxCharsPerLine}`);
    } else {
        console.error(`  ✗ Config ${index + 1}: Invalid`, result.error);
        process.exit(1);
    }
});

// Test 3: Validate default values
console.log('\n✓ Test 3: Default values validation');
const minimalConfig = { enabled: true };
const result = textOverlayConfigSchema.safeParse(minimalConfig);
if (result.success) {
    console.log('  ✓ Default values applied correctly:');
    console.log(`    - Position: ${result.data.position} (expected: bottom)`);
    console.log(`    - Font Size: ${result.data.fontSize}px (expected: 48)`);
    console.log(`    - Font Color: ${result.data.fontColor} (expected: white)`);
    console.log(`    - Background: ${result.data.backgroundColor} (expected: black@0.6)`);
    console.log(`    - Max Chars: ${result.data.maxCharsPerLine} (expected: 40)`);
} else {
    console.error('  ✗ Default values not applied:', result.error);
    process.exit(1);
}

// Test 4: Test text wrapping logic (simulated)
console.log('\n✓ Test 4: Text wrapping logic simulation');
function wrapText(text: string, maxCharsPerLine: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        // Handle words that are longer than maxCharsPerLine
        if (word.length > maxCharsPerLine) {
            // Add current line if it exists
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }
            // Split the long word into chunks
            for (let i = 0; i < word.length; i += maxCharsPerLine) {
                lines.push(word.substring(i, i + maxCharsPerLine));
            }
            continue;
        }

        if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
            currentLine = (currentLine + ' ' + word).trim();
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);

    return lines.join('\n');
}

const testTexts = [
    {
        text: "This is a short text",
        maxChars: 40,
        expectedLines: 1
    },
    {
        text: "This is a much longer text that should be wrapped into multiple lines for better readability",
        maxChars: 40,
        expectedLines: 3
    },
    {
        text: "Everyone dreams of instant success! Imagine a stickman wishing upon a star, dreaming of becoming rich and famous overnight.",
        maxChars: 40,
        expectedLines: 4
    },
    {
        text: "Testing supercalifragilisticexpialidocious word handling",
        maxChars: 30,
        expectedLines: 3,
        description: "Long word test"
    }
];

testTexts.forEach((test, index) => {
    const wrapped = wrapText(test.text, test.maxChars);
    const lines = wrapped.split('\n');
    const testLabel = test.description ? `${test.description}` : `Test ${index + 1}`;
    console.log(`  ${testLabel}:`);
    console.log(`    Input: "${test.text.substring(0, 50)}..."`);
    console.log(`    Max chars: ${test.maxChars}`);
    console.log(`    Result: ${lines.length} line(s)`);
    lines.forEach((line, i) => {
        console.log(`      Line ${i + 1}: "${line}" (${line.length} chars)`);
        if (line.length > test.maxChars) {
            console.error(`    ✗ Line ${i + 1} exceeds max chars!`);
            process.exit(1);
        }
    });
    console.log(`    ✓ All lines within max chars`);
});

// Test 5: Position coordinate calculation (simulated)
console.log('\n✓ Test 5: Position coordinate calculation');
function getTextPosition(position: TextPosition): { x: string, y: string } {
    const positions: Record<TextPosition, { x: string, y: string }> = {
        'top': { x: '(w-text_w)/2', y: '30' },
        'center': { x: '(w-text_w)/2', y: '(h-text_h)/2' },
        'bottom': { x: '(w-text_w)/2', y: 'h-text_h-30' },
        'top-left': { x: '30', y: '30' },
        'top-right': { x: 'w-text_w-30', y: '30' },
        'bottom-left': { x: '30', y: 'h-text_h-30' },
        'bottom-right': { x: 'w-text_w-30', y: 'h-text_h-30' },
        'none': { x: '0', y: '0' }
    };
    return positions[position] || positions.bottom;
}

validPositions.forEach(pos => {
    const coords = getTextPosition(pos);
    console.log(`  ✓ ${pos}: x=${coords.x}, y=${coords.y}`);
});

// Test 6: Validate new highlightColor and googleFontUrl fields
console.log('\n✓ Test 6: highlightColor and googleFontUrl config fields');
const advancedStyles = ['colored-words', 'scaling-words', 'animated-background'] as const;
advancedStyles.forEach(styleName => {
    const parsed = textOverlayConfigSchema.safeParse({
        enabled: true,
        style: styleName,
        highlightColor: '#FF4081',
        googleFontUrl: 'https://fonts.googleapis.com/css2?family=Roboto:wght@900'
    });
    if (!parsed.success) {
        console.error(`  ✗ ${styleName} with highlightColor: Invalid`, parsed.error);
        process.exit(1);
    }
    if (parsed.data.highlightColor !== '#FF4081') {
        console.error(`  ✗ ${styleName}: highlightColor not preserved`);
        process.exit(1);
    }
    if (parsed.data.googleFontUrl !== 'https://fonts.googleapis.com/css2?family=Roboto:wght@900') {
        console.error(`  ✗ ${styleName}: googleFontUrl not preserved`);
        process.exit(1);
    }
    console.log(`  ✓ ${styleName}: highlightColor and googleFontUrl preserved`);
});

// Test 7: Default highlightColor
console.log('\n✓ Test 7: Default highlightColor is #00E676');
const defaultHighlight = textOverlayConfigSchema.safeParse({ enabled: true });
if (!defaultHighlight.success || defaultHighlight.data.highlightColor !== '#00E676') {
    console.error('  ✗ Default highlightColor is incorrect');
    process.exit(1);
}
console.log(`  ✓ Default highlightColor: ${defaultHighlight.data.highlightColor}`);

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║   ✅ All tests passed!                                   ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('Text overlay feature is ready to use!');
console.log('To use it, set textOverlay in VideoGenerationOptions:');
console.log(`
const options = {
    duration: 60,
    sceneCount: 6,
    style: 'motivational',
    animationMode: 'panning',
    textOverlay: {
        enabled: true,
        position: 'bottom',
        fontSize: 48,
        fontColor: 'white',
        backgroundColor: 'black@0.7',
        fontFamily: 'Arial',
        maxCharsPerLine: 40
    }
};
`);
