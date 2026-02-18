import { ItemView, WorkspaceLeaf, TFile, Menu, Notice, MarkdownView } from 'obsidian';
import ObsidianKimiPlugin from '../../main';

export const VIEW_TYPE_KIMI_CHAT = 'kimi-chat-view';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export class KimiChatView extends ItemView {
    plugin: ObsidianKimiPlugin;
    messages: Message[] = [];
    inputValue: string = '';
    isGenerating: boolean = false;
    attachedFiles: TFile[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianKimiPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_KIMI_CHAT;
    }

    getDisplayText() {
        return 'Kimi Chat';
    }

    getIcon(): string {
        return 'bot';
    }

    async onOpen() {
        this.containerEl.empty();
        this.render();
    }

    async onClose() {
        // Cleanup if needed
    }

    render() {
        const container = this.containerEl.createDiv('kimi-chat-container');

        // Header
        const header = container.createDiv('kimi-chat-header');
        header.createEl('h3', { text: '🦊 Kimi' });

        const modeIndicator = header.createSpan('kimi-mode-indicator');
        modeIndicator.textContent = `Mode: ${this.plugin.settings.permissionMode}`;

        // Messages area
        const messagesArea = container.createDiv('kimi-messages-area');
        this.renderMessages(messagesArea);

        // Attached files
        if (this.attachedFiles.length > 0) {
            const attachmentsDiv = container.createDiv('kimi-attachments');
            this.attachedFiles.forEach(file => {
                const chip = attachmentsDiv.createDiv('kimi-file-chip');
                chip.textContent = file.name;

                const pinBtn = chip.createSpan('kimi-pin-btn');
                pinBtn.textContent = '📌';
                pinBtn.title = 'Pin this note';
                pinBtn.onclick = () => {
                    this.plugin.contextManager.pinNote(file);
                    pinBtn.addClass('pinned');
                };

                const removeBtn = chip.createSpan('kimi-remove-btn');
                removeBtn.textContent = '×';
                removeBtn.onclick = () => {
                    this.attachedFiles = this.attachedFiles.filter(f => f !== file);
                    this.render();
                };
            });
        }

        // Input area
        const inputArea = container.createDiv('kimi-input-area');

        const input = inputArea.createEl('textarea', {
            cls: 'kimi-chat-input',
            placeholder: 'Ask Kimi anything... (@ to mention files, / for commands)'
        });
        input.value = this.inputValue;
        input.rows = 3;

        input.addEventListener('input', (e) => {
            this.inputValue = (e.target as HTMLTextAreaElement).value;
            this.handleInputChange(this.inputValue);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Toolbar
        const toolbar = inputArea.createDiv('kimi-toolbar');

        const attachBtn = toolbar.createEl('button', {
            cls: 'kimi-toolbar-btn',
            text: '@ Attach'
        });
        attachBtn.onclick = () => this.showFileMenu(attachBtn);

        const pinBtn = toolbar.createEl('button', {
            cls: 'kimi-toolbar-btn',
            text: '📌 Pin Current'
        });
        pinBtn.onclick = () => this.pinCurrentNote();

        const sendBtn = toolbar.createEl('button', {
            cls: 'kimi-send-btn',
            text: this.isGenerating ? '...' : 'Send'
        });
        sendBtn.disabled = this.isGenerating;
        sendBtn.onclick = () => this.sendMessage();

        // Add styles
        this.addStyles();
    }

    renderMessages(container: HTMLElement) {
        container.empty();

        if (this.messages.length === 0) {
            const welcome = container.createDiv('kimi-welcome');
            welcome.innerHTML = `
                <h4>Welcome to Obsidian Kimi!</h4>
                <p>I can help you with:</p>
                <ul>
                    <li>✍️ Writing and editing notes</li>
                    <li>📊 Summarizing content</li>
                    <li>🔗 Suggesting links</li>
                    <li>🇨🇳 Translating Chinese</li>
                    <li>💭 Answering questions</li>
                </ul>
                <p class="kimi-hint">Tip: Use @ to attach files, 📌 to pin context</p>
            `;
            return;
        }

        this.messages.forEach(msg => {
            const msgDiv = container.createDiv(`kimi-message kimi-message-${msg.role}`);

            const header = msgDiv.createDiv('kimi-message-header');
            header.textContent = msg.role === 'user' ? 'You' : '🦊 Kimi';

            const content = msgDiv.createDiv('kimi-message-content');
            content.innerHTML = this.formatMessage(msg.content);

            if (msg.role === 'assistant') {
                const actions = msgDiv.createDiv('kimi-message-actions');
                const copyBtn = actions.createEl('button', { text: 'Copy' });
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(msg.content);
                    new Notice('Copied!');
                };

                const insertBtn = actions.createEl('button', { text: 'Insert to Note' });
                insertBtn.onclick = () => this.insertToNote(msg.content);
            }
        });

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    formatMessage(content: string): string {
        // Simple markdown formatting
        return content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    handleInputChange(value: string) {
        // Handle @ mentions
        if (value.includes('@')) {
            const afterAt = value.split('@').pop();
            if (afterAt && afterAt.length > 0) {
                // Could show autocomplete here
            }
        }
    }

    async sendMessage() {
        if (!this.inputValue.trim() || this.isGenerating) return;

        const userMessage = this.inputValue.trim();
        this.inputValue = '';
        this.render();

        // Add user message
        this.messages.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date()
        });
        this.render();

        // Generate response
        this.isGenerating = true;
        this.render();

        try {
            // Get context
            const context = await this.plugin.contextManager.getContextString();

            // Add attached files context
            let fullContext = context;
            if (this.attachedFiles.length > 0) {
                const fileContents = await Promise.all(
                    this.attachedFiles.map(async f => {
                        const content = await this.app.vault.read(f);
                        return `## ${f.name}\n${content.substring(0, 3000)}`;
                    })
                );
                fullContext += '\n\n---\n\n' + fileContents.join('\n\n---\n\n');
            }

            let response = '';

            // Stream response
            await this.plugin.kimiClient.generateStream(
                userMessage,
                (chunk) => {
                    response += chunk;
                    // Update last message if it's assistant
                    const lastMsg = this.messages[this.messages.length - 1];
                    if (lastMsg.role === 'assistant') {
                        lastMsg.content = response;
                    } else {
                        this.messages.push({
                            role: 'assistant',
                            content: response,
                            timestamp: new Date()
                        });
                    }
                    this.render();
                },
                fullContext || undefined
            );

        } catch (error) {
            this.messages.push({
                role: 'assistant',
                content: `Error: ${error.message}`,
                timestamp: new Date()
            });
        } finally {
            this.isGenerating = false;
            this.render();
        }
    }

    showFileMenu(button: HTMLElement) {
        const menu = new Menu();

        const files = this.app.vault.getMarkdownFiles();
        files.slice(0, 20).forEach(file => {
            menu.addItem((item) => {
                item.setTitle(file.name)
                    .setIcon('file-text')
                    .onClick(() => {
                        if (!this.attachedFiles.find(f => f.path === file.path)) {
                            this.attachedFiles.push(file);
                            this.render();
                        }
                    });
            });
        });

        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
    }

    async pinCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.plugin.contextManager.pinNote(activeFile);
            new Notice(`Pinned: ${activeFile.name}`);
        } else {
            new Notice('No active file');
        }
    }

    async insertToNote(content: string) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const editor = view.editor;
            const cursor = editor.getCursor();
            editor.replaceRange(content, cursor);
            new Notice('Inserted!');
        }
    }

    addStyles() {
        // Add inline styles
        const style = document.createElement('style');
        style.textContent = `
            .kimi-chat-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                padding: 10px;
            }
            .kimi-chat-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--background-modifier-border);
            }
            .kimi-mode-indicator {
                font-size: 0.8em;
                color: var(--text-muted);
            }
            .kimi-messages-area {
                flex: 1;
                overflow-y: auto;
                padding: 10px 0;
            }
            .kimi-welcome {
                text-align: center;
                color: var(--text-muted);
                padding: 20px;
            }
            .kimi-welcome ul {
                text-align: left;
                display: inline-block;
            }
            .kimi-hint {
                font-size: 0.9em;
                margin-top: 20px;
                padding: 10px;
                background: var(--background-secondary);
                border-radius: 5px;
            }
            .kimi-message {
                margin-bottom: 15px;
                padding: 10px;
                border-radius: 8px;
            }
            .kimi-message-user {
                background: var(--background-secondary);
            }
            .kimi-message-assistant {
                background: var(--background-primary-alt);
            }
            .kimi-message-header {
                font-weight: bold;
                margin-bottom: 5px;
                font-size: 0.9em;
                color: var(--text-muted);
            }
            .kimi-message-content {
                line-height: 1.6;
            }
            .kimi-message-content pre {
                background: var(--background-secondary);
                padding: 10px;
                border-radius: 5px;
                overflow-x: auto;
            }
            .kimi-message-content code {
                background: var(--background-secondary);
                padding: 2px 5px;
                border-radius: 3px;
                font-family: monospace;
            }
            .kimi-message-actions {
                margin-top: 5px;
            }
            .kimi-message-actions button {
                margin-right: 5px;
                padding: 2px 8px;
                font-size: 0.8em;
            }
            .kimi-attachments {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                padding: 5px 0;
            }
            .kimi-file-chip {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 3px 8px;
                background: var(--background-secondary);
                border-radius: 12px;
                font-size: 0.85em;
            }
            .kimi-pin-btn {
                cursor: pointer;
                opacity: 0.6;
            }
            .kimi-pin-btn.pinned {
                opacity: 1;
            }
            .kimi-remove-btn {
                cursor: pointer;
                opacity: 0.6;
            }
            .kimi-remove-btn:hover {
                opacity: 1;
            }
            .kimi-input-area {
                border-top: 1px solid var(--background-modifier-border);
                padding-top: 10px;
            }
            .kimi-chat-input {
                width: 100%;
                resize: none;
                border: 1px solid var(--background-modifier-border);
                border-radius: 5px;
                padding: 10px;
                background: var(--background-primary);
                color: var(--text-normal);
            }
            .kimi-toolbar {
                display: flex;
                justify-content: space-between;
                margin-top: 5px;
            }
            .kimi-toolbar-btn {
                padding: 5px 10px;
                font-size: 0.9em;
            }
            .kimi-send-btn {
                padding: 5px 20px;
            }
        `;
        this.containerEl.appendChild(style);
    }
}