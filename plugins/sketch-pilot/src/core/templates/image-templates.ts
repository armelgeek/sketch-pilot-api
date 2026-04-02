export const IMAGE_STYLE_ANCHORS = {
  default: (personaContext: string, characterContext: string) =>
    `${personaContext} Style: Highly detailed black and white pencil drawing with rich grayscale shading and subtle cross-hatching, creating depth across all surfaces. ${characterContext} The scene takes place in a realistic interior with at least five clearly identifiable objects such as a table, a chair, a lamp, a shelf, and a window, naturally arranged. The camera frames the action clearly while showing the environment. Walls and floor are visible with natural perspective lines to ground the space. All elements are rendered at realistic human scale. The composition is clean, balanced, and fully detailed with no empty or undefined space.`
}

export const IMAGE_RULES = {
  temporalAnchor: `TEMPORAL CONSISTENCY: The image MUST reflect the exact era and technology level implied by the scene. Never default to modern technology unless explicitly required.`,
  genderAnchor: `GENDER CONSISTENCY: The gender of all characters MUST match the narration exactly.
    If the narration uses "he/him" — render a male character.
    If "she/her" — render a female character.
    If unspecified — default to a neutral or ambiguous silhouette.`,
  referenceMode: (stylePrefix: string) =>
    `Style consistency: Match the artistic style of the reference images for character design, clothing, and line quality.${stylePrefix}. The image is strictly black and white, rendered in grayscale with detailed pencil shading and texture. The scene includes a full, realistic, and dense environment with multiple clearly defined objects, independent from the reference background.`,
  styleConsistency: ` Style consistency: Match the flat illustration style, line art, and rendering technique of the reference images. The entire scene, including the background, must be drawn in the same style and not appear photorealistic.`,
  environmentalContinuity: ` ENVIRONMENTAL CONTINUITY: The scene takes place in the EXACT SAME LOCATION as shown in the reference image labeled LOCATION. Maintain all architectural details, furniture positions, and environmental landmarks. Keep the layout identical, only changing the character and their specific action.`
}
