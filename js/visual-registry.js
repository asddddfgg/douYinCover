/* ============================================================
   visual-registry.js — 视觉机制注册表（AI V2）
   规则：
     ✅ 优先读取 effect.meta（显式声明），不再只靠名字/正则猜 family
     ✅ 输出 status：renderable / defined-only / deprecated
     ✅ 只有 renderable 的 preset 才允许 AI 选择
     ✅ 兼容矩阵 / 语义标签 / 渲染成本都来自 design-constants.js
   依赖：design-constants.js
   ============================================================ */
(function (w) {
  'use strict';
  var DC = w.DesignConstants || {};

  // 19 个核心 family；[分类, 中文说明]
  var F = {
    stroke: ['glyph', '描边字形'], shadow: ['glyph', '阴影字形'], glow: ['glyph', '发光字形'], gradient: ['glyph', '渐变字形'],
    extrude: ['glyph', '立体挤出'], texture: ['glyph', '纹理字形'], distortion: ['glyph', '扭曲字形'], glitch: ['glyph', '故障字形'],
    chip: ['container', '标签容器'], panel: ['container', '面板容器'], backdrop: ['container', '文字底衬'],
    highlight: ['annotation', '局部高亮'], underline: ['annotation', '局部下划线'], circle: ['annotation', '圈注'], callout: ['annotation', '批注气泡'],
    divider: ['decoration', '分隔线'], badge: ['decoration', '徽章'], arrow: ['decoration', '箭头'], geometric: ['decoration', '几何装饰']
  };

  function inferFamily(e) {
    var s = e.semantics || e.semantic || {};
    var t = [s.family, e.family, e.id, e.name, e.template, e.css].join(' ').toLowerCase();
    if (/gradient|渐变/.test(t)) return 'gradient';
    if (/glow|neon|发光|霓虹/.test(t)) return 'glow';
    if (/extrude|3d|立体/.test(t)) return 'extrude';
    if (/texture|paper|chalk|纹理|粉笔/.test(t)) return 'texture';
    if (/glitch|故障/.test(t)) return 'glitch';
    if (/distort|warp|扭曲/.test(t)) return 'distortion';
    if (/shadow|阴影/.test(t)) return 'shadow';
    if (/stroke|outline|描边/.test(t)) return 'stroke';
    if (/highlight|marker|高亮/.test(t)) return 'highlight';
    if (/underline|下划线/.test(t)) return 'underline';
    if (/backdrop|底衬/.test(t)) return 'backdrop';
    if (/panel|面板/.test(t)) return 'panel';
    if (/chip|标签/.test(t)) return 'chip';
    return 'shadow';
  }

  function metaOf(e) {
    var extra = (w.EffectSemantics && w.EffectSemantics.getMeta) ? w.EffectSemantics.getMeta(e.id) : null;
    return Object.assign({}, extra || {}, (e && e.meta) || {});
  }
  function familyOf(e) {
    var m = metaOf(e);
    return m.family || e.family || inferFamily(e);
  }
  function categoryOf(family) {
    return (DC.FAMILY_CATEGORY && DC.FAMILY_CATEGORY[family]) || (F[family] && F[family][0]) || 'glyph';
  }
  function statusOf(e, css) {
    var m = metaOf(e);
    if (m.status) return m.status;
    if (e.renderable === false) return 'defined-only';
    return css ? 'renderable' : 'defined-only';
  }
  function paramsOf(e) {
    var m = metaOf(e);
    var defs = m.params || e.params || {};
    var out = {};
    Object.keys(defs).forEach(function (k) {
      var d = defs[k] || {};
      if (d.type === 'token') {
        out[k] = { type: 'token', values: (d.values || []).slice(), default: d.default };
      } else if (d.type === 'colorRole') {
        out[k] = { type: 'colorRole', default: d.default || 'accent' };
      } else if (d.type === 'number' || typeof d.default === 'number') {
        out[k] = {
          type: 'number',
          default: d.default,
          min: Number.isFinite(d.min) ? d.min : undefined,
          max: Number.isFinite(d.max) ? d.max : undefined
        };
      } else if (d.type === 'boolean' || typeof d.default === 'boolean') {
        out[k] = { type: 'boolean', default: !!d.default };
      } else {
        out[k] = { type: d.type || 'string', default: d.default };
      }
    });
    return out;
  }

  function compatibilityOf(family) {
    var c = DC.COMPATIBILITY && DC.COMPATIBILITY[family];
    return c ? { forbiddenWith: (c.forbiddenWith || []).slice() } : {};
  }
  function semanticTagsOf(family) {
    var t = DC.FAMILY_INTENTS && DC.FAMILY_INTENTS[family];
    return t ? t.slice() : [];
  }

  function snapshot() {
    var all = [];
    try { all = w.getAllEffectsMaster ? w.getAllEffectsMaster() : []; } catch (e) { all = []; }
    var presets = [];
    (all || []).forEach(function (e) {
      if (!e || !e.id) return;
      var css = '';
      try { if (typeof w.renderEffectCss === 'function') css = w.renderEffectCss(e.id, {}); } catch (x) { css = ''; }
      var meta = metaOf(e);
      // 没有渲染能力、也没有显式元数据的，不进注册表
      if (!css && !meta.family && !meta.status) return;
      var family = familyOf(e);
      var status = statusOf(e, css);
      presets.push({
        id: e.id,
        preset: meta.preset || e.preset || e.id,
        name: e.name || e.id,
        family: family,
        category: meta.category || categoryOf(family),
        group: (F[family] && F[family][0]) || 'glyph',
        status: status,
        renderable: status === 'renderable',
        custom: !!e.isCustom,
        params: paramsOf(e),
        compatibility: meta.compatibility || compatibilityOf(family),
        semanticTags: meta.semanticTags || semanticTagsOf(family),
        renderCost: Number.isFinite(meta.renderCost) ? meta.renderCost : 1,
        brandSafe: meta.brandSafe !== false
      });
    });

    var families = Object.keys(F).map(function (id) {
      var list = presets.filter(function (p) { return p.family === id; });
      var status = list.some(function (p) { return p.status === 'renderable'; }) ? 'available'
        : (list.length ? 'defined-only' : 'unavailable');
      return {
        id: id,
        category: categoryOf(id),
        label: (DC.FAMILY_LABELS && DC.FAMILY_LABELS[id]) || F[id][1],
        status: status,
        presetCount: list.length
      };
    });

    return {
      version: '2.0.0',
      source: 'runtime-effects-library',
      families: families,
      presets: presets,
      familyCategory: DC.FAMILY_CATEGORY || {},
      familyIntents: DC.FAMILY_INTENTS || {}
    };
  }

  function getPreset(id) {
    return snapshot().presets.filter(function (p) { return p.id === id; })[0] || null;
  }
  function getRenderablePresets(family) {
    return snapshot().presets.filter(function (p) {
      return p.status === 'renderable' && (!family || p.family === family);
    });
  }

  w.VisualRegistry = Object.freeze({
    familyDefinitions: F,
    getSnapshot: snapshot,
    getPreset: getPreset,
    getRenderablePresets: getRenderablePresets,
    inferFamily: inferFamily
  });
})(window);
