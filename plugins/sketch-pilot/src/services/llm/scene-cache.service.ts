import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class SceneCacheService {
    private readonly filePath: string;
    private cache: Record<string, string> = {};

    constructor(dataDir?: string) {
        const rootDir = dataDir || path.join(process.cwd(), 'data');
        if (!fs.existsSync(rootDir)) {
            fs.mkdirSync(rootDir, { recursive: true });
        }
        this.filePath = path.join(rootDir, 'scene-cache.json');
        this.loadCache();
    }

    private loadCache(): void {
        if (fs.existsSync(this.filePath)) {
            try {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                this.cache = JSON.parse(data);
            } catch (error) {
                console.error(`[SceneCacheService] Error loading cache:`, error);
                this.cache = {};
            }
        }
    }

    private saveCache(): void {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
        } catch (error) {
            console.error(`[SceneCacheService] Error saving cache:`, error);
        }
    }

    private generateKey(prompt: string, options?: any): string {
        const hash = crypto.createHash('sha256');
        hash.update(prompt);
        if (options) {
            hash.update(JSON.stringify(options));
        }
        return hash.digest('hex');
    }

    get(prompt: string, options?: any): string | null {
        const key = this.generateKey(prompt, options);
        return this.cache[key] || null;
    }

    set(prompt: string, response: string, options?: any): void {
        const key = this.generateKey(prompt, options);
        this.cache[key] = response;
        this.saveCache();
    }

    clear(): void {
        this.cache = {};
        this.saveCache();
    }
}
