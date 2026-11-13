/* douyin-ai-design 2.0 contract constants and executable example.
 * 依赖：design-constants.js（更早加载）
 * 示例中的 A/B/C 都是完整页面，可直接喂给 AiV2Validator。
 */
(function (w) {
  'use strict';
  var DC = w.DesignConstants || {};
  var CANVAS = DC.CANVAS || { width: 360, height: 640, exportScale: 3, exportWidth: 1080, exportHeight: 1920 };
  var SAFE = DC.SAFE || { left: 28, right: 28, top: 46, bottom: 62 };
  var COLOR_ROLES = DC.COLOR_ROLES || ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'textInverse', 'border'];
  var LAYER_ROLES = DC.LAYER_ROLES || ['headline', 'subheadline', 'body', 'keyword', 'number', 'label', 'source', 'decoration'];
  var LAYER_TYPES = DC.LAYER_TYPES || ['text', 'shape'];
  var LAYOUT_STRATEGIES = DC.LAYOUT_STRATEGIES || ['editorial-center', 'impact-block', 'brand-minimal'];
  var BUDGETS = DC.BUDGETS || {};
  var FONT_TOKENS = DC.FONT_TOKENS || {};
  var FAMILY_CATEGORY = DC.FAMILY_CATEGORY || {};

  function text(id, role, content, o) {
    o = o || {};
    return {
      id: id,
      type: 'text',
      role: role,
      content: content,
      geometry: { x: o.x || 28, y: o.y || 140, width: o.width || 304, height: o.height || 120, rotation: 0 },
      style: {
        sizeToken: o.sizeToken || 'body',
        fontSize: o.fontSize || 19,
        fontFamily: o.fontFamily || 'sans-serif',
        fontWeight: o.bold === false ? 400 : 700,
        bold: o.bold !== false,
        italic: false,
        lineHeight: o.lineHeight || 1.4,
        letterSpacing: o.letterSpacing || 0,
        align: o.align || 'left',
        colorRole: o.colorRole || 'text',
        opacity: o.opacity == null ? 1 : o.opacity,
        container: o.container || undefined,
        emphasis: o.emphasis || undefined
      },
      effects: o.effects || [],
      order: o.order || 10,
      visible: true
    };
  }

  function shape(id, role, o) {
    o = o || {};
    return {
      id: id,
      type: 'shape',
      role: role,
      geometry: { x: o.x || 28, y: o.y || 260, width: o.width || 304, height: o.height || 2, rotation: 0 },
      style: {
        shapeKind: o.shapeKind || 'rect',
        fillRole: o.fillRole || 'accent',
        strokeRole: o.strokeRole || null,
        strokeWidth: o.strokeWidth || 0,
        cornerRadius: o.cornerRadius || 0,
        opacity: o.opacity == null ? 1 : o.opacity,
        decorationPreset: o.decorationPreset || undefined
      },
      effects: [],
      order: o.order || 20,
      visible: true
    };
  }

  function plan(id, name, description, layers) {
    return {
      id: id,
      name: name,
      description: description,
      strategy: (DC.PLAN_STRATEGY && DC.PLAN_STRATEGY[id]) || 'editorial-center',
      canvas: { width: CANVAS.width, height: CANVAS.height, backgroundRole: 'background' },
      pages: [{
        id: id + '-1',
        title: '第 1 页',
        backgroundRole: 'background',
        layers: layers
      }]
    };
  }

  var EXAMPLE = {
    format: 'douyin-ai-design',
    version: '2.0',
    requestId: 'req-001',
    analysis: {
      topic: '幼儿自主性教育',
      intent: '引发家长反思',
      audience: '家长',
      tone: ['温暖', '专业', '有观点'],
      emotion: '克制',
      intensity: 3,
      keywords: ['打断', '自主性', '成长'],
      visualDirection: '温暖、克制、有力量',
      contentLength: 'medium',
      contentStructure: '观点表达'
    },
    brand: { brandId: 'brand_001' },
    plans: [
      plan('A', '语义匹配', '居中编辑感：标题即观点，双色细线收口', [
        text('A-title', 'headline', '不要总是打断孩子的行动', {
          y: 140, height: 120, sizeToken: 'display', fontSize: 46,
          align: 'center', bold: true, lineHeight: 1.18, order: 10,
          container: { preset: 'pill', fillRole: 'surface' },
          effects: [{ category: 'glyph', family: 'shadow', presetId: 'effect-soft-shadow', params: { strength: 'md' } }]
        }),
        shape('A-rule', 'decoration', { x: 150, y: 272, width: 60, height: 2, fillRole: 'accent', decorationPreset: 'divider', order: 20 }),
        text('A-body', 'body', '我们总怕孩子弄脏、弄乱、弄坏，却在一次次“别动”中，夺走了孩子自己动手的机会。', {
          y: 292, height: 220, sizeToken: 'body', fontSize: 19,
          align: 'center', bold: false, lineHeight: 1.62, order: 30,
          emphasis: [{ start: 0, end: 2, colorRole: 'accent', style: 'color' }]
        })
      ]),
      plan('B', '视觉冲击', '左对齐巨字：品牌色块承载标题，关键词胶囊', [
        shape('B-block', 'decoration', { x: 22, y: 128, width: 316, height: 214, fillRole: 'primary', cornerRadius: 8, decorationPreset: 'geometric', order: 5 }),
        text('B-title', 'headline', '不要总是打断孩子的行动', {
          x: 40, y: 146, width: 280, height: 178, sizeToken: 'display', fontSize: 54,
          align: 'left', bold: true, lineHeight: 1.12, colorRole: 'textInverse', order: 10,
          effects: [{ category: 'glyph', family: 'gradient', presetId: 'effect-gradient', params: { strength: 'md' } }]
        }),
        text('B-body', 'body', '别动，弄脏了！别动，一会儿碗打碎了！\n成长，始于放手。', {
          x: 40, y: 368, width: 292, height: 180, sizeToken: 'body', fontSize: 20,
          align: 'left', bold: false, lineHeight: 1.66, order: 20
        })
      ]),
      plan('C', '品牌高级感', '顶对齐大留白：发丝线分隔，低干扰', [
        text('C-title', 'headline', '不要总是打断孩子的行动', {
          y: 112, height: 100, sizeToken: 'h1', fontSize: 38,
          align: 'left', bold: true, lineHeight: 1.34, order: 10
        }),
        shape('C-hairline', 'decoration', { x: 28, y: 228, width: 304, height: 1, fillRole: 'text', opacity: 0.18, decorationPreset: 'divider', order: 20 }),
        text('C-body', 'body', '成长，始于放手。', {
          y: 250, height: 120, sizeToken: 'body', fontSize: 19,
          align: 'left', bold: false, lineHeight: 1.86, opacity: 0.78, order: 30
        })
      ])
    ],
    constraints: {
      safeArea: { left: SAFE.left, right: SAFE.right, top: SAFE.top, bottom: SAFE.bottom },
      maxPages: 8,
      budgets: BUDGETS[3] || { glyph: 1, container: 1, annotation: 2, decoration: 2, colorRoles: 4, fontSizes: 3, maxEffectsPerLayer: 1 },
      maxEffectsPerLayer: 1,
      preserveOriginalText: true,
      allowHtml: false,
      checkContrast: true
    }
  };

  w.AiV2Schema = Object.freeze({
    FORMAT: 'douyin-ai-design',
    VERSION: '2.0',
    CANVAS: CANVAS,
    SAFE: SAFE,
    COLOR_ROLES: COLOR_ROLES,
    LAYER_ROLES: LAYER_ROLES,
    LAYER_TYPES: LAYER_TYPES,
    LAYOUT_STRATEGIES: LAYOUT_STRATEGIES,
    BUDGETS: BUDGETS,
    FONT_TOKENS: FONT_TOKENS,
    FAMILY_CATEGORY: FAMILY_CATEGORY,
    EXAMPLE: EXAMPLE
  });
})(window);
