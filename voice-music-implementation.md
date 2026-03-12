# Voice and Music Dynamic Implementation

## Summary

Complete implementation of a **dynamic voice and music management system from the database**.

The endpoints `GET /v1/config/voices` and `GET /v1/config/music` now read from PostgreSQL instead of hardcoded constants, enabling zero-deployment management by modifying the `isActive` flag.

## Architecture

### Database Schema

**voice_presets table:**
- id (PK): unique identifier
- preset_id (UNIQUE): used by TTS service  
- provider: kokoro, elevenlabs, or google
- name: display name
- language: BCP-47 code
- gender: male, female, or neutral
- description: optional description
- preview_url: optional CDN URL
- is_active: controls visibility
- created_at, updated_at: timestamps

**music_tracks table:**
- id (PK): unique identifier
- track_id (UNIQUE): used by video assembler
- name: display name
- path: filename in assets directory
- tags: array of categorization tags
- preview_url: optional CDN URL
- is_active: controls visibility
- created_at, updated_at: timestamps

## Initial Seed Data

### Kokoro Voices (10 presets)

- af_heart, af_bella, af_nicole (US female)
- am_adam, am_michael, am_echo (US male)
- bf_emma, bf_isabella (GB female)
- bm_george, bm_lewis (GB male)

### Background Music (4 tracks)

- lofi-1: Chill Lo-Fi
- upbeat-1: Upbeat Corporate  
- ambient-1: Soft Ambient
- fun-1: Funky Groove

## Key Features

### Zero-Deployment Management

To deactivate a voice without redeploying:

```sql
UPDATE voice_presets SET is_active = false WHERE preset_id = 'af_heart';
```

### Repository Methods

- `getAllVoices(provider?: string)`: list all active voices
- `getAllVoicesGroupedByProvider()`: voices grouped by provider
- `getVoiceByPresetId(presetId)`: validate specific voice
- `getAllMusicTracks()`: list all active music tracks
- `getMusicTrackById(trackId)`: validate specific track

### API Endpoints

- `GET /v1/config/voices`: returns voices grouped by provider
- `GET /v1/config/music`: returns active music tracks

### Use Case Validation

- `choose-voiceover`: validates voice in DB before accepting
- `choose-background-music`: validates music in DB before accepting

## Deployment

```bash
# Apply migrations
bun run migrate

# Test endpoints
curl http://localhost:3000/v1/config/voices
curl http://localhost:3000/v1/config/music
```

## Files Modified

- `src/infrastructure/database/schema/assets-config.schema.ts`: Drizzle schema
- `src/infrastructure/repositories/assets-config.repository.ts`: DB access
- `src/infrastructure/controllers/config.controller.ts`: API endpoints
- `src/application/use-cases/video/choose-voiceover.use-case.ts`: validation
- `src/application/use-cases/video/choose-background-music.use-case.ts`: validation
- `drizzle/0021_add_voice_music_config.sql`: migration with seed data
