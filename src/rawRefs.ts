/* ---------------------------------------------------------------------------
 * rawRefs.ts — 从文件原文里抠出"可能指向附件"的 token
 *
 * 这里全部是纯函数，不依赖 Obsidian，方便单独跑测试。
 * 设计原则参考了 obsidian-clear-unused-assets 的不对称性：
 *   漏认一个引用 = 删掉用户还要的文件；多认一个引用 = 只留下一个本想删的文件。
 * 所以宁可多认，抠出可疑 token 后由 refResolver 去伪存真。
 *
 * 性能注意：最后那条兜底正则必须**吃掉左侧定界符**，否则一句含 base64
 * data URI 的长行会让正则从每个字符位置重新起扫，直接把 UI 线程卡死。
 * ------------------------------------------------------------------------- */

/** 常见附件扩展名，兜底正则只认这些，避免把普通词组当成文件。 */
const FILE_EXTENSION_PATTERN =
    'png|jpe?g|jfif|gif|svg|bmp|webp|avif|ico|tiff?|heic|heif|' +
    'pdf|mp3|wav|m4a|ogg|flac|mp4|mov|webm|mkv|avi|' +
    'zip|rar|7z|tar|gz|' +
    'docx?|xlsx?|pptx?|csv|epub|excalidraw|canvas|base';

/** 只匹配"键名 + 值"形式的行，键名是用户写引用时常用的一批词。 */
const KEY_NAME_PATTERN =
    'file|filename|files|background|banner|cover|image|images|img|thumbnail|thumb|icon|logo|avatar|poster|src|source|path|href|url|link|attachment|attachments';

/** 一条提取规则：名字只用于调试，正则必须带 /g。 */
interface TokenPattern {
    name: string;
    regex: RegExp;
}

/**
 * 提取规则按"越明确越靠前"排列。每条规则只负责把候选串拽出来，
 * 清洗和解析交给 {@link cleanToken} 与 refResolver。
 */
const TOKEN_PATTERNS: TokenPattern[] = [
    // Obsidian wiki 链接与嵌入：[[a.png]]、![[a.png|300]]、[[笔记#标题]]
    { name: 'wiki', regex: /\[\[([^\[\]\n]+)\]\]/g },
    // markdown 尖括号写法：![](<assets/a b.png>)
    { name: 'md-angle', regex: /!?\[[^\]\n]*\]\(\s*<([^<>\n]+)>\s*\)/g },
    // markdown 普通写法：![](assets/a.png)、[x](a.png "title")
    { name: 'md', regex: /!?\[[^\]\n]*\]\(\s*([^)\s]+)/g },
    // markdown 引用式定义：[ref]: assets/a.png
    { name: 'md-ref', regex: /^[ \t]*\[[^\]\n]+\]:[ \t]*(\S+)/gm },
    // HTML 属性：<img src="a.png">、srcset、xlink:href
    {
        name: 'html-attr',
        regex: /(?:src|href|xlink:href|data|data-src|data-original|poster|srcset|content)\s*=\s*["']([^"'>\n]+)["']/gi,
    },
    // CSS url(...)：background: url("a.png")
    { name: 'css-url', regex: /url\(\s*["']?([^"')>\n]+?)["']?\s*\)/gi },
    // 带引号的键值对（JSON / YAML / 各类配置）："banner": "assets/a.png"
    { name: 'quoted-kv', regex: new RegExp(`["']?(?:${KEY_NAME_PATTERN})["']?\\s*[:=]\\s*["']([^"'\\n]+)["']`, 'gi') },
    // 不带引号的 YAML 写法：banner: assets/a.png
    { name: 'plain-kv', regex: new RegExp(`^[ \\t-]*(?:${KEY_NAME_PATTERN})\\s*[:=]\\s*([^"'\\s#\\[\\]{},][^\\n#]*)`, 'gim') },
    // 兜底：任何看起来像附件路径的 token。左侧定界符必须吃掉——见文件头注释。
    {
        name: 'bare',
        regex: new RegExp(`(?:^|[\\s"'([{=,:;>|])([\\w][\\w ./\\\\%-]*\\.(?:${FILE_EXTENSION_PATTERN}))`, 'gim'),
    },
];

/** wiki 链接里的别名与标题：`a.png|300`、`a.png#标题`。 */
const WIKI_DECORATION_RE = /\|[^|]*$/;

/** 已知的外部/非文件 scheme，命中就直接跳过。 */
const EXTERNAL_SCHEME_RE = /^(?:https?|ftps?|data|blob|mailto|tel|obsidian|app|file|chrome|about|javascript):/i;

/**
 * 把 token 里"看起来像装饰"的部分去掉，保留最可能正确的文件路径。
 * 注意这里只做规范化，不做磁盘查询。
 */
export const decodeToken = (rawToken: string): string => {
    let token = String(rawToken == null ? '' : rawToken).trim();

    // <...> 尖括号写法
    if (token.length > 1 && token.charAt(0) === '<' && token.charAt(token.length - 1) === '>') {
        token = token.slice(1, -1).trim();
    }
    // 百分号编码：a%20b.png
    if (token.indexOf('%') !== -1) {
        try {
            const decoded = decodeURIComponent(token);
            if (decoded !== '') token = decoded;
        } catch (e) {
            // 编码不合法就保留原文
        }
    }
    // 反斜杠统一成 /，并去掉转义用的反斜杠：assets\/a.png
    token = token.replace(/\\(?=[\w./\\ -])/g, '').replace(/\\/g, '/');
    // 去掉开头的 URL 片段与锚点
    token = token.replace(/#.*$/, '').trim();
    return token;
};

/**
 * 在 {@link decodeToken} 基础上裁掉别名、尺寸、查询参数和标题，
 * 结果用于"这条路就是文件路径"的直接查表。
 */
export const cleanToken = (rawToken: string): string => {
    let token = decodeToken(rawToken);

    // wiki 别名/尺寸：a.png|300
    token = token.replace(WIKI_DECORATION_RE, '');
    // markdown 标题：a.png "title"
    token = token.replace(/\s+["'][^"']*["']\s*$/, '');
    // 查询参数与锚点：a.png?v=2#x
    token = token.replace(/[?#].*$/, '');
    // 首尾的引号、括号、逗号、分号
    token = token.replace(/^[\s"'([{<]+/, '').replace(/[\s"')}\]>,;]+$/, '');
    return token.trim();
};

/** 明显不是 vault 内文件引用的 token（外部链接、锚点、纯数值等）。 */
export const isExternalToken = (token: string): boolean => {
    if (token === '') return true;
    if (token.charAt(0) === '#') return true; // [[#标题]] 之类的纯锚点
    if (token.indexOf('//') === 0) return true; // 协议相对地址
    if (EXTERNAL_SCHEME_RE.test(token)) return true;
    if (token.indexOf('{{') !== -1 || token.indexOf('<%') !== -1) return true; // 模板语法
    return false;
};

/**
 * 从一段原文里提取所有候选 token（去重后按出现顺序返回）。
 *
 * @param text 文件原文
 * @returns 候选 token 列表，可能包含误报，由解析层过滤
 */
export const extractRawTokens = (text: string): string[] => {
    if (!text) return [];
    const found = new Set<string>();

    // 明显的外部地址/锚点不必进入解析阶段，直接丢掉能省下大量查表。
    const push = (candidate: string): void => {
        if (candidate === '' || isExternalToken(candidate)) return;
        found.add(candidate);
    };

    for (const pattern of TOKEN_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(text)) !== null) {
            const candidate = match[1];
            if (candidate === undefined || candidate === '') {
                if (match.index === pattern.regex.lastIndex) pattern.regex.lastIndex++;
                continue;
            }
            // srcset 里是 "a.png 1x, b.png 2x"，逗号分隔且带倍率描述
            if (pattern.name === 'html-attr' && candidate.indexOf(',') !== -1) {
                for (const part of candidate.split(',')) {
                    const piece = part.trim().split(/\s+/)[0];
                    if (piece) push(piece);
                }
            } else {
                push(candidate);
            }
            if (match.index === pattern.regex.lastIndex) pattern.regex.lastIndex++;
        }
    }

    return Array.from(found);
};
