import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import { KimiClient } from './src/api/kimi-client';
import { ContextManager } from './src/core/context-manager';
import { PermissionManager } from './src/core/permission-manager';
import { KimiChatView, VIEW_TYPE_KIMI_CHAT } from './src/ui/chat-view';

interface ObsidianKimiSettings {
    apiKey: string;
    permissionMode: 'AUTO' | 'SAFE' | 'PLAN';
    defaultModel: string;
    temperature: number;
    maxTokens: number;
    showTokenCount: boolean;
}

const DEFAULT_SETTINGS: ObsidianKimiSettings = {
    apiKey: '',
    permissionMode: 'SAFE',
    defaultModel: 'moonshot/kimi-k2.5',
    temperature: 0.7,
    maxTokens: 8192,
    showTokenCount: true,
};

export default class ObsidianKimiPlugin extends Plugin {
    settings: ObsidianKimiSettings;
    kimiClient: KimiClient;
    contextManager: ContextManager;
    permissionManager: PermissionManager;

    async onload() {
        await this.loadSettings();

        // Initialize core components
        this.kimiClient = new KimiClient(this.settings.apiKey, {
            model: this.settings.defaultModel,
            temperature: this.settings.temperature,
            maxTokens: this.settings.maxTokens,
        });
        
        this.contextManager = new ContextManager(this.app);
        this.permissionManager = new PermissionManager(this.settings.permissionMode);

        // Register view
        this.registerView(
            VIEW_TYPE_KIMI_CHAT,
            (leaf) => new KimiChatView(leaf, this)
        );

        // Ribbon icon
        this.addRibbonIcon('bot', 'Open Kimi Chat', () => {
            this.activateView();
        });

        // Commands
        this.addCommand({
            id: 'open-kimi-chat',
            name: 'Open Kimi Chat',
            callback: () => this.activateView(),
        });

        this.addCommand({
            id: 'kimi-summarize-note',
            name: 'Kimi: Summarize current note',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.summarizeNote(view.file);
            }
        });

        this.addCommand({
            id: 'kimi-inline-edit',
            name: 'Kimi: Edit selection',
            editorCallback: (editor: Editor) => {
                this.inlineEdit(editor);
            }
        });

        // Settings tab
        this.addSettingTab(new ObsidianKimiSettingTab(this.app, this));

        console.log('Obsidian Kimi plugin loaded');
    }

    onunload() {
        console.log('Obsidian Kimi plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update client with new settings
        this.kimiClient.updateConfig({
            model: this.settings.defaultModel,
            temperature: this.settings.temperature,
            maxTokens: this.settings.maxTokens,
        });
        this.permissionManager.setMode(this.settings.permissionMode);
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_KIMI_CHAT);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf?.setViewState({ type: VIEW_TYPE_KIMI_CHAT, active: true });
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async summarizeNote(file: TFile | null) {
        if (!file) {
            new Notice('No file is currently open');
            return;
        }

        const content = await this.app.vault.read(file);
        
        if (this.settings.permissionMode !== 'AUTO') {
            const confirmed = await this.permissionManager.requestPermission(
                'Summarize note',
                `Summarize "${file.name}"?`
            );
            if (!confirmed) return;
        }

        new Notice('Kimi is summarizing...');
        
        try {
            const summary = await this.kimiClient.summarize(content);
            
            // Insert summary at the top of the note
            const summaryBlock = `\n> [!summary] AI Summary\n> ${summary.replace(/\n/g, '\n> ')}\n\n`;
            const newContent = summaryBlock + content;
            
            await this.app.vault.modify(file, newContent);
            new Notice('Summary added!');
        } catch (error) {
            new Notice('Error: ' + error.message);
        }
    }

    async inlineEdit(editor: Editor) {
        const selection = editor.getSelection();
        
        if (!selection) {
            new Notice('Please select text to edit');
            return;
        }

        // Open modal for instruction
        const modal = new InlineEditModal(this.app, selection, async (instruction) => {
            if (!instruction) return;

            new Notice('Kimi is editing...');
            
            try {
                const edited = await this.kimiClient.edit(selection, instruction);
                
                // Replace selection
                editor.replaceSelection(edited);
                new Notice('Edit applied!');
            } catch (error) {
                new Notice('Error: ' + error.message);
            }
        });
        
        modal.open();
    }
}

class InlineEditModal extends Modal {
    selection: string;
    onSubmit: (instruction: string) => void;

    constructor(app: App, selection: string, onSubmit: (instruction: string) => void) {
        super(app);
        this.selection = selection;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('h2', { text: 'Inline Edit with Kimi' });
        
        contentEl.createEl('p', { 
            text: 'Selected text:',
            cls: 'kimi-modal-label'
        });
        
        const preview = contentEl.createEl('pre', {
            text: this.selection.length > 200 
                ? this.selection.substring(0, 200) + '...' 
                : this.selection,
            cls: 'kimi-selection-preview'
        });
        
        contentEl.createEl('p', { 
            text: 'How would you like to edit this?',
            cls: 'kimi-modal-label'
        });

        const input = contentEl.createEl('textarea', {
            cls: 'kimi-instruction-input'
        });
        input.placeholder = 'e.g., Make it more concise, Fix grammar, Translate to Korean...';
        input.rows = 3;

        const buttonContainer = contentEl.createDiv('kimi-modal-buttons');
        
        const submitBtn = buttonContainer.createEl('button', {
            text: 'Edit',
            cls: 'mod-cta'
        });
        
        const cancelBtn = buttonContainer.createEl('button', {
            text: 'Cancel'
        });

        submitBtn.addEventListener('click', () => {
            this.onSubmit(input.value);
            this.close();
        });

        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ObsidianKimiSettingTab extends PluginSettingTab {
    plugin: ObsidianKimiPlugin;

    constructor(app: App, plugin: ObsidianKimiPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Obsidian Kimi Settings' });

        // API Key
        new Setting(containerEl)
            .setName('Moonshot API Key')
            .setDesc('Your API key from https://platform.moonshot.ai/')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Permission Mode
        new Setting(containerEl)
            .setName('Permission Mode')
            .setDesc('How Kimi handles actions that modify files')
            .addDropdown(dropdown => dropdown
                .addOption('AUTO', 'Auto - Execute automatically')
                .addOption('SAFE', 'Safe - Ask for confirmation')
                .addOption('PLAN', 'Plan - Show plan only')
                .setValue(this.plugin.settings.permissionMode)
                .onChange(async (value) => {
                    this.plugin.settings.permissionMode = value as 'AUTO' | 'SAFE' | 'PLAN';
                    await this.plugin.saveSettings();
                }));

        // Model
        new Setting(containerEl)
            .setName('Model')
            .setDesc('Kimi model to use')
            .addDropdown(dropdown => dropdown
                .addOption('moonshot/kimi-k2.5', 'Kimi K2.5 (Recommended)')
                .setValue(this.plugin.settings.defaultModel)
                .onChange(async (value) => {
                    this.plugin.settings.defaultModel = value;
                    await this.plugin.saveSettings();
                }));

        // Temperature
        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Creativity level (0.0 = deterministic, 1.0 = creative)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        // Max Tokens
        new Setting(containerEl)
            .setName('Max Tokens')
            .setDesc('Maximum response length')
            .addSlider(slider => slider
                .setLimits(1024, 8192, 1024)
                .setValue(this.plugin.settings.maxTokens)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxTokens = value;
                    await this.plugin.saveSettings();
                }));
    }
}