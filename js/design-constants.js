/* ============================================================
   design-constants.js — AI V2 唯一设计常量源
   职责：
     ✅ 画布 / 安全区 / 颜色角色 / 字号令牌 / intensity 预算
     ✅ 19 个 family 的分类、语义意图、兼容矩阵
     ✅ HTML 转义、颜色解析、对比度等纯函数
     ❌ 不读写 state、不操作 DOM、不渲染
   加载顺序：必须早于 ai-v2-brand / ai-v2-layout / ai-v2-schema / ai-v2-validator
   ============================================================ */
(function (w) {
  'use strict';

  var CANVAS = Object.freeze({ width: 360, height: 640, exportScale: 3, exportWidth: 1080, exportHeight: 1920 });
  // 一行正文的高度：默认正文 20px × lineHeight 1.6 ≈ 32px
  // 底部安全区在平台 62px 基础上再向上预留这一行，避免正文压到页码/操作栏
  var CONTENT_LINE_HEIGHT = 32;
  // 与 auto-design-core 的 SAFE 保持同一口径（有单测锁定）
  var SAFE = Object.freeze({
    left: 28, right: 28, top: 46, bottom: 62,
    contentBottom: CANVAS.height - 62 - CONTENT_LINE_HEIGHT
  });

  var COLOR_ROLES = Object.freeze([
    'primary', 'secondary', 'accent', 'background',
    'surface', 'text', 'textInverse', 'border'
  ]);

  var LAYER_TYPES = Object.freeze(['text', 'shape']);
  var LAYER_ROLES = Object.freeze([
    'headline', 'subheadline', 'body', 'keyword',
    'number', 'label', 'source', 'decoration'
  ]);

  // A/B/C 不是靠“换颜色”区分，而是三条固定版式策略
  var LAYOUT_STRATEGIES = Object.freeze(['editorial-center', 'impact-block', 'brand-minimal']);
  var PLAN_STRATEGY = Object.freeze({ A: 'editorial-center', B: 'impact-block', C: 'brand-minimal' });

  // 19 个 family 的四大分类（机制层，不是具体效果名）
  var FAMILY_CATEGORY = Object.freeze({
    stroke: 'glyph', shadow: 'glyph', glow: 'glyph', gradient: 'glyph',
    extrude: 'glyph', texture: 'glyph', distortion: 'glyph', glitch: 'glyph',
    chip: 'container', panel: 'container', backdrop: 'container',
    highlight: 'annotation', underline: 'annotation', circle: 'annotation', callout: 'annotation',
    divider: 'decoration', badge: 'decoration', arrow: 'decoration', geometric: 'decoration'
  });

  var FAMILY_LABELS = Object.freeze({
    stroke: '描边', shadow: '阴影', glow: '发光', gradient: '渐变',
    extrude: '立体', texture: '纹理', distortion: '扭曲', glitch: '故障',
    chip: '标签底', panel: '面板底', backdrop: '自由底衬',
    highlight: '高亮', underline: '下划线', circle: '圈选', callout: '批注',
    divider: '分割线', badge: '徽章', arrow: '箭头', geometric: '几何'
  });

  // 设计意图 → 机制。AI 先选“想表达什么”，再落到 family。
  var FAMILY_INTENTS = Object.freeze({
    stroke: ['legibility', 'impact'], shadow: ['legibility', 'depth'],
    glow: ['energy', 'night'], gradient: ['mood', 'energy'],
    extrude: ['depth', 'impact'], texture: ['material', 'warmth'],
    distortion: ['playfulness', 'handmade'], glitch: ['tech', 'edge'],
    chip: ['hierarchy', 'label'], panel: ['hierarchy', 'surface'], backdrop: ['surface', 'organic'],
    highlight: ['emphasis'], underline: ['emphasis'], circle: ['emphasis'], callout: ['explain'],
    divider: ['structure', 'separate'], badge: ['structure', 'proof'], arrow: ['guide'], geometric: ['balance', 'decorate']
  });

  // 字号令牌：AI 只说 display/h1/h2/body/caption，本地决定 px
  var FONT_TOKENS = Object.freeze({
    display: Object.freeze({ min: 32, max: 60, default: 46 }),
    h1: Object.freeze({ min: 26, max: 46, default: 38 }),
    h2: Object.freeze({ min: 20, max: 30, default: 26 }),
    body: Object.freeze({ min: 15, max: 23, default: 19 }),
    caption: Object.freeze({ min: 10, max: 14, default: 12 })
  });

  // 容器：复用现有文字层 bgColor/bgRadius/bgPadding（.layer-fill）
  var CONTAINER_PRESETS = Object.freeze({
    none: Object.freeze({ radius: 0, padding: 0 }),
    pill: Object.freeze({ radius: 18, padding: 8 }),
    panel: Object.freeze({ radius: 8, padding: 10 }),
    card: Object.freeze({ radius: 12, padding: 12 })
  });
  // 局部强调：复用现有内联 span 渲染
  var ANNOTATION_STYLES = Object.freeze(['color', 'highlight', 'underline']);
  // 装饰：映射到现有 shapeKind
  var DECORATION_PRESETS = Object.freeze({
    divider: Object.freeze({ shapeKind: 'rect' }),
    badge: Object.freeze({ shapeKind: 'rect' }),
    arrow: Object.freeze({ shapeKind: 'triangle' }),
    geometric: Object.freeze({ shapeKind: 'rect' })
  });

  // intensity 是预算，不是“特效数量指标”；0 永远合法
  var BUDGETS = Object.freeze({
    1: Object.freeze({ glyph: 0, container: 0, annotation: 1, decoration: 1, colorRoles: 2, fontSizes: 2, maxEffectsPerLayer: 0 }),
    2: Object.freeze({ glyph: 1, container: 0, annotation: 1, decoration: 1, colorRoles: 3, fontSizes: 3, maxEffectsPerLayer: 1 }),
    3: Object.freeze({ glyph: 1, container: 1, annotation: 2, decoration: 2, colorRoles: 4, fontSizes: 3, maxEffectsPerLayer: 1 }),
    4: Object.freeze({ glyph: 2, container: 1, annotation: 2, decoration: 2, colorRoles: 4, fontSizes: 4, maxEffectsPerLayer: 2 }),
    5: Object.freeze({ glyph: 2, container: 1, annotation: 3, decoration: 3, colorRoles: 4, fontSizes: 4, maxEffectsPerLayer: 2 })
  });

  // 兼容矩阵：只写“明确禁止”，未列出的组合默认允许；同 family 一律禁止。
  var COMPATIBILITY = Object.freeze({
    stroke: Object.freeze({ forbiddenWith: ['glitch', 'texture', 'distortion'] }),
    shadow: Object.freeze({ forbiddenWith: ['glitch'] }),
    glow: Object.freeze({ forbiddenWith: ['glitch', 'texture'] }),
    gradient: Object.freeze({ forbiddenWith: ['glitch', 'texture'] }),
    extrude: Object.freeze({ forbiddenWith: ['stroke', 'glow', 'gradient', 'glitch', 'texture', 'distortion'] }),
    texture: Object.freeze({ forbiddenWith: ['stroke', 'glow', 'gradient', 'glitch', 'extrude', 'distortion'] }),
    distortion: Object.freeze({ forbiddenWith: ['stroke', 'shadow', 'glow', 'gradient', 'extrude', 'texture', 'glitch'] }),
    glitch: Object.freeze({ forbiddenWith: ['stroke', 'shadow', 'glow', 'gradient', 'extrude', 'texture', 'distortion'] })
  });

  // 同一视觉通道不可重复：两个容器、两个阴影都算通道冲突
  var FAMILY_CHANNEL = Object.freeze({
    shadow: 'shadow', gradient: 'gradient',
    chip: 'container', panel: 'container', backdrop: 'container',
    highlight: 'annotation-bg', underline: 'underline', circle: 'circle'
  });

  var EFFECT_STATUS = Object.freeze(['renderable', 'defined-only', 'deprecated']);
  var MAX_PAGES = 8;
  var MAX_LAYERS_PER_PAGE = 40;
  var MAX_TEXT_LENGTH = 1200;


  function isHex(v) { return /^#[0-9A-F]{6}$/.test(String(v || '').toUpperCase()); }
  function normHex(v) { return isHex(v) ? String(v).toUpperCase() : null; }
  function hexToRgb(h) {
    var c = normHex(h);
    if (!c) return null;
    var n = parseInt(c.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function luminance(h) {
    var c = hexToRgb(h);
    if (!c) return 0;
    return [c.r, c.g, c.b].map(function (v) {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }).reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function unescapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }
  function hasHtmlTag(s) {
    var t = String(s == null ? '' : s);
    return /<[a-z][^>]*>/i.test(t) || /\son\w+\s*=/i.test(t);
  }
  function normalizeForCompare(s) {
    return unescapeHtml(String(s == null ? '' : s))
      .replace(/<[^>]*>/g, '')
      .replace(/[\s\u3000]/g, '')
      .replace(/[。，、．,.！？!?：:；;…“”‘’"'（）()《》〈〉【】\[\]—–\-·~～]/g, '');
  }
  function splitSentences(text) {
    return String(text == null ? '' : text)
      .split(/[。！？!?；;\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  /** 兼容扁平色板、{roles:{}}、AIV2Brand snapshot 三种输入 */
  function resolveColorRole(palette, role) {
    if (!palette || COLOR_ROLES.indexOf(role) < 0) return null;
    var source = palette.roles || palette.palette || palette;
    var v = source ? source[role] : null;
    if (v == null && palette.colors && palette.colors[role] != null) v = palette.colors[role];
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v === 'object') v = v.hex || v.color || v.value;
    return isHex(v) ? normHex(v) : null;
  }

  function resolveFontToken(token, fallback) {
    var def = FONT_TOKENS[token];
    if (!def) return Number.isFinite(Number(fallback)) ? Number(fallback) : 19;
    var n = Number(fallback);
    return Number.isFinite(n) ? Math.max(def.min, Math.min(def.max, n)) : def.default;
  }

  function budgetFor(intensity) {
    var n = Math.round(Number(intensity));
    return BUDGETS[n] || BUDGETS[3];
  }
  function familyCategory(family) { return FAMILY_CATEGORY[family] || 'unknown'; }

  /** 同层组合规则：同 family 禁止；明确 forbidden 禁止；同通道禁止 */
  function canCombineFamilies(a, b) {
    if (!a || !b) return true;
    if (a === b) return false;
    var A = COMPATIBILITY[a] || {};
    var B = COMPATIBILITY[b] || {};
    if ((A.forbiddenWith || []).indexOf(b) >= 0) return false;
    if ((B.forbiddenWith || []).indexOf(a) >= 0) return false;
    if (FAMILY_CHANNEL[a] && FAMILY_CHANNEL[a] === FAMILY_CHANNEL[b]) return false;
    return true;
  }

  w.DesignConstants = Object.freeze({
    CANVAS: CANVAS,
    SAFE: SAFE,
    CONTENT_LINE_HEIGHT: CONTENT_LINE_HEIGHT,
    COLOR_ROLES: COLOR_ROLES,
    LAYER_TYPES: LAYER_TYPES,
    LAYER_ROLES: LAYER_ROLES,
    LAYOUT_STRATEGIES: LAYOUT_STRATEGIES,
    PLAN_STRATEGY: PLAN_STRATEGY,
    FAMILY_CATEGORY: FAMILY_CATEGORY,
    FAMILY_LABELS: FAMILY_LABELS,
    FAMILY_INTENTS: FAMILY_INTENTS,
    FONT_TOKENS: FONT_TOKENS,
    CONTAINER_PRESETS: CONTAINER_PRESETS,
    ANNOTATION_STYLES: ANNOTATION_STYLES,
    DECORATION_PRESETS: DECORATION_PRESETS,
    BUDGETS: BUDGETS,
    COMPATIBILITY: COMPATIBILITY,
    FAMILY_CHANNEL: FAMILY_CHANNEL,
    EFFECT_STATUS: EFFECT_STATUS,
    MAX_PAGES: MAX_PAGES,
    MAX_LAYERS_PER_PAGE: MAX_LAYERS_PER_PAGE,
    MAX_TEXT_LENGTH: MAX_TEXT_LENGTH,

    isHex: isHex, normHex: normHex, hexToRgb: hexToRgb,
    luminance: luminance, contrast: contrast,
    escapeHtml: escapeHtml, unescapeHtml: unescapeHtml,
    hasHtmlTag: hasHtmlTag, normalizeForCompare: normalizeForCompare,
    splitSentences: splitSentences, resolveColorRole: resolveColorRole,
    resolveFontToken: resolveFontToken, budgetFor: budgetFor,
    familyCategory: familyCategory, canCombineFamilies: canCombineFamilies
  });
})(window);
