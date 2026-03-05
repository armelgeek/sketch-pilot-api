#!/usr/bin/env ts-node

/**
 * Test script for audio services
 * 
 * This script tests the different audio service providers to ensure they work correctly.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { AudioServiceFactory, AudioServiceConfig } from '../src/services/audio';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Test the Demo audio service
 */
async function testDemoAudio() {
    console.log('\n=== Testing Demo Audio Service ===');
    try {
        const config: AudioServiceConfig = {
            provider: 'demo',
            lang: 'en',
        };
        
        const service = AudioServiceFactory.create(config);
        const outputPath = path.join('/tmp', 'test-demo-audio.mp3');
        
        await service.generateSpeech('Hello, this is a test of the demo audio service.', outputPath);
        
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log('✅ Demo audio service test passed!');
            console.log(`   File size: ${stats.size} bytes`);
            console.log(`   Output: ${outputPath}`);
            return true;
        } else {
            console.log('❌ Demo audio service test failed: File not created');
            return false;
        }
    } catch (error) {
        console.error('❌ Demo audio service test failed:', error);
        return false;
    }
}

/**
 * Test the Google TTS service
 */
async function testGoogleTTS() {
    console.log('\n=== Testing Google TTS Service ===');
    
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
        console.log('⚠️  Skipping Google TTS test: GOOGLE_TTS_API_KEY not set');
        return null;
    }
    
    try {
        const config: AudioServiceConfig = {
            provider: 'google-tts',
            apiKey: apiKey,
            lang: 'en-US',
        };
        
        const service = AudioServiceFactory.create(config);
        const outputPath = path.join('/tmp', 'test-google-tts.mp3');
        
        await service.generateSpeech('Hello, this is a test of the Google text to speech service.', outputPath);
        
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log('✅ Google TTS service test passed!');
            console.log(`   File size: ${stats.size} bytes`);
            console.log(`   Output: ${outputPath}`);
            return true;
        } else {
            console.log('❌ Google TTS service test failed: File not created');
            return false;
        }
    } catch (error) {
        console.error('❌ Google TTS service test failed:', error);
        return false;
    }
}

/**
 * Test the ElevenLabs service
 */
async function testElevenLabs() {
    console.log('\n=== Testing ElevenLabs Service ===');
    
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.log('⚠️  Skipping ElevenLabs test: ELEVENLABS_API_KEY not set');
        return null;
    }
    
    try {
        const config: AudioServiceConfig = {
            provider: 'elevenlabs',
            apiKey: apiKey,
        };
        
        const service = AudioServiceFactory.create(config);
        const outputPath = path.join('/tmp', 'test-elevenlabs.mp3');
        
        await service.generateSpeech('Hello, this is a test of the ElevenLabs text to speech service.', outputPath);
        
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log('✅ ElevenLabs service test passed!');
            console.log(`   File size: ${stats.size} bytes`);
            console.log(`   Output: ${outputPath}`);
            return true;
        } else {
            console.log('❌ ElevenLabs service test failed: File not created');
            return false;
        }
    } catch (error) {
        console.error('❌ ElevenLabs service test failed:', error);
        return false;
    }
}

/**
 * Main test function
 */
async function main() {
    console.log('Starting audio service tests...');
    console.log('This will test all available audio providers.\n');
    
    const results = {
        demo: await testDemoAudio(),
        googleTTS: await testGoogleTTS(),
        elevenlabs: await testElevenLabs(),
    };
    
    console.log('\n=== Test Summary ===');
    console.log(`Demo Audio:    ${results.demo ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Google TTS:    ${results.googleTTS === null ? '⚠️  SKIPPED' : results.googleTTS ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`ElevenLabs:    ${results.elevenlabs === null ? '⚠️  SKIPPED' : results.elevenlabs ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPassed = results.demo && (results.googleTTS !== false) && (results.elevenlabs !== false);
    
    if (allPassed) {
        console.log('\n✅ All tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed');
        process.exit(1);
    }
}

// Run tests
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
