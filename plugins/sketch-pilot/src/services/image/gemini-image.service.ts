import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import * as fs from "node:fs";
import sharp from "sharp";
import { ImageService, ImageServiceConfig } from './index';

/**
 * Implementation using Google Gemini Image Generation.
 */
export class GeminiImageService implements ImageService {
    private client: GoogleGenAI;
    private modelId: string = 'gemini-2.5-flash-image';
    private styleSuffix: string;
    private systemPrompt: string;
    private defaultQuality: 'ultra-low' | 'low' | 'medium' | 'high';

    constructor(config: ImageServiceConfig) {
        this.client = new GoogleGenAI({ apiKey: config.apiKey });
        this.styleSuffix = config.styleSuffix || '';
        this.systemPrompt = config.systemPrompt || '';
        this.defaultQuality = config.defaultQuality || 'medium';
    }



    async generateImage(
        prompt: string,
        filename: string,
        options: {
            aspectRatio?: string,
            removeBackground?: boolean,
            skipTrim?: boolean,
            referenceImages?: string[],
            systemInstruction?: string,
            quality?: 'ultra-low' | 'low' | 'medium' | 'high',
            smartUpscale?: boolean,
            format?: 'png' | 'webp'
        } = {}
    ): Promise<string> {
        const contents: any[] = [];
        const baseImages = options.referenceImages || [];

        if (baseImages.length > 0) {
            baseImages.forEach(data => {
                let mimeType = "image/jpeg";
                if (data.startsWith('iVBORw0KGgo')) mimeType = "image/png";
                else if (data.startsWith('UklGR')) mimeType = "image/webp";
                contents.push({ inlineData: { mimeType, data } });
            });
        }

        const bgConstraint = options.removeBackground ? "Isolated on a solid pure #FFFFFF white background. No shadows, no gradients." : "";
        const fullPrompt = `${prompt} ${bgConstraint} ${this.styleSuffix}`;
        contents.push({ text: fullPrompt });

        try {
            const dynamicSystemInstruction = options.systemInstruction || this.systemPrompt;
            const geminiAspectRatio = options.aspectRatio || '16:9';

            const response = await this.client.models.generateContent({
                model: this.modelId,
                contents,
                config: {
                    responseModalities: ['IMAGE'],
                    systemInstruction: dynamicSystemInstruction,
                    imageConfig: {
                        aspectRatio: geminiAspectRatio,
                    },
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    ],
                } as any,
            });

            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        const buffer = Buffer.from(part.inlineData.data, "base64");

                        // Post-process: resize to exact aspect ratio dimensions
                        const targetRes = this.getResolution(geminiAspectRatio);
                        const [width, height] = targetRes.split('x').map(Number);

                        console.log(`[GeminiImage] Resizing generated image to ${targetRes}...`);
                        const finalBuffer = await sharp(buffer)
                            .resize(width, height, {
                                fit: 'cover',
                                position: 'center'
                            })
                            .toBuffer();

                        fs.writeFileSync(filename, finalBuffer);
                        console.log(`[GeminiImage] Saved image to ${filename}`);
                        return filename;
                    }
                }
            }
        } catch (error) {
            console.error(`[GeminiImage] Error generating image:`, error);
            throw error;
        }
        return '';
    }

    private getResolution(aspectRatio: string): string {
        switch (aspectRatio) {
            case '9:16':
                return '720x1280';
            case '1:1':
                return '1080x1080';
            case '16:9':
            default:
                return '1280x720';
        }
    }
}
