import { Modal, App } from 'obsidian';
import { t } from './i18n';

export class LogsModal extends Modal {
    textToView: string;

    constructor(textToView: string, app: App) {
        super(app);
        this.textToView = textToView;
    }

    onOpen() {
        let { contentEl } = this;
        let myModal = this;

        // Header
        const headerWrapper = contentEl.createEl('div');
        headerWrapper.addClass('unused-images-center-wrapper');
        const headerEl = headerWrapper.createEl('h1', { text: t('Clear Unused Images - Logs', '清理未使用图片 - 日志') });
        headerEl.addClass('modal-title');

        // Information to show
        const logs = contentEl.createEl('div');
        logs.addClass('unused-images-logs');
        logs.innerHTML = this.textToView;

        // Close Button
        const buttonWrapper = contentEl.createEl('div');
        buttonWrapper.addClass('unused-images-center-wrapper');
        const closeButton = buttonWrapper.createEl('button', { text: t('Close', '关闭') });
        closeButton.addClass('unused-images-button');
        closeButton.addEventListener('click', () => {
            myModal.close();
        });
    }
}
