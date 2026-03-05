/**
 * Layout Catalog
 *
 * 17 visual composition layouts extracted from real whiteboard animation frames.
 * Each layout defines how elements (character, text, props, visuals) are positioned
 * in the frame. The LayoutCatalog is used by PromptGenerator to produce accurate
 * composition instructions and by VideoScriptGenerator to let the AI make
 * intelligent layout choices per scene.
 */

export type AspectRatio = '16:9' | '9:16' | '1:1';

export interface LayoutZone {
    /** Horizontal position in % from left */
    x: number;
    /** Vertical position in % from top */
    y: number;
    /** Width as % of frame */
    w: number;
    /** Height as % of frame */
    h: number;
}

export interface LayoutDefinition {
    /** Unique identifier used in schema / AI prompts */
    id: LayoutId;
    /** Short human-readable name */
    name: string;
    /** Detailed description for image prompt generation */
    compositionInstruction: string;
    /** Short description for the AI to choose this layout */
    aiDescription: string;
    /** When to use this layout */
    useCases: string[];
    /** Approximate zone for the main character (if present) */
    characterZone?: LayoutZone;
    /** Approximate zone for the main text block (if present) */
    textZone?: LayoutZone;
    /** Aspect ratios this layout works best with */
    bestForAspectRatio: AspectRatio[];
    /** Whether the layout should include a character */
    hasCharacter: boolean;
    /** Whether the layout features multiple characters */
    multipleCharacters: boolean;
    /** Aspect-ratio specific zone overrides */
    zones?: Partial<Record<AspectRatio, { character?: LayoutZone; text?: LayoutZone }>>;
}

export type LayoutId =
    | 'character-center-bottom-text'
    | 'character-left-text-right'
    | 'character-right-text-left'
    | 'text-only-center'
    | 'text-columns-multi'
    | 'checklist-with-character'
    | 'dual-character-split'
    | 'dual-character-arrow'
    | 'multi-character-3col'
    | 'multi-character-grid-6'
    | 'character-with-scene-prop'
    | 'image-grid-3x2'
    | 'character-thought-bubble'
    | 'character-pointing-visual'
    | 'character-icons-around'
    | 'character-with-object-side'
    | 'full-frame-action'
    | 'narrator-besides-ui'
    | 'individual-vs-crowd'
    | 'triple-action-simultaneous'
    | 'data-viz-comparison'
    | 'asymmetric-action-focus'
    | 'character-seated-thought-box'
    | 'split-scene-top-bottom'
    | 'character-inside-object'
    | 'visual-metaphor-center'
    | 'character-peeking-side'
    | 'character-besides-signpost'
    | 'three-panel-comic-strip'
    | 'reference-image-center'
    | 'roadmap-winding-path'
    | 'dual-character-meeting-table'
    | 'character-thinking-large-cloud'
    | 'character-energy-impact'
    | 'dual-character-dialogue'
    | 'character-pointing-large-screen'
    | 'asymmetric-dual-confrontation'
    | 'circular-process-cycle'
    | 'character-at-desk-workstation'
    | 'character-on-pedestal-stage'
    | 'character-mobile-phone-tablet'
    | 'character-in-armchair-relaxing'
    | 'dual-character-professor-student'
    | 'asymmetric-dual-scene-contrast'
    | 'character-with-side-bullet-highlights'
    | 'comparison-visual-ratio-pots'
    | 'software-ui-with-narrator'
    | 'character-surrounded-by-concept-icons';

export const LAYOUT_CATALOG: Record<LayoutId, LayoutDefinition> = {

    /**
     * LAYOUT 1: Character centered, subtitle text below
     * Example: Frame 001 — character center, "two oddly specific things" below
     */
    'character-center-bottom-text': {
        id: 'character-center-bottom-text',
        name: 'Character Center, Caption Below',
        compositionInstruction:
            'Position the character centered horizontally, in the upper half of frame. ' +
            'Text elements in lower portion. Clean empty background.',
        aiDescription: 'Character centered, text below.',
        useCases: [
            'intro hook',
            'narrator moment',
            'single key statement',
            'punchline delivery',
            'emotional reaction',
        ],
        characterZone: { x: 30, y: 15, w: 40, h: 65 },
        textZone: { x: 10, y: 80, w: 80, h: 15 },
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 2: Character left, explanation text right
     */
    'character-left-text-right': {
        id: 'character-left-text-right',
        name: 'Character Left, Text Right',
        compositionInstruction:
            'Character on left, text on right.',
        aiDescription: 'Character left, text right.',
        useCases: [
            'explaining a concept',
            'delivering a result',
            'commentary on a fact',
            'narrating with emphasis',
        ],
        characterZone: { x: 5, y: 20, w: 30, h: 60 },
        textZone: { x: 38, y: 25, w: 55, h: 50 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
        zones: {
            '9:16': {
                character: { x: 10, y: 10, w: 80, h: 35 }, // Top
                text: { x: 10, y: 50, w: 80, h: 40 }       // Bottom
            }
        }
    },

    /**
     * LAYOUT 3: Text/title left, character right
     */
    'character-right-text-left': {
        id: 'character-right-text-left',
        name: 'Text Left, Character Right',
        compositionInstruction:
            'Text on left, character on right.',
        aiDescription: 'Text left, character right.',
        useCases: [
            'presenting a list',
            'slide-like format',
            'topic introduction',
            'character reacting to text',
        ],
        characterZone: { x: 62, y: 20, w: 30, h: 65 },
        textZone: { x: 5, y: 15, w: 55, h: 70 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
        zones: {
            '9:16': {
                text: { x: 10, y: 10, w: 80, h: 40 },       // Top
                character: { x: 10, y: 55, w: 80, h: 35 }   // Bottom
            }
        }
    },

    /**
     * LAYOUT 4: Pure text, no character
     */
    'text-only-center': {
        id: 'text-only-center',
        name: 'Text Only (Centered)',
        compositionInstruction:
            'Text only, centered. No character.',
        aiDescription: 'Text only, centered.',
        useCases: [
            'key statistic',
            'powerful quote',
            'transition slide',
            'big number reveal',
            'memorable statement',
        ],
        textZone: { x: 10, y: 25, w: 80, h: 50 },
        bestForAspectRatio: ['16:9', '9:16', '1:1'],
        hasCharacter: false,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 5: Multi-column text table
     */
    'text-columns-multi': {
        id: 'text-columns-multi',
        name: 'Multi-Column Text (2-4 Columns)',
        compositionInstruction:
            'Multiple text columns. No character.',
        aiDescription: 'Multiple text columns.',
        useCases: [
            'schedule or plan',
            'multi-step comparison',
            'features comparison',
            'gym plan or routine',
            'options or choices',
        ],
        textZone: { x: 5, y: 10, w: 90, h: 80 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: false,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 6: Checklist on left, character on right
     */
    'checklist-with-character': {
        id: 'checklist-with-character',
        name: 'Checklist Left, Character Right',
        compositionInstruction:
            'Checklist left, character right.',
        aiDescription: 'Checklist left, character right.',
        useCases: [
            'showing achievements',
            'to-do list recap',
            'feature highlights',
            'summary of points',
        ],
        characterZone: { x: 58, y: 20, w: 35, h: 65 },
        textZone: { x: 5, y: 10, w: 52, h: 80 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 7: Two characters side by side in contrast
     */
    'dual-character-split': {
        id: 'dual-character-split',
        name: 'Dual Character Split (Contrast)',
        compositionInstruction:
            'Two characters side by side.',
        aiDescription: 'Two characters side by side.',
        useCases: [
            'before vs after',
            'good vs bad habit',
            'two types of people',
            'problem vs solution',
            'two different reactions',
        ],
        characterZone: { x: 5, y: 20, w: 38, h: 60 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    /**
     * LAYOUT 8: Two characters connected by an arrow with label
     */
    'dual-character-arrow': {
        id: 'dual-character-arrow',
        name: 'Before → Arrow → After',
        compositionInstruction:
            'Character left, arrow, character right. Transformation.',
        aiDescription: 'Character left, arrow, character right.',
        useCases: [
            'transformation',
            'result of an action',
            'cause and effect',
            'before and after',
            'process result',
        ],
        characterZone: { x: 5, y: 20, w: 28, h: 60 },
        textZone: { x: 30, y: 40, w: 40, h: 20 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    /**
     * LAYOUT 9: Three characters in 3 columns
     */
    'multi-character-3col': {
        id: 'multi-character-3col',
        name: '3 Characters in 3 Columns',
        compositionInstruction: '3 characters in 3 columns.',
        aiDescription: '3 characters in 3 columns.',
        useCases: [
            '3 types of people',
            '3 steps or stages',
            'different options',
            '3 scenarios',
        ],
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    /**
     * LAYOUT 10: 6 characters in a 3x2 grid
     */
    'multi-character-grid-6': {
        id: 'multi-character-grid-6',
        name: '6 Characters in 3×2 Grid',
        compositionInstruction:
            '6 characters in 3x2 grid.',
        aiDescription: '6 characters in 3x2 grid.',
        useCases: [
            'showing multiple options',
            'showing a variety of examples',
            'a collection of habits or activities',
            'humor with multiple scenarios',
        ],
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    /**
     * LAYOUT 11: Character in a full scene environment
     */
    'character-with-scene-prop': {
        id: 'character-with-scene-prop',
        name: 'Character in Full Scene',
        compositionInstruction: 'Character with scene props around.',
        aiDescription: 'Character with environmental props.',
        useCases: [
            'depicting a daily-life situation',
            'setting a scene or location',
            'showing a habit or routine',
            'relatable life moment',
        ],
        characterZone: { x: 10, y: 30, w: 35, h: 55 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 12: Grid of images with labels below each
     */
    'image-grid-3x2': {
        id: 'image-grid-3x2',
        name: 'Image Grid 3×2 with Labels',
        compositionInstruction:
            '6 items in 3x2 grid. No character.',
        aiDescription: '6 items in 3x2 grid.',
        useCases: [
            'ranking or top list',
            'destinations or places',
            'visual comparison of options',
            'product features',
            'step illustrations',
        ],
        textZone: { x: 5, y: 5, w: 90, h: 90 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: false,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 13: Character with thought bubble
     */
    'character-thought-bubble': {
        id: 'character-thought-bubble',
        name: 'Character with Thought Bubble',
        compositionInstruction:
            'Character with thought bubble above.',
        aiDescription: 'Character with thought bubble above.',
        useCases: [
            'inner monologue',
            'confusion or doubt',
            'hesitation',
            'questioning themselves',
            'internal conflict',
        ],
        characterZone: { x: 45, y: 40, w: 40, h: 50 },
        textZone: { x: 30, y: 5, w: 45, h: 40 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 14: Character pointing at an object or visual
     */
    'character-pointing-visual': {
        id: 'character-pointing-visual',
        name: 'Character Pointing at Visual Element',
        compositionInstruction:
            'Character pointing at chart/visual on opposite side.',
        aiDescription: 'Character pointing at visual/chart opposite side.',
        useCases: [
            'presenting data',
            'showing a chart or graph',
            'highlighting a specific visual',
            'teaching moment',
            'directing attention to information',
        ],
        characterZone: { x: 65, y: 25, w: 28, h: 65 },
        textZone: { x: 5, y: 10, w: 58, h: 80 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 15: Character surrounded by floating icons
     */
    'character-icons-around': {
        id: 'character-icons-around',
        name: 'Character with Icons Around',
        compositionInstruction:
            'Character with floating icons around.',
        aiDescription: 'Character with floating icons around.',
        useCases: [
            'showing multiple possibilities',
            'overwhelm or decision moment',
            'describing someone\'s interests',
            'illustrating distractions',
            'brainstorming scene',
        ],
        characterZone: { x: 15, y: 20, w: 35, h: 65 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 16: Character and a large object side by side
     */
    'character-with-object-side': {
        id: 'character-with-object-side',
        name: 'Character Beside Large Object',
        compositionInstruction:
            'Character beside large object.',
        aiDescription: 'Character beside large object.',
        useCases: [
            'demonstrating an action',
            'showing a tool or device',
            'cause and effect',
            'interaction with environment',
        ],
        characterZone: { x: 5, y: 20, w: 30, h: 65 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 17: Full-frame dramatic single character action
     */
    'full-frame-action': {
        id: 'full-frame-action',
        name: 'Full Frame Dramatic Action',
        compositionInstruction:
            'One character fills frame dramatically.',
        aiDescription: 'One character, dramatic high-energy pose.',
        useCases: [
            'visual climax',
            'multitasking scene',
            'overwhelm moment',
            'hero or power moment',
            'exaggerated action for humor',
        ],
        characterZone: { x: 15, y: 10, w: 70, h: 85 },
        bestForAspectRatio: ['16:9', '9:16', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 18: Narrator besides a large UI/app/dashboard screenshot
     */
    'narrator-besides-ui': {
        id: 'narrator-besides-ui',
        name: 'Narrator Besides UI',
        compositionInstruction:
            'Character beside large app/UI interface.',
        aiDescription: 'Character beside large UI/app interface.',
        useCases: ['final CTA', 'product demo', 'resource mention', 'software walkthrough'],
        characterZone: { x: 70, y: 30, w: 25, h: 60 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 19: One main character facing a crowd of small characters
     */
    'individual-vs-crowd': {
        id: 'individual-vs-crowd',
        name: 'Individual vs Crowd',
        compositionInstruction:
            'One large character vs small crowd on opposite side.',
        aiDescription: 'One large character on left, group small on right.',
        useCases: ['peer pressure', 'influence', 'standing out', 'social comparison', 'leadership'],
        characterZone: { x: 10, y: 25, w: 30, h: 60 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    /**
     * LAYOUT 20: 3 distinct action scenes side-by-side
     */
    'triple-action-simultaneous': {
        id: 'triple-action-simultaneous',
        name: 'Triple Simultaneous Action',
        compositionInstruction:
            '3 different actions in 3 vertical zones.',
        aiDescription: '3 different actions in 3 vertical columns.',
        useCases: ['daily routine', 'multitasking', 'different locations', 'story progression'],
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    /**
     * LAYOUT 21: Pure data/graphics comparison with percentages
     */
    'data-viz-comparison': {
        id: 'data-viz-comparison',
        name: 'Data-Viz Comparison',
        compositionInstruction:
            'Data/graphics comparisons with percentages and numbers. No large character.',
        aiDescription: 'Data/graphics comparison. No character.',
        useCases: ['statistics', 'results', 'fact-checking', 'market share', 'survey results'],
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: false,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 22: Action pushed to extreme left/right for transition space
     */
    'asymmetric-action-focus': {
        id: 'asymmetric-action-focus',
        name: 'Asymmetric Action Focus',
        compositionInstruction:
            'All action on extreme left or right. Mostly empty space opposite.',
        aiDescription: 'Action on extreme side, empty opposite.',
        useCases: ['dramatic transition', 'room for future captions', 'showing travel/movement', 'leaving a scene'],
        bestForAspectRatio: ['16:9', '9:16'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 23: Character seated besides a dark text box
     */
    'character-seated-thought-box': {
        id: 'character-seated-thought-box',
        name: 'Seated Character with Info Box',
        compositionInstruction:
            'Character seated on left, large text box on right.',
        aiDescription: 'Character seated left, text box right.',
        useCases: ['long reflection', 'complex question', 'narrative pause', 'key takeaway'],
        characterZone: { x: 10, y: 35, w: 35, h: 60 },
        textZone: { x: 50, y: 20, w: 45, h: 60 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 24: Text top, visual bottom
     */
    'split-scene-top-bottom': {
        id: 'split-scene-top-bottom',
        name: 'Narrative Text Over Visual',
        compositionInstruction:
            'Text at top, action scene at bottom.',
        aiDescription: 'Text top, action scene bottom.',
        useCases: ['descriptive narration', 'explaining a process', 'scene setup', 'detailed context'],
        textZone: { x: 10, y: 5, w: 80, h: 35 },
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    /**
     * LAYOUT 25: Character emerging from an object
     */
    'character-inside-object': {
        id: 'character-inside-object',
        name: 'Character Emerging (Inside)',
        compositionInstruction:
            'Character half-emerged from a large center object.',
        aiDescription: 'Character emerging from center object.',
        useCases: ['surprise reveal', 'internal concepts', 'new ideas', 'personal growth', 'discovery'],
        characterZone: { x: 30, y: 25, w: 40, h: 65 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 26: Large central metaphor
     */
    'visual-metaphor-center': {
        id: 'visual-metaphor-center',
        name: 'Central Visual Metaphor',
        compositionInstruction:
            'Large visual metaphor centered. No character.',
        aiDescription: 'Large visual metaphor centered. No character.',
        useCases: ['core idea highlight', 'global concepts', 'intelligence/mind topics', 'big picture'],
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: false,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 27: Character peeking from behind text
     */
    'character-peeking-side': {
        id: 'character-peeking-side',
        name: 'Character Peeking Behind Text',
        compositionInstruction:
            'Character peeking behind text block.',
        aiDescription: 'Character peeking behind text panel.',
        useCases: ['adding details', 'curiosity hook', 'extra tip', 'narrator aside', 'pointing at text'],
        characterZone: { x: 20, y: 35, w: 25, h: 45 },
        bestForAspectRatio: ['16:9', '9:16'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 28: Character besides a milestone signpost
     */
    'character-besides-signpost': {
        id: 'character-besides-signpost',
        name: 'Character Besides Signpost',
        compositionInstruction:
            'Character beside signpost with arrows.',
        aiDescription: 'Character beside signpost.',
        useCases: ['milestones', 'direction change', 'next steps', 'goals', 'attaining a level'],
        characterZone: { x: 20, y: 30, w: 30, h: 60 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 29: 3 panels for sequential storytelling
     */
    'three-panel-comic-strip': {
        id: 'three-panel-comic-strip',
        name: 'Three-Panel Comic Strip',
        compositionInstruction:
            '3 horizontal comic-style panels with sequential scenes.',
        aiDescription: '3 horizontal comic panels.',
        useCases: ['short story', 'sequential steps', 'humorous situation', 'process walkthrough'],
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    /**
     * LAYOUT 30: Realistic reference/meme image center
     */
    'reference-image-center': {
        id: 'reference-image-center',
        name: 'Central Reference Image',
        compositionInstruction:
            'Large reference image/photo centered with text.',
        aiDescription: 'Reference image/photo centered.',
        useCases: ['historical reference', 'meme usage', 'external example', 'celebrity quote', 'real-world object'],
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: false,
        multipleCharacters: false,
    },

    /**
     * LAYOUT 31: Winding road with milestones
     */
    'roadmap-winding-path': {
        id: 'roadmap-winding-path',
        name: 'Winding Roadmap Path',
        compositionInstruction:
            'Winding path with milestone markers. Character along path.',
        aiDescription: 'Winding path with milestones and character.',
        useCases: ['user journey', 'project roadmap', 'long-term vision', 'progress tracking'],
        characterZone: { x: 10, y: 20, w: 80, h: 70 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'dual-character-meeting-table': {
        id: 'dual-character-meeting-table',
        name: 'Dual Character Meeting',
        compositionInstruction: 'Two characters at table facing each other.',
        aiDescription: 'Two characters sitting at table together.',
        useCases: ['teamwork', 'negotiation', 'interview', 'social interaction'],
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    'character-thinking-large-cloud': {
        id: 'character-thinking-large-cloud',
        name: 'Character with Large Thought Cloud',
        compositionInstruction: 'Character in lower corner, large cloud above.',
        aiDescription: 'Character with large thought cloud above.',
        useCases: ['big ideas', 'visions', 'unexplored thoughts', 'ambition'],
        characterZone: { x: 10, y: 70, w: 20, h: 25 },
        textZone: { x: 15, y: 5, w: 70, h: 60 },
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'character-energy-impact': {
        id: 'character-energy-impact',
        name: 'Character Energy Impact',
        compositionInstruction: 'Character centered with radial energy lines behind.',
        aiDescription: 'Character with radial energy/impact lines.',
        useCases: ['success', 'breakthrough', 'high energy', 'sudden realization'],
        characterZone: { x: 30, y: 20, w: 40, h: 60 },
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'dual-character-dialogue': {
        id: 'dual-character-dialogue',
        name: 'Dual Character Dialogue',
        compositionInstruction: 'Two characters face-to-face with speech bubbles.',
        aiDescription: 'Two characters talking face-to-face.',
        useCases: ['conversation', 'argument', 'consultation', 'feedback'],
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    'character-pointing-large-screen': {
        id: 'character-pointing-large-screen',
        name: 'Pointing at Large Screen',
        compositionInstruction: 'Character on side pointing at giant screen/monitor.',
        aiDescription: 'Character pointing at giant monitor/screen.',
        useCases: ['presentation', 'tech demo', 'data analysis', 'watching content'],
        characterZone: { x: 5, y: 30, w: 20, h: 60 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'asymmetric-dual-confrontation': {
        id: 'asymmetric-dual-confrontation',
        name: 'Asymmetric Confrontation',
        compositionInstruction: 'One large character foreground, one small background opposite side.',
        aiDescription: 'Large foreground character vs small background character.',
        useCases: ['threat', 'intimidation', 'perspective', 'observation'],
        bestForAspectRatio: ['16:9', '9:16'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    'circular-process-cycle': {
        id: 'circular-process-cycle',
        name: 'Circular Process Cycle',
        compositionInstruction: 'Circular arrow center. Items/icons arranged around it.',
        aiDescription: 'Circular process with items around.',
        useCases: ['feedback loop', 'continuous improvement', 'lifecycle', 'repeating process'],
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: false,
        multipleCharacters: false,
    },

    'character-at-desk-workstation': {
        id: 'character-at-desk-workstation',
        name: 'Character at Desk',
        compositionInstruction: 'Character sitting at desk with laptop.',
        aiDescription: 'Character at desk with laptop and lamp.',
        useCases: ['work', 'study', 'focus', 'online activity', 'content creation'],
        characterZone: { x: 10, y: 30, w: 50, h: 60 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'character-on-pedestal-stage': {
        id: 'character-on-pedestal-stage',
        name: 'Character on Pedestal',
        compositionInstruction: 'Character standing on raised pedestal platform.',
        aiDescription: 'Character on pedestal or stage.',
        useCases: ['success', 'winning', 'achievement', 'public speaking', 'authority'],
        characterZone: { x: 30, y: 20, w: 40, h: 60 },
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'character-mobile-phone-tablet': {
        id: 'character-mobile-phone-tablet',
        name: 'Mobile Device Usage',
        compositionInstruction: 'Character holding mobile device or tablet.',
        aiDescription: 'Character with phone or tablet.',
        useCases: ['social media', 'messaging', 'mobile app', 'scrolling', 'notification'],
        characterZone: { x: 30, y: 30, w: 40, h: 60 },
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'character-in-armchair-relaxing': {
        id: 'character-in-armchair-relaxing',
        name: 'Character in Armchair',
        compositionInstruction: 'Character sitting in armchair.',
        aiDescription: 'Character in armchair.',
        useCases: ['relaxation', 'reading', 'thinking', 'leisure', 'comfort'],
        characterZone: { x: 20, y: 30, w: 50, h: 60 },
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'dual-character-professor-student': {
        id: 'dual-character-professor-student',
        name: 'Professor and Student',
        compositionInstruction: 'One character pointing at board, another character watching.',
        aiDescription: 'Teacher character with student character.',
        useCases: ['education', 'mentorship', 'coaching', 'lessons'],
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    'asymmetric-dual-scene-contrast': {
        id: 'asymmetric-dual-scene-contrast',
        name: 'Asymmetric Contrast Scene',
        compositionInstruction: 'Two different scene zones with contrast.',
        aiDescription: 'Two mini-scenes with contrast.',
        useCases: ['narrative comparison', 'cause-effect', 'different realities'],
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: true,
    },

    'character-with-side-bullet-highlights': {
        id: 'character-with-side-bullet-highlights',
        name: 'Side Bullet Highlights',
        compositionInstruction: 'Character center-right, bullet text on left.',
        aiDescription: 'Character and text bullet list.',
        useCases: ['feature list', 'key takeaways', 'reasons', 'steps'],
        characterZone: { x: 45, y: 20, w: 40, h: 60 },
        textZone: { x: 5, y: 20, w: 40, h: 60 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'comparison-visual-ratio-pots': {
        id: 'comparison-visual-ratio-pots',
        name: 'Visual Ratio Comparison',
        compositionInstruction: 'Two containers side-by-side with different quantities.',
        aiDescription: 'Visual ratio comparison containers.',
        useCases: ['80/20 rule', 'priorities', 'inequality', 'resource allocation'],
        bestForAspectRatio: ['16:9', '1:1'],
        hasCharacter: false,
        multipleCharacters: false,
    },

    'software-ui-with-narrator': {
        id: 'software-ui-with-narrator',
        name: 'Software UI Demo',
        compositionInstruction: 'App/UI interface with character pointing to it.',
        aiDescription: 'Character with dashboard UI.',
        useCases: ['product demo', 'software tutorial', 'data walkthrough', 'call to action'],
        characterZone: { x: 75, y: 30, w: 20, h: 60 },
        bestForAspectRatio: ['16:9'],
        hasCharacter: true,
        multipleCharacters: false,
    },

    'character-surrounded-by-concept-icons': {
        id: 'character-surrounded-by-concept-icons',
        name: 'Concept Icon Cloud',
        compositionInstruction: 'Character centered with small icons arranged around.',
        aiDescription: 'Character surrounded by concept icons.',
        useCases: ['brainstorming', 'interests', 'multi-tasking', 'complexity', 'ideas'],
        characterZone: { x: 35, y: 35, w: 30, h: 30 },
        bestForAspectRatio: ['16:9', '1:1', '9:16'],
        hasCharacter: true,
        multipleCharacters: false,
    },
};

/**
 * Helper to resolve layout zones based on aspect ratio
 */
export function getLayoutZones(layoutId: LayoutId, aspectRatio: AspectRatio): { character?: LayoutZone, text?: LayoutZone } {
    const layout = LAYOUT_CATALOG[layoutId];
    if (!layout) return {};

    // Check for specific override
    if (layout.zones && layout.zones[aspectRatio]) {
        return {
            character: layout.zones[aspectRatio]!.character || layout.characterZone,
            text: layout.zones[aspectRatio]!.text || layout.textZone
        };
    }

    // Fallback to default
    return {
        character: layout.characterZone,
        text: layout.textZone
    };
}

/**
 * Get a layout definition by ID
 */
export function getLayout(id: LayoutId): LayoutDefinition {
    const layout = LAYOUT_CATALOG[id];
    if (!layout) throw new Error(`Unknown layout ID: ${id}`);
    return layout;
}

/**
 * Get all layout IDs as a string array (for Zod enum)
 */
export const ALL_LAYOUT_IDS = Object.keys(LAYOUT_CATALOG) as LayoutId[];

/**
 * Get layouts suitable for a given aspect ratio
 */
export function getLayoutsForAspectRatio(aspectRatio: AspectRatio): LayoutId[] {
    return ALL_LAYOUT_IDS.filter(id =>
        LAYOUT_CATALOG[id].bestForAspectRatio.includes(aspectRatio)
    );
}

/**
 * Build the AI-readable layout menu for system prompts
 * Returns a formatted list of layout IDs with their short descriptions and use cases.
 */
export function buildLayoutMenuForAI(aspectRatio?: AspectRatio): string {
    const ids = aspectRatio ? getLayoutsForAspectRatio(aspectRatio) : ALL_LAYOUT_IDS;

    const lines: string[] = ids.map(id => {
        const l = LAYOUT_CATALOG[id];
        const useCases = l.useCases.slice(0, 3).join(', ');
        return `  '${id}' → ${l.aiDescription} [Use for: ${useCases}]`;
    });

    return lines.join('\n');
}
