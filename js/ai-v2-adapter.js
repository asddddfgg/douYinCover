/* ============================================================
   ai-v2-adapter.js — 新版 JSON → 现有 AppState 图层
   安全默认：
     ✅ 默认 append（保留原页面），replace 必须显式传 mode:'replace'
     ✅ 用户文案 / 页面标题统一 HTML 转义（画布用 innerHTML）
     ✅ 颜色只从品牌角色解析，缺角色直接报错，不发明颜色
     ✅ 应用前快照；失败恢复 pages/background/选中态/历史栈
     ✅ 成功后只 saveState() 一次 → 一次撤销即可回到应用前
     ✅ 应用前先跑 AiV2Layout 预检（自动降字号 + 夹回安全区）
   依赖：design-constants.js / ai-v2-validator.js / ai-v2-layout.js
   ============================================================ */
(function (w) {
  'use strict';
  var DC = w.DesignConstants || {};
  var esc = DC.escapeHtml || function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  var runSeq = 0;

  function clone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; }
  }
  function num(v, d) { return Number.isFinite(Number(v)) ? Number(v) : d; }
  function px(v) { return Math.round(num(v, 0)); }
  function safeId(s) { return String(s || 'x').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40); }
  function makeRunId() {
    runSeq++;
    return Date.now().toString(36) + '-' + runSeq;
  }

  function flattenPalette(input) {
    if (!input) return null;
    var out = {};
    (DC.COLOR_ROLES || []).forEach(function (r) {
      var v = DC.resolveColorRole ? DC.resolveColorRole(input, r) : null;
      if (v) out[r] = v;
    });
    return Object.keys(out).length ? out : null;
  }
  function requiredColor(palette, role, where) {
    var v = palette && palette[role];
    if (!v) {
      var e = new Error('品牌色板缺少颜色角色「' + role + '」（' + where + '）');
      e.code = 'E_V2_PALETTE';
      e.missingRole = role;
      throw e;
    }
    return v;
  }

  function pageBackground(plan, page) {
    var bg = (page && page.background) || (plan && plan.canvas && plan.canvas.background);
    return bg && typeof bg === 'object' ? clone(bg) : null;
  }

  function annotationStyle(style, hex) {
    if (style === 'highlight') return 'background-color:' + hex + ';border-radius:2px';
    if (style === 'underline') return 'border-bottom:2px solid ' + hex;
    return 'color:' + hex;
  }

  /** 区间强调：start/end 是 Unicode 码点（左闭右开），逐码点转义后包 span */
  function applyEmphasis(raw, emphasis, palette, where) {
    var cps = Array.from(String(raw == null ? '' : raw));
    if (!Array.isArray(emphasis) || !emphasis.length) return esc(cps.join(''));
    var ranges = emphasis.filter(function (e) {
      return e && Number.isInteger(e.start) && Number.isInteger(e.end) && e.end > e.start;
    }).slice().sort(function (a, b) { return a.start - b.start; });
    if (!ranges.length) return esc(cps.join(''));
    var out = '', ri = 0;
    for (var i = 0; i < cps.length; i++) {
      while (ri < ranges.length && i >= ranges[ri].end) ri++;
      if (ri < ranges.length && i === ranges[ri].start) {
        var hex = requiredColor(palette, ranges[ri].colorRole || 'accent', where + '.emphasis');
        out += '<span style="' + annotationStyle(ranges[ri].style, hex) + '">';
      }
      out += esc(cps[i]);
      if (ri < ranges.length && i + 1 === ranges[ri].end) out += '</span>';
    }
    return out;
  }

  function textLayer(layer, palette, id, index) {
    var g = layer.geometry || {};
    var s = layer.style || {};
    var effects = Array.isArray(layer.effects) ? layer.effects : [];
    var ids = [], params = {};
    var palList = Object.keys(palette || {}).map(function (k) { return palette[k]; });
    effects.forEach(function (f) {
      if (!f || !f.presetId) return;
      var resolved = f.params || {};
      if (w.EffectBrandGuard && typeof w.EffectBrandGuard.auditEffect === 'function') {
        var audit = w.EffectBrandGuard.auditEffect(f.presetId, resolved, palList);
        // 硬编码非品牌色（如 effect-viral 的红光）：防御性跳过，不让它污染成品
        if (!audit.ok) return;
        resolved = audit.resolved;
      }
      if (ids.indexOf(f.presetId) < 0) ids.push(f.presetId);
      params[f.presetId] = resolved;
    });
    var fontSize = num(s.fontSize, DC.resolveFontToken ? DC.resolveFontToken(s.sizeToken, 19) : 19);
    var bold = s.bold === true || num(s.fontWeight, 0) >= 600;
    var bgColor = 'transparent', bgRadius = 6, bgPadding = 6;
    if (s.container && s.container.preset && s.container.preset !== 'none') {
      var cdef = (DC.CONTAINER_PRESETS || {})[s.container.preset] || { radius: 8, padding: 8 };
      bgColor = requiredColor(palette, s.container.fillRole || 'accent', id + '.container');
      bgRadius = num(s.container.radius, cdef.radius);
      bgPadding = num(s.container.padding, cdef.padding);
    }
    return {
      id: id,
      type: 'text',
      content: applyEmphasis(layer.content || '', s.emphasis, palette, id),
      fontSize: (Math.round(fontSize * 10) / 10) + 'px',
      fontFamily: s.fontFamily || 'sans-serif',
      color: requiredColor(palette, s.colorRole || 'text', id),
      bgColor: bgColor,
      bgRadius: bgRadius,
      bgPadding: bgPadding,
      bold: bold,
      italic: !!s.italic,
      underline: false,
      strike: false,
      align: s.align || 'left',
      vertical: false,
      letterSpacing: num(s.letterSpacing, 0) ? (num(s.letterSpacing, 0) + 'px') : 0,
      lineHeight: num(s.lineHeight, 1.2),
      opacity: num(s.opacity, 1),
      effectClass: ids[0] || '',
      effectClasses: ids,
      effectParams: params,
      x: px(g.x),
      y: px(g.y),
      width: px(g.width),
      height: px(g.height),
      heightMode: 'auto',
      rotation: num(g.rotation, 0),
      flipH: false, flipV: false,
      locked: false, groupId: null,
      _aiRole: layer.role || 'body',
      _aiOrder: num(layer.order, index),
      _role: (layer.role === 'headline' || layer.role === 'subheadline') ? 'title'
        : (layer.role === 'body' ? 'body' : (layer.role || 'body'))
    };
  }

  function shapeLayer(layer, palette, id, index) {
    var g = layer.geometry || {};
    var s = layer.style || {};
    var deco = s.decorationPreset;
    var decoDef = deco ? ((DC.DECORATION_PRESETS || {})[deco] || null) : null;
    return {
      id: id,
      type: 'shape',
      shapeKind: s.shapeKind || (decoDef && decoDef.shapeKind) || 'rect',
      fill: requiredColor(palette, s.fillRole || 'accent', id),
      stroke: s.strokeRole ? requiredColor(palette, s.strokeRole, id) : 'transparent',
      strokeWidth: num(s.strokeWidth, 0),
      cornerRadius: num(s.cornerRadius, 0),
      x: px(g.x),
      y: px(g.y),
      width: px(g.width),
      height: px(g.height),
      rotation: num(g.rotation, 0),
      opacity: num(s.opacity, 1),
      arrowHead: 'none',
      flipH: false, flipV: false,
      locked: false, groupId: null,
      _aiRole: layer.role || 'decoration',
      _aiOrder: num(layer.order, index),
      _decorationPreset: deco || null,
      _role: layer.role || 'decoration'
    };
  }


  function snapshotState(st) {
    return {
      pages: clone(st.pages || []),
      background: clone(st.background || null),
      currentPageId: st.currentPageId,
      selectedLayerId: st.selectedLayerId,
      selectedLayerIds: (st.selectedLayerIds || []).slice(),
      editingLayerId: st.editingLayerId,
      history: st.history ? { stack: st.history.stack.slice(), pointer: st.history.pointer } : null
    };
  }

  function restoreState(st, snap) {
    if (!snap) return;
    st.pages = snap.pages;
    st.background = snap.background;
    st.currentPageId = snap.currentPageId;
    st.selectedLayerId = snap.selectedLayerId;
    st.selectedLayerIds = snap.selectedLayerIds;
    st.editingLayerId = snap.editingLayerId;
    if (snap.history && st.history) {
      st.history.stack = snap.history.stack;
      st.history.pointer = snap.history.pointer;
    }
  }

  function renderAllSafe() {
    if (typeof w.renderAll === 'function') { w.renderAll(); return; }
    if (typeof w.renderCanvas === 'function') w.renderCanvas();
    if (typeof w.renderPageList === 'function') w.renderPageList();
  }

  /**
   * 应用一个 V2 方案
   * @param {object} spec 完整 V2 JSON
   * @param {'A'|'B'|'C'} planId
   * @param {{mode?:'append'|'replace', palette?:object, original?:string,
   *          fonts?:string[], layout?:boolean, runId?:string,
   *          validation?:object}} [options]
   */
  function apply(spec, planId, options) {
    options = options || {};
    var st = w.state;
    if (!st || !Array.isArray(st.pages)) {
      var e0 = new Error('AppState 尚未初始化');
      e0.code = 'E_V2_STATE';
      throw e0;
    }
    if (!w.AiV2Validator || typeof w.AiV2Validator.validate !== 'function') {
      var e1 = new Error('AiV2Validator 未加载');
      e1.code = 'E_V2_DEPENDENCY';
      throw e1;
    }

    var palette = flattenPalette(options.palette);
    if (!palette && w.AIV2Brand && typeof w.AIV2Brand.getSnapshot === 'function') {
      palette = flattenPalette(w.AIV2Brand.getSnapshot());
    }
    if (!palette) {
      var e2 = new Error('缺少品牌色板：请传入 AIV2Brand.getSnapshot().palette 或扁平角色对象');
      e2.code = 'E_V2_PALETTE';
      throw e2;
    }

    var validationOptions = Object.assign({}, options.validation || {});
    validationOptions.palette = palette;
    if (validationOptions.checkSafeArea === undefined) validationOptions.checkSafeArea = false;
    if (options.original) validationOptions.original = options.original;
    if (options.fonts) validationOptions.fonts = options.fonts;

    var checked = w.AiV2Validator.validate(spec, validationOptions);
    if (!checked.ok) {
      var e3 = new Error('AI JSON 校验失败');
      e3.code = 'E_V2_VALIDATION';
      e3.validationErrors = checked.errors;
      throw e3;
    }
    var plan = checked.spec.plans.filter(function (p) { return p.id === planId; })[0];
    if (!plan) {
      var e4 = new Error('找不到方案 ' + planId);
      e4.code = 'E_V2_PLAN';
      throw e4;
    }

    var layout = { plan: plan, report: { issues: [], adjusted: 0 } };
    if (options.layout !== false && w.AIV2Layout && typeof w.AIV2Layout.layoutPlan === 'function') {
      layout = w.AIV2Layout.layoutPlan(plan, checked.spec.constraints);
    }
    var overflow = (layout.report.issues || []).filter(function (i) {
      return i.code === 'TEXT_OVERFLOW_UNRESOLVED';
    });
    if (overflow.length) {
      var e5 = new Error('排版预检失败：有文字降到字号下限仍放不下');
      e5.code = 'E_V2_LAYOUT';
      e5.layoutIssues = overflow;
      throw e5;
    }

    var newPages = pagesFor(layout.plan, palette, { runId: options.runId });
    if (!newPages.length) {
      var e6 = new Error('方案没有可渲染页面');
      e6.code = 'E_V2_EMPTY';
      throw e6;
    }
    var mode = options.mode === 'replace' ? 'replace' : 'append';
    var snap = snapshotState(st);

    try {
      st.pages = mode === 'replace' ? newPages : (st.pages || []).concat(newPages);
      st.currentPageId = newPages[0].id;
      // 应用后不预选图层：先给用户一个干净的成品视图
      st.selectedLayerId = null;
      st.selectedLayerIds = [];
      st.editingLayerId = null;
      if (typeof st.saveState === 'function') st.saveState();
      renderAllSafe();
      return {
        ok: true,
        planId: planId,
        mode: mode,
        pageCount: newPages.length,
        layerCount: newPages.reduce(function (n, p) { return n + p.layers.length; }, 0),
        totalPages: (st.pages || []).length,
        addedPageIds: newPages.map(function (p) { return p.id; }),
        undoSteps: 1,
        layoutIssues: layout.report.issues || [],
        adjusted: layout.report.adjusted || 0
      };
    } catch (err) {
      restoreState(st, snap);
      try { renderAllSafe(); } catch (e2) { }
      if (!err.code) err.code = 'E_V2_APPLY';
      throw err;
    }
  }

  w.AiV2Adapter = Object.freeze({
    apply: apply,
    toAppPages: pagesFor,
    flattenPalette: flattenPalette
  });

  /**
   * plan → AppState pages（不读写 state，便于单测）
   * @param {object} plan V2 plan
   * @param {object} palette 扁平颜色角色或 AIV2Brand snapshot
   * @param {{runId?:string, mode?:string}} [options]
   */
  function pagesFor(plan, palette, options) {
    options = options || {};
    var pal = flattenPalette(palette);
    if (!pal) {
      var e = new Error('缺少品牌色板：请传入 AIV2Brand.getSnapshot().palette 或扁平角色对象');
      e.code = 'E_V2_PALETTE';
      throw e;
    }
    var runId = options.runId || makeRunId();
    var planId = safeId(plan && plan.id);
    var outPages = (plan.pages || []).map(function (page, pi) {
      var pageId = 'ai-' + planId + '-' + runId + '-p' + (pi + 1);
      var bg = pageBackground(plan, page);
      var layers = (page.layers || []).filter(function (l) { return l && l.visible !== false; })
        .map(function (layer, li) {
          var layerId = 'ai-' + planId + '-' + runId + '-p' + (pi + 1) + '-l' + (li + 1) + '-' + safeId(layer.id);
          return layer.type === 'shape'
            ? shapeLayer(layer, pal, layerId, li)
            : textLayer(layer, pal, layerId, li);
        })
        .sort(function (a, b) { return a._aiOrder - b._aiOrder; })
        .map(function (l, i) { l._aiOrder = i; return l; });
      var out = {
        id: pageId,
        title: esc(page.title || ('第 ' + (pi + 1) + ' 页')),
        layers: layers,
        _planLabel: planId,
        _planPageNo: pi + 1
      };
      if (bg) out.bg = bg;
      return out;
    });
    // ✅ 页码：单页不加；多页每页加 "01 / 07"
    try {
      if (w.PageNumbers && w.PageNumbers.ensurePageNumbers) {
        w.PageNumbers.ensurePageNumbers(outPages);
      }
    } catch (e) { }
    return outPages;
  }
})(window);
