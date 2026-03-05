# Video Types & Genres Guide

This guide explains the video types and genres feature inspired by [shortsbot.ai](https://shortsbot.ai/), which enables creating targeted, engaging short-form content for different audiences and purposes.

## Overview

The stickman generator now supports **9 video types** and **16 video genres** that work together to create contextually appropriate content. This system helps tailor the narrative style, character actions, props, and overall approach to match your content goals.

## Video Types

Video types define the **format and structure** of your content. Each type has specific characteristics that influence how the story is told.

### 1. **Faceless** (`faceless`)
- **Best for:** Narration-driven content with strong visuals
- **Characteristics:** 
  - No need to show character face prominently
  - Focus on actions and environmental storytelling
  - Ideal for anonymous or brand-focused content
- **Example Topics:**
  - "The Secret Behind Viral Videos"
  - "5 Facts About Space You Didn't Know"

### 2. **Tutorial** (`tutorial`)
- **Best for:** Step-by-step instructional content
- **Characteristics:**
  - Clear breakdown of steps
  - Character demonstrates each action
  - Uses props and tools
  - Educational and practical
- **Example Topics:**
  - "How to Build a Website in 5 Steps"
  - "Master This Skill in 60 Seconds"

### 3. **Listicle** (`listicle`)
- **Best for:** Numbered lists, rankings, facts
- **Characteristics:**
  - Structured as numbered points
  - Each scene represents one item
  - Clear visual representation per item
  - Engaging and easy to follow
- **Example Topics:**
  - "Top 5 Productivity Hacks"
  - "3 Mistakes Everyone Makes"

### 4. **News** (`news`)
- **Best for:** News recaps, trending topics, updates
- **Characteristics:**
  - Factual presentation
  - Character as news presenter/reporter
  - Professional tone
  - Current events focus
- **Example Topics:**
  - "Breaking: AI Just Changed Everything"
  - "Today's Tech News in 60 Seconds"

### 5. **Animation** (`animation`)
- **Best for:** Motion graphics and dynamic content
- **Characteristics:**
  - Emphasizes dynamic movements
  - Visual effects focused
  - Exaggerated, expressive actions
  - Highly visual storytelling
- **Example Topics:**
  - "How Your Brain Works"
  - "The Journey of a Photon"

### 6. **Review** (`review`)
- **Best for:** Product reviews, recommendations
- **Characteristics:**
  - Character examining subject
  - Evaluation gestures and expressions
  - Pros/cons presentation
  - Comparative analysis
- **Example Topics:**
  - "Is This AI Tool Worth It?"
  - "Reviewing the Latest iPhone"

### 7. **Story** (`story`)
- **Best for:** Narratives, legends, mini-mysteries
- **Characteristics:**
  - Narrative progression
  - Emotional character arc
  - Visual storytelling
  - Beginning, middle, end structure
- **Example Topics:**
  - "The Man Who Solved the Impossible"
  - "A Strange Discovery That Changed Everything"

### 8. **Motivational** (`motivational`)
- **Best for:** Inspirational content, quotes, affirmations
- **Characteristics:**
  - Uplifting language
  - Confident poses
  - Inspiring body language
  - Positive energy
- **Example Topics:**
  - "You're Stronger Than You Think"
  - "The Power of Persistence"

### 9. **Entertainment** (`entertainment`)
- **Best for:** Memes, trends, funny content
- **Characteristics:**
  - Fun and engaging
  - Playful, energetic actions
  - Humorous expressions
  - High entertainment value
- **Example Topics:**
  - "When You Finally Understand Coding"
  - "Things Nobody Tells You About Adulting"

---

## Video Genres

Video genres define the **subject matter and audience** for your content. They help tailor the props, context, and specific details.

### Content Genres

| Genre | Description | Example Props | Best Combined With |
|-------|-------------|---------------|-------------------|
| **Educational** | Learning and knowledge | Books, pencils, charts | Tutorial, Listicle |
| **Fun** | Fun and engaging entertainment | Party items, games | Entertainment, Story |
| **Business** | Professional/entrepreneurship | Charts, briefcase, documents | Tutorial, Listicle |
| **Lifestyle** | Daily life and wellness | Coffee, plants, yoga mat | Faceless, Story |
| **Tech** | Technology and gadgets | Computer, phone, gadgets | Review, Tutorial |
| **Finance** | Money and investing | Money, graphs, calculator | Tutorial, Listicle |
| **Health** | Health and fitness | Dumbbells, fruit, water | Tutorial, Motivational |
| **Travel** | Travel and destinations | Map, luggage, camera | Story, Listicle |
| **Food** | Recipes and cooking | Utensils, ingredients | Tutorial, Review |
| **Gaming** | Gaming content | Controller, screen | Review, Entertainment |
| **Sports** | Sports and athletics | Ball, equipment | Motivational, News |
| **Science** | Scientific facts | Beaker, microscope | Educational, Animation |
| **History** | Historical content | Books, artifacts | Story, Educational |
| **Self-improvement** | Personal development | Journal, mirror, goals | Motivational, Tutorial |
| **Mystery** | Mysteries and puzzles | Magnifying glass, clues | Story, Entertainment |
| **General** | Broad audience | Versatile | Any type |

---

## Usage Examples

### Basic Usage

```typescript
import { VideoGenerationOptions } from './src/types/video-script.types';

const options: VideoGenerationOptions = {
    duration: 60,
    sceneCount: 6,
    style: 'educational',
    videoType: 'tutorial',        // Video format
    videoGenre: 'tech',           // Subject matter
    characterConsistency: true,
    animationClipDuration: 6,
    animationMode: 'ai'
};

const script = await engine.generateStructuredScript(
    "How to Build Your First AI App",
    options
);
```

### Recommended Combinations

#### 1. Educational Tutorial
```typescript
{
    videoType: 'tutorial',
    videoGenre: 'educational',
    topic: '5 Steps to Learn Programming'
}
```
**Result:** Step-by-step educational content with teaching gestures and educational props.

#### 2. Business Listicle
```typescript
{
    videoType: 'listicle',
    videoGenre: 'business',
    topic: 'Top 10 Productivity Hacks for Entrepreneurs'
}
```
**Result:** Numbered list of business tips with professional props and settings.

#### 3. Mystery Story
```typescript
{
    videoType: 'story',
    videoGenre: 'mystery',
    topic: 'The Unsolved Case That Baffled Everyone'
}
```
**Result:** Narrative mystery with suspenseful atmosphere and investigative character.

#### 4. Tech Review
```typescript
{
    videoType: 'review',
    videoGenre: 'tech',
    topic: 'Is This New AI Tool Worth It?'
}
```
**Result:** Evaluation-focused content with tech props and analytical character actions.

#### 5. Health Motivational
```typescript
{
    videoType: 'motivational',
    videoGenre: 'health',
    topic: 'You Can Transform Your Health Today'
}
```
**Result:** Inspiring health content with wellness props and confident character.

---

## Running the Demo

Try the interactive demo to see how different type/genre combinations affect the generated content:

```bash
npm run demo:types
```

This demo includes 7 pre-configured examples:
1. Educational Tutorial (Self-improvement)
2. Tech Review
3. Business Listicle
4. Motivational Story
5. Health Listicle
6. Mystery Entertainment
7. Finance Educational

---

## How It Works

When you specify a video type and genre:

1. **System Prompt Enhancement:** The AI receives specific guidelines about the chosen type and genre
2. **Contextual Adaptation:** The script generator adapts:
   - Narrative style and structure
   - Character actions and expressions
   - Props and visual elements
   - Scene composition
3. **Consistency:** The character and style remain consistent while adapting to the content type

### Behind the Scenes

The `VideoScriptGenerator` uses specialized guidelines for each type/genre:

```typescript
// Video Type Guidelines
private getVideoTypeGuidelines(videoType: string): string {
    // Returns specific instructions for the AI
    // e.g., "Break down steps clearly" for tutorials
}

// Video Genre Guidelines  
private getVideoGenreGuidelines(videoGenre: string): string {
    // Returns subject-specific context
    // e.g., "Use tech props (computer, phone)" for tech genre
}
```

---

## Best Practices

### 1. Choose Appropriate Combinations
- Match type and genre logically (e.g., tutorial + educational)
- Consider your target audience
- Think about platform and purpose

### 2. Topic Crafting
- Be specific in your topic
- Include key elements you want covered
- Consider viral potential

### 3. Duration and Scenes
- Shorter videos (30-60s) work best for social media
- 5-6 scenes provide good pacing
- Adjust scene count based on complexity

### 4. Optional Fields
- Type and genre are optional
- Omit them for more general content
- Use when you need specific targeting

---

## Comparison to Shortsbot.ai

Our implementation provides similar conceptual benefits:

| Feature | Shortsbot.ai | Stickman Generator |
|---------|--------------|-------------------|
| Video Types | ✅ Faceless, Tutorial, etc. | ✅ 9 types including same |
| Genre Targeting | ✅ Multiple niches | ✅ 16 genres |
| Customization | ✅ AI-generated scripts | ✅ AI-generated with Gemini |
| Animation | ✅ Automated | ✅ Veo/Grok integration |
| Character Style | Various | Minimalist stickman |
| Use Case | Social media automation | Flexible video generation |

---

## Testing

Validate the types and schemas:

```bash
npx ts-node examples/test-video-types-validation.ts
```

This test validates:
- ✅ All 9 video types
- ✅ All 16 video genres
- ✅ Schema validation
- ✅ Type/genre combinations
- ✅ Optional fields behavior

---

## Future Enhancements

Potential additions inspired by the broader market:
- More animation styles per type
- Platform-specific optimizations (TikTok, YouTube Shorts, Instagram Reels)
- Trending topic suggestions per genre
- A/B testing variations
- Analytics integration

---

## Support & Resources

- **Main README:** [../README.md](../README.md)
- **Examples:** `/examples/video-types-demo.ts`
- **Type Definitions:** `/src/types/video-script.types.ts`
- **Script Generator:** `/src/core/video-script-generator.ts`

For questions or issues, refer to the main documentation or open an issue on GitHub.
