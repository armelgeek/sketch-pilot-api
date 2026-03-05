# Pricing Guide - NanoBanana Video Generation

## 💰 Gemini API Pricing (2024/2026)

### Text Generation (Gemini Flash)
- **Input**: ~$0.00001875 per 1K tokens
- **Output**: ~$0.000075 per 1K tokens
- **Typical request**: ~$0.0002 per call

### Image Generation (Gemini Pro Image)
- **Per image**: $0.01-0.04 depending on resolution
- **Average**: ~$0.02 per image (standard quality)

---

## 📊 Cost Breakdown by Video Length

### 59 seconds (6 scenes, ~12 images)

| Component | Calls | Unit Cost | Total |
|-----------|-------|-----------|-------|
| Script generation | 1 | $0.0002 | $0.0002 |
| Layout generation | 6 | $0.0002 | $0.0012 |
| Image generation | 12 | $0.02 | $0.24 |
| **TOTAL** | **19** |  | **~$0.24** |

### 5 minutes (30 scenes, optimized)

| Component | Calls | Unit Cost | Total |
|-----------|-------|-----------|-------|
| Script generation | 1 | $0.0002 | $0.0002 |
| Layout generation | 30 | $0.0002 | $0.006 |
| Image generation | 20* | $0.02 | $0.40 |
| **TOTAL** | **51** |  | **~$0.41** |

*Optimized: ~0.67 assets per scene instead of 2-3

### 5 minutes (30 scenes, standard)

| Component | Calls | Unit Cost | Total |
|-----------|-------|-----------|-------|
| Script generation | 1 | $0.0002 | $0.0002 |
| Layout generation | 30 | $0.0002 | $0.006 |
| Image generation | 60 | $0.02 | $1.20 |
| **TOTAL** | **91** |  | **~$1.21** |

---

## 🎯 Cost Optimization Strategies

### 1. Script-Only Mode (Validate First)
Generate and review scripts before creating assets.

```typescript
const script = await engine.generateStructuredScript(topic, options);
// Review script.md, modify if needed
// Then generate assets only if approved
```

**Savings**: $0.24 → $0.0002 (99% cheaper for validation)

### 2. Reduce Props per Scene
AI tends to generate 2-3 assets per scene. Optimize prompts to minimize props.

**Example**:
- **Before**: "mountain, desk, laptop, thought bubble" = 4 assets
- **After**: "desk with laptop" = 2 assets (50% saving)

### 3. Reuse Assets Across Scenes
Same character, same props in multiple scenes = generate once, reuse.

```typescript
// Generate character once
const character = await engine.generateAsset(stickman, baseImages, "character.png");

// Reuse in all 6 scenes
scenes.forEach(scene => scene.characterFile = "character.png");
```

**Savings**: 6 characters → 1 character = 5 × $0.02 = $0.10 saved

### 4. Batch Generation
Generate multiple videos in parallel to maximize API throughput.

```typescript
const topics = ["Topic 1", "Topic 2", "Topic 3"];
await Promise.all(topics.map(topic => 
  engine.generateStructuredScript(topic, options)
));
```

---

## 📈 Scaling Examples

### Small Channel (10 videos/month)
- **59s videos**: 10 × $0.24 = **$2.40/month**
- **5min videos**: 10 × $0.41 = **$4.10/month**

### Medium Channel (100 videos/month)
- **59s videos**: 100 × $0.24 = **$24/month**
- **5min videos**: 100 × $0.41 = **$41/month**

### Large Channel (1000 videos/month)
- **59s videos**: 1000 × $0.24 = **$240/month**
- **5min videos optimized**: 1000 × $0.41 = **$410/month**

---

## 💡 Real-World Reference

> **User Reference**: "A 5-minute video should cost around $0.40"

This is achievable with:
- ✅ Optimized asset generation (~0.67 assets/scene)
- ✅ Prop reuse across scenes
- ✅ Minimal background elements
- ✅ Smart character consistency

**Formula**:
```
Cost = $0.006 (layouts) + (num_unique_assets × $0.02)
$0.40 = $0.006 + (20 × $0.02)
```

For 30 scenes, that's **20 unique assets total** or **~0.67 per scene**.

---

## 🔧 Monitoring Costs

The engine automatically tracks costs in metadata:

```json
{
  "metadata": {
    "apiCalls": 19,
    "estimatedCost": 0.24,
    "generationTimeMs": 180000
  }
}
```

Check `metadata.json` after each generation to monitor actual costs.

---

## ⚡ Quick Reference

| Duration | Scenes | Images | Cost |
|----------|--------|--------|------|
| 30s | 3 | ~6 | ~$0.12 |
| 59s | 6 | ~12 | ~$0.24 |
| 2min | 12 | ~16 | ~$0.32 |
| 5min | 30 | ~20* | ~$0.41 |
| 5min | 30 | ~60 | ~$1.21 |

*Optimized asset count

---

**Last Updated**: 2026-02-17  
**Pricing Source**: Gemini API (Flash + Pro Image)
