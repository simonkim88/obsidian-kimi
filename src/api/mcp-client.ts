import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Notice } from 'obsidian';

export class MCPClientManager {
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private serverPath: string = '';
    private apiKey: string = '';

    constructor() { }

    setServerPath(path: string) {
        this.serverPath = path;
    }

    setApiKey(key: string) {
        this.apiKey = key;
    }

    async connect(): Promise<boolean> {
        if (!this.serverPath) {
            console.warn('MCP Server path not set');
            return false;
        }

        try {
            // Prepare environment
            const env = { ...process.env } as Record<string, string>;
            // Prioritize explicitly set API key
            if (this.apiKey) {
                env.MOONSHOT_API_KEY = this.apiKey;
            } else if (process.env.MOONSHOT_API_KEY) {
                env.MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY;
            }

            console.log(`Connecting to MCP server: node ${this.serverPath}`);

            // Create transport (It spawns the process internally)
            this.transport = new StdioClientTransport({
                command: 'node',
                args: [this.serverPath],
                env: env
            });

            this.transport.onerror = (error) => {
                console.error('MCP Transport Error:', error);
            };

            // Create client
            this.client = new Client(
                {
                    name: 'obsidian-kimi-plugin-client',
                    version: '1.1.0',
                },
                {
                    capabilities: {
                        // Client capabilities
                    },
                }
            );

            // Connect
            await this.client.connect(this.transport);

            console.log('MCP Client connected to server');
            new Notice('Kimi MCP server connected!');
            return true;

        } catch (error) {
            console.error('Failed to connect to MCP server:', error);
            new Notice('Failed to connect to Kimi MCP server');
            return false;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.client = null;
        }
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }
    }

    async callTool(toolName: string, args: any): Promise<any> {
        if (!this.client) {
            throw new Error('MCP client not connected');
        }

        try {
            const result = await this.client.callTool({
                name: toolName,
                arguments: args,
            });
            return result;
        } catch (error) {
            console.error(`Tool call failed (${toolName}):`, error);
            throw error;
        }
    }

    isConnected(): boolean {
        return this.client !== null;
    }
}
