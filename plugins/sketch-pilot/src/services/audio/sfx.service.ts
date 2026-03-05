import * as path from 'path';

export interface SoundEffectAsset {
    type: string;
    path: string;
}

export class SFXService {
    private assetsDir: string;
    private sfxMap: Map<string, string>;

    constructor() {
        this.assetsDir = path.join(__dirname, 'assets', 'sfx');
        this.sfxMap = new Map([
            ['pop', 'pop.mp3'],
            ['swish', 'swish.mp3'],
            ['whoosh', 'whoosh.mp3'],
            ['scratch', 'pencil-scratch.mp3'],
            ['ding', 'ding.mp3'],
            ['click', 'click.mp3'],
        ]);
    }

    public getSFXPath(type: string): string {
        const filename = this.sfxMap.get(type.toLowerCase());
        if (!filename) {
            console.warn(`[SFXService] Unknown SFX type: ${type}`);
            return '';
        }
        return path.join(this.assetsDir, filename);
    }

    public resolveSFX(type: string): string | null {
        const p = this.getSFXPath(type);
        return p ? p : null;
    }
}
