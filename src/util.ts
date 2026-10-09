import { App, TFile } from 'obsidian';
import OzanClearImages from './main';
import { getAllLinkMatchesInFile, LinkMatch } from './linkDetector';
import { collectRawRefsInText, isTextLikeExtension } from './refResolver';
import { t } from './i18n';

/* ------------------ Image Handlers  ------------------ */

const imageRegex = /.*(jpe?g|png|gif|svg|bmp)/i;
const bannerRegex = /!\[\[(.*?)\]\]/i;
const imageExtensions: Set<string> = new Set(['jpeg', 'jpg', 'png', 'gif', 'svg', 'bmp', 'webp']);

// Create the List of Unused Images
export const getUnusedAttachments = async (app: App, type: 'image' | 'all') => {
    var allAttachmentsInVault: TFile[] = getAttachmentsInVault(app, type);
    var unusedAttachments: TFile[] = [];
    var usedAttachmentsSet: Set<string>;

    // Get Used Attachments in All Markdown Files
    usedAttachmentsSet = await getAttachmentPathSetForVault(app);

    // Compare All Attachments vs Used Attachments
    allAttachmentsInVault.forEach((attachment) => {
        if (!usedAttachmentsSet.has(attachment.path)) unusedAttachments.push(attachment);
    });

    return unusedAttachments;
};

// Getting all available images saved in vault
const getAttachmentsInVault = (app: App, type: 'image' | 'all'): TFile[] => {
    let allFiles: TFile[] = app.vault.getFiles();
    let attachments: TFile[] = [];
    for (let i = 0; i < allFiles.length; i++) {
        if (!['md', 'canvas'].includes(allFiles[i].extension)) {
            // Only images
            if (imageExtensions.has(allFiles[i].extension.toLowerCase())) {
                attachments.push(allFiles[i]);
            }
            // All Files
            else if (type === 'all') {
                attachments.push(allFiles[i]);
            }
        }
    }
    return attachments;
};

// New Method for Getting All Used Attachments
const getAttachmentPathSetForVault = async (app: App): Promise<Set<string>> => {
    var attachmentsSet: Set<string> = new Set();
    var resolvedLinks = app.metadataCache.resolvedLinks;
    if (resolvedLinks) {
        for (const [mdFile, links] of Object.entries(resolvedLinks)) {
            for (const [filePath, nr] of Object.entries(resolvedLinks[mdFile])) {
                if (!(filePath as String).endsWith('.md')) {
                    attachmentsSet.add(filePath);
                }
            }
        }
    }
    // Loop Files and Check Frontmatter/Canvas
    let allFiles = app.vault.getFiles();
    for (let i = 0; i < allFiles.length; i++) {
        let obsFile = allFiles[i];
        // Check Frontmatter for md files and additional links that might be missed in resolved links
        if (obsFile.extension === 'md') {
            // Read the file once and reuse the text for every later check
            let fileText = await readFileText(obsFile, app);
            // Frontmatter
            let fileCache = app.metadataCache.getFileCache(obsFile);
            if (fileCache.frontmatter) {
                let frontmatter = fileCache.frontmatter;
                for (let k of Object.keys(frontmatter)) {
                    if (typeof frontmatter[k] === 'string') {
                        if (frontmatter[k].match(bannerRegex)) {
                            let fileName = frontmatter[k].match(bannerRegex)[1];
                            let file = app.metadataCache.getFirstLinkpathDest(fileName, obsFile.path);
                            if (file) {
                                addToSet(attachmentsSet, file.path);
                            }
                        } else if (pathIsAnImage(frontmatter[k])) {
                            addToSet(attachmentsSet, frontmatter[k]);
                        }
                    }
                }
            }
            // Raw text references (HTML tags, CSS url(), srcset, YAML paths, ...)
            collectRawRefsInText(fileText, obsFile.path, app, attachmentsSet);
            // Any Additional Link
            let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app, fileText);
            for (let linkMatch of linkMatches) {
                addToSet(attachmentsSet, linkMatch.linkText);
            }
        }
        // Check Canvas for links
        else if (obsFile.extension === 'canvas') {
            let fileRead = await readFileText(obsFile, app);
            // Raw text references first: canvas cards may contain HTML/img tags
            collectRawRefsInText(fileRead, obsFile.path, app, attachmentsSet);
            let canvasData;
            try {
                canvasData = JSON.parse(fileRead);
            } catch (e) {
                console.error('Clear Unused Images: failed to parse canvas file ' + obsFile.path, e);
                continue;
            }
            if (canvasData.nodes && canvasData.nodes.length > 0) {
                for (const node of canvasData.nodes) {
                    // node.type: 'text' | 'file'
                    if (node.type === 'file') {
                        addToSet(attachmentsSet, node.file);
                    } else if (node.type == 'text') {
                        let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app, node.text);
                        for (let linkMatch of linkMatches) {
                            addToSet(attachmentsSet, linkMatch.linkText);
                        }
                    }
                }
            }
        }
        // Any other text-like file can also reference attachments (HTML, CSS, JSON, ...)
        else if (isTextLikeExtension(obsFile.extension)) {
            let fileText = await readFileText(obsFile, app);
            collectRawRefsInText(fileText, obsFile.path, app, attachmentsSet);
        }
    }
    return attachmentsSet;
};

/**
 * 读文件原文。读取失败时返回空串并记日志：扫描会少一路引用来源，
 * 但不会因为一个坏文件就中断整次扫描。
 */
const readFileText = async (file: TFile, app: App): Promise<string> => {
    try {
        return await app.vault.cachedRead(file);
    } catch (e) {
        console.error('Clear Unused Images: failed to read ' + file.path, e);
        return '';
    }
};

const pathIsAnImage = (path: string) => {
    return path.match(imageRegex);
};

/* ------------------ Deleting Handlers  ------------------ */

// Clear Images From the Provided List
export const deleteFilesInTheList = async (
    fileList: TFile[],
    plugin: OzanClearImages,
    app: App
): Promise<{ deletedImages: number; textToView: string }> => {
    var deleteOption = plugin.settings.deleteOption;
    var deletedImages = 0;
    let textToView = '';
    for (let file of fileList) {
        if (fileIsInExcludedFolder(file, plugin)) {
            console.log('File not referenced but excluded: ' + file.path);
        } else {
            if (deleteOption === '.trash') {
                await app.vault.trash(file, false);
                textToView += `[+] ` + t('Moved to Obsidian Trash: ', '已移至 Obsidian 回收站：') + file.path + '</br>';
            } else if (deleteOption === 'system-trash') {
                await app.vault.trash(file, true);
                textToView += `[+] ` + t('Moved to System Trash: ', '已移至系统回收站：') + file.path + '</br>';
            } else if (deleteOption === 'permanent') {
                await app.vault.delete(file);
                textToView += `[+] ` + t('Deleted Permanently: ', '已永久删除：') + file.path + '</br>';
            }
            deletedImages++;
        }
    }
    return { deletedImages, textToView };
};

// Check if File is Under Excluded Folders
const fileIsInExcludedFolder = (file: TFile, plugin: OzanClearImages): boolean => {
    var excludedFoldersSettings = plugin.settings.excludedFolders;
    var excludeSubfolders = plugin.settings.excludeSubfolders;
    if (excludedFoldersSettings === '') {
        return false;
    } else {
        // Get All Excluded Folder Paths
        var excludedFolderPaths = new Set(
            excludedFoldersSettings.split(',').map((folderPath) => {
                return folderPath.trim();
            })
        );

        if (excludeSubfolders) {
            // If subfolders included, check if any provided path partially match
            for (let exludedFolderPath of excludedFolderPaths) {
                var pathRegex = new RegExp(exludedFolderPath + '.*');
                if (file.parent.path.match(pathRegex)) {
                    return true;
                }
            }
        } else {
            // Full path of parent should match if subfolders are not included
            if (excludedFolderPaths.has(file.parent.path)) {
                return true;
            }
        }

        return false;
    }
};

/* ------------------ Helpers  ------------------ */

export const getFormattedDate = () => {
    let dt = new Date();
    return dt.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const addToSet = (setObj: Set<string>, value: string) => {
    if (!setObj.has(value)) {
        setObj.add(value);
    }
};
