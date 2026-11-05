// ============================================================
// ai-spec-generator.js — AI 契约文档生成器
// 职责边界：
//   ✅ 负责：从现有数据（特效库/背景预设/底衬/品牌/画布几何）
//            自动生成给 DeepSeek 的契约文档（Markdown + JSON）
//   ❌ 不负责：校验（在 ai-spec.js）、分块（在 ai-spec.js）、应用（在 ai-spec.js）
// 依赖：getAllEffectsMaster / getEffectCategory / getEffectParamsDef /
//       BG_PRESETS / BACKDROP_PRESETS / BrandManager
// 加载顺序：必须晚于 effects.js 和 backdrop-panel.js
// ============================================================

window.__AI_SPEC_GENERATOR_READY__ = true;

/**
 * 生成结构化契约对象（供 JSON 输出与内部消费）
 * @returns {object}
 */
function generateAiSpecDoc() {
    const effects = (typeof getAllEffectsMaster === 'function')
        ? getAllEffectsMaster()
            .filter(e => e && !e.hidden)   // ✅ 隐藏的特效不再进入 AI 契约（用户预期：隐藏=从候选中移除）
            .map(e => {
                let sem = null;
                try {
                    if (typeof inferSemantics === 'function') sem = inferSemantics(e);
                } catch (err) {
                    if (window.Utils && Utils.log) Utils.log.warn('[AiSpecGen] inferSemantics 失败', e && e.id, err);
                }
                return {
                    id: e.id,
                    name: e.name,
                    category: (typeof getEffectCategory === 'function') ? getEffectCategory(e) : 'text',
                    semantics: sem
                };
            })
        : [];

    const backgrounds = (window.BG_PRESETS || []).map(p => ({
        id: p.id,
        cat: p.cat,
        name: p.name,
        type: p.type,
        color1: p.color1 || null,
        color2: p.color2 || null,
        angle: p.angle != null ? p.angle : null,
        texture: p.texture || 'none'
    }));

    const backdrops = (typeof BACKDROP_PRESETS !== 'undefined' && Array.isArray(BACKDROP_PRESETS))
        ? BACKDROP_PRESETS.map(p => ({ type: p.type, name: p.name, cat: p.cat }))
        : [];

    let brand = { colors: [], fonts: [], bgPresets: [], strictMode: false, strictColors: false, strictFonts: false };
    try {
        if (window.BrandManager) {
            const activeColors = (BrandManager.getActiveColors && BrandManager.getActiveColors()) || [];
            const allColors = (BrandManager.getAllColors && BrandManager.getAllColors()) || [];
            brand = {
                colors: activeColors.length ? activeColors : allColors,
                fonts: ((BrandManager.data && BrandManager.data.fonts) || []).map(f => f.name),
                bgPresets: (BrandManager.getActiveBgPresets && BrandManager.getActiveBgPresets()) || [],
                strictMode: !!(BrandManager.isStrictColors && BrandManager.isStrictColors())
                    || !!(BrandManager.isStrictFonts && BrandManager.isStrictFonts()),
                strictColors: !!(BrandManager.isStrictColors && BrandManager.isStrictColors()),
                strictFonts: !!(BrandManager.isStrictFonts && BrandManager.isStrictFonts())
            };
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpecGen] 读取品牌数据失败', e);
    }

    let styleRef = null;
    try {
        if (typeof exportCanvasAsSpec === 'function') {
            const s = exportCanvasAsSpec();
            if (s && Array.isArray(s.pages) && s.pages.length > 0) {
                styleRef = s;
            }
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpecGen] 读取当前画布风格参考失败', e);
    }

    return {
        format: 'douyin-cover-spec',
        version: 1,
        canvas: { width: 360, height: 640, minFontSize: 12, maxFontSize: 120 },
        effects,
        backgrounds,
        backdrops,
        brand,
        styleReference: styleRef
    };
}
window.generateAiSpecDoc = generateAiSpecDoc;

/**
 * 生成给 DeepSeek 的 Markdown 契约文档（可复制到剪贴板）
 * @returns {string}
 */
function generateAiSpecMarkdown() {
    const doc = generateAiSpecDoc();
    const lines = [];

    lines.push('# 抖音封面设计器 · AI 输出契约 v1');
    lines.push('');
    lines.push('> 生成于 ' + new Date().toLocaleString() + '；契约版本 v1；本契约由项目内现有特效库/背景库/底衬/品牌自动生成，如与 README 不同请以此为准。');
    lines.push('');
    lines.push('你是一个抖音封面设计助手。请严格按本契约输出 JSON，不要输出任何解释文字。');
    lines.push('');
    try {
        const last = (typeof getLastStyle === 'function') ? getLastStyle() : null;
        if (last) {
            lines.push('## 0. 上次已用风格（保持一致）');
            lines.push('- ' + (last.name || last.id) + '（' + last.id + '）');
            lines.push('- 关键词：' + ((last.keywords || []).join(', ') || '-'));
            lines.push('- 背景推荐：' + (last.bgPresetId || '-'));
            lines.push('- 主特效：' + (last.titleEffect || '无'));
            lines.push('- 除非新内容明显不匹配，否则请优先沿用这套视觉语言。');
            lines.push('');
        }
    } catch (e) {}
    lines.push('## 1. 顶层结构');
    lines.push('```json');
    lines.push(JSON.stringify({
        format: 'douyin-cover-spec',
        version: 1,
        titleCandidates: ['封面标题候选1', '封面标题候选2', '封面标题候选3'],
        pages: [
            {
                title: '第 1 页',
                bg: { presetId: 'brand-warm-cream' },
                layers: [
                    {
                        type: 'text',
                        content: '很多老板不成功\n派园长出去学习',
                        fontSize: '46px',
                        fontFamily: 'Xiaolai-Regular',
                        color: '#263B32',
                        bold: true,
                        italic: false,
                        underline: false,
                        strike: false,
                        align: 'center',
                        vertical: false,
                        letterSpacing: 0,
                        lineHeight: 1.25,
                        opacity: 1,
                        effectClass: 'effect-black-stroke',
                        effectParams: { 'effect-black-stroke': { fill: '#263B32', stroke: '#292B27', width: 2 } },
                        x: 30, y: 130, width: 300, height: 180,
                        heightMode: 'auto',
                        rotation: -1, flipH: false, flipV: false,
                        locked: false, groupId: null,
                        backdrop: null
                    }
                ]
            }
        ]
    }, null, 2));
    lines.push('```');
    lines.push('');
    // ---- 1b. 多方案输出（一次给 3 份独立 JSON，供用户挑选）----
    lines.push('## 1b. 多方案输出（强烈推荐，必须遵守）');
    lines.push('');
    lines.push('你必须一次性输出 **3 份独立、完整、可单独解析** 的 `douyin-cover-spec` JSON，分别代表 3 套不同风格的方案：');
    lines.push('');
    lines.push('- **方案 A（主推）**：你认为最贴合原文的方案，默认把这份写全、写稳；');
    lines.push('- **方案 B（对比款）**：换一套背景/主色/特效组合，视觉气质与 A 明显不同，但同样符合品牌约束；');
    lines.push('- **方案 C（换视觉语言）**：换另一种版式节奏或特效档位（如 A 走炸裂档、C 走低调档），风格差要能被一眼看出。');
    lines.push('');
    lines.push('**输出格式硬要求（最容易出错）**：');
    lines.push('');
    lines.push('- 3 份 JSON **完全独立**，每份都以 `{` 开头、以 `}` 结尾，能单独 `JSON.parse` 成功；');
    lines.push('- 3 份之间**只用空行分隔**，禁止加 `方案A：`、`1.`、`---`、`###`、代码块前后缀等任何标记；');
    lines.push('- 不要写“以下是 3 份方案”之类的引导语；不要写结尾总结；');
    lines.push('- 每份都必须包含 `format`、`version`、`titleCandidates`（3 条）、`pages`（非空）；');
    lines.push('- 每份的 `titleCandidates` 可以不同（不同风格的标题会不一样），但都必须 ≤14 字、有冲击力；');
    lines.push('- 每份的页数、文字内容结构可以不同：A 可以是最稳的版本，B/C 可以做拆页/合并的差异；');
    lines.push('- 不要为了凑数而复制同一份 JSON 换个 `notes`，3 份必须真的视觉可区分；');
    lines.push('');
    lines.push('**示例骨架（只示意形状，内容请按原文生成）**：');
    lines.push('```');
    lines.push('{ "format": "douyin-cover-spec", "version": 1, "titleCandidates": ["A1","A2","A3"], "pages": [ ... ] }');
    lines.push('');
    lines.push('{ "format": "douyin-cover-spec", "version": 1, "titleCandidates": ["B1","B2","B3"], "pages": [ ... ] }');
    lines.push('');
    lines.push('{ "format": "douyin-cover-spec", "version": 1, "titleCandidates": ["C1","C2","C3"], "pages": [ ... ] }');
    lines.push('```');
    lines.push('');
    lines.push('> 本工具的「校验」按钮会自动检测 3 份候选、按质量分排序并弹窗让你挑一份应用，所以请放心输出完整 3 份。');
    lines.push('');
    lines.push('## 2. 画布几何约束');lines.push('- 画布尺寸：' + doc.canvas.width + ' × ' + doc.canvas.height);
    lines.push('- 字号范围：' + doc.canvas.minFontSize + 'px ~ ' + doc.canvas.maxFontSize + 'px');
    lines.push('- x 范围：0 ~ ' + doc.canvas.width + '，y 范围：0 ~ ' + doc.canvas.height);
    lines.push('- 页数上限：20 页');
    lines.push('');
    lines.push('## 3. 可用特效列表（effectClass 只能从这里选）');
    lines.push('');
    lines.push('每条格式：`id` (名称) — 类别/作用域/机制族 — 视觉风格 — 适合 — 不适合');
    lines.push('');
    doc.effects.forEach(e => {
        const s = e.semantics || {};
        const cat = s.category || (e.category === 'whole' ? 'container' : 'glyph-treatment');
        const mode = s.applyMode || (cat === 'glyph-treatment' ? 'inline+layer' : 'layer-only');
        const fam = s.family || 'misc';
        const vs = Array.isArray(s.visualStyle) && s.visualStyle.length ? s.visualStyle.join('、') : '—';
        const suit = Array.isArray(s.suitableRoles) && s.suitableRoles.length ? s.suitableRoles.join('、') : '—';
        const avoid = Array.isArray(s.avoidRoles) && s.avoidRoles.length ? s.avoidRoles.join('、') : '—';
        const inten = s.intensity || '';
        const intenTag = inten ? ' [' + inten + ']' : '';
        lines.push('- `' + e.id + '` (' + e.name + ') — ' + cat + '/' + mode + '/' + fam + intenTag + ' — 视觉：' + vs + ' — 适合：' + suit + ' — 不适合：' + avoid);
    });
    lines.push('');
    lines.push('## 3b. 特效选择方法（先想清楚再选，不要凭名字盲选）');
    lines.push('');
    lines.push('第 1 步：识别本页内容的视觉方向（强冲击 / 理性分析 / 情感 / 生活 / 知识干货 / 警示）');
    lines.push('第 2 步：识别每个文字图层的角色（封面主标题 / 正文标题 / 关键词 / 标签 / 对话 / 引用 / 局部标注）');
    lines.push('第 3 步：在 3 节的候选里，按「适合」字段匹配角色；用「不适合」字段排掉不合适的');
    lines.push('第 4 步：按「视觉」字段确保同一套方案里出现不同视觉机制（发光、描边、渐变、立体、气泡、纸张、标注等）');
    lines.push('');
    lines.push('硬规则：');
    lines.push('- 封面主标题：禁止 effect-black-stroke / effect-gold；选 family 为 neon-glow / 3d-extrude / gradient-fill 且 intensity 为 high 的特效');
    lines.push('- 正文标题：可用 text-stroke / drop-shadow / gradient-fill 类，保证可读性');
    lines.push('- 标签 / 关键词：可用 annotation / glyph-treatment 的轻量特效（例如 highlight / text-decoration）');
    lines.push('- 对话 / 引用：用 container 类的气泡或纸张');
    lines.push('- 局部标注：用 annotation 类，只作用于关键词而不是整段');
    lines.push('- applyMode 为 inline-only 的特效不能整层应用；applyMode 为 layer-only 的特效不能只作用于部分文字');
    lines.push('');
    lines.push('## 4. 可用背景预设（presetId 只能从这里选，或自定义 {type,color1,color2,angle,texture}）');
    doc.backgrounds.forEach(b => {
        lines.push(`- \`${b.id}\` (${b.name}) [${b.cat}] ${b.type}`);
    });
    lines.push('');
    lines.push('## 5. 可用底衬类型（layer.backdrop.type 只能从这里选，或 null / \"none\" / \"custom\"）');
    doc.backdrops.forEach(b => {
        lines.push(`- \`${b.type}\` (${b.name}) [${b.cat}]`);
    });
    lines.push('');
    if (doc.brand.strictMode) {
        lines.push('## 5b. 画布安全区（重要）');
    lines.push('- 抖音封面安全区：左右各留 20px，顶部留 30px，底部留 40px');
    lines.push('- 即推荐坐标：x ∈ [20, 340 - width]，y ∈ [30, 596 - height]（硬底线 y+高度 ≤ 596）');
    lines.push('- 越界的内容在手机上可能被裁切或遮挡');
    lines.push('');
    lines.push('## 6. 品牌严格模式（生效中，必须遵守）');
        lines.push('- 所有 color 必须从以下品牌色中选：' + (doc.brand.colors.join(', ') || '（无）'));
        lines.push('- 所有 fontFamily 必须从以下品牌字体中选：' + (doc.brand.fonts.join(', ') || '（无）'));
        lines.push('');
    } else {
        lines.push('## 6. 品牌约束（未开启严格模式，颜色/字体自由选择）');
        lines.push('');
    }
    lines.push('## 6b. 输出格式硬要求（最容易出错的地方）');
    lines.push('- 必须从 `{` 开始，到 `}` 结束。不要“好的以下是...”，不要在前后加解释');
    lines.push('- 所有字段名和字符串值必须用英文双引号 `"`，禁止中文引号 `“”‘’`');
    lines.push('- 禁止尾逗号，最后一项后面不能有 `,`');
    lines.push('- 禁止注释 `//` 和 `/* */`');
    lines.push('- 如果你不确定某字段，宁可不写，也不要写错类型（数字就写数字，别写成字符串）');
    lines.push('');
    lines.push('## 6c. 推荐版式（可直接使用，AI 不必每次自己算坐标）');
    lines.push('| layout | 适用字数 | 字号 | align | x/y/width/height 建议 | 建议特效 |');
    lines.push('|---|---|---|---|---|---|');
    lines.push('| hero | ≤12 字 | 52px | center | 30/140/300/180 | effect-black-stroke |');
    lines.push('| title-sub | 13~30 字 | 40px | center | 30/120/300/160 | effect-black-stroke |');
    lines.push('| title-body | 31~80 字 | 28px | left | 28/100/304/220 | 无特效 或 effect-black-stroke |');
    lines.push('| long-text | >80 字 | 24px | left | 20/100/320/400 | 无特效（分页处理） |');
    lines.push('');
    lines.push('## 6d. 可选：多份候选（推荐）');
    lines.push('如果你一次能想到 2-3 套不同风格，可以把它们连在一起输出（中间不要加任何说明）：');
    lines.push('```');
    lines.push('{ ...方案 A... }');
    lines.push('{ ...方案 B... }');
    lines.push('```');
    lines.push('本工具的「挑选」按钮会自动检测并按质量分排序，让你一键选最优。');
    lines.push('');
    lines.push('## 6e. 每页可选批注 notes（强烈建议）');
    lines.push('给每页加一个 `notes` 字符串，一句话解释这页的视觉意图，如：');
    lines.push('- "封面用大字+强特效抓眼球"');
    lines.push('- "正文用浅色底衬提升可读性"');
    lines.push('应用后会保留在页的 _notes 字段，导入面板里会显示这些批注。');
    lines.push('');
    lines.push('## 6f. 最小可用输出（AI 不确定时请直接抄这个骨架）');
    lines.push('```json');
    lines.push(JSON.stringify({
        format: 'douyin-cover-spec',
        version: 1,
        titleCandidates: ['老板花钱培养园长', '为什么全白花了', '管理学真相'],
        pages: [
            {
                title: '第 1 页',
                bg: { presetId: 'brand-warm-cream' },
                layers: [
                    {
                        type: 'text',
                        content: '在这里写一句标题',
                        fontSize: '44px',
                        fontFamily: 'Xiaolai-Regular',
                        color: '#263B32',
                        bold: true,
                        align: 'center',
                        lineHeight: 1.25,
                        opacity: 1,
                        effectClass: 'effect-black-stroke',
                        effectParams: { 'effect-black-stroke': { fill: '#263B32', stroke: '#292B27', width: 2 } },
                        x: 30, y: 140, width: 300, height: 160,
                        heightMode: 'auto',
                        rotation: -1, flipH: false, flipV: false,
                        locked: false, groupId: null, backdrop: null
                    }
                ]
            }
        ]
    }, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('## 6g. 特效使用档位（按内容类型自动判断，别一刀切）');
    lines.push('');
    lines.push('先判断内容类型，再选对应档位。不要把爆款做成知识风，也不要把知识做成爆款。');
    lines.push('');
    lines.push('### 档位 A · 低调档（知识 / 干货 / 教育 / 教程 / 育儿）');
    lines.push('- 特效覆盖率：30% ~ 50%');
    lines.push('- 最多 2 种特效同时出现');
    lines.push('- 优先 effect-black-stroke（黑描边）或 effect-gold（金色强调）');
    lines.push('- 正文页优先不用特效（effectClass: null），保可读');
    lines.push('');
    lines.push('### 档位 B · 标准档（生活 / 情感 / 美食 / 旅行 / 穿搭 / 读书）');
    lines.push('- 特效覆盖率：40% ~ 70%');
    lines.push('- 每页最多 2 种特效，从第 3 节列表里自由选择');
    lines.push('- 主标题和副标题要形成视觉对比（颜色 / 字号 / 特效至少 1 项不同）');
    lines.push('- 副标题可配底衬 backdrop: { type: "sticky" } 或 washi');
    lines.push('');
    lines.push('### 档位 C · 炸裂档（爆款 / 逆袭 / 娱乐 / 副业 / 警示 / 搞笑）');
    lines.push('- 特效覆盖率：60% ~ 90%');
    lines.push('- 4 ~ 6 种特效同时出现');
    lines.push('- 特效完全自由：effect-viral / effect-neon / effect-3d / effect-fire / effect-cyber / effect-glitch 等任意组合均可');
    lines.push('- 主标题必须带特效，副标题也要带（可以是不同特效）');
    lines.push('- 关键词加行内高亮（见 6h）');
    lines.push('');
    lines.push('### 通用规则（所有档位都遵守）');
    lines.push('- 封面主标题必须带特效，不允许纯变色');
    lines.push('- 副标题可带描边或加底衬');
    lines.push('- 正文优先不用特效（effectClass: null），保证可读性');
    lines.push('- 特效 / 底衬 / 贴纸完全自由，不受品牌约束；品牌约束只作用于颜色（和可选字体）');
    lines.push('');
    lines.push('## 6g-2. 强制丰富度规则（硬性，违反视为失败，不是建议）');
    lines.push('');
    lines.push('⚠️ 你必须让每一页在视觉上足够丰富。以下全部是**硬性强制**，不是建议、不是推荐、不是可选。任何一条不满足，视为整份方案失败。');
    lines.push('');
    lines.push('### 强制 A：特效多样化（effectClass）');
    lines.push('- 同一份方案（多页）里，必须使用 **至少 4 种不同的 effectClass**');
    lines.push('- 禁止 100% 页面都用同一个特效；同一特效在所有文字图层中的占比不得超过 60%');
    lines.push('- 封面主标题必须用高冲击特效（effect-viral / effect-neon / effect-fire / effect-cyber / effect-3d / effect-glitch 之一），**禁止用 effect-black-stroke 或 effect-gold 当封面主特效**');
    lines.push('- 正文标题可用 effect-black-stroke 或 effect-gold 保可读，但**不得所有页正文标题都是同一款**');
    lines.push('- 标签 / 数字 / 强调词必须用 effect-gold / effect-neon / effect-cyber / effect-lightning / effect-hk 之一做点缀，不得全部无特效');
    lines.push('- 每页至少有 1 个文字图层带特效，不得整页无特效');
    lines.push('');
    lines.push('### 强制 B：底衬多样化（backdrop）');
    lines.push('- 同一份方案里，必须使用 **至少 3 种不同的 backdrop.type**');
    lines.push('- 从以下类型里选：paper / grid / sticky / notebook / tape / torn / kraft / fiber / watercolor / xuan / parchment / newspaper / chalkboard / cork / canvas-texture / linen / glass / polaroid / ticket / washi');
    lines.push('- 禁止所有底衬都是 paper；禁止所有文字图层都无底衬');
    lines.push('- 每页至少有 1 个文字图层带底衬，不得整页无底衬');
    lines.push('- 底衬的颜色必须从当前品牌色板里选（严格色彩模式下）或与主色协调');
    lines.push('');
    lines.push('### 强制 C：字号与字重层次（fontSize / bold）');
    lines.push('- 每页必须至少有 **3 个不同字号**（例如 44px / 24px / 18px），不得所有文字同一字号');
    lines.push('- 每页必须至少有 **1 个 bold: true 和 1 个 bold: false** 的文字图层，不得全粗或全细');
    lines.push('- 关键词 / 数字 / 对比词必须用 `<span style="font-size:1.4em">` 放大 1.3~1.6 倍');
    lines.push('');
    lines.push('### 强制 D：行内装饰（inline span）');
    lines.push('- 每页必须至少有 **1 处行内装饰**，从以下选：');
    lines.push('  - 荧光高亮：`<span style="background:linear-gradient(100deg,rgba(...,0.15) 0%,rgba(...,0.5) 12%,rgba(...,0.5) 88%,rgba(...,0.15) 100%);padding:0 3px;border-radius:2px;box-decoration-break:clone">关键词</span>`');
    lines.push('  - 下划线：`<span style="border-bottom:3px solid #品牌色;padding-bottom:1px">关键词</span>`');
    lines.push('  - 圈重点：`<span style="border:3px solid #品牌色;border-radius:999px;padding:0 6px;display:inline-block">关键词</span>`');
    lines.push('  - 波浪线：`<span style="text-decoration:underline wavy #品牌色;text-decoration-thickness:3px">关键词</span>`');
    lines.push('- 不得整页没有任何行内装饰');
    lines.push('');
    lines.push('### 强制 E：块级背景标签（bgColor）');
    lines.push('- 每页必须至少有 **1 个文字图层带 bgColor + bgRadius + bgPadding**，形成色块标签');
    lines.push('- bgColor 必须从当前品牌色板里选，不得用透明');
    lines.push('- 不得整页没有任何色块标签');
    lines.push('');
    lines.push('### 强制 F：贴纸 / 图形元素');
    lines.push('- 每份方案至少 **2 页** 要有贴纸或图形元素（emoji 贴纸、SVG 贴纸、形状）');
    lines.push('- 贴纸必须用系统提供的贴纸库（type: "sticker"），不得凭空想象不存在的贴纸');
    lines.push('- 贴纸不能遮挡正文，必须放在安全区内，且不覆盖主标题');
    lines.push('');
    lines.push('### 强制 G：自定义上传素材');
    lines.push('- 如果用户上传过自定义底衬 / 贴纸 / 背景图，**优先使用它们**，不得只用系统预设');
    lines.push('- 自定义底衬用 `{ "type": "custom", "customId": <id> }` 引用');
    lines.push('- 自定义贴纸用 `{ "type": "sticker", "assetId": "<id>" }` 引用');
    lines.push('- 自定义背景用 `{ "presetId": null, "customImageId": "<id>" }` 引用');
    lines.push('');
    lines.push('### 强制 H：整体丰富度自检（输出前必须执行）');
    lines.push('输出 JSON 前，在心里逐条数一遍：');
    lines.push('');
    lines.push('- □ effectClass 用了 ≥4 种？');
    lines.push('- □ backdrop.type 用了 ≥3 种？');
    lines.push('- □ 每页有 ≥3 个不同字号？');
    lines.push('- □ 每页有 ≥1 处行内装饰？');
    lines.push('- □ 每页有 ≥1 个色块标签？');
    lines.push('- □ ≥2 页有贴纸/图形？');
    lines.push('');
    lines.push('**8 条缺任何 1 条，整份方案作废，必须重做。不得输出「凑合能用」的方案。**');
    lines.push('');
    lines.push('## 6h. 4 层视觉手段（不要只做"变色"，4 层都要用）');
    lines.push('');
    lines.push('每个文字图层都应该主动使用下面 4 层里的 2~3 层。只做"变色"是最低级的做法，会被判不合格。');
    lines.push('');
    lines.push('### L1 块级背景（"标签感"）');
    lines.push('- 用在：封面副标题、正文页小标题、标签文字');
    lines.push('- 字段：bgColor + bgRadius + bgPadding');
    lines.push('- 示例：{ "bgColor": "#C27C5A", "bgRadius": 8, "bgPadding": 10 }（品牌色 #C27C5A，陶土棕）');
    lines.push('- 语义：把这行文字变成一个"色块标签"，视觉上和周围文字拉开层级');
    lines.push('');
    lines.push('### L2 行内高亮（"关键词感"）');
    lines.push('- 用在：标题里的数字、核心名词、需要强调的词');
    lines.push('- 字段：content 里用 <span> 包裹');
    lines.push('- 示例："content": "3 个月<span style=\"background:linear-gradient(100deg,rgba(194,124,90,0.15) 0%,rgba(194,124,90,0.5) 12%,rgba(194,124,90,0.5) 88%,rgba(194,124,90,0.15) 100%);padding:0 3px;border-radius:2px;box-decoration-break:clone;-webkit-box-decoration-break:clone\">月入 5 万</span>"（品牌色 #C27C5A）');
    lines.push('- 语义：像用马克笔涂过一样，只强调几个词');
    lines.push('- 注意：多行时必须用 background-image: linear-gradient(...) 而不是 background-color，并用 box-decoration-break: clone');
    lines.push('');
    lines.push('### L3 行内装饰（"标注感"）');
    lines.push('- 用在：反常识观点、强调数字、需要"圈重点"的词');
    lines.push('- 字段：content 里用 <span> 包裹');
    lines.push('- 示例（下划线）："content": "普通人<span style=\"border-bottom:3px solid #C27C5A;padding-bottom:1px\">也能逆袭</span>"（品牌色 #C27C5A）');
    lines.push('- 示例（圈起来）："content": "<span style=\"border:3px solid #C27C5A;border-radius:999px;padding:0 6px;display:inline-block\">3 个月</span> 做到月入 5 万"（品牌色 #C27C5A）');
    lines.push('- 示例（波浪线）："content": "<span style=\"text-decoration:underline wavy #C27C5A;text-decoration-thickness:3px;text-underline-offset:2px\">核心秘密</span>"（品牌色 #C27C5A）');
    lines.push('- 语义：像老师批改作业一样，圈出重点');
    lines.push('');
    lines.push('### L4 字号差（"层次感"）');
    lines.push('- 用在：数字 > 单位、主词 > 修饰词');
    lines.push('- 字段：content 里用 <span style="font-size:..."> 包裹');
    lines.push('- 示例："content": "<span style=\"font-size:1.5em\">3</span> 个方法"');
    lines.push('- 示例："content": "月入 <span style=\"font-size:1.6em;color:#C27C5A\">50000</span> 元"（品牌色 #C27C5A）');
    lines.push('- 语义：数字放大 1.3~1.6 倍，立即产生"冲击感"');
    lines.push('');
    lines.push('## 6i. 视觉丰富度自检 checklist（每页生成后必须过一遍）');
    lines.push('');
    lines.push('每一页输出前，逐条勾选，不勾满不允许输出该页：');
    lines.push('');
    lines.push('- □ 主标题带特效？（不能纯变色）');
    lines.push('- □ 副标题有视觉区分？（颜色 / 字号 / 底衬 / 特效，至少 1 项）');
    lines.push('- □ 至少有 1 个关键词行内高亮（L2）？');
    lines.push('- □ 至少有 1 个字号差（L4，数字或主词放大）？');
    lines.push('- □ 至少有 1 个装饰元素（emoji 贴纸 / 底衬 / 几何块）？');
    lines.push('- □ 文字在安全区内（左右各留 20px、上留 30px、下留 40px）？');
    lines.push('- □ 如果有数字，数字是否放大 1.3 倍以上？');
    lines.push('- □ 如果是对比句（A 不如 B），是否用颜色/字重区分 A 和 B？');
    lines.push('');
    lines.push('8 条勾满，封面就"丰富"了。缺任何一条，就是"干巴巴"。');
    lines.push('');
    lines.push('## 6j. 抖音安全区（硬性，违反必拦）');
    lines.push('');
    lines.push('抖音播放页底部有 UI 栏。工具端硬底线是 y + 实际渲染高度 ≤ **596**（不是 600；600 再减 4px 视觉余量）。');
    lines.push('');
    lines.push('- 左安全：x >= 20');
    lines.push('- 右安全：x + width <= 340');
    lines.push('- 上安全：y >= 30');
    lines.push('- 下安全：y + 实际高度 <= **596**（硬约束，超了整份方案会被拒绝）');
    lines.push('- 单页所有文字图层高度之和 <= **566**（640 - 30 - 44）');
    lines.push('');
    lines.push('任何文字图层底部超过 596，或单页总高超过 566，工具会直接拒绝，不会进入预览/应用。这是 error，不是 warning。');
    lines.push('输出前必须执行后面的 **6k-1 高度预算** 与 **6k-2 自检伪代码**，跑不通不许输出 JSON。');
    lines.push('');
    lines.push('## 6k. 文字微倾斜（"手工感"）');
    lines.push('');
    lines.push('爆款封面 60% 有轻微倾斜，模拟"手工贴上去"的感觉。建议：');
    lines.push('');
    lines.push('- 主标题：rotation: -1.5 到 rotation: 1.5（随机）');
    lines.push('- 副标题 / 标签：rotation: -2 到 rotation: 2（比主标题更随机）');
    lines.push('- 正文：不倾斜（rotation: 0），保证可读');
    lines.push('');
    lines.push('- 强对比/警示 类：effect-black-stroke（黑描边）或 effect-gold（金色强调）');lines.push('');
    lines.push('## 6h. 跨页风格一致性（重要）');
    lines.push('- 同一组图必须保持统一的品牌气质、字体体系、颜色职责和装饰语言；不要求每一页机械使用完全相同的背景。');
    lines.push('- 默认同一组图共用同一套主色，至少 60% 的文字图层使用同一主文字色；强调色只用于关键词、细线、编号或小面积标记。');
    lines.push('- 背景只允许在暖米白、柔和暖白、柔和米灰、浅鼠尾草绿等浅色背景之间按内容节奏切换；森林绿只用于文字、线条、边框或小面积标记，严禁作为背景。切换必须遵循第 6l 节的多页配色规则，不能随机换色。');
    lines.push('- 整个方案最多 2 种字体；品牌严格模式下优先使用 Xiaolai-Regular。');
    lines.push('- 整个方案最多 3 种特效，且主特效占比 ≥50%；教育金句和长正文优先不用强特效。');
    lines.push('- 背景可以使用同一 presetId、同一背景家族，或按第 6l 节规定使用品牌自定义背景；背景变化不得损害文字对比度和阅读性。');
    lines.push('');
    lines.push('## 6l. 幼教图文原创视觉系统（本次新增，优先执行）');
    lines.push('');
    lines.push('### 6l-1. 品牌定位');
    lines.push('- 视觉方向：原创混合风，融合国际杂志的编辑感、自然生活美学和克制的原创艺术设计。');
    lines.push('- 品牌气质：温暖、专业、有观点、有生活气息；优先服务文字传播、手机阅读和内容理解，不为装饰牺牲可读性。');
    lines.push('- 适用内容：幼儿成长、幼儿独立与自我效能、教育金句、幼儿园一日生活、教育观点解读、家园共育。');
    lines.push('- 视觉必须原创；可以沿用统一的色彩逻辑，但不得要求逐字或逐图复刻参考图。');
    lines.push('');
    lines.push('### 6l-2. 品牌颜色与职责');
    lines.push('- 主色：');
    lines.push('  - 暖米白 `#F5F1E8`：主要浅色背景，适合教育金句、长正文、温和解释。');
    lines.push('  - 森林绿 `#263B32`：仅用于标题文字、短句、线条、边框或小面积标记；禁止用作背景、整块色板或文字特效的底色，避免干扰特效呈现。');
    lines.push('  - 鼠尾草绿 `#7D9274`：自然辅助色，适合小面积色块、分隔线、标签和次级强调。');
    lines.push('  - 陶土棕 `#C27C5A`：温暖强调色，适合关键词、编号、小标记；不得大面积抢正文。');
    lines.push('  - 墨黑 `#292B27`：浅色背景上的首选正文色。');
    lines.push('- 辅助色：');
    lines.push('  - 柔和米灰 `#E6E0D5`：浅色页面的辅助区块、边界和柔和分层。');
    lines.push('  - 浅鼠尾草绿 `#DDE4D7`：自然生活类页面的浅色背景或辅助卡片。');
    lines.push('  - 柔和暖白 `#FCFAF5`：高亮度、低干扰的正文背景。');
    lines.push('  - 金色 `#D7B66D`：兼容保留色，仅用于少量精致点缀。');
    lines.push('  - 中性灰 `#85847C`：兼容保留色，用于低优先级说明或辅助元素。');
    lines.push('- 颜色职责不可随意互换：浅底优先用墨黑正文；森林绿只作为文字、线条、边框或小面积标记，不得铺成背景或大面积色块；鼠尾草绿、陶土棕和金色以强调为主。');
    lines.push('- 禁止把所有颜色平均铺满画面；每页必须有明确的主背景色、主文字色和强调色。');
    lines.push('- 若旧示例中出现品牌色范围外的颜色或 `sans-serif`，在实际生成时以本节的品牌严格模式为准；不得照抄旧示例的冲突值。');
    lines.push('');
    lines.push('### 6l-2b. 品牌背景 presetId（硬性，仅严格色彩模式生效）');
    lines.push('');
    if (doc.brand.strictColors && doc.brand.bgPresets.length) {
        lines.push('所有页的 bg 必须从下面 ' + doc.brand.bgPresets.length + ' 个 presetId 里选一个，不允许用其他 presetId，不允许自定义 color1/color2：');
        lines.push('');
        doc.brand.bgPresets.forEach(b => {
            const c = b.color1 || '';
            lines.push('- `' + b.id + '`：' + (b.name || '') + (c ? (' ' + c) : ''));
        });
        lines.push('');
        lines.push('示例：`{ "bg": { "presetId": "' + doc.brand.bgPresets[0].id + '" } }`');
        lines.push('');
        lines.push('禁止：❌ 禁止用 hot-* / dark-* / neon-* / know-* 等其他 presetId；❌ 禁止自定义 color1/color2。');
    } else {
        lines.push('品牌严格色彩模式未开启，背景自由选择：可用第 4 节任意 presetId，或自定义 {type,color1,color2,angle,texture}。');
    }
    lines.push('');
    lines.push('### 6l-3. 三种视觉模式（背景必须保持浅色）');
    lines.push('- A｜暖米白编辑风：背景以 `#F5F1E8`、`#FCFAF5` 或 `#E6E0D5` 为主，正文使用 `#292B27`；用 `#7D9274` 或 `#C27C5A` 做少量强调。适合教育金句、知识解释、长文字和收藏型内容。');
    lines.push('- B｜森林绿观点强调风：背景仍使用 `#F5F1E8`、`#FCFAF5`、`#E6E0D5` 或 `#DDE4D7` 等浅色；森林绿 `#263B32` 仅用于标题文字、短句、细线、边框或小面积标记，不得作为背景色、整块底色或文字特效底色。适合封面、核心观点、反常识表达和短句冲击。');
    lines.push('- C｜自然光影生活风：以 `#F5F1E8`、`#FCFAF5` 或 `#DDE4D7` 为底，可使用低对比、稀疏的植物投影或自然光影；正文使用 `#292B27`，强调色使用 `#7D9274`。适合一日生活、孩子独立做事、幼儿园真实生活和家园共育。');
    lines.push('- 生成背景时必须是独立、无文字、无数字、无标志、无水印的干净背景；纹理和光影应克制、低对比，不得遮挡正文。');
    lines.push('- 不得擅自假定系统中存在未列出的背景 presetId。需要精确品牌色时，优先使用本契约允许的自定义背景结构；若无法确认自定义背景字段兼容性，则选择已有背景预设中最接近的背景，并用图层颜色维持品牌统一。');
    lines.push('');
    lines.push('### 6l-4. 按内容类型选风格');
    lines.push('- 成长与独立：优先 C 自然光影生活风；观点强、标题短时可用 B。');
    lines.push('- 教育金句：优先 A 暖米白编辑风；一句话需要强视觉冲击时可用 B。');
    lines.push('- 一日生活：优先 C；背景必须留白充足，避免复杂装饰。');
    lines.push('- 教育解读：优先 A；使用清晰层级、分隔线或浅色辅助块，不使用密集特效。');
    lines.push('- 家园共育：优先 A 或 C；语气温和但信息明确，强调色少量使用。');
    lines.push('- 如果用户指定了主题、情绪、颜色或参考风格，先满足用户明确要求，再在品牌色系统内尽可能协调。');
    lines.push('');
    lines.push('### 6l-5. 单张、多张图的颜色节奏');
    lines.push('- 单张图：只设 1 个主背景色、1 个主文字色、最多 1 个强调色；视觉焦点必须明确。');
    lines.push('- 两张图：优先采用「B 森林绿观点强调风 → A 暖米白编辑风」，或「A 暖米白编辑风 → C 自然光影生活风」；所有页面背景仍保持浅色，第一张通过标题层级和小面积强调抓住注意力，第二张负责解释或落地。');
    lines.push('- 三张图：优先按「观点 → 解释 → 行动/生活例子」组织，视觉节奏可用「B → A → C」或「A → A → C」；B 仅代表森林绿文字强调，不代表深色背景。');
    lines.push('- 四张及以上：可以重复 A 或 C，必要时用 B 作为开头或转折；不要每页更换完全不同的色系。');
    lines.push('- 用户明确要求的图片数量、页数、字数优先于本节建议；不得为了配色节奏擅自增加或减少页数。');
    lines.push('- 背景变化是建议，不是强制模板；若文案较长或阅读密度高，应优先统一浅色背景以保证连续阅读。');
    lines.push('');
    lines.push('### 6l-6. 颜色比例与文字可读性');
    lines.push('- 浅色页面参考比例：背景约 70%–85%，辅助区块/装饰约 10%–20%，强调色约 5%–10%；仅为视觉参考，不要求机械计算。');
    lines.push('- 本品牌规范不使用深色背景；所有页面以浅色背景为主，森林绿不得作为背景或大面积色块。');
    lines.push('- 正文与背景必须保持明显明度对比；长正文优先使用纯净浅底和墨黑文字，不得把正文放在复杂纹理、强光影或高饱和渐变上。');
    lines.push('- 一页只突出少量关键词；陶土棕、鼠尾草绿、金色不应同时大面积竞争。');
    lines.push('- 避免马赛克感、斑点噪声、脏污纹理、过度颗粒、随机渐变色斑、过强光晕和装饰堆叠。');
    lines.push('');
    lines.push('### 6l-7. 字体、排版和装饰');
    lines.push('- 品牌严格模式下所有文字图层使用 `Xiaolai-Regular`；不得擅自切换到其他字体。');
    lines.push('- 标题要有清楚的视觉层级；正文优先左对齐、行距舒适、段落分明。只有短标题或明确需要时才使用居中对齐。');
    lines.push('- 单行超过 10 个中文字时按第 6k 节手动软换行；长文案拆成短行和短段，避免单行过宽。');
    lines.push('- 长文字减少描边、发光、立体等强特效；可使用 `effectClass: null`，或使用已列出的低干扰效果。');
    lines.push('- 装饰只用于组织信息：细线、简洁几何块、编号、克制的自然形态；装饰不得抢过文字主体。');
    lines.push('- 不要为了「看起来设计感强」而添加无意义贴纸、伪文字、随机图案或未经用户要求的插画。');
    lines.push('');
    lines.push('### 6l-8. 输出决策顺序');
    lines.push('每次生成前按以下顺序决定视觉：');
    lines.push('1. 先识别内容类型：成长与独立、教育金句、一日生活、教育解读、家园共育，或用户指定的其他类型。');
    lines.push('2. 再识别页面任务：封面抓注意力、正文解释、案例展示、结尾总结/行动。');
    lines.push('3. 再决定页面数量与文字密度；严格遵守用户指定的张数、页数和字数。');
    lines.push('4. 为每页选择 A/B/C 视觉模式，并选用本节品牌色；所有页面背景保持浅色，森林绿仅用于文字或小面积元素；多页按第 6l-5 节安排节奏。');
    lines.push('5. 选择可读的文字颜色、字体、字号、对齐方式和安全区内坐标。');
    lines.push('6. 最后才考虑特效和装饰；如果效果影响阅读，删除特效而不是牺牲可读性。');
    lines.push('7. 输出前检查品牌颜色、字体、背景与正文对比、跨页节奏和安全区。');
    lines.push('');
    lines.push('### 6l-10. 品牌硬性 checklist（AI 每图层必查）');
    lines.push('');
    lines.push('**每生成一个文字图层，必须过一遍**：');
    lines.push('');
    if (doc.brand.strictColors) {
        const colorList = doc.brand.colors.length ? doc.brand.colors.join(', ') : '（当前色板为空，请在品牌面板添加）';
        const bgList = doc.brand.bgPresets.length ? doc.brand.bgPresets.map(b => b.id).join(' / ') : '（当前色板未配置背景预设）';
        lines.push('- □ color / bgColor 字段是否在 [' + colorList + '] 里？');
        lines.push('- □ 如果不在 → 改！用当前品牌色板里的颜色');
        lines.push('- □ 背景（bg.presetId）是否是 ' + bgList + ' 之一？');
    } else {
        lines.push('- □ 品牌严格色彩模式未开启，颜色/背景自由，跳过色彩校验');
    }
    lines.push('- □ 特效（effectClass）、底衬（backdrop）、贴纸（sticker）、上传素材：**完全自由，不受品牌约束**');
    lines.push('');
    lines.push('**只锁颜色（可选锁字体），永远不锁特效/底衬/贴纸。**');
    lines.push('');
    lines.push('### 6l-11. AI 自检流程（生成前跑 3 遍）');
    lines.push('');
    lines.push('在输出 JSON 之前，逐页逐图层跑 3 遍自检：');
    lines.push('');
    if (doc.brand.strictColors) {
        const fallbackColor = doc.brand.colors[0] || '#292B27';
        const fallbackBg = (doc.brand.bgPresets[0] && doc.brand.bgPresets[0].id) || 'brand-warm-cream';
        lines.push('**第 1 遍**：检查所有 color 字段 → 有非品牌色 → 改成 ' + fallbackColor);
        lines.push('**第 2 遍**：检查所有 bgColor 字段 → 有非品牌色 → 改成 transparent');
        lines.push('**第 3 遍**：检查所有 bg.presetId → 有非品牌预设 → 改成 ' + fallbackBg);
    } else {
        lines.push('品牌严格色彩模式未开启，3 遍色彩自检可跳过；仍建议检查所有颜色为合法 #rrggbb。');
    }
    lines.push('');
    lines.push('**3 遍都过，才输出。过不了，重做整页。**');
    lines.push('');
    lines.push('### 6l-9. 与 JSON 结构的兼容规则');
    lines.push('- 本节只规定视觉决策，不新增 JSON 字段，也不改变 `format`、`version`、`pages`、`layers` 等既有数据结构。');
    lines.push('- 继续使用第 4 节已列出的 `presetId`；不可以凭空创造诸如 `brand-cream`、`forest-green` 等未声明 ID。');
    lines.push('- 如需使用精确品牌色自定义背景，必须遵守第 4 节现有自定义背景格式；`color1`、`color2` 必须是品牌色，`angle` 必须为数字，`texture` 仅在明确需要且实现兼容时填写。');
    lines.push('- `bg` 的具体结构优先遵循第 1 节和现有模板；不要把视觉说明、注释或 Markdown 文本放入 JSON。');
    lines.push('- `notes` 可以用一句简短中文说明本页视觉意图，但不能替代有效的 JSON 字段，也不能包含未支持的功能指令。');
    lines.push('- 最终输出必须满足第 6b、6i 和第 7 节的 JSON 格式约束。');
    lines.push('');
    lines.push('## 6i. 输出前自查清单（建议 AI 每次输出前过一遍）');
    lines.push('□ 顶层有 format="douyin-cover-spec"、version=1、titleCandidates（3 条）、pages');
    lines.push('□ 每页有 title、bg（presetId）、layers（非空）');
    lines.push('□ 每个 text 图层有 content、fontSize、color、align、x、y、width、height、heightMode');
    lines.push('□ effectClass 全部在契约列表里，effectParams 的 key 都在该特效声明里');
    lines.push('□ 所有 color 都是 #rrggbb 格式');
    lines.push('□ 所有 x ∈ [0,360]、y ∈ [0,640]、width ≤ 360、height ≤ 640');
    lines.push('□ 多页方案主色一致、主字体 ≤2 种、主特效占比 ≥50%');
    lines.push('□ 输出是完整可解析的 JSON（无尾逗号、无注释、无双引号外包裹）');
    lines.push('');
    lines.push('## 6j. 承诺一致性（重要）');
    lines.push('- 如果用户原文里提到「X 页 / X 张」或「X 字以内」，你的输出必须严格遵守');
    lines.push('- 页数尽量落在承诺值 ±20% 内；封面标题长度必须 ≤ 承诺值');
    lines.push('- 不确定用户承诺时，宁可保守（页数少、标题短）');
    lines.push('');
    lines.push('## 6k. 安全区 + 软换行（手机端体验关键）');
    lines.push('- 左右各留 20px，上留 30px；硬底线 y + 实际高度 ≤ 596；单页文字总高 ≤ 566；即 x ∈ [20, 340-width]、y ∈ [30, 596-height]');
    lines.push('- 单行文字超过 10 个中文字时，请用 `\\n` 手动换行，避免横向溢出');
    lines.push('- 长段落请分多行；避免单行超过 240px 宽');
    lines.push('');
    lines.push('### 6k-1. 每页高度预算表（硬约束，生成时必须自己算）');
    lines.push('');
    lines.push('单页可用高度 = 640 - 30（上安全）- 44（下安全）= **566px**。每页所有文字图层的高度之和不能超过 566px。');
    lines.push('');
    lines.push('单图层高度 = 字号 × 行高 × 行数 + 底色 padding × 2 + 4px。');
    lines.push('');
    lines.push('常用字号的最大行数（width=304、lineHeight=1.6 时）：');
    lines.push('- 28px 标题：最多 12 行');
    lines.push('- 24px 正文：最多 14 行');
    lines.push('- 22px 正文：最多 16 行');
    lines.push('- 21px 正文：最多 16 行');
    lines.push('- 18px 标签：最多 19 行');
    lines.push('');
    lines.push('**生成前自查**：每页所有图层的 y + 高度 都必须 ≤ 596。超了就：① 删掉次要句子；② 拆到下一页；③ 字号降 2px。**禁止靠「写一个小的 height 字段」来绕过**——工具会用实际渲染高度校验，字段写小了照样报错。');
    lines.push('');
    lines.push('### 6k-2. 输出前强制执行的自检伪代码（不是建议，是强制步骤）');
    lines.push('');
    lines.push('```');
    lines.push('for each page in pages:');
    lines.push('    totalHeight = 0');
    lines.push('    for each layer in page.layers where layer.type == "text":');
    lines.push('        lineCount = 0');
    lines.push('        for each line in layer.content.split("\\n"):');
    lines.push('            lineWidth = 0');
    lines.push('            for each char in line:');
    lines.push('                if char is Chinese: lineWidth += fontSize');
    lines.push('                else: lineWidth += fontSize * 0.55');
    lines.push('            lineCount += max(1, ceil(lineWidth / layer.width))');
    lines.push('        layerHeight = lineCount * fontSize * lineHeight + (bgPadding or 0) * 2 + 4');
    lines.push('        if layer.y + layerHeight > 596:');
    lines.push('            DELETE last 1 line from layer.content');
    lines.push('            RECALCULATE layerHeight');
    lines.push('            if still > 596: DELETE this layer entirely');
    lines.push('        totalHeight += layerHeight');
    lines.push('    if totalHeight > 566:');
    lines.push('        MOVE the longest layer to a new page');
    lines.push('        RECALCULATE that new page totalHeight');
    lines.push('        if still > 566: SPLIT into two pages');
    lines.push('```');
    lines.push('');
    lines.push('**执行规则**：');
    lines.push('1. 你必须对每一页跑一遍上面的伪代码，不能跳过');
    lines.push('2. 任何一步检查失败，必须修改内容后重新跑，直到全部通过');
    lines.push('3. 只输出通过自检的 JSON，不允许输出越界方案');
    lines.push('4. 工具端会在 parse 后再次强制校验，越界方案会被拒绝且不会进入用户视野');
    lines.push('');
    lines.push('## 7. 强制规则');
    lines.push('1. 只输出 JSON，不要任何解释文字、不要 markdown 代码块以外的内容');
    lines.push('2. 禁止输出 CSS、<script>、<style> 标签');
    lines.push('3. effectClass 必须从第 3 节列表里选，effectParams 的 key 必须是该特效声明过的参数');
    lines.push('4. 颜色必须是 #rrggbb 格式');
    lines.push('5. x/y/width/height 必须在画布范围内');
    lines.push('6. 每个 chunks 里的块必须对应 spec.pages 里至少一页；内容过多时按 pagesNeeded 拆页');
    lines.push('7. titleCandidates 必须给 3 个封面标题候选');
    lines.push('');
    if (doc.styleReference && doc.styleReference.pages && doc.styleReference.pages.length > 0) {
        lines.push('## 8a. 当前画布风格参考（可选，仅供保持视觉连续性，不必逐字复用）');
        lines.push('```json');
        lines.push(JSON.stringify({
            format: 'douyin-cover-spec',
            version: 1,
            pages: doc.styleReference.pages.slice(0, 2)
        }, null, 2));
        lines.push('```');
        lines.push('');
    }

    lines.push('## 8. Few-shot 参考（来自内置模板，仅供参考风格，不必逐字复用）');
    lines.push('```json');
    lines.push(JSON.stringify({
        format: 'douyin-cover-spec',
        version: 1,
        titleCandidates: ['老板花钱培养园长', '为什么全白花了', '管理学真相'],
        pages: [
            {
                title: '封面',
                bg: { presetId: 'brand-warm-cream' },
                layers: [
                    {
                        type: 'text', content: '老板花钱\n培养园长', fontSize: '46px',
                        fontFamily: 'Xiaolai-Regular', color: '#263B32', bold: true,
                        align: 'center', lineHeight: 1.25, opacity: 1,
                        effectClass: 'effect-black-stroke',
                        effectParams: { 'effect-black-stroke': { fill: '#263B32', stroke: '#292B27', width: 2 } },
                        x: 30, y: 130, width: 300, height: 180,
                        heightMode: 'auto', rotation: -1, flipH: false, flipV: false,
                        locked: false, groupId: null, backdrop: null
                    }
                ]
            },
            {
                title: '正文',
                bg: { presetId: 'brand-soft-white' },
                layers: [
                    {
                        type: 'text', content: '很多老板不成功\n一年七八万都花了',
                        fontSize: '24px', fontFamily: 'Xiaolai-Regular', color: '#292B27',
                        bold: false, align: 'left', lineHeight: 1.5, opacity: 1,
                        effectClass: null,
                        x: 28, y: 100, width: 304, height: 260,
                        heightMode: 'auto', rotation: 0, flipH: false, flipV: false,
                        locked: false, groupId: null,
                        backdrop: null
                    }
                ]
            }
        ]
    }, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('');
    lines.push('## 附录 A. 特效 JSON 上传格式（v2，供生成新特效的 AI 使用）');
    lines.push('');
    lines.push('如果你要为本设计器**生成新特效**（不是生成封面），请按下面的格式输出。每个特效必须包含 semantics 字段，让本设计器在生成封面时能理解它是什么、适合什么。');
    lines.push('');
    lines.push('```json');
    lines.push('[{');
    lines.push('  "id": "唯一的英文标识（小写+下划线）",');
    lines.push('  "name": "中文显示名",');
    lines.push('  "params": {');
    lines.push('    "color": { "type": "color", "label": "颜色", "default": "#ff69b4" },');
    lines.push('    "blur": { "type": "range", "label": "光晕半径", "min": 1, "max": 40, "default": 10 }');
    lines.push('  },');
    lines.push('  "template": "color: #fff; text-shadow: 0 0 {blur}px {color}, 0 0 calc({blur}px * 2) {color};",');
    lines.push('  "semantics": {');
    lines.push('    "category": "glyph-treatment | container | annotation | frame-decoration",');
    lines.push('    "applyMode": "inline+layer | layer-only | inline-only",');
    lines.push('    "family": "视觉机制族（kebab-case，如 neon-glow / speech-bubble / paper-texture / 3d-extrude / text-stroke / gradient-fill / highlight / text-decoration / drop-shadow / metal-fill / glass-morphism / hand-drawn）",');
    lines.push('    "visualStyle": ["发光", "霓虹", "高冲击"],');
    lines.push('    "suitableRoles": ["封面主标题", "关键词强调"],');
    lines.push('    "avoidRoles": ["长正文", "小字号"],');
    lines.push('    "intensity": "low | medium | high",');
    lines.push('    "mood": ["炫酷", "赛博"]');
    lines.push('  }');
    lines.push('}]');
    lines.push('```');
    lines.push('');
    lines.push('semantics 字段说明：');
    lines.push('');
    lines.push('- `category`（必填）：`glyph-treatment`（改变文字本身）/ `container`（文字背后的容器）/ `annotation`（局部标注）/ `frame-decoration`（版式装饰）');
    lines.push('- `applyMode`（必填）：`inline+layer`（行内和整层都能用）/ `layer-only`（只能整层）/ `inline-only`（只能行内）');
    lines.push('- `family`（必填）：同一视觉机制用同一个 family（例如所有霓虹都用 `neon-glow`，不同颜色是参数，不要每个颜色一个 family）');
    lines.push('- `visualStyle`（推荐）：3-5 个视觉形容词');
    lines.push('- `suitableRoles`（推荐）：适合的文字角色，从封面主标题 / 正文标题 / 关键词强调 / 标签 / 对话 / 引用 / 局部标注 / 数字放大 里选');
    lines.push('- `avoidRoles`（推荐）：不适合的场景，避免 AI 滥用');
    lines.push('- `intensity`（推荐）：`low` / `medium` / `high`，帮助 AI 按视觉冲击力分级');
    lines.push('- `mood`（可选）：情绪标签，帮助 AI 按内容匹配');
    lines.push('');
    lines.push('**注意**：如果只提供 `id/name/params/template` 不提供 semantics，本设计器仍可正常渲染这个特效，但 AI 在生成封面时不会优先选择它（因为不知道它适合什么）。');
    lines.push('');
    return lines.join('\n');
}
window.generateAiSpecMarkdown = generateAiSpecMarkdown;

if (window.AppSelfTest && typeof AppSelfTest.register === 'function') {
  AppSelfTest.register('ai-contract', function () {
    var rows = [];
    function check(name, pass, detail) {
      rows.push({ name: name, pass: !!pass, detail: detail || '' });
    }
    check('generateAiSpecMarkdown', typeof generateAiSpecMarkdown === 'function');
    if (typeof generateAiSpecMarkdown !== 'function') return rows;
    var md = '';
    try { md = generateAiSpecMarkdown() || ''; check('生成契约不抛错', true); }
    catch (e) { check('生成契约不抛错', false, e.message); return rows; }
    check('含 6k-1', md.indexOf('6k-1') >= 0);
    check('含 6k-2', md.indexOf('6k-2') >= 0);
    check('含硬底线 596', /596/.test(md));
    check('含预算 566', /566/.test(md));
    check('无旧 y+height 600 硬底', !/y\s*\+\s*height\s*<=\s*600/.test(md) && !/y\s*\+\s*height\s*超过\s*600/.test(md));
    return rows;
  });
}

console.log('[AiSpecGen] ✅ 契约生成器就位');