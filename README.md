# Clear Unused Images（社区 Fork：修复误删 + 中文界面）

扫描整个 Vault，找出**没有被任何笔记引用**的图片 / 附件并清理掉。删除方式可选：移到 Obsidian 回收站、移到系统回收站、永久删除。

> ⚠️ **注意**：本插件会真正执行删除，选择「Permanently Delete」时**不可恢复**。首次使用建议先把删除目标设为「Move to Obsidian Trash」，确认扫描结果符合预期后再考虑其它方式。

## 这个仓库是什么

本仓库是 [**ozntel/oz-clear-unused-images-obsidian**](https://github.com/ozntel/oz-clear-unused-images-obsidian) 的 **Fork**，插件的基础功能、整体设计、`manifest` 与插件 id（`oz-clear-unused-images`）全部来自上游，原始版权归原作者 **Ozan**（<https://www.ozan.pl>）所有，沿用上游的 MIT License。

上游插件久未更新，且存在一个会**误删用户文件**的缺陷（详见下一节），因此我们在自己的 Fork 里做了修复，并顺手加上了中文界面。本 Fork 由 [DuRuofu](https://github.com/DuRuofu) 维护，**没有提交到 Obsidian 社区插件市场**，需要手动安装。

本 Fork 相对上游的全部改动都可以在提交历史里看到：`git log da6aa74..master`。

## 我们改了什么

### 1. 修复：HTML / CSS 里引用的图片会被误删（核心）

**问题出在哪**：上游判断「一个附件有没有被引用」，只有 4 个来源——`metadataCache.resolvedLinks`、笔记 frontmatter、插件自带的链接解析（只认 `[[wiki 链接]]` 和 `[文字](链接)`）、Canvas 节点。**没有任何一路会去读笔记的原始文本**，所以下面这些引用它完全看不见：

- HTML 标签属性：`<img src="...">`、`srcset`、`xlink:href`、`data-src`、`poster` 等
- CSS 的 `url(...)`：行内 `style`、`<style>` 块、`.css` 文件
- 引用式链接定义：`[ref]: attachments/a.png`
- **用 HTML 控制图片尺寸的写法**，例如 `<img src="a.png" height="300">` —— 这正是我们踩到的坑
- 正文或 frontmatter 里直接写的裸路径

而判定逻辑是「不在被引用集合里 → 加入删除队列」，于是这些图片会被一并删掉。

**怎么修的**：新增两层独立扫描，把「被引用集合」改成**只做加法**——多认一个引用，最坏结果是留下一个本想删的文件；漏认一个引用，结果却是删掉用户还要的文件：

- **`src/rawRefs.ts`**（纯函数，不依赖 Obsidian）：从任意文本里抽取候选引用 token——wiki / markdown 链接、HTML 属性、CSS `url()`、带引号与不带引号的键值对，以及「看起来像文件名」的兜底匹配；过滤 `http(s)://`、`data:`、`blob:`、`mailto:` 等外部链接；兼容 `|300` 尺寸别名、`#标题/^块`、`"标题"`、百分号转义、文件名含空格等写法。
- **`src/refResolver.ts`**：把 token 解析回 Vault 里的真实文件——依次尝试 Vault 绝对路径、相对当前笔记目录的路径、`metadataCache.getFirstLinkpathDest()`；并负责决定「哪些文件需要扫描」，除 `.md` / `.canvas` 外还覆盖 HTML、CSS、SVG、JSON、TXT、Base、Excalidraw 等文本类文件。
- **`src/util.ts`**：md、canvas 以及其它文本类文件都会走一遍原文扫描；每篇笔记只 `cachedRead` 一次（上游会读两遍）；Canvas 的 `JSON.parse` 加了保护，遇到损坏的 `.canvas` 不再让整个扫描流程崩掉。

**效果对照**（同一份测试 Vault，11 张图片、4 篇笔记）：修复前有 **9** 个文件被判为「未使用」，其中 8 张其实正被 HTML / CSS / `srcset` / frontmatter 引用着；修复后只剩真正没有被任何人引用的 **1** 张。

### 2. 新增：中文界面

- 新增 `src/i18n.ts`；设置页第一项「界面语言」可选 **跟随系统 / 简体中文 / English**，默认跟随系统（读取 Obsidian 的界面语言）。
- 设置页全部文案、命令名、Ribbon 图标提示、通知（Notice）、删除日志弹窗与日志正文均已本地化；切换语言后会立即重新注册命令，无需重启 Obsidian。

### 3. 顺手清理

- 移除 `onload` / `onunload` 里的 `console.log`。
- `.gitignore` 忽略本地 npm 缓存目录。

## 安装

<!-- 本插件未上架社区市场，只能手动安装 -->

### 方式一：使用构建好的文件（推荐）

本仓库根目录的 `main.js` 就是构建产物（源码在 `src/`）。

1. 下载本仓库的 `main.js`、`manifest.json`、`styles.css` 三个文件。
2. 在 Vault 里创建目录：`<你的 Vault>/.obsidian/plugins/oz-clear-unused-images/`（目录名必须与插件 id 一致）。
3. 把三个文件放进该目录。
4. 重启 Obsidian（或按 `Cmd/Ctrl + R`），打开 **设置 → 第三方插件**，关闭「受限模式」并启用 **Clear Unused Images**。

目录结构应是：

```
<你的 Vault>/.obsidian/plugins/oz-clear-unused-images/
├── main.js
├── manifest.json
└── styles.css
```

### 方式二：从源码构建

```bash
git clone https://github.com/DuRuofu/oz-clear-unused-images-obsidian.git
cd oz-clear-unused-images-obsidian
npm install
npm run build     # 产物 main.js 生成在仓库根目录
```

然后把 `main.js`、`manifest.json`、`styles.css` 拷进上面的插件目录即可。开发时可用 `npm run dev`（监听源码改动自动重建，仍需在 Obsidian 里重载插件）。

> 小提示：如果 `npm install` 报缓存权限错误（`EPERM ... _cacache/tmp/...`，通常是全局缓存里有 root 属主文件），可以改用项目内缓存：`npm install --cache ./.npm-cache`。

## 使用

1. 打开 **设置 → Clear Unused Images Settings**，先确认「Deleted Image Destination」等选项。
2. 点击左侧 Ribbon 栏的图片图标（需在设置里开启「Ribbon Icon」），或在命令面板（`Cmd/Ctrl + P`）运行：
   - **Clear Unused Images** —— 只清理未被引用的图片；
   - **Clear Unused Attachments** —— 清理所有未被引用的附件（图片以外的 PDF、压缩包等也包含在内）。
3. 若开启了「Delete Logs」，清理结束后会弹出日志窗口，逐条列出被删除的文件；若没有需要删除的文件，会以通知形式提示。

> 下面几张截图来自上游的英文界面（本 Fork 已汉化，选项位置与含义一致）。

### 删除目标（Deleted Image Destination）

<img src="images/delete-destination.png" alt="Deleted Image Destination 设置" />

1. **Move to Obsidian Trash** —— 移到 Vault 内的 `.trash` 文件夹；
2. **Move to System Trash** —— 移到操作系统回收站；
3. **Permanently Delete** —— 永久删除，**无法恢复**。

### 排除文件夹

不需要被扫描的文件夹，请填写**完整的 Vault 路径**，多个文件夹用英文逗号分隔：

<img src="images/excluded-folders.png" alt="Excluded Folder Full Paths 设置" />

还可以把上面这些文件夹的**子文件夹一并排除**：

<img src="images/exclude-subfolders.png" alt="Exclude Subfolders 设置" />

### 删除日志

<img src="images/logs-modal.png" alt="删除日志弹窗" />

**扫描的图片格式**：jpg、jpeg、png、gif、svg、bmp、webp。

## 后续计划（尚未实现）

- [ ] 删除前的二次确认窗口：逐文件勾选，对有疑问的候选默认**保留**
- [ ] 扫描异常时「失败即中止」：读文件 / 解析失败就不用残缺的引用集合去删除
- [ ] 排除文件夹路径做正则转义与锚定（当前实现直接把路径拼进正则，`A/B` 有可能误命中 `XA/B`、`A/BC`）
- [ ] frontmatter 裸路径识别补上 webp / avif（当前 `imageRegex` 缺 webp）
- [ ] 打开 Vault 时自动清理 / 每 X 分钟自动清理（上游遗留的 Planned Features）

## 致谢

- 上游作者 **Ozan** —— [ozntel/oz-clear-unused-images-obsidian](https://github.com/ozntel/oz-clear-unused-images-obsidian)：本 Fork 的全部基础功能来自上游。
- 引用扫描的思路参考了社区重写版 [Quincy-Leo/obsidian-clear-unused-assets](https://github.com/Quincy-Leo/obsidian-clear-unused-assets)，特别是「漏认引用会删掉用户还要的文件，多认引用只是留下一个文件」这一取舍原则。

## License

MIT License（沿用上游 `package.json` 的声明），原始版权归作者 **Ozan** 所有；本 Fork 的修改同样以 MIT License 发布。
