/* ============================================================
   ai-v2-layout.js — AI V2 排版预检（360×640 逻辑坐标）
   职责：
     ✅ 字号令牌 → px；安全区统一从 design-constants 取
     ✅ 文本高度估算（优先复用 AutoDesignCore 的字宽表）
     ✅ 空间不足时逐级降字号；位置越界时夹回安全区
     ✅ 文字层重叠自动推开（LayoutSpacing）；text ↔ shape 仍只提示
     ❌ 不读写 state、不操作 DOM
   ============================================================ */
(function (w) {
  'use strict';
  var DC = w.DesignConstants || {};
  var W = (DC.CANVAS && DC.CANVAS.width) || 360;
  var H = (DC.CANVAS && DC.CANVAS.height) || 640;
  var DEFAULT_SAFE = {
    left: (DC.SAFE && DC.SAFE.left) || 28,
    right: (DC.SAFE && DC.SAFE.right) || 28,
    top: (DC.SAFE && DC.SAFE.top) || 46,
    bottom: (DC.SAFE && DC.SAFE.bottom) || 62
  };

  function num(v, d) { return Number.isFinite(Number(v)) ? Number(v) : d; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function chars(s) { return Array.from(String(s || '')); }

  function analyzeContent(text) {
    var s = String(text || '').trim(), n = chars(s).length;
    return {
      charCount: n,
      paragraphCount: s ? s.split(/\n+/).filter(Boolean).length : 0,
      sentenceCount: (s.match(/[。！？!?；;]/g) || []).length,
      contentLength: n <= 60 ? 'short' : (n <= 220 ? 'medium' : 'long')
    };
  }

  /** 支持 {left,right,top,bottom} 与 {x,y,width,height} 两种安全区写法 */
  function getSafe(constraints) {
    var s = (constraints && constraints.safeArea) || {};
    var left, right, top, bottom;
    if (num(s.left, null) != null || num(s.right, null) != null || num(s.top, null) != null || num(s.bottom, null) != null) {
      left = num(s.left, DEFAULT_SAFE.left);
      right = num(s.right, DEFAULT_SAFE.right);
      top = num(s.top, DEFAULT_SAFE.top);
      bottom = num(s.bottom, DEFAULT_SAFE.bottom);
    } else if (num(s.x, null) != null && num(s.y, null) != null && num(s.width, null) != null && num(s.height, null) != null) {
      left = num(s.x, 0);
      top = num(s.y, 0);
      right = W - (num(s.x, 0) + num(s.width, W));
      bottom = H - (num(s.y, 0) + num(s.height, H));
    } else {
      left = DEFAULT_SAFE.left; right = DEFAULT_SAFE.right;
      top = DEFAULT_SAFE.top; bottom = DEFAULT_SAFE.bottom;
    }
    left = clamp(left, 0, W / 2 - 20);
    right = clamp(right, 0, W / 2 - 20);
    top = clamp(top, 0, H / 2 - 20);
    bottom = clamp(bottom, 0, H / 2 - 20);
    return { left: left, top: top, right: W - right, bottom: H - bottom };
  }

  function measureWidth(text, fontSize) {
    if (w.AutoDesignCore && typeof w.AutoDesignCore.estimateWidth === 'function') {
      try { return w.AutoDesignCore.estimateWidth(text, fontSize, 0); } catch (e) { }
    }
    var sum = 0;
    chars(text).forEach(function (ch) {
      if (ch === ' ') sum += 0.3;
      else if (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)) sum += 1;
      else if (/[A-Z]/.test(ch)) sum += 0.62;
      else if (/[a-z0-9]/.test(ch)) sum += 0.55;
      else sum += 0.72;
    });
    return sum * fontSize;
  }

  function estimate(layer) {
    var style = layer.style || {}, geo = layer.geometry || {};
    var fs = clamp(num(style.fontSize, 28), 10, 120);
    var width = clamp(num(geo.width, 300), 40, W);
    var lineHeight = clamp(num(style.lineHeight, 1.2), 0.85, 2.2);
    var lines = 0;
    String(layer.content || '').split('\n').forEach(function (par) {
      if (!par) { lines++; return; }
      var current = '', count = 1;
      chars(par).forEach(function (ch) {
        var next = current + ch;
        if (measureWidth(next, fs) > width && current) {
          count++;
          current = ch;
        } else {
          current = next;
        }
      });
      lines += count;
    });
    lines = Math.max(1, lines);
    return { fontSize: fs, lines: lines, estimatedHeight: Math.ceil(lines * fs * lineHeight + 8) };
  }


  function fontBounds(style) {
    var def = (DC.FONT_TOKENS || {})[style && style.sizeToken];
    if (def) return { min: def.min, max: def.max, default: def.default };
    return { min: 10, max: 120, default: num(style && style.fontSize, 19) };
  }

  function layoutTextLayer(layer, safe, pageIndex, issues) {
    var g = layer.geometry || (layer.geometry = {});
    var style = layer.style || (layer.style = {});
    if (style.sizeToken) {
      style.fontSize = DC.resolveFontToken
        ? DC.resolveFontToken(style.sizeToken, style.fontSize)
        : clamp(num(style.fontSize, fontBounds(style).default), fontBounds(style).min, fontBounds(style).max);
    }
    var bounds = fontBounds(style);
    style.fontSize = clamp(num(style.fontSize, bounds.default), bounds.min, bounds.max);

    var safeW = Math.max(40, safe.right - safe.left);
    var safeH = Math.max(40, safe.bottom - safe.top);
    var width = clamp(num(g.width, safeW), 40, safeW);
    var height = clamp(num(g.height, 120), 24, safeH);
    if (width !== num(g.width, width)) {
      issues.push({ pageIndex: pageIndex, layerId: layer.id, code: 'WIDTH_CLAMPED', message: '文本框宽度已限制到安全区。' });
    }
    if (height !== num(g.height, height)) {
      issues.push({ pageIndex: pageIndex, layerId: layer.id, code: 'HEIGHT_CLAMPED', message: '文本框高度已限制到安全区。' });
    }
    g.width = width;
    g.height = height;

    // 放不下就逐级降字号（最多降 40 次），绝不用裁字解决
    var m = estimate(layer);
    var reduced = 0;
    while (m.estimatedHeight > height && style.fontSize > bounds.min && reduced < 40) {
      style.fontSize = Math.max(bounds.min, Math.round((style.fontSize - 1) * 10) / 10);
      m = estimate(layer);
      reduced++;
    }
    if (reduced > 0) {
      issues.push({
        pageIndex: pageIndex, layerId: layer.id, code: 'FONT_SIZE_REDUCED',
        message: '文字放不下，字号已自动降低 ' + reduced + 'px（现 ' + style.fontSize + 'px）。'
      });
    }
    if (m.estimatedHeight > height) {
      issues.push({
        pageIndex: pageIndex, layerId: layer.id, code: 'TEXT_OVERFLOW_UNRESOLVED',
        message: '字号已降到下限仍放不下，需要拆页或缩短单页内容。'
      });
    }

    var x = clamp(num(g.x, safe.left), safe.left, safe.right - width);
    var y = clamp(num(g.y, safe.top), safe.top, safe.bottom - height);
    if (x !== num(g.x, x) || y !== num(g.y, y)) {
      issues.push({
        pageIndex: pageIndex, layerId: layer.id, code: 'SAFE_AREA_ADJUSTED',
        message: '图层位置已在预检副本中限制到安全区。'
      });
    }
    g.x = x;
    g.y = y;
    g.rotation = num(g.rotation, 0);
    layer._layoutEstimate = m;
  }

  function layoutShapeLayer(layer, pageIndex, issues) {
    var g = layer.geometry || (layer.geometry = {});
    ['x', 'y', 'width', 'height'].forEach(function (k) {
      g[k] = num(g[k], k === 'width' || k === 'height' ? 1 : 0);
    });
    g.width = clamp(g.width, 1, W);
    g.height = clamp(g.height, 1, H);
    g.x = clamp(g.x, 0, W - g.width);
    g.y = clamp(g.y, 0, H - g.height);
    g.rotation = num(g.rotation, 0);
    if (g.width <= 0 || g.height <= 0) {
      issues.push({ pageIndex: pageIndex, layerId: layer.id, code: 'SHAPE_DEGENERATE', message: '形状尺寸无效。' });
    }
  }

  function layoutPlan(plan, constraints) {
    if (!plan || !Array.isArray(plan.pages)) throw new Error('plan.pages 必须是数组');
    var safe = getSafe(constraints);
    var issues = [];
    var pages = plan.pages.map(function (page, pageIndex) {
      var layers = (page.layers || []).map(function (src) {
        var layer = JSON.parse(JSON.stringify(src));
        if (layer.type === 'text') layoutTextLayer(layer, safe, pageIndex, issues);
        else layoutShapeLayer(layer, pageIndex, issues);
        return layer;
      });

      // 文字层之间自动保持间距（text ↔ shape 不动，装饰压在文字下是有意设计）
      if (w.LayoutSpacing && typeof w.LayoutSpacing.resolveLayers === 'function') {
        var spacingItems = [];
        layers.forEach(function (l) {
          if (l.type !== 'text' || !l.geometry || !l.style) return;
          spacingItems.push({
            type: 'text', _src: l,
            x: l.geometry.x, y: l.geometry.y,
            width: l.geometry.width, height: l.geometry.height,
            fontSize: l.style.fontSize, content: l.content,
            rotation: l.geometry.rotation, backdrop: null
          });
        });
        var spacing = w.LayoutSpacing.resolveLayers(spacingItems, {
          gap: 20, minGap: 6, safeTop: safe.top, safeBottom: safe.bottom,
          measure: function (tmp) { return estimate(tmp._src).estimatedHeight; }
        });
        spacingItems.forEach(function (tmp) { tmp._src.geometry.y = tmp.y; });
        if (spacing.fixed > 0) {
          issues.push({
            pageIndex: pageIndex,
            code: 'SPACING_ADJUSTED',
            message: '文字图层间距已自动调整为 ≥20px（移动 ' + spacing.fixed + ' 层）。'
          });
        }
      }

      // 剩余重叠仅提示：可能是有意的文字压在色块 / 底衬上
      for (var i = 0; i < layers.length; i++) {
        for (var j = i + 1; j < layers.length; j++) {
          var a = layers[i].geometry, b = layers[j].geometry;
          if (!a || !b) continue;
          if (a.x < b.x + b.width && a.x + a.width > b.x &&
              a.y < b.y + b.height && a.y + a.height > b.y) {
            issues.push({
              pageIndex: pageIndex, layerId: layers[i].id, otherLayerId: layers[j].id,
              code: 'OVERLAP_REVIEW',
              message: '图层存在重叠，请结合预览判断是否为有意叠放。'
            });
          }
        }
      }
      return Object.assign({}, page, { layers: layers });
    });

    var adjusted = issues.filter(function (i) {
      return ['FONT_SIZE_REDUCED', 'SAFE_AREA_ADJUSTED', 'WIDTH_CLAMPED', 'HEIGHT_CLAMPED', 'SPACING_ADJUSTED'].indexOf(i.code) >= 0;
    }).length;

    return {
      plan: Object.assign({}, plan, { pages: pages }),
      report: {
        canvas: { width: W, height: H },
        safeArea: safe,
        adjusted: adjusted,
        issueCount: issues.length,
        issues: issues,
        note: '文本高度为估算值，最终以浏览器真实渲染测量为准。'
      }
    };
  }

  w.AIV2Layout = {
    WIDTH: W,
    HEIGHT: H,
    DEFAULT_SAFE_AREA: DEFAULT_SAFE,
    analyzeContent: analyzeContent,
    getSafeArea: getSafe,
    estimateLayer: estimate,
    layoutPlan: layoutPlan
  };
})(window);
