import { ItemView, WorkspaceLeaf, TFile, Menu, Notice, MarkdownView, ButtonComponent } from 'obsidian';
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

    // UI Elements
    private messagesContainer: HTMLElement;
    private inputEl: HTMLTextAreaElement;
    private sendBtn: HTMLButtonElement;
    private attachmentsContainer: HTMLElement;

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
        console.log('KimiChatView: Opening view (v1.0.4)');
        this.containerEl.empty();
        this.buildInterface();
    }

    async onClose() {
        // Cleanup if needed
    }

    private buildInterface() {
        const container = this.containerEl.createDiv('kimi-chat-container');

        // Header
        const header = container.createDiv('kimi-chat-header');
        header.createEl('h3', { text: '🦊 Kimi' });

        const modeIndicator = header.createSpan('kimi-mode-indicator');
        modeIndicator.textContent = `Mode: ${this.plugin.settings.permissionMode}`;

        // Messages area
        this.messagesContainer = container.createDiv('kimi-messages-area');
        this.renderWelcomeMessage();

        // Attached files area
        this.attachmentsContainer = container.createDiv('kimi-attachments');
        this.renderAttachments();

        // Input area
        const inputArea = container.createDiv('kimi-input-area');

        this.inputEl = inputArea.createEl('textarea', {
            cls: 'kimi-chat-input',
            placeholder: 'Ask Kimi anything... (@ to mention files, / for commands)'
        });
        this.inputEl.rows = 3;

        this.inputEl.addEventListener('input', (e) => {
            this.inputValue = (e.target as HTMLTextAreaElement).value;
            this.handleInputChange(this.inputValue);
        });

        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Toolbar
        const toolbar = inputArea.createDiv('kimi-toolbar');

        const toolbarLeft = toolbar.createDiv('kimi-toolbar-left');

        const attachBtn = toolbarLeft.createEl('button', {
            cls: 'kimi-toolbar-btn',
            text: '@ Attach'
        });
        attachBtn.onclick = () => this.showFileMenu(attachBtn);

        const pinBtn = toolbarLeft.createEl('button', {
            cls: 'kimi-toolbar-btn',
            text: '📌 Pin Current'
        });
        pinBtn.onclick = () => this.pinCurrentNote();

        this.sendBtn = toolbar.createEl('button', {
            cls: 'kimi-send-btn',
            text: 'Send'
        });
        this.sendBtn.onclick = () => this.sendMessage();

        // Add styles
        this.addStyles();
    }

    private renderWelcomeMessage() {
        if (this.messages.length === 0) {
            this.messagesContainer.empty();
            const welcome = this.messagesContainer.createDiv('kimi-welcome');
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
        }
    }

    private renderAttachments() {
        this.attachmentsContainer.empty();

        if (this.attachedFiles.length > 0) {
            this.attachedFiles.forEach(file => {
                const chip = this.attachmentsContainer.createDiv('kimi-file-chip');
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
                    this.renderAttachments();
                };
            });
        }
    }

    private appendMessage(msg: Message) {
        // Remove welcome message if it exists
        if (this.messagesContainer.querySelector('.kimi-welcome')) {
            this.messagesContainer.empty();
        }

        const msgDiv = this.messagesContainer.createDiv(`kimi-message kimi-message-${msg.role}`);

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

        this.scrollToBottom();
    }

    private updateLastMessage(content: string) {
        const lastMsg = this.messagesContainer.lastElementChild;
        if (lastMsg) {
            const contentDiv = lastMsg.querySelector('.kimi-message-content');
            if (contentDiv) {
                contentDiv.innerHTML = this.formatMessage(content);
                this.scrollToBottom();
            }
        }
    }

    private scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private setGenerating(generating: boolean) {
        this.isGenerating = generating;
        this.sendBtn.disabled = generating;
        this.sendBtn.textContent = generating ? '...' : 'Send';

        if (!generating) {
            this.inputEl.focus();
        }
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

        const userMessageContent = this.inputValue.trim();

        // Clear input
        this.inputValue = '';
        this.inputEl.value = '';

        // Add user message to UI and state
        const userMsg: Message = {
            role: 'user',
            content: userMessageContent,
            timestamp: new Date()
        };
        this.messages.push(userMsg);
        this.appendMessage(userMsg);

        // Set state to generating
        this.setGenerating(true);

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

            // Create a placeholder for assistant message
            const assistantMsg: Message = {
                role: 'assistant',
                content: '...',
                timestamp: new Date()
            };
            this.messages.push(assistantMsg);
            this.appendMessage(assistantMsg);

            // Construct history for chat
            // Exclude the current user message and the placeholder assistant message we just added
            // Also exclude the initial "..." placeholder if it exists in history logic (but here we construct from this.messages)
            // KimiClient.chat expects history of previous turns.
            const history = this.messages.slice(0, this.messages.length - 2).map(m => ({
                role: m.role,
                content: m.content
            }));

            // Add attached files to the user message if present
            let finalMessage = userMessageContent;
            if (this.attachedFiles.length > 0) {
                const fileContents = await Promise.all(
                    this.attachedFiles.map(async f => {
                        const content = await this.app.vault.read(f);
                        return `## ${f.name}\n${content.substring(0, 3000)}`;
                    })
                );
                const contextString = fileContents.join('\n\n---\n\n');
                finalMessage = `Context:\n${contextString}\n\nUser Request:\n${userMessageContent}`;
            } else {
                // Check context manager for pinned notes if no explicit attachments
                const context = await this.plugin.contextManager.getContextString();
                if (context) {
                    finalMessage = `Context:\n${context}\n\nUser Request:\n${userMessageContent}`;
                }
            }

            // Call Chat Tool (Non-streaming for now)
            response = await this.plugin.kimiClient.chat(finalMessage, history);

            // Update last message in state
            this.messages[this.messages.length - 1].content = response;

            // Update UI
            this.updateLastMessage(response);

        } catch (error) {
            // If error, remove the placeholder or update it
            this.messages.pop(); // Remove placeholder from state
            const lastMsgEl = this.messagesContainer.lastElementChild;
            if (lastMsgEl) lastMsgEl.remove(); // Remove ... bubble from UI

            const errorMsg: Message = {
                role: 'assistant',
                content: `Error: ${error.message}`,
                timestamp: new Date()
            };
            this.messages.push(errorMsg);
            this.appendMessage(errorMsg);
        } finally {
            this.setGenerating(false);
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
                            this.renderAttachments();
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
            .kimi-toolbar-left {
                display: flex;
                gap: 5px;
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