import OpenAI from 'openai';

interface KimiConfig {
    model: string;
    temperature: number;
    maxTokens: number;
}

export class KimiClient {
    private client: OpenAI;
    private config: KimiConfig;

    constructor(apiKey: string, config: KimiConfig) {
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.moonshot.ai/v1',
        });
        this.config = config;
    }

    updateConfig(config: Partial<KimiConfig>) {
        this.config = { ...this.config, ...config };
    }

    updateApiKey(apiKey: string) {
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.moonshot.ai/v1',
        });
    }

    async generate(prompt: string, context?: string): Promise<string> {
        const fullPrompt = context 
            ? `Context:\n${context}\n\nUser: ${prompt}`
            : prompt;

        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages: [{ role: 'user', content: fullPrompt }],
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
            });

            return response.choices[0]?.message?.content || '';
        } catch (error) {
            console.error('Kimi API Error:', error);
            throw new Error('Failed to generate response: ' + error.message);
        }
    }

    async generateStream(
        prompt: string, 
        onChunk: (chunk: string) => void,
        context?: string
    ): Promise<void> {
        const fullPrompt = context 
            ? `Context:\n${context}\n\nUser: ${prompt}`
            : prompt;

        try {
            const stream = await this.client.chat.completions.create({
                model: this.config.model,
                messages: [{ role: 'user', content: fullPrompt }],
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
                stream: true,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    onChunk(content);
                }
            }
        } catch (error) {
            console.error('Kimi API Streaming Error:', error);
            throw new Error('Failed to stream response: ' + error.message);
        }
    }

    async chat(messages: Array<{role: 'user' | 'assistant', content: string}>): Promise<string> {
        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
            });

            return response.choices[0]?.message?.content || '';
        } catch (error) {
            console.error('Kimi Chat Error:', error);
            throw new Error('Failed to chat: ' + error.message);
        }
    }

    async summarize(content: string, style: 'brief' | 'detailed' | 'bullet-points' = 'bullet-points'): Promise<string> {
        const prompt = `Please summarize the following content in ${style} style in Korean:\n\n${content}`;
        return this.generate(prompt);
    }

    async edit(text: string, instruction: string): Promise<string> {
        const prompt = `Original text:\n${text}\n\nInstruction: ${instruction}\n\nPlease provide only the edited text, without any explanation:`;
        return this.generate(prompt);
    }

    async generateTitle(content: string): Promise<string> {
        const prompt = `Based on the following content, suggest a concise title (2-6 words) in Korean:\n\n${content}\n\nTitle:`;
        const title = await this.generate(prompt);
        return title.trim();
    }

    async suggestLinks(content: string, existingNotes: string[]): Promise<string[]> {
        const prompt = `Based on the content, suggest relevant links from: ${existingNotes.join(', ')}\n\nContent:\n${content}\n\nSuggested links (in [[Note Name]] format):`;
        const response = await this.generate(prompt);
        
        // Parse wikilinks from response
        const links: string[] = [];
        const regex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = regex.exec(response)) !== null) {
            links.push(match[1]);
        }
        return links;
    }

    async analyzeChinese(content: string, task: 'translate' | 'summarize' | 'explain' = 'summarize', targetLang: 'korean' | 'english' = 'korean'): Promise<string> {
        const taskMap = {
            translate: `Translate to ${targetLang}:`,
            summarize: `Summarize in ${targetLang}:`,
            explain: `Explain meaning and context in ${targetLang}:`,
        };

        const prompt = `${taskMap[task]}\n\n${content}`;
        return this.generate(prompt);
    }
}