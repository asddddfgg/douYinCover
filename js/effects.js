// Art Effects Library v2 — 统一参数化格式
// 所有特效 = { id, name, params, template }
// template 用 {key} 占位符，渲染时替换成参数值
// 老数据（{id,name,css}）自动迁移成新格式

/* ============================================================
   特效栏位分类 / 排序 / 置顶 / 隐藏
   ============================================================ */
const EFFECT_STATE_KEY = 'douyin_effects_states_v3';
const EFFECT_PINNED_TEXT_KEY = 'douyin_effects_pinned_order_text';
const EFFECT_PINNED_WHOLE_KEY = 'douyin_effects_pinned_order_whole';
const EFFECT_NORMAL_TEXT_KEY = 'douyin_effects_normal_order_text';
const EFFECT_NORMAL_WHOLE_KEY = 'douyin_effects_normal_order_whole';
const EFFECT_CATEGORY_OVERRIDES_KEY = 'douyin_effects_category_overrides';

function getEffectCategory(eff) {
    if (!eff) return 'text';
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(EFFECT_CATEGORY_OVERRIDES_KEY) || '{}'); } catch (e) {}
    if (overrides[eff.id]) return overrides[eff.id];

    // 用渲染出的 CSS 判断（兼容新格式）
    const css = eff.template ? renderTemplate(eff.template, getDefaultParams(eff)) : (eff.css || '');
    if (typeof canEffectApplyToSelection === 'function') {
        return canEffectApplyToSelection(css) ? 'text' : 'whole';
    }
    const c = css.toLowerCase();
    if (/(^|;|\s)border\s*:/.test(c)) return 'whole';
    if (c.includes('border-radius')) return 'whole';
    if (/(^|;|\s)padding\s*:/.test(c)) return 'whole';
    if (/(^|;|\s)animation\s*:/.test(c)) return 'whole';
    if (c.includes('backdrop-filter')) return 'whole';
    if (c.includes('clip-path')) return 'whole';
    if (c.includes('mix-blend-mode')) return 'whole';
    return 'text';
}

function getEffectOrder(cat, area) {
    const key = area === 'pinned'
        ? (cat === 'text' ? EFFECT_PINNED_TEXT_KEY : EFFECT_PINNED_WHOLE_KEY)
        : (cat === 'text' ? EFFECT_NORMAL_TEXT_KEY : EFFECT_NORMAL_WHOLE_KEY);
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}

function saveEffectOrder(cat, area, ids) {
    const key = area === 'pinned'
        ? (cat === 'text' ? EFFECT_PINNED_TEXT_KEY : EFFECT_PINNED_WHOLE_KEY)
        : (cat === 'text' ? EFFECT_NORMAL_TEXT_KEY : EFFECT_NORMAL_WHOLE_KEY);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) {}
}

function moveEffectToCategory(id, targetCat) {
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(EFFECT_CATEGORY_OVERRIDES_KEY) || '{}'); } catch (e) {}
    overrides[id] = targetCat;
    try { localStorage.setItem(EFFECT_CATEGORY_OVERRIDES_KEY, JSON.stringify(overrides)); } catch (e) {}

    let states = {};
    try { states = JSON.parse(localStorage.getItem(EFFECT_STATE_KEY) || '{}'); } catch (e) {}
    const isPinned = !!(states[id] && states[id].pinned);

    ['text', 'whole'].forEach(cat => {
        ['pinned', 'normal'].forEach(area => {
            const ids = getEffectOrder(cat, area).filter(x => x !== id);
            saveEffectOrder(cat, area, ids);
        });
    });
    if (isPinned) {
        const arr = getEffectOrder(targetCat, 'pinned'); arr.unshift(id);
        saveEffectOrder(targetCat, 'pinned', arr);
    } else {
        const arr = getEffectOrder(targetCat, 'normal'); arr.unshift(id);
        saveEffectOrder(targetCat, 'normal', arr);
    }
    if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
    if (typeof showBgToast === 'function') showBgToast(`已移到${targetCat === 'text' ? '文字特效' : '整层特效'}栏`);
}

function restoreEffectCategory(id) {
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(EFFECT_CATEGORY_OVERRIDES_KEY) || '{}'); } catch (e) {}
    if (!overrides[id]) return;
    delete overrides[id];
    try { localStorage.setItem(EFFECT_CATEGORY_OVERRIDES_KEY, JSON.stringify(overrides)); } catch (e) {}
    ['text', 'whole'].forEach(cat => {
        ['pinned', 'normal'].forEach(area => {
            const ids = getEffectOrder(cat, area).filter(x => x !== id);
            saveEffectOrder(cat, area, ids);
        });
    });
    if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
}

function migrateEffectOrdersIfNeeded() {
    const hasText = localStorage.getItem(EFFECT_PINNED_TEXT_KEY) !== null;
    const hasWhole = localStorage.getItem(EFFECT_PINNED_WHOLE_KEY) !== null;
    if (hasText || hasWhole) return;
    let oldPinned = [];
    try { oldPinned = JSON.parse(localStorage.getItem('douyin_effects_pinned_order') || '[]'); } catch (e) { return; }
    if (!Array.isArray(oldPinned) || oldPinned.length === 0) {
        saveEffectOrder('text', 'pinned', []);
        saveEffectOrder('whole', 'pinned', []);
        try { localStorage.removeItem('douyin_effects_pinned_order'); } catch (e) {}
        return;
    }
    const all = (typeof getAllEffectsMaster === 'function') ? getAllEffectsMaster() : [];
    const map = new Map(all.map(e => [e.id, e]));
    const textPinned = [];
    const wholePinned = [];
    oldPinned.forEach(id => {
        const eff = map.get(id);
        if (!eff) return;
        const cat = getEffectCategory(eff);
        if (cat === 'whole') wholePinned.push(id);
        else textPinned.push(id);
    });
    saveEffectOrder('text', 'pinned', textPinned);
    saveEffectOrder('whole', 'pinned', wholePinned);
    try { localStorage.removeItem('douyin_effects_pinned_order'); } catch (e) {}
}

/* ============================================================
   统一格式核心：template + params → CSS
   ============================================================ */

// 渲染 template：{key} 替换成 params[key] ?? default
function renderTemplate(template, params) {
    if (!template) return '';
    return String(template).replace(/\{(\w+)\}/g, (match, key) => {
        const v = params && params[key] !== undefined ? params[key] : '';
        return v !== undefined && v !== null ? v : '';
    });
}

// 从特效定义里拿默认参数对象
function getDefaultParams(eff) {
    const out = {};
    if (eff && eff.params) {
        Object.entries(eff.params).forEach(([k, meta]) => {
            out[k] = meta.default;
        });
    }
    return out;
}

// 根据特效 id + 用户参数生成 CSS（统一入口）
function renderEffectCss(effectId, userParams) {
    if (!effectId) return '';
    try {
        const all = window.getAllEffectsMaster ? window.getAllEffectsMaster() : [];
        const eff = all.find(e => e.id === effectId);
        if (!eff) return '';
        // 合并：default + 用户覆盖
        const merged = Object.assign({}, getDefaultParams(eff), userParams || {});
        if (eff.template) return renderTemplate(eff.template, merged);
        if (eff.css) return eff.css;   // 兼容万一还有老格式
        return '';
    } catch (e) { return ''; }
}

// 获取特效的参数定义（用于右侧面板渲染）
function getEffectParamsDef(effectId) {
    try {
        const all = window.getAllEffectsMaster ? window.getAllEffectsMaster() : [];
        const eff = all.find(e => e.id === effectId);
        return eff && eff.params ? eff.params : null;
    } catch (e) { return null; }
}

// 是否是"可调"特效（有 params）
function isParametricEffect(effectId) {
    const def = getEffectParamsDef(effectId);
    return !!(def && Object.keys(def).length > 0);
}

window.renderTemplate = renderTemplate;
window.getDefaultParams = getDefaultParams;
window.renderEffectCss = renderEffectCss;
window.getEffectParamsDef = getEffectParamsDef;
window.isParametricEffect = isParametricEffect;

/* ============================================================
   特效语义层 v1：让 AI 理解「是什么、适合什么」
   两大来源：
     1) EFFECT_SEMANTIC_OVERRIDES —— 内置 14 个精准手写
     2) inferSemantics(eff) —— 自定义特效规则推断（含 name + template 关键字）
   所有字段均可选；缺失时 AI 不优先选，但不影响渲染
   ============================================================ */
const EFFECT_SEMANTIC_OVERRIDES = {
    'effect-gradient': {
        category: 'glyph-treatment', applyMode: 'layer-only', family: 'gradient-fill',
        visualStyle: ['渐变', '柔和', '现代'],
        suitableRoles: ['封面主标题', '正文标题', '标签'],
        avoidRoles: ['超小字号', '需要硬朗感的警示文案'],
        intensity: 'medium', mood: ['温暖', '时尚']
    },
    'effect-neon': {
        category: 'glyph-treatment', applyMode: 'inline+layer', family: 'neon-glow',
        visualStyle: ['发光', '霓虹', '高冲击'],
        suitableRoles: ['封面主标题', '关键词强调', '数字放大'],
        avoidRoles: ['长正文', '小字号'], intensity: 'high', mood: ['炫酷', '赛博']
    },
    'effect-3d': {
        category: 'glyph-treatment', applyMode: 'layer-only', family: '3d-extrude',
        visualStyle: ['立体', '层次', '厚重'],
        suitableRoles: ['封面主标题', '核心观点'],
        avoidRoles: ['长正文', '密集信息页'], intensity: 'high', mood: ['稳重', '权威']
    },
    'effect-hk': {
        category: 'glyph-treatment', applyMode: 'inline+layer', family: 'neon-glow',
        visualStyle: ['发光', '复古', '怀旧'],
        suitableRoles: ['封面主标题', '案例页标题'],
        avoidRoles: ['长正文'], intensity: 'medium', mood: ['怀旧', '港风']
    },
    'effect-gold': {
        category: 'glyph-treatment', applyMode: 'layer-only', family: 'gradient-fill',
        visualStyle: ['金属', '奢华', '质感'],
        suitableRoles: ['标签', '副标题', '强调词'],
        avoidRoles: ['封面主标题（冲击力不足）', '长正文'], intensity: 'medium', mood: ['高端', '稳重']
    },
    'effect-ice': {
        category: 'glyph-treatment', applyMode: 'inline+layer', family: 'neon-glow',
        visualStyle: ['发光', '冰感', '冷色'],
        suitableRoles: ['封面主标题', '情绪转折页'],
        avoidRoles: ['温暖主题'], intensity: 'medium', mood: ['冷峻', '疏离']
    },
    'effect-black-stroke': {
        category: 'glyph-treatment', applyMode: 'inline+layer', family: 'text-stroke',
        visualStyle: ['描边', '稳定', '可读'],
        suitableRoles: ['正文标题', '长段落小标题', '标签'],
        avoidRoles: ['封面主标题（冲击力不足）'], intensity: 'low', mood: ['克制', '稳定']
    },
    'effect-purple-mist': {
        category: 'glyph-treatment', applyMode: 'layer-only', family: 'soft-glow',
        visualStyle: ['柔光', '朦胧', '梦幻'],
        suitableRoles: ['情感页标题', '回忆段落', '标签'],
        avoidRoles: ['数字冲击', '警示文案'], intensity: 'low', mood: ['梦幻', '温柔']
    },
    'effect-sunset': {
        category: 'glyph-treatment', applyMode: 'layer-only', family: 'gradient-fill',
        visualStyle: ['渐变', '暖光', '日落'],
        suitableRoles: ['封面主标题', '情绪收尾页'],
        avoidRoles: ['冷色主题'], intensity: 'medium', mood: ['温暖', '抒情']
    },
    'effect-deep-sea': {
        category: 'glyph-treatment', applyMode: 'layer-only', family: 'gradient-fill',
        visualStyle: ['渐变', '深蓝', '理性'],
        suitableRoles: ['分析页标题', '知识干货'],
        avoidRoles: ['情感类'], intensity: 'medium', mood: ['理性', '专业']
    },
    'effect-jade': {
        category: 'glyph-treatment', applyMode: 'layer-only', family: 'gradient-fill',
        visualStyle: ['渐变', '自然', '清透'],
        suitableRoles: ['生活类标题', '自然主题'],
        avoidRoles: ['科技主题'], intensity: 'medium', mood: ['清新', '自然']
    },
    'effect-chalk': {
        category: 'glyph-treatment', applyMode: 'inline+layer', family: 'hand-drawn',
        visualStyle: ['手绘', '粉笔', '粗糙'],
        suitableRoles: ['教育类标题', '黑板主题'],
        avoidRoles: ['正式商务'], intensity: 'medium', mood: ['随性', '亲和']
    },
    'effect-lightning': {
        category: 'glyph-treatment', applyMode: 'inline+layer', family: 'neon-glow',
        visualStyle: ['发光', '闪电', '高冲击'],
        suitableRoles: ['关键数字', '警示词', '强调'],
        avoidRoles: ['长正文'], intensity: 'high', mood: ['爆发', '惊悚']
    },
    'effect-viral': {
        category: 'glyph-treatment', applyMode: 'inline+layer', family: 'neon-glow',
        visualStyle: ['发光', '爆款', '高冲击'],
        suitableRoles: ['封面主标题', '核心观点', '号召'],
        avoidRoles: ['长正文', '知识解释段'], intensity: 'high', mood: ['热血', '爆燃']
    }
};

// 顺序=优先级。名字类关键字（bubble/paper/highlight）必须排在 template 关键字（shadow/box-shadow）之前，
// 否则 dlg_comic_bubble 的 template 含 box-shadow 会被误判成 drop-shadow。
const SEMANTICS_FAMILY_RULES = [
    // 容器/材质类：名字优先，先匹配
    // ✅ paper-texture 提到 speech-bubble 之前：『纸/信/letter』比『对话/chat』更具体，避免旧信纸被误判成气泡
    { kw: /纸|paper|信|letter|报纸|newspaper|羊皮|parchment|牛皮|kraft|宝丽来|polaroid|票根|ticket|便签|便利贴|sticky/i, family: 'paper-texture', style: ['纸质', '复古'], intensity: 'low', catHint: 'container' },
    { kw: /气泡|bubble|说话|台词|对话框|对话气泡/i, family: 'speech-bubble', style: ['气泡', '对话'], intensity: 'medium', catHint: 'container' },
    { kw: /黑板|chalk|白板|whiteboard|打字机|typewriter|信纸|代码|终端/i, family: 'paper-texture', style: ['手写', '复古'], intensity: 'medium', catHint: 'container' },
    { kw: /玻璃|glass|frost|磨砂|毛玻璃/i, family: 'glass-morphism', style: ['玻璃', '现代'], intensity: 'medium', catHint: 'frame-decoration' },
    { kw: /卡片|card|引用|quote|Pro.?Tip|warning|警告|提示/i, family: 'card-block', style: ['卡片', '信息块'], intensity: 'medium', catHint: 'container' },
    // 标注类：名字优先
    { kw: /高亮|highlight|marker|荧光|马克笔/i, family: 'highlight', style: ['高亮', '强调'], intensity: 'medium', catHint: 'annotation' },
    { kw: /下划线|underline|删除线|strike|波浪|wavy|点线|双线/i, family: 'text-decoration', style: ['装饰线', '强调'], intensity: 'medium', catHint: 'annotation' },
    { kw: /圆圈|circle|方框|box|圈|画圈|标注|箭头|arrow|callout/i, family: 'callout-mark', style: ['标注', '圈重点'], intensity: 'high', catHint: 'annotation' },
    { kw: /手写|handwritten|手绘|粉笔/i, family: 'hand-drawn', style: ['手绘', '随性'], intensity: 'medium' },
    // 字形表现类：名字优先
    { kw: /霓虹|neon|发光|glow|外发光|闪光|闪烁|脉冲|激光/i, family: 'neon-glow', style: ['发光', '高冲击'], intensity: 'high' },
    { kw: /渐变|gradient|彩虹|rainbow|炫彩/i, family: 'gradient-fill', style: ['渐变', '多彩'], intensity: 'medium' },
    { kw: /描边|stroke|outline|轮廓|边框|虚线|点线|双线|内凹|外凸|凹槽|凸起/i, family: 'text-stroke', style: ['描边', '轮廓'], intensity: 'medium' },
    { kw: /立体|3d|浮雕|雕刻|emboss|extrude/i, family: '3d-extrude', style: ['立体', '层次'], intensity: 'high' },
    { kw: /金属|metal|silver|银色|钢|铁/i, family: 'metal-fill', style: ['金属', '硬朗'], intensity: 'medium' },
    // 兜底：template 关键字（box-shadow 等容易被误伤，放最后）
    { kw: /阴影|shadow|投影|长投影|斜投影|暗黑/i, family: 'drop-shadow', style: ['阴影', '厚重'], intensity: 'medium' }
];

function _semanticsDefaultCategory(eff) {
    try {
        const cat = (typeof getEffectCategory === 'function') ? getEffectCategory(eff) : 'text';
        return cat === 'whole' ? 'container' : 'glyph-treatment';
    } catch (e) { return 'glyph-treatment'; }
}

function _semanticsDefaultApplyMode(eff, category) {
    try {
        const cat = (typeof getEffectCategory === 'function') ? getEffectCategory(eff) : 'text';
        if (cat === 'whole') return 'layer-only';
    } catch (e) {}
    if (category === 'container' || category === 'frame-decoration') return 'layer-only';
    if (category === 'annotation') return 'inline+layer';
    return 'inline+layer';
}

const SEMANTICS_RULE_VERSION = 2;

function inferSemantics(eff) {
    if (!eff) return null;
    // ✅ 只有版本匹配才复用缓存；旧版本缓存自动重新推断
    if (eff.semantics && eff.semantics.category) {
        const cachedVer = eff.semantics._version || 1;
        if (cachedVer >= SEMANTICS_RULE_VERSION) return eff.semantics;
        // 版本过期 → 继续往下重新推断（不 return）
    }
    if (EFFECT_SEMANTIC_OVERRIDES[eff.id]) {
        return Object.assign({ _source: 'override', _version: SEMANTICS_RULE_VERSION }, EFFECT_SEMANTIC_OVERRIDES[eff.id]);
    }
    const name = String(eff.name || '');
    const tpl = String(eff.template || eff.css || '');
    // ✅ 两段匹配：先只看名字（更精确），名字没命中才扫 template
    let hit = null;
    for (const rule of SEMANTICS_FAMILY_RULES) {
        if (rule.kw.test(name)) { hit = rule; break; }
    }
    if (!hit) {
        for (const rule of SEMANTICS_FAMILY_RULES) {
            if (rule.kw.test(tpl)) { hit = rule; break; }
        }
    }
    const category = (hit && hit.catHint) ? hit.catHint : _semanticsDefaultCategory(eff);
    const applyMode = _semanticsDefaultApplyMode(eff, category);
    const family = hit ? hit.family : 'misc';
    const visualStyle = hit ? hit.style.slice() : ['其他'];
    const intensity = hit ? (hit.intensity || 'medium') : 'medium';

    const roleMap = {
        'glyph-treatment': { suitable: ['封面主标题', '正文标题', '关键词'], avoid: ['长正文'] },
        'container': { suitable: ['对话承载', '信息卡片', '引用'], avoid: ['长正文', '小字号'] },
        'annotation': { suitable: ['关键词强调', '数字标注', '重点圈出'], avoid: ['整段正文'] },
        'frame-decoration': { suitable: ['版式装饰', '封面边框'], avoid: ['长正文'] }
    };
    const roles = roleMap[category] || roleMap['glyph-treatment'];

    return {
        _source: 'inferred',
        _version: SEMANTICS_RULE_VERSION,
        category, applyMode, family,
        visualStyle,
        suitableRoles: roles.suitable,
        avoidRoles: roles.avoid,
        intensity,
        mood: []
    };
}
window.inferSemantics = inferSemantics;
window.EFFECT_SEMANTIC_OVERRIDES = EFFECT_SEMANTIC_OVERRIDES;

console.log('[Effects] ✅ 语义层已就位：EFFECT_SEMANTIC_OVERRIDES（' +
    Object.keys(EFFECT_SEMANTIC_OVERRIDES).length + ' 个内置精准语义）+ inferSemantics() 规则推断');

/* ============================================================
   内置 20 款 → 全部改成新格式 {id, name, params, template}
   id 保持不变，老图层零迁移
   ============================================================ */
const DEFAULT_ART_EFFECTS = [
    {
        id: 'effect-gradient', name: '双色渐变',
        params: {
            color1: { type: 'color', label: '颜色1', default: '#ff7e5f' },
            color2: { type: 'color', label: '颜色2', default: '#feb47b' },
            angle:  { type: 'range', label: '角度', min: 0, max: 360, default: 135, step: 5 }
        },
        template: 'background: linear-gradient({angle}deg, {color1}, {color2}); -webkit-background-clip: text; -webkit-text-fill-color: transparent;'
    },
    {
        id: 'effect-neon', name: '霓虹发光',
        params: {
            color: { type: 'color', label: '发光色', default: '#ff00de' },
            blur:  { type: 'range', label: '强度', min: 1, max: 40, default: 5, step: 1 }
        },
        template: 'color: #fff; text-shadow: 0 0 {blur}px {color}, 0 0 calc({blur}px * 2) {color}, 0 0 calc({blur}px * 4) {color}, 0 0 calc({blur}px * 8) {color};'
    },
    {
        id: 'effect-3d', name: '3D立体',
        params: {
            depth:  { type: 'range', label: '立体深度', min: 1, max: 10, default: 5, step: 1 },
            shadow: { type: 'color', label: '阴影色', default: 'rgba(0,0,0,0.6)' }
        },
        template: 'color: #f0f0f0; text-shadow: 1px 1px 0 #ccc, 2px 2px 0 #c9c9c9, 3px 3px 0 #bbb, calc({depth}px) calc({depth}px) 7px {shadow};'
    },
    {
        id: 'effect-cyber', name: '赛博机甲',
        params: {
            color1: { type: 'color', label: '主色', default: '#00ffff' },
            color2: { type: 'color', label: '辅色', default: '#ff0055' }
        },
        template: 'color: {color1}; text-shadow: 2px 0 {color2}, -2px 0 {color1};'
    },
    {
        id: 'effect-glitch', name: '故障艺术',
        params: {
            shift: { type: 'range', label: '偏移', min: 1, max: 8, default: 2, step: 1 }
        },
        template: 'color: #fff; position: relative; text-shadow: {shift}px -{shift}px 0 rgba(255,0,0,0.7), -{shift}px {shift}px 0 rgba(0,255,255,0.7);'
    },
    {
        id: 'effect-hk', name: '复古港风',
        params: {
            color: { type: 'color', label: '主色', default: '#ffeb3b' },
            glow:  { type: 'range', label: '光晕', min: 1, max: 20, default: 8, step: 1 }
        },
        template: 'color: {color}; text-shadow: 0 0 {glow}px rgba(255,235,59,0.8), 2px 2px 5px #000;'
    },
    {
        id: 'effect-gold', name: '暗金奢华',
        params: {
            color1: { type: 'color', label: '亮金', default: '#d4af37' },
            color2: { type: 'color', label: '暗金', default: '#aa771c' }
        },
        template: 'background: linear-gradient(to bottom, {color1} 0%, {color2} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.8));'
    },
    {
        id: 'effect-fire', name: '烈火熔岩',
        params: {
            c1: { type: 'color', label: '红', default: '#ff4500' },
            c2: { type: 'color', label: '橙', default: '#ff8c00' },
            c3: { type: 'color', label: '黄', default: '#ffff00' }
        },
        template: 'background: linear-gradient(to bottom, {c1} 0%, {c2} 50%, {c3} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0 0 10px rgba(255,69,0,0.6);'
    },
    {
        id: 'effect-ice', name: '寒冰霜冻',
        params: {
            color: { type: 'color', label: '冰蓝', default: '#e0f7fa' },
            blur:  { type: 'range', label: '霜冻强度', min: 1, max: 20, default: 5, step: 1 }
        },
        template: 'color: {color}; text-shadow: 0 0 {blur}px #00bcd4, 0 0 calc({blur}px*2) #00bcd4, 0 0 calc({blur}px*4) #00e5ff;'
    },
    {
        id: 'effect-black-stroke', name: '黑描边粗重',
        params: {
            fill: { type: 'color', label: '文字色', default: '#ffffff' },
            stroke: { type: 'color', label: '描边色', default: '#000000' },
            width: { type: 'range', label: '描边粗细', min: 1, max: 8, default: 2, step: 1 }
        },
        template: 'color: {fill}; text-shadow: -{width}px -{width}px 0 {stroke}, {width}px -{width}px 0 {stroke}, -{width}px {width}px 0 {stroke}, {width}px {width}px 0 {stroke}, 0 3px 5px rgba(0,0,0,0.8);'
    },
    {
        id: 'effect-purple-mist', name: '紫雾梦幻',
        params: {
            color: { type: 'color', label: '紫雾色', default: '#e1bee7' },
            blur:  { type: 'range', label: '朦胧度', min: 1, max: 30, default: 10, step: 1 }
        },
        template: 'color: {color}; text-shadow: 0 0 {blur}px #ab47bc, 0 0 calc({blur}px*2) #7b1fa2;'
    },
    {
        id: 'effect-sunset', name: '日落晚霞',
        params: {
            color1: { type: 'color', label: '橙色', default: '#ff512f' },
            color2: { type: 'color', label: '玫红', default: '#dd2476' }
        },
        template: 'background: linear-gradient(135deg, {color1} 0%, {color2} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;'
    },
    {
        id: 'effect-deep-sea', name: '深海湛蓝',
        params: {
            color1: { type: 'color', label: '深蓝', default: '#2b5876' },
            color2: { type: 'color', label: '紫蓝', default: '#4e4376' }
        },
        template: 'background: linear-gradient(135deg, {color1} 0%, {color2} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;'
    },
    {
        id: 'effect-jade', name: '翡翠绿光',
        params: {
            color1: { type: 'color', label: '翠绿', default: '#11998e' },
            color2: { type: 'color', label: '荧光绿', default: '#38ef7d' }
        },
        template: 'background: linear-gradient(135deg, {color1} 0%, {color2} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;'
    },
    {
        id: 'effect-candy', name: '梦幻糖果',
        params: {
            color1: { type: 'color', label: '粉', default: '#ff9a9e' },
            color2: { type: 'color', label: '奶白', default: '#fecfef' }
        },
        template: 'background: linear-gradient(135deg, {color1} 0%, {color2} 50%, {color2} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;'
    },
    {
        id: 'effect-metal', name: '重金属风',
        params: {
            base: { type: 'color', label: '金属色', default: '#b0bec5' }
        },
        template: 'color: {base}; text-shadow: 0 1px 0 #cfd8dc, 0 2px 0 {base}, 0 3px 0 #90a4ae, 0 4px 0 #607d8b, 0 5px 10px rgba(0,0,0,0.8);'
    },
    {
        id: 'effect-chalk', name: '粉笔手绘',
        params: {
            color: { type: 'color', label: '粉笔色', default: '#ffffff' }
        },
        template: 'color: {color}; text-shadow: 0 0 2px rgba(255,255,255,0.8), 1px 1px 2px rgba(0,0,0,0.5);'
    },
    {
        id: 'effect-lightning', name: '闪电高压',
        params: {
            c1: { type: 'color', label: '中心', default: '#ffffff' },
            c2: { type: 'color', label: '光晕', default: '#ffeb3b' }
        },
        template: 'color: {c1}; text-shadow: 0 0 5px {c1}, 0 0 10px {c2}, 0 0 20px #ff9800;'
    },
    {
        id: 'effect-red-stroke', name: '红描边爆款',
        params: {
            fill: { type: 'color', label: '文字色', default: '#ffeb3b' },
            stroke: { type: 'color', label: '描边色', default: '#ff2442' },
            width: { type: 'range', label: '描边粗细', min: 1, max: 8, default: 2, step: 1 }
        },
        template: 'color: {fill}; text-shadow: -{width}px -{width}px 0 {stroke}, {width}px -{width}px 0 {stroke}, -{width}px {width}px 0 {stroke}, {width}px {width}px 0 {stroke};'
    },
    {
        id: 'effect-viral', name: '王牌爆款',
        params: {
            color: { type: 'color', label: '主色', default: '#ffff00' },
            glow:  { type: 'range', label: '爆闪强度', min: 1, max: 40, default: 10, step: 1 }
        },
        template: 'color: {color}; text-shadow: 0 0 {glow}px #ff2442, 0 0 calc({glow}px*2) #ff2442, 0 0 calc({glow}px*3) #ff2442; font-weight: 900;'
    }
];

/* ============================================================
   兼容层：把 template 转成 css（供老代码读取 eff.css 的地方用）
   ============================================================ */
function augmentEffectWithCss(eff) {
    if (!eff) return eff;
    if (!eff.css && eff.template) {
        try { eff.css = renderTemplate(eff.template, getDefaultParams(eff)); } catch (e) { eff.css = ''; }
    }
    return eff;
}

/* ============================================================
   特效库读取 + 自动迁移你上传的几十种
   ============================================================ */
function initEffectsLibrary() {
    migrateEffectOrdersIfNeeded();
    initEffectsManagerPanel();
    loadEffectsFromDB();
}

function getAllEffectsMaster() {
    let userOverrides = {};
    try { userOverrides = JSON.parse(localStorage.getItem('douyin_effects_states_v3') || '{}'); } catch(e) {}
    let customList = window.__effectsCustomListCache || [];

    let defaults = DEFAULT_ART_EFFECTS.map(eff => augmentEffectWithCss({
        ...eff,
        hidden: userOverrides[eff.id] ? !!userOverrides[eff.id].hidden : false,
        deleted: userOverrides[eff.id] ? !!userOverrides[eff.id].deleted : false,
        pinned: userOverrides[eff.id] ? !!userOverrides[eff.id].pinned : false,
        isCustom: false
    })).filter(eff => !eff.deleted);

    let customs = customList.map(eff => augmentEffectWithCss({
        ...eff,
        hidden: userOverrides[eff.id] ? !!userOverrides[eff.id].hidden : (eff.hidden || false),
        deleted: userOverrides[eff.id] ? !!userOverrides[eff.id].deleted : false,
        pinned: userOverrides[eff.id] ? !!userOverrides[eff.id].pinned : false,
        isCustom: true
    })).filter(eff => !eff.deleted);

    return [...defaults, ...customs];
}

async function loadEffectsFromDB() {
    try {
        const list = await EffectsDB.getAllEffects();
        window.__effectsCustomListCache = list;
        // ✅ 启动时自动迁移老格式（{css} → {params, template}）
        await migrateLegacyEffectsToParametric();
        // 重新读一遍（迁移后的）
        const list2 = await EffectsDB.getAllEffects();
        window.__effectsCustomListCache = list2;
        // ✅ 一次性语义补全：给缺 semantics 的自定义特效写入推断结果
        try {
            if (typeof inferSemantics === 'function') {
                let needSave = 0;
                for (const eff of list2) {
                    if (eff && eff.id && !eff.semantics) {
                        try {
                            const s = inferSemantics(eff);
                            if (s && s.category) {
                                eff.semantics = s;
                                needSave++;
                            }
                        } catch (err) {}
                    }
                }
                if (needSave > 0) {
                    for (const eff of list2) {
                        if (eff && eff.semantics && eff.semantics._source === 'inferred') {
                            try { await EffectsDB.putEffect(eff); } catch (err) {}
                        }
                    }
                    console.log('[Effects] 已为 ' + needSave + ' 个自定义特效补全语义');
                }
            }
        } catch (e2) {
            if (window.Utils && Utils.log) Utils.log.warn('[Effects] 批量补全语义失败', e2);
        }
        renderEffectsGrid();
    } catch (e) {
        console.error('读取特效库失败:', e);
        renderEffectsGrid();
    }
}

/* ============================================================
   🔑 核心：自动迁移你上传的几十种老特效
   规则：css 里扫颜色 + px → 抽成 params + template
   ============================================================ */
async function migrateLegacyEffectsToParametric() {
    if (!window.EffectsDB) return { migrated: 0 };
    const all = await EffectsDB.getAllEffects();
    const needMigrate = all.filter(e => !e.template && e.css);
    if (needMigrate.length === 0) return { migrated: 0 };

    let okCount = 0;
    for (const eff of needMigrate) {
        try {
            const { params, template } = autoExtractParamsFromCss(eff.css);
            eff.params = params;
            eff.template = template;
            eff.legacyCss = eff.css;
            eff.migratedFrom = 'v1';
            delete eff.css;
            await EffectsDB.putEffect(eff);
            okCount++;
        } catch (err) {
            console.warn('迁移失败:', eff.id, err);
        }
    }
    console.log(`[特效迁移] 已自动迁移 ${okCount} 条自定义特效到参数化格式`);
    return { migrated: okCount };
}

// 智能从 CSS 里提取颜色/px → params + template
function autoExtractParamsFromCss(css) {
    if (!css) return { params: {}, template: '' };
    const params = {};
    const replacement = {};
    let template = String(css);

    // 1. 提取颜色（去重，按出现顺序）
    const colorRegex = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g;
    const colors = [];
    const seenColors = new Set();
    let m;
    while ((m = colorRegex.exec(css)) !== null) {
        const c = m[0];
        if (!seenColors.has(c)) { seenColors.add(c); colors.push(c); }
    }
    colors.forEach((c, i) => {
        const key = 'color' + (i + 1);
        params[key] = { type: 'color', label: '颜色' + (i + 1), default: c };
        replacement[c] = `{${key}}`;
    });

    // 2. 提取 px 数值（去重，排除 0px/1px 太小）
    const pxRegex = /(\d+(?:\.\d+)?)px/g;
    const pxs = [];
    const seenPx = new Set();
    while ((m = pxRegex.exec(css)) !== null) {
        const v = parseFloat(m[1]);
        if (v > 1 && v < 200 && !seenPx.has(v)) { seenPx.add(v); pxs.push(v); }
    }
    pxs.forEach((v, i) => {
        const key = i === 0 ? 'blur' : ('size' + (i + 1));
        params[key] = { type: 'range', label: i === 0 ? '强度' : ('尺寸' + (i + 1)), min: 1, max: 80, default: v, step: 1 };
        replacement[`${v}px`] = `{${key}}px`;
    });

    // 3. 生成 template（把原值替换成占位符）
    Object.entries(replacement).forEach(([orig, ph]) => {
        template = template.split(orig).join(ph);
    });

    return { params, template };
}

window.migrateLegacyEffectsToParametric = migrateLegacyEffectsToParametric;
window.autoExtractParamsFromCss = autoExtractParamsFromCss;

/* ============================================================
   以下 UI 部分保持原逻辑（渲染卡片、上传、隐藏、置顶…）
   唯一改动：上传校验新格式
   ============================================================ */

function getPinnedEffectsList() {
    let all = getAllEffectsMaster();
    let pinnedIds = [];
    try { pinnedIds = JSON.parse(localStorage.getItem('douyin_effects_pinned_order') || '[]'); } catch(e) {}
    let pinnedMap = new Map(all.map(e => [e.id, e]));
    let orderedPinned = [];
    pinnedIds.forEach(id => {
        if (pinnedMap.has(id)) { orderedPinned.push(pinnedMap.get(id)); pinnedMap.delete(id); }
    });
    pinnedMap.forEach(eff => { if (eff.pinned) orderedPinned.push(eff); });
    return orderedPinned;
}

function renderEffectsGrid() {
    migrateEffectOrdersIfNeeded();
    const grid = document.getElementById('effects-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let styleTag = document.getElementById('dynamic-custom-effects-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-custom-effects-style';
        document.head.appendChild(styleTag);
    }

    let allEffects = getAllEffectsMaster();
    let cssRules = '';
    allEffects.forEach(eff => {
        if (eff.css) cssRules += `.${eff.id} { ${eff.css} }\n`;
    });
    styleTag.innerHTML = cssRules;

    const visible = allEffects.filter(eff => !eff.hidden);
    const textEffects = visible.filter(eff => getEffectCategory(eff) === 'text');
    const wholeEffects = visible.filter(eff => getEffectCategory(eff) === 'whole');

    function renderSection(cat, catTitle, catEffects) {
        if (catEffects.length === 0) return;
        const pinned = catEffects.filter(eff => eff.pinned);
        const normal = catEffects.filter(eff => !eff.pinned);
        const pinnedSorted = sortByOrder(pinned, cat, 'pinned');
        const normalSorted = sortByOrder(normal, cat, 'normal');

        const section = document.createElement('div');
        section.className = 'effects-section effects-section-' + cat;
        section.style.gridColumn = 'span 2';
        const catHeader = document.createElement('div');
        catHeader.className = 'effects-section-header';
        catHeader.innerHTML = cat === 'text'
            ? '<i class="fa-solid fa-font"></i> 文字特效'
            : '<i class="fa-solid fa-square-full"></i> 整层特效';
        section.appendChild(catHeader);
        const body = document.createElement('div');
        body.className = 'effects-section-body';
        pinnedSorted.forEach((eff, idx) => body.appendChild(createEffectCardDOM(eff, idx, pinnedSorted.length, true)));
        if (pinnedSorted.length > 0 && normalSorted.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'effects-section-divider';
            divider.style.gridColumn = 'span 2';
            body.appendChild(divider);
        }
        normalSorted.forEach((eff, idx) => body.appendChild(createEffectCardDOM(eff, idx, normalSorted.length, false)));
        section.appendChild(body);
        grid.appendChild(section);
    }

    renderSection('text', '文字特效', textEffects);
    renderSection('whole', '整层特效', wholeEffects);
}

function createEffectCardDOM(eff, pinIndex, pinTotal, isPinnedSection) {
    const card = document.createElement('div');
    card.className = `effect-card ${eff.id}`;
    card.innerText = eff.name;
    card.dataset.effectId = eff.id;

    const currentLayer = state.getSelectedLayer();
    if (currentLayer && (currentLayer.effectClass === eff.id ||
        (Array.isArray(currentLayer.effectClasses) && currentLayer.effectClasses.includes(eff.id)))) {
        card.classList.add('active');
    }

    card.addEventListener('click', () => {
        handleEffectClick(eff);
        document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
        const layer = state.getSelectedLayer();
        if (layer && (layer.effectClass === eff.id ||
            (Array.isArray(layer.effectClasses) && layer.effectClasses.includes(eff.id)))) {
            card.classList.add('active');
        }
    });

    card.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        showEffectContextMenu(e, eff);
    });

    const delBtn = document.createElement('div');
    delBtn.className = 'effect-action-btn btn-del';
    delBtn.innerHTML = '&times;'; delBtn.title = '删除此特效';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteEffect(eff.id, eff.isCustom); });
    card.appendChild(delBtn);

    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'effect-action-btn btn-toggle';
    toggleBtn.innerHTML = '👁️'; toggleBtn.title = '隐藏此特效';
    toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEffectHidden(eff.id); });
    card.appendChild(toggleBtn);

    const pinBtn = document.createElement('div');
    pinBtn.className = 'effect-action-btn btn-pin';
    pinBtn.innerHTML = eff.pinned ? '📍' : '📌';
    pinBtn.title = eff.pinned ? '取消置顶' : '置顶到本栏顶部';
    pinBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEffectPinned(eff.id); });
    card.appendChild(pinBtn);

    const moveUp = document.createElement('div');
    moveUp.className = 'effect-action-btn btn-move-left';
    moveUp.innerHTML = '◀'; moveUp.title = '向前移动（同区内）';
    if (pinIndex <= 0) { moveUp.style.opacity = '0.3'; moveUp.style.pointerEvents = 'none'; }
    else { moveUp.addEventListener('click', (e) => { e.stopPropagation(); movePinnedOrder(eff.id, -1); }); }
    card.appendChild(moveUp);

    const moveDown = document.createElement('div');
    moveDown.className = 'effect-action-btn btn-move-right';
    moveDown.innerHTML = '▶'; moveDown.title = '向后移动（同区内）';
    if (pinIndex >= pinTotal - 1) { moveDown.style.opacity = '0.3'; moveDown.style.pointerEvents = 'none'; }
    else { moveDown.addEventListener('click', (e) => { e.stopPropagation(); movePinnedOrder(eff.id, 1); }); }
    card.appendChild(moveDown);

    return card;
}

function showEffectContextMenu(e, eff) {
    document.querySelectorAll('.effect-context-menu').forEach(m => m.remove());
    const cat = getEffectCategory(eff);
    const targetCat = cat === 'text' ? 'whole' : 'text';
    const targetLabel = targetCat === 'text' ? '文字特效' : '整层特效';
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(EFFECT_CATEGORY_OVERRIDES_KEY) || '{}'); } catch (err) {}
    const hasOverride = !!overrides[eff.id];
    const menu = document.createElement('div');
    menu.className = 'effect-context-menu';
    menu.style.cssText = 'position:fixed;z-index:99999;background:#161b22;border:1px solid #30363d;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.8);padding:4px 0;min-width:160px;font-size:12px;';
    function addItem(label, onClick, danger) {
        const item = document.createElement('div');
        item.style.cssText = 'padding:6px 14px;cursor:pointer;color:' + (danger ? '#f85149' : '#c9d1d9') + ';';
        item.textContent = label;
        item.addEventListener('mouseenter', () => { item.style.background = '#30363d'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); onClick(); });
        menu.appendChild(item);
    }
    addItem('移到' + targetLabel, () => { moveEffectToCategory(eff.id, targetCat); });
    if (hasOverride) {
        addItem('恢复默认分类', () => {
            restoreEffectCategory(eff.id);
            if (typeof showBgToast === 'function') showBgToast('已恢复默认分类');
        }, true);
    }
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    let x = e.clientX, y = e.clientY;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + rect.width > vw - 8) x = vw - rect.width - 8;
    if (y + rect.height > vh - 8) y = vh - rect.height - 8;
    if (x < 8) x = 8; if (y < 8) y = 8;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    const closeHandler = (ev) => {
        if (menu.contains(ev.target)) return;
        menu.remove();
        document.removeEventListener('mousedown', closeHandler, true);
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler, true), 0);
}

function bindRefreshSemanticsButton() {
    const btn = document.getElementById('btn-refresh-effect-semantics');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
        if (!window.EffectsDB || typeof inferSemantics !== 'function') {
            if (typeof showBgToast === 'function') showBgToast('语义系统未就绪');
            return;
        }
        if (!confirm('将重新推断所有自定义特效的语义标签（family / applyMode / 视觉风格），覆盖已有 semantics。继续？')) return;
        btn.disabled = true;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 刷新中';
        try {
            const list = await EffectsDB.getAllEffects();
            let updated = 0;
            for (const eff of list) {
                if (!eff || !eff.id) continue;
                try {
                    const s = inferSemantics(eff);
                    if (s && s.category) {
                        eff.semantics = s;
                        await EffectsDB.putEffect(eff);
                        updated++;
                    }
                } catch (err) {}
            }
            const list2 = await EffectsDB.getAllEffects();
            window.__effectsCustomListCache = list2;
            if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
            if (typeof showBgToast === 'function') showBgToast('已刷新 ' + updated + ' 个特效的语义标签 ✓');
        } catch (e) {
            if (typeof showBgToast === 'function') showBgToast('刷新失败：' + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = oldHtml;
        }
    });
}

function initEffectsManagerPanel() {
    setTimeout(bindRefreshSemanticsButton, 100);
    const sidebar = document.querySelector('.sidebar-left .panel-section');
    if (!sidebar || document.getElementById('effects-control-panel')) return;
    const panelDiv = document.createElement('div');
    panelDiv.id = 'effects-control-panel';
    panelDiv.className = 'effects-control-panel';
    panelDiv.innerHTML = `
        <div style="display: flex; gap: 4px;">
            <button id="btn-show-format" class="btn" style="flex:1; font-size:10px; justify-content:center;"><i class="fa-solid fa-circle-info"></i> 查看特效格式</button>
            <button id="btn-show-hidden-bin" class="btn" style="flex:1; font-size:10px; justify-content:center;"><i class="fa-solid fa-eye-slash"></i> 已隐藏特效</button>
        </div>
        <textarea id="ce-batch-json" rows="3" placeholder="在此粘贴 JSON 代码批量上传（智能防误覆盖，自动生成新版本）..."></textarea>
        <button id="btn-batch-upload" class="btn btn-primary" style="justify-content:center; font-size:11px; padding:5px;"><i class="fa-solid fa-cloud-arrow-up"></i> 批量上传特效</button>
        <div id="hidden-bin-container" style="display:none;" class="sub-panel-box"></div>
    `;
    sidebar.appendChild(panelDiv);

    document.getElementById('btn-show-format').addEventListener('click', () => { showCopyableFormatModal(); });

    document.getElementById('btn-show-hidden-bin').addEventListener('click', () => {
        const binBox = document.getElementById('hidden-bin-container');
        if (binBox.style.display === 'none') { binBox.style.display = 'block'; renderHiddenBinList(); }
        else { binBox.style.display = 'none'; }
    });

    document.getElementById('btn-batch-upload').addEventListener('click', async () => {
        const rawText = document.getElementById('ce-batch-json').value.trim();
        if (!rawText) { alert('请先粘贴符合格式的 JSON 代码！'); return; }
        const btn = document.getElementById('btn-batch-upload');
        const oldText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 保存中…';
        try {
            const newItems = JSON.parse(rawText);
            if (!Array.isArray(newItems)) throw new Error('导入的数据必须是数组 [...] 格式');
            let customList = window.__effectsCustomListCache || [];
            let countAdded = 0, countRenamed = 0;

            newItems.forEach(item => {
                if (!item.id || !item.name) return;
                // ✅ 新格式：必须二选一
                //    - { params, template }（推荐）
                //    - { css }（兼容，自动迁移成新格式）
                let normalized = { id: item.id, name: item.name, hidden: false, deleted: false };
                if (item.template) {
                    normalized.params = item.params || {};
                    normalized.template = item.template;
                } else if (item.css) {
                    // 自动迁移
                    const migrated = autoExtractParamsFromCss(item.css);
                    normalized.params = migrated.params;
                    normalized.template = migrated.template;
                    normalized.legacyCss = item.css;
                    normalized.migratedFrom = 'v1-upload';
                } else {
                    return; // 两个都没有，跳过
                }
                let existing = customList.find(ex => ex.id === item.id);
                if (existing) {
                    const sameTemplate = (existing.template || existing.css || '').trim() ===
                                        (normalized.template || normalized.css || '').trim();
                    if (sameTemplate) return;
                    let ver = 2;
                    let newId = `${item.id}_v${ver}`;
                    let newName = `${item.name} (v${ver})`;
                    while (customList.some(ex => ex.id === newId)) {
                        ver++; newId = `${item.id}_v${ver}`; newName = `${item.name} (v${ver})`;
                    }
                    normalized.id = newId;
                    normalized.name = newName;
                    customList.push(normalized);
                    countRenamed++;
                } else {
                    customList.push(normalized);
                    countAdded++;
                }
            });

            for (const item of customList) {
                try { await EffectsDB.putEffect(item); } catch (e) { console.error('写入失败', item.id, e); }
            }
            window.__effectsCustomListCache = customList;
            document.getElementById('ce-batch-json').value = '';
            renderEffectsGrid();
            if (document.getElementById('hidden-bin-container').style.display === 'block') renderHiddenBinList();
            alert(`批量上传成功！新增 ${countAdded} 款特效` + (countRenamed > 0 ? `，为 ${countRenamed} 款存在重名但内容不同的特效自动创建了新版本。` : '。'));
        } catch (err) {
            alert('上传失败：' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    });
}

function showCopyableFormatModal() {
    let existingModal = document.getElementById('copyable-format-modal');
    if (existingModal) existingModal.remove();
    const modal = document.createElement('div');
    modal.id = 'copyable-format-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; align-items: center; justify-content: center;';
    const contentBox = document.createElement('div');
    contentBox.style.cssText = 'background: #161b22; border: 1px solid #30363d; border-radius: 8px; width: 560px; max-width:94vw; max-height:90vh; overflow-y:auto; padding: 20px; color: #c9d1d9; box-shadow: 0 8px 24px rgba(0,0,0,0.8); font-size: 12px;';

    const sampleJson = `[
  {
    "id": "my_custom_eff_1",
    "name": "炫彩霓虹",
    "params": {
      "color": { "type": "color", "label": "颜色", "default": "#ff00de" },
      "blur":  { "type": "range", "label": "强度", "min": 1, "max": 40, "default": 5 }
    },
    "template": "color: #fff; text-shadow: 0 0 {blur}px {color}, 0 0 {blur}px {color};"
  }
]`;

    contentBox.innerHTML = `
        <h3 style="margin-bottom: 10px; color: #f1e05a; font-size: 14px;"><i class="fa-solid fa-code"></i> AI 批量生成特效格式（统一参数化）</h3>
        <p style="margin-bottom: 8px; line-height: 1.4; color: #8b949e;">复制下面格式发给 AI，让它按此生成。<b>所有特效都可以有参数，都可以让用户拖滑块调！</b></p>
        <textarea readonly style="width: 100%; height: 160px; background: #0d1117; border: 1px solid #30363d; color: #58a6ff; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; resize: none; outline: none; user-select: text;">${sampleJson}</textarea>
        <div style="margin-top: 10px; font-size: 11px; color: #8b949e; line-height: 1.6;">
            <b>字段说明：</b><br>
            <code style="color:#58a6ff;">id</code> 唯一标识（英文数字下划线）<br>
            <code style="color:#58a6ff;">name</code> 显示名<br>
            <code style="color:#58a6ff;">params</code> 参数声明对象，key 是变量名，值声明 type/min/max/default/label<br>
            <code style="color:#58a6ff;">template</code> CSS 模板字符串，用 <code>{key}</code> 引用 params 里的变量<br>
            渲染时 <code>{blur}</code> 会被自动替换成用户滑块的值
        </div>
        <div style="margin-top:10px;padding:8px;background:#0d1117;border:1px dashed #30363d;border-radius:6px;font-size:11px;line-height:1.6;">
            <b style="color:#7ee787;">兼容说明：</b>如果你上传老格式 <code>{"css":"..."}</code>，系统会自动扫描 CSS 里的颜色和 px 值，智能提取成参数（颜色→色块、px→滑块），让你上传的每一款特效也变可调！
        </div>
        <div style="margin-top: 15px; text-align: right;">
            <button id="btn-close-modal" class="btn btn-primary" style="padding: 4px 14px; font-size: 11px;">关闭窗口</button>
        </div>
    `;
    modal.appendChild(contentBox);
    document.body.appendChild(modal);
    contentBox.querySelector('textarea').select();
    document.getElementById('btn-close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function renderHiddenBinList() {
    const binBox = document.getElementById('hidden-bin-container');
    if (!binBox) return;
    binBox.innerHTML = '';
    let all = getAllEffectsMaster();
    let hiddenItems = all.filter(e => e.hidden);
    if (hiddenItems.length === 0) {
        binBox.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 4px;">当前没有被隐藏的特效</div>';
        return;
    }
    binBox.innerHTML = '<div style="font-weight:bold; margin-bottom:4px; color:#f1e05a;">已隐藏特效列表 (点击恢复显示)：</div>';
    hiddenItems.forEach(eff => {
        const row = document.createElement('div');
        row.className = 'sub-item-row';
        row.innerHTML = `<span>${eff.name} <small style="color:#8b949e;">(${eff.id})</small></span>
            <button class="btn" style="padding: 1px 6px; font-size:10px;"><i class="fa-solid fa-eye"></i> 显示</button>`;
        row.querySelector('button').addEventListener('click', () => {
            toggleEffectHidden(eff.id);
            renderEffectsGrid();
            renderHiddenBinList();
        });
        binBox.appendChild(row);
    });
}

function toggleEffectHidden(id) {
    try {
        let userOverrides = JSON.parse(localStorage.getItem('douyin_effects_states_v3') || '{}');
        if (!userOverrides[id]) userOverrides[id] = {};
        userOverrides[id].hidden = !userOverrides[id].hidden;
        localStorage.setItem('douyin_effects_states_v3', JSON.stringify(userOverrides));
        renderEffectsGrid();
    } catch(e) { console.error(e); }
}

function toggleEffectPinned(id) {
    try {
        let userOverrides = JSON.parse(localStorage.getItem(EFFECT_STATE_KEY) || '{}');
        if (!userOverrides[id]) userOverrides[id] = {};
        const willPin = !userOverrides[id].pinned;
        userOverrides[id].pinned = willPin;
        localStorage.setItem(EFFECT_STATE_KEY, JSON.stringify(userOverrides));
        const all = getAllEffectsMaster();
        const eff = all.find(e => e.id === id);
        if (!eff) { renderEffectsGrid(); return; }
        const cat = getEffectCategory(eff);
        ['text', 'whole'].forEach(c => {
            ['pinned', 'normal'].forEach(area => {
                const ids = getEffectOrder(c, area).filter(x => x !== id);
                saveEffectOrder(c, area, ids);
            });
        });
        if (willPin) {
            const arr = getEffectOrder(cat, 'pinned'); arr.unshift(id);
            saveEffectOrder(cat, 'pinned', arr);
        } else {
            const arr = getEffectOrder(cat, 'normal'); arr.unshift(id);
            saveEffectOrder(cat, 'normal', arr);
        }
        renderEffectsGrid();
    } catch (e) { console.error(e); }
}

function movePinnedOrder(id, direction) {
    try {
        const all = getAllEffectsMaster();
        const eff = all.find(e => e.id === id);
        if (!eff) return;
        const cat = getEffectCategory(eff);
        const states = JSON.parse(localStorage.getItem(EFFECT_STATE_KEY) || '{}');
        const isPinned = !!(states[id] && states[id].pinned);
        const area = isPinned ? 'pinned' : 'normal';
        const visibleInArea = all.filter(e =>
            !e.hidden && getEffectCategory(e) === cat && (!!e.pinned === isPinned)
        );
        const ids = sortByOrder(visibleInArea, cat, area).map(e => e.id);
        const idx = ids.indexOf(id);
        if (idx === -1) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= ids.length) return;
        const temp = ids[idx]; ids[idx] = ids[targetIdx]; ids[targetIdx] = temp;
        saveEffectOrder(cat, area, ids);
        renderEffectsGrid();
    } catch (e) { console.error(e); }
}

function sortByOrder(list, cat, area) {
    const orderIds = getEffectOrder(cat, area);
    const map = new Map(list.map(e => [e.id, e]));
    const sorted = [];
    orderIds.forEach(id => { if (map.has(id)) { sorted.push(map.get(id)); map.delete(id); } });
    list.forEach(eff => { if (map.has(eff.id)) { sorted.push(eff); map.delete(eff.id); } });
    return sorted;
}

function deleteEffect(id, isCustom) {
    if (!confirm('确定要删除这款特效吗？')) return;
    try {
        if (isCustom) {
            if (window.EffectsDB) EffectsDB.deleteEffect(id).catch(() => {});
            if (window.__effectsCustomListCache) {
                window.__effectsCustomListCache = window.__effectsCustomListCache.filter(item => item.id !== id);
            }
            try {
                const raw = localStorage.getItem('douyin_custom_effects_v3');
                if (raw) {
                    let oldList = JSON.parse(raw);
                    oldList = oldList.filter(item => item.id !== id);
                    localStorage.setItem('douyin_custom_effects_v3', JSON.stringify(oldList));
                }
            } catch (e) {}
        } else {
            let userOverrides = JSON.parse(localStorage.getItem('douyin_effects_states_v3') || '{}');
            if (!userOverrides[id]) userOverrides[id] = {};
            userOverrides[id].deleted = true;
            userOverrides[id].pinned = false;
            localStorage.setItem('douyin_effects_states_v3', JSON.stringify(userOverrides));
            let pinnedIds = [];
            try { pinnedIds = JSON.parse(localStorage.getItem('douyin_effects_pinned_order') || '[]'); } catch(e) {}
            pinnedIds = pinnedIds.filter(pid => pid !== id);
            localStorage.setItem('douyin_effects_pinned_order', JSON.stringify(pinnedIds));
        }
        ['text', 'whole'].forEach(c => {
            ['pinned', 'normal'].forEach(area => {
                const ids = getEffectOrder(c, area).filter(x => x !== id);
                saveEffectOrder(c, area, ids);
            });
        });
        renderEffectsGrid();
        const binBox = document.getElementById('hidden-bin-container');
        if (binBox && binBox.style.display === 'block') renderHiddenBinList();
    } catch(e) { console.error(e); }
}