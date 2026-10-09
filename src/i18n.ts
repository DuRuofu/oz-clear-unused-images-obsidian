/* ---------------------------------------------------------------------------
 * i18n.ts — 界面文案的中英切换
 *
 * Obsidian 把界面语言写在自己的 localStorage 里（键名 `language`，值形如
 * `zh` / `zh-TW` / `en`），所以"跟随系统"就是读它。设置页也可以强制指定。
 *
 * 文案一律用 {@link t}(english, chinese) 在**使用处**取值，不要在模块顶层
 * 求值，否则切换语言后不会更新。
 * ------------------------------------------------------------------------- */

/** 设置项里保存的语言选择。 */
export type LanguageSetting = 'auto' | 'zh' | 'en';

/** 当前生效的语言（由 {@link setLanguage} 在加载设置后写入）。 */
let activeLanguage: 'zh' | 'en' = 'en';

const isZhValue = (value: unknown): boolean => {
    return typeof value === 'string' && value.toLowerCase().indexOf('zh') === 0;
};

/** 读取 Obsidian 当前界面语言，识别不了时回退英文。 */
export const detectSystemLanguage = (): 'zh' | 'en' => {
    try {
        const stored = window.localStorage.getItem('language');
        if (stored) return isZhValue(stored) ? 'zh' : 'en';
    } catch (e) {
        // 非浏览器环境（例如测试），继续往下回退
    }
    try {
        const moment = (window as any).moment;
        if (moment && typeof moment.locale === 'function' && isZhValue(String(moment.locale()))) {
            return 'zh';
        }
    } catch (e) {
        // 忽略：没有 moment 就用默认值
    }
    return 'en';
};

/** 依据设置项切换语言。`auto` 表示跟随 Obsidian 界面语言。 */
export const setLanguage = (setting: LanguageSetting): void => {
    activeLanguage = setting === 'auto' ? detectSystemLanguage() : setting;
};

/** 当前生效的语言。 */
export const getLanguage = (): 'zh' | 'en' => activeLanguage;

/** 取当前语言的文案。 */
export const t = (en: string, zh: string): string => (activeLanguage === 'zh' ? zh : en);
