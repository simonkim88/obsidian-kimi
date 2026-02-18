import { App, Modal, Setting } from 'obsidian';

type PermissionMode = 'AUTO' | 'SAFE' | 'PLAN';

export class PermissionManager {
    private mode: PermissionMode;

    constructor(mode: PermissionMode = 'SAFE') {
        this.mode = mode;
    }

    setMode(mode: PermissionMode) {
        this.mode = mode;
    }

    getMode(): PermissionMode {
        return this.mode;
    }

    async requestPermission(action: string, details: string): Promise<boolean> {
        switch (this.mode) {
            case 'AUTO':
                return true;
            case 'PLAN':
                this.showPlan(action, details);
                return false;
            case 'SAFE':
            default:
                return await this.showPermissionModal(action, details);
        }
    }

    private async showPermissionModal(action: string, details: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new PermissionModal(action, details, (confirmed) => {
                resolve(confirmed);
            });
            modal.open();
        });
    }

    private showPlan(action: string, details: string) {
        // Show plan without executing
        const plan = `## Planned Action\n\n**Action:** ${action}\n\n**Details:** ${details}\n\n*Switch to SAFE or AUTO mode to execute.*`;
        console.log(plan);
    }
}

class PermissionModal extends Modal {
    action: string;
    details: string;
    onConfirm: (confirmed: boolean) => void;

    constructor(action: string, details: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.action = action;
        this.details = details;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('h2', { text: 'Permission Required' });
        
        contentEl.createEl('p', {
            text: `Kimi wants to: ${this.action}`,
            cls: 'kimi-permission-action'
        });
        
        contentEl.createEl('p', {
            text: this.details,
            cls: 'kimi-permission-details'
        });

        const buttonContainer = contentEl.createDiv('kimi-permission-buttons');
        
        const allowBtn = buttonContainer.createEl('button', {
            text: 'Allow',
            cls: 'mod-cta'
        });
        
        const denyBtn = buttonContainer.createEl('button', {
            text: 'Deny'
        });

        allowBtn.addEventListener('click', () => {
            this.onConfirm(true);
            this.close();
        });

        denyBtn.addEventListener('click', () => {
            this.onConfirm(false);
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}