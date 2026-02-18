import { App, TFile } from 'obsidian';

export class ContextManager {
    private app: App;
    private pinnedNotes: TFile[] = [];
    private currentNote: TFile | null = null;

    constructor(app: App) {
        this.app = app;
    }

    pinNote(file: TFile) {
        if (!this.pinnedNotes.find(n => n.path === file.path)) {
            this.pinnedNotes.push(file);
        }
    }

    unpinNote(file: TFile) {
        this.pinnedNotes = this.pinnedNotes.filter(n => n.path !== file.path);
    }

    isPinned(file: TFile): boolean {
        return this.pinnedNotes.some(n => n.path === file.path);
    }

    getPinnedNotes(): TFile[] {
        return [...this.pinnedNotes];
    }

    setCurrentNote(file: TFile | null) {
        this.currentNote = file;
    }

    getCurrentNote(): TFile | null {
        return this.currentNote;
    }

    async getContextString(): Promise<string> {
        const contexts: string[] = [];

        // Add pinned notes
        for (const note of this.pinnedNotes) {
            try {
                const content = await this.app.vault.read(note);
                contexts.push(`## ${note.name}\n${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}`);
            } catch (e) {
                console.error('Error reading pinned note:', e);
            }
        }

        // Add current note
        if (this.currentNote && !this.pinnedNotes.find(n => n.path === this.currentNote?.path)) {
            try {
                const content = await this.app.vault.read(this.currentNote);
                contexts.push(`## Current: ${this.currentNote.name}\n${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}`);
            } catch (e) {
                console.error('Error reading current note:', e);
            }
        }

        return contexts.join('\n\n---\n\n');
    }

    async getVaultContext(query: string): Promise<string> {
        // Search for relevant notes in vault
        const files = this.app.vault.getMarkdownFiles();
        const relevantFiles: { file: TFile, relevance: number }[] = [];

        for (const file of files) {
            const content = await this.app.vault.read(file);
            // Simple relevance check
            if (content.toLowerCase().includes(query.toLowerCase())) {
                relevantFiles.push({ file, relevance: content.length });
            }
        }

        // Sort by relevance and take top 3
        relevantFiles.sort((a, b) => b.relevance - a.relevance);
        const topFiles = relevantFiles.slice(0, 3);

        const contexts = await Promise.all(
            topFiles.map(async ({ file }) => {
                const content = await this.app.vault.read(file);
                return `## ${file.name}\n${content.substring(0, 1500)}${content.length > 1500 ? '...' : ''}`;
            })
        );

        return contexts.join('\n\n---\n\n');
    }

    clearContext() {
        this.pinnedNotes = [];
        this.currentNote = null;
    }
}