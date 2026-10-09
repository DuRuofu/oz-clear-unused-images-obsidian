import OzanClearImages from './main';
import { PluginSettingTab, Setting, App } from 'obsidian';
import { LanguageSetting, setLanguage, t } from './i18n';

export interface OzanClearImagesSettings {
    deleteOption: string;
    logsModal: boolean;
    excludedFolders: string;
    ribbonIcon: boolean;
    excludeSubfolders: boolean;
    language: LanguageSetting;
}

export const DEFAULT_SETTINGS: OzanClearImagesSettings = {
    deleteOption: '.trash',
    logsModal: true,
    excludedFolders: '',
    ribbonIcon: false,
    excludeSubfolders: false,
    language: 'auto',
};

export class OzanClearImagesSettingsTab extends PluginSettingTab {
    plugin: OzanClearImages;

    constructor(app: App, plugin: OzanClearImages) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: t('Clear Images Settings', '清理未使用图片 - 设置') });

        new Setting(containerEl)
            .setName(t('Interface Language', '界面语言'))
            .setDesc(
                t(
                    'Follow system uses the language of the Obsidian interface. Command names are refreshed immediately after switching.',
                    '「跟随系统」使用 Obsidian 界面语言。切换后会立即刷新命令名称与 Ribbon 提示。'
                )
            )
            .addDropdown((dropdown) => {
                dropdown.addOption('auto', t('Follow system', '跟随系统'));
                dropdown.addOption('zh', t('Chinese', '中文'));
                dropdown.addOption('en', t('English', 'English'));
                dropdown.setValue(this.plugin.settings.language);
                dropdown.onChange((option) => {
                    this.plugin.settings.language = option as LanguageSetting;
                    setLanguage(this.plugin.settings.language);
                    this.plugin.saveSettings();
                    this.plugin.refreshCommands();
                    this.plugin.refreshIconRibbon();
                    this.display();
                });
            });

        new Setting(containerEl)
            .setName(t('Ribbon Icon', 'Ribbon 图标'))
            .setDesc(t('Turn on if you want a Ribbon Icon for clearing the images.', '开启后在左侧 Ribbon 栏显示清理图片的图标。'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.ribbonIcon).onChange((value) => {
                    this.plugin.settings.ribbonIcon = value;
                    this.plugin.saveSettings();
                    this.plugin.refreshIconRibbon();
                })
            );

        new Setting(containerEl)
            .setName(t('Delete Logs', '删除日志'))
            .setDesc(
                t(
                    'Turn off if you dont want to view the delete logs Modal to pop up after deletion is completed. It wont appear if no image is deleted',
                    '关闭后不再弹出删除结果日志弹窗。若没有任何文件被删除，日志弹窗本就不会出现。'
                )
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.logsModal).onChange((value) => {
                    this.plugin.settings.logsModal = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t('Deleted Image Destination', '删除文件去向'))
            .setDesc(t('Select where you want images to be moved once they are deleted', '选择文件被清理后移动到哪里。'))
            .addDropdown((dropdown) => {
                dropdown.addOption('permanent', t('Delete Permanently', '永久删除（不可恢复）'));
                dropdown.addOption('.trash', t('Move to Obsidian Trash', '移至 Obsidian 回收站'));
                dropdown.addOption('system-trash', t('Move to System Trash', '移至系统回收站'));
                dropdown.setValue(this.plugin.settings.deleteOption);
                dropdown.onChange((option) => {
                    this.plugin.settings.deleteOption = option;
                    this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName(t('Excluded Folder Full Paths', '排除的文件夹完整路径'))
            .setDesc(
                t(
                    `Provide the FULL path of the folder names (Case Sensitive) divided by comma (,) to be excluded from clearing. 
					i.e. For images under Personal/Files/Zodiac -> Personal/Files/Zodiac should be used for exclusion`,
                    `填入要排除的文件夹「完整路径」，多个路径用英文逗号 (,) 分隔，区分大小写。
					例如要排除 Personal/Files/Zodiac 下的图片，就填 Personal/Files/Zodiac。
					注意：这里只决定"不删哪些"，不影响引用扫描——为避免误删，引用始终从整个仓库收集。`
                )
            )
            .addTextArea((text) =>
                text.setValue(this.plugin.settings.excludedFolders).onChange((value) => {
                    this.plugin.settings.excludedFolders = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName(t('Exclude Subfolders', '同时排除子文件夹'))
            .setDesc(
                t(
                    'Turn on this option if you want to also exclude all subfolders of the folder paths provided above.',
                    '开启后，上面填写的文件夹下的所有子文件夹也会一并排除。'
                )
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.excludeSubfolders).onChange((value) => {
                    this.plugin.settings.excludeSubfolders = value;
                    this.plugin.saveSettings();
                })
            );

        const coffeeDiv = containerEl.createDiv('coffee');
        coffeeDiv.addClass('oz-coffee-div');
        const coffeeLink = coffeeDiv.createEl('a', { href: 'https://ko-fi.com/L3L356V6Q' });
        const coffeeImg = coffeeLink.createEl('img', {
            attr: {
                src: 'https://cdn.ko-fi.com/cdn/kofi2.png?v=3',
            },
        });
        coffeeImg.height = 45;
    }
}
