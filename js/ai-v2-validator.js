/* ============================================================
   ai-v2-validator.js — douyin-ai-design 2.0 严格校验器
   原则：
     ✅ 语义层错误 fail closed（不猜 family/preset/颜色角色）
     ✅ 格式层修复交给上层；本文件只校验，不改数据
     ✅ 安全区 / 对比度 / 内容保真 / HTML 注入 / intensity 预算
   依赖：design-constants.js / ai-v2-schema.js / visual-registry.js
   ============================================================ */
(function (w) {
  'use strict';
  var DC = w.DesignConstants || {};
  var S = w.AiV2Schema || {};
  var MAXP = DC.MAX_PAGES || 8;
  var MAXL = DC.MAX_LAYERS_PER_PAGE || 40;
  var MAXT = DC.MAX_TEXT_LENGTH || 1200;

  function obj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function num(x) { return typeof x === 'number' && Number.isFinite(x); }
  function str(x) { return typeof x === 'string' && x.trim().length > 0; }
  function arr(x) { return Array.isArray(x); }
  function role(v) { return (DC.COLOR_ROLES || S.COLOR_ROLES || []).indexOf(v) >= 0; }
  function familyCategory(f) {
    return (DC.FAMILY_CATEGORY && DC.FAMILY_CATEGORY[f]) || (S.FAMILY_CATEGORY && S.FAMILY_CATEGORY[f]) || 'unknown';
  }
  function budgetFor(intensity) {
    return DC.budgetFor ? DC.budgetFor(intensity) : { glyph: 1, container: 1, annotation: 2, decoration: 2, colorRoles: 4, fontSizes: 3, maxEffectsPerLayer: 1 };
  }
  function resolveRole(palette, r) { return DC.resolveColorRole ? DC.resolveColorRole(palette, r) : null; }
  function contrast(a, b) { return DC.contrast ? DC.contrast(a, b) : 1; }
  function norm(s) { return DC.normalizeForCompare ? DC.normalizeForCompare(s) : String(s || ''); }
  function sentences(s) {
    return DC.splitSentences ? DC.splitSentences(s) : String(s || '').split(/[。！？!?；;\n]+/).filter(Boolean);
  }
  function hasHtml(s) { return DC.hasHtmlTag ? DC.hasHtmlTag(s) : /<[a-z][^>]*>/i.test(String(s || '')); }
  function canCombine(a, b) { return DC.canCombineFamilies ? DC.canCombineFamilies(a, b) : a !== b; }
  function safeBox(s) {
    var W = (S.CANVAS || DC.CANVAS || {}).width || 360;
    var H = (S.CANVAS || DC.CANVAS || {}).height || 640;
    if (!s) return { left: 28, right: W - 28, top: 46, bottom: H - 62 };
    if (Number.isFinite(Number(s.left)) || Number.isFinite(Number(s.right)) ||
        Number.isFinite(Number(s.top)) || Number.isFinite(Number(s.bottom))) {
      var l = Number.isFinite(Number(s.left)) ? Number(s.left) : 28;
      var r = Number.isFinite(Number(s.right)) ? Number(s.right) : 28;
      var t = Number.isFinite(Number(s.top)) ? Number(s.top) : 46;
      var b = Number.isFinite(Number(s.bottom)) ? Number(s.bottom) : 62;
      return { left: l, right: W - r, top: t, bottom: H - b };
    }
    if (Number.isFinite(Number(s.x)) && Number.isFinite(Number(s.y)) &&
        Number.isFinite(Number(s.width)) && Number.isFinite(Number(s.height))) {
      return { left: Number(s.x), right: Number(s.x) + Number(s.width), top: Number(s.y), bottom: Number(s.y) + Number(s.height) };
    }
    return { left: 28, right: W - 28, top: 46, bottom: H - 62 };
  }

  function validate(input, options) {
    options = options || {};
    var errors = [];
    function add(path, code, message) { errors.push({ path: path, code: code, message: message }); }

    if (!obj(input)) {
      return { ok: false, errors: [{ path: '$', code: 'E_ROOT', message: 'JSON 顶层必须是对象' }] };
    }
    var spec;
    try { spec = JSON.parse(JSON.stringify(input)); }
    catch (e) { return { ok: false, errors: [{ path: '$', code: 'E_CLONE', message: 'JSON 无法复制' }] }; }

    if (spec.format !== (S.FORMAT || 'douyin-ai-design')) add('format', 'E_FORMAT', '必须为 douyin-ai-design');
    if (String(spec.version) !== String(S.VERSION || '2.0')) add('version', 'E_VERSION', '必须为 2.0');
    if (!str(spec.requestId)) add('requestId', 'E_REQUEST_ID', '必须提供非空 requestId');

    // ---------- analysis ----------
    if (!obj(spec.analysis)) {
      add('analysis', 'E_ANALYSIS', '缺少文案分析对象');
    } else {
      var a = spec.analysis;
      if (!num(a.intensity) || a.intensity < 1 || a.intensity > 5) {
        add('analysis.intensity', 'E_INTENSITY', 'intensity 必须为 1–5 的数字');
      }
      if (a.keywords !== undefined && (!arr(a.keywords) || a.keywords.some(function (k) { return typeof k !== 'string'; }))) {
        add('analysis.keywords', 'E_KEYWORDS', 'keywords 必须为字符串数组');
      }
      if (a.tone !== undefined && !arr(a.tone) && typeof a.tone !== 'string') {
        add('analysis.tone', 'E_TONE', 'tone 必须为数组或字符串');
      }
      if (a.contentLength !== undefined && ['short', 'medium', 'long'].indexOf(a.contentLength) < 0) {
        add('analysis.contentLength', 'E_CONTENT_LENGTH', 'contentLength 必须为 short/medium/long');
      }
    }

    // ---------- brand ----------
    if (!obj(spec.brand) || !str(spec.brand.brandId)) {
      add('brand.brandId', 'E_BRAND_ID', '必须提供品牌 ID');
    }

    // ---------- plans ----------
    if (!arr(spec.plans) || spec.plans.length !== 3) {
      add('plans', 'E_PLANS_COUNT', '必须且只能提供 A、B、C 三套方案');
      return { ok: false, errors: errors };
    }

    var registry = w.VisualRegistry && w.VisualRegistry.getSnapshot
      ? w.VisualRegistry.getSnapshot()
      : { presets: [] };
    var presetMap = new Map((registry.presets || []).map(function (p) { return [p.id, p]; }));
    var planIds = {};
    var budget = budgetFor(spec.analysis && spec.analysis.intensity);
    var safe = safeBox(spec.constraints && spec.constraints.safeArea);
    var CW = (S.CANVAS || DC.CANVAS || {}).width || 360;
    var CH = (S.CANVAS || DC.CANVAS || {}).height || 640;

    spec.plans.forEach(function (plan, pi) {
      var pp = 'plans[' + pi + ']';
      if (!obj(plan)) { add(pp, 'E_PLAN', '方案必须是对象'); return; }
      if (['A', 'B', 'C'].indexOf(plan.id) < 0) add(pp + '.id', 'E_PLAN_ID', '只能为 A、B、C');
      if (planIds[plan.id]) add(pp + '.id', 'E_PLAN_DUP', '方案 ID 重复');
      planIds[plan.id] = true;
      if (plan.strategy !== undefined && (S.LAYOUT_STRATEGIES || DC.LAYOUT_STRATEGIES || []).indexOf(plan.strategy) < 0) {
        add(pp + '.strategy', 'E_STRATEGY', '未知版式策略：' + plan.strategy);
      }
      if (!obj(plan.canvas) || plan.canvas.width !== CW || plan.canvas.height !== CH) {
        add(pp + '.canvas', 'E_CANVAS', '画布必须为 360×640');
      }
      if (plan.canvas && plan.canvas.backgroundRole !== undefined && !role(plan.canvas.backgroundRole)) {
        add(pp + '.canvas.backgroundRole', 'E_COLOR_ROLE', '背景颜色必须引用品牌角色');
      }
      if (!arr(plan.pages) || plan.pages.length < 1 || plan.pages.length > MAXP) {
        add(pp + '.pages', 'E_PAGES', '页面数必须为 1–' + MAXP);
        return;
      }

      var pageIds = {};
      var layerIds = {};
      var planTextChunks = [];
      plan.pages.forEach(function (page, pgi) {
        var ppp = pp + '.pages[' + pgi + ']';
        if (!obj(page)) { add(ppp, 'E_PAGE', '页面必须是对象'); return; }
        if (!str(page.id)) add(ppp + '.id', 'E_PAGE_ID', '缺少页面 ID');
        else if (pageIds[page.id]) add(ppp + '.id', 'E_PAGE_DUP', '页面 ID 重复');
        pageIds[page.id] = true;
        if (page.title !== undefined && typeof page.title !== 'string') add(ppp + '.title', 'E_PAGE_TITLE', '页面标题必须是字符串');
        if (page.backgroundRole !== undefined && !role(page.backgroundRole)) {
          add(ppp + '.backgroundRole', 'E_COLOR_ROLE', '背景颜色必须引用品牌角色');
        }
        if (!arr(page.layers) || page.layers.length > MAXL) {
          add(ppp + '.layers', 'E_LAYERS', '图层必须为数组且每页不超过 ' + MAXL);
          return;
        }

        var counts = { glyph: 0, container: 0, annotation: 0, decoration: 0 };
        var usedRoles = {};
        var usedSizes = {};
        var textChunks = [];

        page.layers.forEach(function (layer, li) {
          var lp = ppp + '.layers[' + li + ']';
          if (!obj(layer)) { add(lp, 'E_LAYER', '图层必须是对象'); return; }
          if (!str(layer.id)) add(lp + '.id', 'E_LAYER_ID', '缺少图层 ID');
          else if (layerIds[layer.id]) add(lp + '.id', 'E_LAYER_DUP', '图层 ID 重复');
          layerIds[layer.id] = true;
          if ((S.LAYER_TYPES || DC.LAYER_TYPES || ['text', 'shape']).indexOf(layer.type) < 0) {
            add(lp + '.type', 'E_LAYER_TYPE', '仅支持 text、shape');
          }
          if (layer.role !== undefined && (S.LAYER_ROLES || DC.LAYER_ROLES || []).indexOf(layer.role) < 0) {
            add(lp + '.role', 'E_LAYER_ROLE', '未知图层角色：' + layer.role);
          }
          if (layer.visible !== undefined && typeof layer.visible !== 'boolean') {
            add(lp + '.visible', 'E_VISIBLE', 'visible 必须为布尔值');
          }
          if (layer.order !== undefined && !num(layer.order)) {
            add(lp + '.order', 'E_ORDER', 'order 必须为数字');
          }

          var g = layer.geometry;
          if (!obj(g)) {
            add(lp + '.geometry', 'E_GEOMETRY', '缺少 geometry');
          } else {
            ['x', 'y', 'width', 'height'].forEach(function (k) {
              if (!num(g[k])) add(lp + '.geometry.' + k, 'E_GEOMETRY_NUM', '必须为有限数字');
            });
            if (g.rotation !== undefined && !num(g.rotation)) add(lp + '.geometry.rotation', 'E_ROTATION', 'rotation 必须为数字');
            if (num(g.x) && (g.x < 0 || g.x > CW)) add(lp + '.geometry.x', 'E_CANVAS_BOUNDS', '超出画布');
            if (num(g.y) && (g.y < 0 || g.y > CH)) add(lp + '.geometry.y', 'E_CANVAS_BOUNDS', '超出画布');
            if (num(g.width) && (g.width <= 0 || g.width > CW)) add(lp + '.geometry.width', 'E_CANVAS_BOUNDS', '宽度必须为 0–' + CW);
            if (num(g.height) && (g.height <= 0 || g.height > CH)) add(lp + '.geometry.height', 'E_CANVAS_BOUNDS', '高度必须为 0–' + CH);
            if (num(g.x) && num(g.width) && g.x + g.width > CW) add(lp + '.geometry', 'E_CANVAS_BOUNDS', '右边缘超出画布');
            if (num(g.y) && num(g.height) && g.y + g.height > CH) add(lp + '.geometry', 'E_CANVAS_BOUNDS', '下边缘超出画布');
            if (options.checkSafeArea && layer.type === 'text' && num(g.x) && num(g.y) && num(g.width) && num(g.height)) {
              if (g.x < safe.left - 0.5) add(lp + '.geometry.x', 'E_SAFE_X', '文字超出左右安全区');
              if (g.x + g.width > safe.right + 0.5) add(lp + '.geometry.x', 'E_SAFE_X', '文字超出左右安全区');
              if (g.y < safe.top - 0.5) add(lp + '.geometry.y', 'E_SAFE_TOP', '文字超出顶部安全区');
              if (g.y + g.height > safe.bottom + 0.5) add(lp + '.geometry.y', 'E_SAFE_BOTTOM', '文字超出底部安全区');
            }
          }

          // ---------- text ----------
          if (layer.type === 'text') {
            if (typeof layer.content !== 'string' || !layer.content.trim()) {
              add(lp + '.content', 'E_TEXT_EMPTY', '文字不能为空');
            } else {
              if (layer.content.length > MAXT) add(lp + '.content', 'E_TEXT_LENGTH', '最多 ' + MAXT + ' 字符');
              if (!options.allowHtml && hasHtml(layer.content)) {
                add(lp + '.content', 'E_HTML_IN_CONTENT', '文字内容不能包含 HTML 标签或事件属性');
              }
            }
            if (!obj(layer.style)) {
              add(lp + '.style', 'E_TEXT_STYLE', '缺少文字样式');
            } else {
              var ts = layer.style;
              var tokenDef = (DC.FONT_TOKENS || S.FONT_TOKENS || {})[ts.sizeToken];
              if (ts.sizeToken !== undefined && !tokenDef) add(lp + '.style.sizeToken', 'E_SIZE_TOKEN', '未知字号令牌：' + ts.sizeToken);
              if (ts.fontSize === undefined && !tokenDef) add(lp + '.style.fontSize', 'E_FONT_SIZE', '必须提供 fontSize 或 sizeToken');
              if (ts.fontSize !== undefined && (!num(ts.fontSize) || ts.fontSize < 8 || ts.fontSize > 120)) {
                add(lp + '.style.fontSize', 'E_FONT_SIZE', '字号必须 8–120');
              }
              if (ts.fontSize !== undefined && tokenDef && (ts.fontSize < tokenDef.min || ts.fontSize > tokenDef.max)) {
                add(lp + '.style.fontSize', 'E_FONT_TOKEN_RANGE', '字号超出令牌 ' + ts.sizeToken + ' 的范围');
              }
              if (!str(ts.fontFamily)) add(lp + '.style.fontFamily', 'E_FONT_FAMILY', '必须指定字体');
              else if (options.fonts && arr(options.fonts) && options.fonts.indexOf(ts.fontFamily) < 0) {
                add(lp + '.style.fontFamily', 'E_FONT_NOT_LOCAL', '字体不在本地清单：' + ts.fontFamily);
              }
              if (!role(ts.colorRole)) add(lp + '.style.colorRole', 'E_COLOR_ROLE', '颜色必须引用品牌角色');
              else usedRoles[ts.colorRole] = true;
              if (['left', 'center', 'right'].indexOf(ts.align) < 0) add(lp + '.style.align', 'E_ALIGN', '对齐值无效');
              if (ts.lineHeight !== undefined && (!num(ts.lineHeight) || ts.lineHeight < 0.8 || ts.lineHeight > 2.5)) {
                add(lp + '.style.lineHeight', 'E_LINE_HEIGHT', '行高必须 0.8–2.5');
              }
              if (ts.opacity !== undefined && (!num(ts.opacity) || ts.opacity < 0 || ts.opacity > 1)) {
                add(lp + '.style.opacity', 'E_OPACITY', '透明度必须 0–1');
              }
              if (ts.letterSpacing !== undefined && (!num(ts.letterSpacing) || ts.letterSpacing < -5 || ts.letterSpacing > 30)) {
                add(lp + '.style.letterSpacing', 'E_LETTER_SPACING', '字距必须 -5–30');
              }
              usedSizes[ts.sizeToken || String(Math.round(ts.fontSize || 0))] = true;

              // ---------- P4 容器（复用 .layer-fill） ----------
              if (ts.container !== undefined) {
                if (!obj(ts.container)) add(lp + '.style.container', 'E_CONTAINER', 'container 必须为对象');
                else {
                  var cp = ts.container.preset;
                  var cdef = (DC.CONTAINER_PRESETS || {})[cp];
                  if (!cdef) add(lp + '.style.container.preset', 'E_CONTAINER_PRESET', '未知容器预设：' + cp);
                  else if (cp !== 'none') {
                    var cfill = ts.container.fillRole || 'accent';
                    if (!role(cfill)) add(lp + '.style.container.fillRole', 'E_COLOR_ROLE', '容器填充必须引用品牌角色');
                    else usedRoles[cfill] = true;
                    counts.container++;
                    var cRadius = num(ts.container.radius) ? ts.container.radius : cdef.radius;
                    var cPadding = num(ts.container.padding) ? ts.container.padding : cdef.padding;
                    if (cRadius < 0 || cRadius > 80) add(lp + '.style.container.radius', 'E_CONTAINER_RADIUS', '容器圆角必须 0–80');
                    if (cPadding < 0 || cPadding > 24) add(lp + '.style.container.padding', 'E_CONTAINER_PADDING', '容器内边距必须 0–24');
                    if (obj(g) && num(g.x) && num(g.y) && num(g.width) && num(g.height)) {
                      if (g.x - cPadding < 0 || g.y - cPadding < 0 ||
                          g.x + g.width + cPadding > CW || g.y + g.height + cPadding > CH) {
                        add(lp + '.style.container', 'E_CONTAINER_BOUNDS', '容器加上内边距后超出画布');
                      }
                    }
                  }
                }
              }

              // ---------- P4 区间强调（复用内联 span） ----------
              if (ts.emphasis !== undefined) {
                if (!arr(ts.emphasis)) add(lp + '.style.emphasis', 'E_EMPHASIS', 'emphasis 必须为数组');
                else {
                  if (ts.emphasis.length > 3) add(lp + '.style.emphasis', 'E_EMPHASIS_COUNT', '每层最多 3 处强调');
                  var cpLen = Array.from(String(layer.content || '')).length;
                  var ranges = [];
                  ts.emphasis.forEach(function (e, ei) {
                    var ep = lp + '.style.emphasis[' + ei + ']';
                    if (!obj(e)) { add(ep, 'E_EMPHASIS_OBJECT', '强调必须是对象'); return; }
                    if (!Number.isInteger(e.start) || !Number.isInteger(e.end) ||
                        e.start < 0 || e.end <= e.start) {
                      add(ep, 'E_EMPHASIS_RANGE', 'start/end 必须是合法码点区间（左闭右开）');
                    } else if (e.end > cpLen) {
                      add(ep, 'E_EMPHASIS_RANGE', 'end 超出文字长度 ' + cpLen);
                    }
                    if ((DC.ANNOTATION_STYLES || []).indexOf(e.style) < 0) {
                      add(ep + '.style', 'E_EMPHASIS_STYLE', '强调样式必须为 color/highlight/underline');
                    }
                    if (!role(e.colorRole)) add(ep + '.colorRole', 'E_COLOR_ROLE', '强调色必须引用品牌角色');
                    else usedRoles[e.colorRole] = true;
                    counts.annotation++;
                    if (Number.isInteger(e.start) && Number.isInteger(e.end)) ranges.push({ s: e.start, e: e.end });
                  });
                  ranges.sort(function (a, b) { return a.s - b.s; });
                  for (var ri = 1; ri < ranges.length; ri++) {
                    if (ranges[ri].s < ranges[ri - 1].e) {
                      add(lp + '.style.emphasis', 'E_EMPHASIS_OVERLAP', '强调区间不能重叠');
                    }
                  }
                }
              }
            }
            if (layer.role === 'headline' || layer.role === 'subheadline' || layer.role === 'body') {
              textChunks.push(layer.content || '');
            }
          }

          // ---------- shape ----------
          if (layer.type === 'shape') {
            if (!obj(layer.style)) {
              add(lp + '.style', 'E_SHAPE_STYLE', '缺少形状样式');
            } else {
              var ss = layer.style;
              if (['rect', 'circle', 'ellipse', 'triangle', 'diamond', 'star', 'line'].indexOf(ss.shapeKind) < 0) {
                add(lp + '.style.shapeKind', 'E_SHAPE_KIND', '形状类型尚未开放');
              }
              if (ss.fillRole !== undefined && !role(ss.fillRole)) add(lp + '.style.fillRole', 'E_COLOR_ROLE', '填充必须引用品牌角色');
              else if (ss.fillRole) usedRoles[ss.fillRole] = true;
              if (ss.strokeRole !== undefined && ss.strokeRole !== null && !role(ss.strokeRole)) {
                add(lp + '.style.strokeRole', 'E_COLOR_ROLE', '描边必须引用品牌角色');
              } else if (ss.strokeRole) usedRoles[ss.strokeRole] = true;
              if (ss.strokeWidth !== undefined && (!num(ss.strokeWidth) || ss.strokeWidth < 0 || ss.strokeWidth > 20)) {
                add(lp + '.style.strokeWidth', 'E_STROKE_WIDTH', '描边宽度必须 0–20');
              }
              if (ss.cornerRadius !== undefined && (!num(ss.cornerRadius) || ss.cornerRadius < 0 || ss.cornerRadius > 80)) {
                add(lp + '.style.cornerRadius', 'E_RADIUS', '圆角必须 0–80');
              }
              if (ss.decorationPreset !== undefined) {
                if (layer.role !== 'decoration') {
                  add(lp + '.style.decorationPreset', 'E_DECORATION_ROLE', '只有 decoration 图层才能使用 decorationPreset');
                }
                if (!(DC.DECORATION_PRESETS || {})[ss.decorationPreset]) {
                  add(lp + '.style.decorationPreset', 'E_DECORATION_PRESET', '未知装饰预设：' + ss.decorationPreset);
                }
              }
            }
            if (layer.role === 'decoration') counts.decoration++;
            if (layer.effects && layer.effects.length) add(lp + '.effects', 'E_SHAPE_EFFECTS', '形状暂不支持 effects');
          }

          // ---------- effects ----------
          if (layer.type === 'text' && layer.effects !== undefined && !arr(layer.effects)) {
            add(lp + '.effects', 'E_EFFECTS', 'effects 必须为数组');
          } else if (layer.type === 'text') {
            var fx = layer.effects || [];
            if (fx.length > budget.maxEffectsPerLayer) {
              add(lp + '.effects', 'E_FX_PER_LAYER', '每层最多 ' + budget.maxEffectsPerLayer + ' 个特效（当前 intensity）');
            }
            var families = [];
            fx.forEach(function (f, fi) {
              var fp = lp + '.effects[' + fi + ']';
              if (!obj(f)) { add(fp, 'E_FX_OBJECT', '特效必须是对象'); return; }
              if (!str(f.presetId)) { add(fp + '.presetId', 'E_FX_PRESET', '必须提供 presetId'); return; }
              var preset = presetMap.get(f.presetId);
              if (!preset) { add(fp + '.presetId', 'E_FX_UNKNOWN', '当前特效库中不存在该 preset：' + f.presetId); return; }
              if (preset.status !== 'renderable') {
                add(fp + '.presetId', 'E_FX_NOT_RENDERABLE', '该 preset 尚未完成渲染，不能使用：' + f.presetId);
                return;
              }
              if (preset.brandSafe === false) {
                add(fp + '.presetId', 'E_FX_NOT_BRAND_SAFE', '该 preset 含硬编码非品牌色，不能使用：' + f.presetId);
                return;
              }
              if (f.family !== undefined && f.family !== preset.family) {
                add(fp + '.family', 'E_FX_FAMILY', 'family 与注册表不一致：' + f.family + ' ≠ ' + preset.family);
              }
              if (f.category !== undefined && f.category !== preset.category) {
                add(fp + '.category', 'E_FX_CATEGORY', 'category 与注册表不一致：' + f.category + ' ≠ ' + preset.category);
              }
              if (families.indexOf(preset.family) >= 0) {
                add(fp, 'E_FX_DUP', '同一图层不能重复使用同一机制：' + preset.family);
              }
              families.push(preset.family);
              var cat = preset.category || familyCategory(preset.family);
              if (counts[cat] === undefined) add(fp, 'E_FX_CATEGORY_UNKNOWN', '特效分类未知：' + cat);
              else counts[cat]++;

              if (f.params !== undefined && !obj(f.params)) {
                add(fp + '.params', 'E_FX_PARAMS', 'params 必须为对象');
              } else {
                var defs = preset.params || {};
                Object.keys(f.params || {}).forEach(function (k) {
                  var d = defs[k];
                  var v = f.params[k];
                  if (!d) { add(fp + '.params.' + k, 'E_FX_PARAM_UNKNOWN', '参数未注册：' + k); return; }
                  if (d.type === 'number') {
                    if (!num(v)) add(fp + '.params.' + k, 'E_FX_PARAM_TYPE', '必须为数字');
                    else if ((num(d.min) && v < d.min) || (num(d.max) && v > d.max)) {
                      add(fp + '.params.' + k, 'E_FX_PARAM_RANGE', '参数超出范围：' + v);
                    }
                  } else if (d.type === 'token') {
                    if (!arr(d.values) || d.values.indexOf(v) < 0) {
                      add(fp + '.params.' + k, 'E_FX_PARAM_TOKEN', '参数必须为 ' + (d.values || []).join('/'));
                    }
                  } else if (d.type === 'colorRole') {
                    if (!role(v)) add(fp + '.params.' + k, 'E_FX_PARAM_COLOR', '必须引用品牌颜色角色');
                  } else if (d.type === 'boolean') {
                    if (typeof v !== 'boolean') add(fp + '.params.' + k, 'E_FX_PARAM_TYPE', '必须为布尔值');
                  } else if (typeof v !== d.type) {
                    add(fp + '.params.' + k, 'E_FX_PARAM_TYPE', '参数类型错误');
                  }
                });
              }
            });
            for (var x = 0; x < families.length; x++) {
              for (var y = x + 1; y < families.length; y++) {
                if (!canCombine(families[x], families[y])) {
                  add(lp + '.effects', 'E_FX_INCOMPATIBLE', '不兼容的特效组合：' + families[x] + ' + ' + families[y]);
                }
              }
            }
          }

          // ---------- 对比度（需要调用方传入品牌色板） ----------
          if (layer.type === 'text' && options.palette && obj(layer.style)) {
            var colorHex = resolveRole(options.palette, layer.style.colorRole);
            var bgRole = layer.style.surfaceRole
              || (layer.style.colorRole === 'textInverse' ? 'primary' : (page.backgroundRole || (plan.canvas && plan.canvas.backgroundRole) || 'background'));
            var bgHex = resolveRole(options.palette, bgRole);
            if (!colorHex) add(lp + '.style.colorRole', 'E_PALETTE_MISSING', '品牌色板缺少颜色角色：' + layer.style.colorRole);
            else if (!bgHex) add(lp + '.style.surfaceRole', 'E_PALETTE_MISSING', '品牌色板缺少背景角色：' + bgRole);
            else {
              var fsPx = num(layer.style.fontSize) ? layer.style.fontSize
                : ((((DC.FONT_TOKENS || S.FONT_TOKENS || {})[layer.style.sizeToken]) || {}).default || 19);
              var need = fsPx >= 24 ? 3 : 4.5;
              var ratio = contrast(colorHex, bgHex);
              if (ratio < need) {
                add(lp + '.style.colorRole', 'E_CONTRAST', '对比度不足：' + ratio.toFixed(2) + ':1（需要 ' + need + ':1）');
              }
            }
          }
        });

        // ---------- 每页预算 ----------
        Object.keys(counts).forEach(function (cat) {
          var limit = budget[cat];
          if (num(limit) && counts[cat] > limit) {
            add(ppp + '.budget.' + cat, 'E_BUDGET', cat + ' 超出当前 intensity 预算：' + counts[cat] + ' / ' + limit);
          }
        });
        if (num(budget.colorRoles) && Object.keys(usedRoles).length > budget.colorRoles) {
          add(ppp + '.budget.colorRoles', 'E_BUDGET_COLORS', '品牌色角色数超出预算：' + Object.keys(usedRoles).length + ' / ' + budget.colorRoles);
        }
        if (num(budget.fontSizes) && Object.keys(usedSizes).length > budget.fontSizes) {
          add(ppp + '.budget.fontSizes', 'E_BUDGET_SIZES', '字号层级超出预算：' + Object.keys(usedSizes).length + ' / ' + budget.fontSizes);
        }

        planTextChunks.push.apply(planTextChunks, textChunks);
      });

      // ---------- 内容保真（调用方传入 original 时才校验） ----------
      if (options.original) {
        var got = norm(planTextChunks.join(' '));
        sentences(options.original).forEach(function (s) {
          var key = norm(s);
          if (key.length >= 4 && got.indexOf(key) < 0) {
            add(pp + '.content', 'E_CONTENT_LOST', '原文片段未出现在方案 ' + plan.id + '：' + s.slice(0, 12));
          }
        });
      }
    });

    if (!planIds.A || !planIds.B || !planIds.C) {
      add('plans', 'E_PLAN_MISSING', '必须包含 A、B、C 三套方案');
    }

    return errors.length
      ? { ok: false, errors: errors, registry: registry }
      : { ok: true, errors: [], spec: spec, registry: registry };
  }

  w.AiV2Validator = Object.freeze({ validate: validate });
})(window);
