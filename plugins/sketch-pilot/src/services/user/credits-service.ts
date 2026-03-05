import * as fs from 'fs';
import * as path from 'path';

export interface UserCredits {
    userId: string;
    balance: number;
    updatedAt: string;
}

export class CreditsService {
    private readonly filePath: string;
    private credits: Record<string, UserCredits> = {};

    constructor(dataDir?: string) {
        const rootDir = dataDir || path.join(process.cwd(), 'data');
        if (!fs.existsSync(rootDir)) {
            fs.mkdirSync(rootDir, { recursive: true });
        }
        this.filePath = path.join(rootDir, 'credits.json');
        this.loadCredits();
    }

    private loadCredits(): void {
        if (fs.existsSync(this.filePath)) {
            try {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                this.credits = JSON.parse(data);
            } catch (error) {
                console.error(`[CreditsService] Error loading credits:`, error);
                this.credits = {};
            }
        }
    }

    private saveCredits(): void {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.credits, null, 2), 'utf-8');
        } catch (error) {
            console.error(`[CreditsService] Error saving credits:`, error);
        }
    }

    getCredits(userId: string): number {
        if (!this.credits[userId]) {
            // Default credits for new users
            this.credits[userId] = {
                userId,
                balance: 100, // Starting bonus
                updatedAt: new Date().toISOString()
            };
            this.saveCredits();
        }
        return this.credits[userId].balance;
    }

    addCredits(userId: string, amount: number): void {
        const currentBalance = this.getCredits(userId);
        this.credits[userId] = {
            userId,
            balance: currentBalance + amount,
            updatedAt: new Date().toISOString()
        };
        this.saveCredits();
    }

    deductCredits(userId: string, amount: number): boolean {
        const currentBalance = this.getCredits(userId);
        if (currentBalance < amount) {
            return false;
        }
        this.credits[userId] = {
            userId,
            balance: currentBalance - amount,
            updatedAt: new Date().toISOString()
        };
        this.saveCredits();
        return true;
    }
}
