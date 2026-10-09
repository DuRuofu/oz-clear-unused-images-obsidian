import { Plugin, TFile, Notice } from 'obsidian';
import { OzanClearImagesSettingsTab } from './settings';
import { OzanClearImagesSettings, DEFAULT_SETTINGS } from './settings';
import { LogsModal } from './modals';
import * as Util from './util';
import { setLanguage, t } from './i18n';

export default class OzanClearImages extends Plugin {
    settings: OzanClearImagesSettings;
    ribbonIconEl: HTMLElement | undefined = undefined;

    async onload() {
        this.addSettingTab(new OzanClearImagesSettingsTab(this.app, this));
        await this.loadSettings();
        setLanguage(this.settings.language);
        this.registerCommands();
        this.refreshIconRibbon();
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    registerCommands = () => {
        this.addCommand({
            id: 'clear-images-obsidian',
            name: t('Clear Unused Images', '清理未使用的图片'),
            callback: () => this.clearUnusedAttachments('image'),
        });
        this.addCommand({
            id: 'clear-unused-attachments',
            name: t('Clear Unused Attachments', '清理未使用的附件'),
            callback: () => this.clearUnusedAttachments('all'),
        });
    };

    // Command names are fixed at registration time, so switching the interface
    // language has to re-register them for the new wording to show up.
    refreshCommands = () => {
        const commands = (this.app as any).commands;
        if (!commands || typeof commands.removeCommand !== 'function') return;
        try {
            commands.removeCommand('clear-images-obsidian');
            commands.removeCommand('clear-unused-attachments');
        } catch (e) {
            console.error('Clear Unused Images: failed to remove commands', e);
        }
        this.registerCommands();
    };

    refreshIconRibbon = () => {
        this.ribbonIconEl?.remove();
        if (this.settings.ribbonIcon) {
            this.ribbonIconEl = this.addRibbonIcon('image-file', t('Clear Unused Images', '清理未使用的图片'), (event): void => {
                this.clearUnusedAttachments('image');
            });
        }
    };

    // Compare Used Images with all images and return unused ones
    clearUnusedAttachments = async (type: 'all' | 'image') => {
        var unusedAttachments: TFile[] = await Util.getUnusedAttachments(this.app, type);
        var len = unusedAttachments.length;
        if (len > 0) {
            let logs = '';
            logs += `[+] ${Util.getFormattedDate()}: ${t('Clearing started.', '开始清理。')}</br>`;
            Util.deleteFilesInTheList(unusedAttachments, this, this.app).then(({ deletedImages, textToView }) => {
                logs += textToView;
                logs +=
                    '[+] ' +
                    t(`${deletedImages} image(s) in total deleted.`, `本次共删除 ${deletedImages} 个文件。`) +
                    '</br>';
                logs += `[+] ${Util.getFormattedDate()}: ${t('Clearing completed.', '清理完成。')}`;
                if (this.settings.logsModal) {
                    let modal = new LogsModal(logs, this.app);
                    modal.open();
                }
            });
        } else {
            new Notice(
                type === 'image'
                    ? t('All images are used. Nothing was deleted.', '所有图片都在使用中，没有需要删除的文件。')
                    : t('All attachments are used. Nothing was deleted.', '所有附件都在使用中，没有需要删除的文件。')
            );
        }
    };
}
