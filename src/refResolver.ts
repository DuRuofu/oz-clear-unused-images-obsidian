/* ---------------------------------------------------------------------------
 * refResolver.ts — 把原文 token 解析成 vault 文件
 *
 * 纯文本提取在 rawRefs.ts；这里负责需要 Obsidian App 的解析部分。
 * 解析策略由宽到窄，且每一级命中都会记录：
 *   1. token 本身当作 vault 绝对路径；
 *   2. token 相对源文件所在目录解析（处理 ./ 与 ../）；
 *   3. metadataCache.getFirstLinkpathDest —— Obsidian 自己的最短路径解析，
 *      兜住"只写文件名"和带空格的文件名（如 `Pasted image 1.png`）。
 *
 * 命中越宽越安全：多记一个路径只会让文件被保留。
 * ------------------------------------------------------------------------- */

import { App, TFile } from 'obsidian';
import { cleanToken, decodeToken, extractRawTokens, isExternalToken } from './rawRefs';

/** 带空格 token 最多尝试的写法数量，避免长行文本引发大量查表。 */
const MAX_SPACED_VARIANTS = 8;

/**
 * 带空格的 token 有歧义：`- assets/Pasted image 1.png` 可能是整个文件名，
 * 也可能是正文加一个文件名。先试整串，再逐个丢掉开头的词。
 */
const spacedVariants = (token: string): string[] => {
    if (token.indexOf(' ') === -1) return [token];
    const variants: string[] = [token];
    let rest = token;
    while (variants.length < MAX_SPACED_VARIANTS) {
        const cut = rest.indexOf(' ');
        if (cut === -1) break;
        rest = rest.slice(cut + 1);
        if (rest === '') break;
        variants.push(rest);
    }
    return variants;
};

/** 把相对路径按源文件目录解析成 vault 相对路径，拒绝爬出 vault 根目录。 */
const resolveRelative = (fromDir: string, relative: string): string => {
    if (relative.charAt(0) === '/') return relative.slice(1);
    const segments: string[] = [];
    const base = fromDir === '' ? [] : fromDir.split('/');
    const all = base.concat(relative.split('/'));
    for (const segment of all) {
        if (segment === '' || segment === '.') continue;
        if (segment === '..') {
            if (segments.length === 0) return '';
            segments.pop();
            continue;
        }
        segments.push(segment);
    }
    return segments.join('/');
};

/** 归一化路径：`a//b` → `a/b`，去掉开头的 `/`。 */
const normalizeVaultPath = (path: string): string => {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
};

/** 源文件所在目录，根目录文件返回空串。 */
const dirnameOf = (path: string): string => {
    const cut = path.lastIndexOf('/');
    return cut === -1 ? '' : path.slice(0, cut);
};

/**
 * 解析一条原文 token：能落到 vault 文件上就加入 `out`。
 *
 * @returns 是否至少命中一个 vault 文件
 */
const resolveSingleToken = (rawToken: string, sourcePath: string, app: App, out: Set<string>): boolean => {
    const cleaned = cleanToken(rawToken);
    if (cleaned === '' || isExternalToken(cleaned)) return false;

    // 文件真的以 `#` 或 `?` 命名时，未裁装饰的写法才是对的，两种都试。
    const decoded = decodeToken(rawToken);
    const spellings: string[] = [cleaned];
    if (decoded !== '' && decoded !== cleaned && !isExternalToken(decoded)) spellings.push(decoded);

    const sourceDir = dirnameOf(sourcePath);
    let resolved = false;

    for (const spelling of spellings) {
        for (const variant of spacedVariants(spelling)) {
            const candidates: string[] = [variant];
            const relative = resolveRelative(sourceDir, variant);
            if (relative !== '' && relative !== variant) candidates.push(relative);

            for (const candidate of candidates) {
                const path = normalizeVaultPath(candidate);
                if (path === '') continue;
                const entry = app.vault.getAbstractFileByPath(path);
                if (entry instanceof TFile) {
                    out.add(entry.path);
                    resolved = true;
                }
            }

            const dest = app.metadataCache.getFirstLinkpathDest(variant, sourcePath);
            if (dest) {
                out.add(dest.path);
                resolved = true;
            }

            // 整串命中就够自信，不再继续丢词；未命中则继续放宽。
            if (resolved) break;
        }
    }
    return resolved;
};

/**
 * 扫描一段原文，把其中所有能解析到 vault 文件的引用加入 `out`。
 *
 * @param text 文件原文（或 canvas 的 JSON 文本）
 * @param sourcePath 该文件在 vault 中的路径，用于相对路径与最短路径解析
 * @param out 被引用路径集合（会被就地修改）
 * @returns 命中的引用条数
 */
export const collectRawRefsInText = (text: string, sourcePath: string, app: App, out: Set<string>): number => {
    let hits = 0;
    const tokens = extractRawTokens(text);
    for (const token of tokens) {
        if (resolveSingleToken(token, sourcePath, app, out)) hits++;
    }
    return hits;
};

/**
 * 值得读原文的文本类扩展名。这里用白名单而不是"排除已知二进制"，是为了让
 * 扫描代价可控；漏掉一个陌生文本格式最多是少认一个引用，而白名单里这些
 * 已经覆盖了用户真正会写引用的地方。
 */
const TEXT_EXTENSIONS = new Set([
    'md', 'markdown', 'mdx', 'canvas', 'base', 'excalidraw',
    'html', 'htm', 'xhtml', 'svg', 'css', 'txt', 'text', 'log',
    'json', 'json5', 'jsonc', 'xml', 'yml', 'yaml', 'toml', 'ini', 'csv', 'tsv',
    'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'mermaid', 'tex', 'bib', 'org', 'rst',
]);

/** 该扩展名是否属于需要扫描原文的文本类文件？ */
export const isTextLikeExtension = (extension: string): boolean => {
    return TEXT_EXTENSIONS.has(String(extension).toLowerCase());
};
