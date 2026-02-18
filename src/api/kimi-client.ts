import { Notice } from 'obsidian';
import { MCPClientManager } from './mcp-client';

export interface KimiClientOptions {
    apiKey: string;
    temperature?: number;
    maxTokens?: number;
}

export class KimiClient {
    private mcpManager: MCPClientManager;
    private options: KimiClientOptions;

    constructor(options: KimiClientOptions) {
        this.options = options;
        this.mcpManager = new MCPClientManager();
        if (options.apiKey) {
            this.mcpManager.setApiKey(options.apiKey);
        }
    }

    setServerPath(path: string) {
        this.mcpManager.setServerPath(path);
        if (this.options.apiKey) {
            this.mcpManager.setApiKey(this.options.apiKey);
        }
    }

    async connect() {
        return await this.mcpManager.connect();
    }

    async disconnect() {
        await this.mcpManager.disconnect();
    }

    isConnected() {
        return this.mcpManager.isConnected();
    }

    updateOptions(newOptions: Partial<KimiClientOptions>) {
        this.options = { ...this.options, ...newOptions };
        if (newOptions.apiKey) {
            this.mcpManager.setApiKey(newOptions.apiKey);
        }
    }

    async generate(prompt: string, context?: string): Promise<string> {
        if (!this.isConnected()) {
            new Notice('Kimi MCP server not connected');
            return '';
        }

        try {
            const result = await this.mcpManager.callTool('generate_text', {
                prompt,
                context,
                temperature: this.options.temperature,
                maxTokens: this.options.maxTokens
            });

            if (result.isError) {
                throw new Error(result.content[0].text);
            }

            return result.content[0].text;
        } catch (error) {
            console.error('Kimi generation failed:', error);
            new Notice('Failed to generate response');
            throw error;
        }
    }

    async generateStream(prompt: string, onChunk: (chunk: string) => void, context?: string): Promise<void> {
        // MCP streaming not yet fully standardized or implemented in our server.
        // Fallback to non-streaming for now, simulating stream by returning full response at once.
        // Or we could implement a custom streaming tool if needed.
        const response = await this.generate(prompt, context);
        onChunk(response);
    }

    async summarize(content: string): Promise<string> {
        if (!this.isConnected()) {
            new Notice('Kimi MCP server not connected');
            return '';
        }

        try {
            const result = await this.mcpManager.callTool('summarize_note', {
                content,
                style: 'bullet-points'
            });

            return result.content[0].text;
        } catch (error) {
            console.error('Summarization failed:', error);
            new Notice('Failed to summarize note');
            throw error;
        }
    }

    async generateTitle(content: string, currentTitle?: string): Promise<string> {
        if (!this.isConnected()) return '';

        try {
            const result = await this.mcpManager.callTool('generate_note_title', {
                content,
                currentTitle
            });
            return result.content[0].text;
        } catch (error) {
            console.error('Title generation failed:', error);
            return '';
        }
    }

    async suggestLinks(content: string, vaultNotes: string[]): Promise<string[]> {
        if (!this.isConnected()) return [];

        try {
            const result = await this.mcpManager.callTool('suggest_links', {
                content,
                vaultNotes
            });
            const text = result.content[0].text;
            return text.split('\n').map((link: string) => link.trim()).filter((link: string) => link.length > 0);
        } catch (error) {
            console.error('Link suggestion failed:', error);
            return [];
        }
    }

    async analyzeChinese(content: string, task: 'translate' | 'summarize' | 'explain' = 'explain'): Promise<string> {
        if (!this.isConnected()) return '';

        try {
            const result = await this.mcpManager.callTool('analyze_chinese_text', {
                content,
                task
            });
            return result.content[0].text;
        } catch (error) {
            console.error('Chinese analysis failed:', error);
            return '';
        }
    }

    async edit(selection: string, instruction: string): Promise<string> {
        if (!this.isConnected()) {
            throw new Error('Kimi MCP server not connected');
        }

        try {
            const prompt = `Edit the following text based on the instruction: "${instruction}"\n\nText:\n${selection}`;
            return await this.generate(prompt);
        } catch (error) {
            console.error('Edit failed:', error);
            throw error;
        }
    }

    // Additional helper for chat view which sends history
    async chat(message: string, history: { role: string, content: string }[]): Promise<string> {
        if (!this.isConnected()) {
            throw new Error('Kimi MCP server not connected');
        }

        const result = await this.mcpManager.callTool('chat', {
            message,
            history
        });

        if (result.isError) {
            throw new Error(result.content[0].text);
        }

        return result.content[0].text;
    }
}