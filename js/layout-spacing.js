/* ============================================================
   layout-spacing.js — 文字图层纵向间距 / 重叠修复（纯函数）
   解决问题：
     ✅ JSON 里声明的 height 往往小于真实渲染高度
     ✅ 底衬 padding、旋转后的包围盒会继续向外扩
     ✅ 结果就是相邻文字层贴住甚至叠在一起
   规则：
     ✅ 只在「水平方向有交集」的文字层之间调整纵向位置
     ✅ 从上到下按「上一层的可视底边 + gap」排布
     ✅ 先保位置推开；装不下时整体上移 → 压缩间距 → 仍不行则报告
     ✅ 不处理 text ↔ shape：装饰/色块压在文字下是有意设计
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof window !== 'undefined') window.LayoutSpacing = api;
  else root.LayoutSpacing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULTS = {
    gap: 20,          // 目标可视间距
    minGap: 6,        // 压缩后的最小间距
    safeTop: 30,
    safeBottom: 546,   // 平台 62 + 一行正文 32 → 640-62-32
    canvasWidth: 360,
    includeBackdrop: true,
    includeRotation: true
  };

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }
  function round(v) { return Math.round(v * 100) / 100; }
  function optsOf(options) {
    var o = Object.assign({}, DEFAULTS, options || {});
    o.gap = Math.max(0, num(o.gap, DEFAULTS.gap));
    o.minGap = Math.max(0, num(o.minGap, DEFAULTS.minGap));
    o.safeTop = num(o.safeTop, DEFAULTS.safeTop);
    o.safeBottom = num(o.safeBottom, DEFAULTS.safeBottom);
    o.canvasWidth = Math.max(1, num(o.canvasWidth, DEFAULTS.canvasWidth));
    return o;
  }

  function isTextLayer(layer) {
    return !!layer && layer.type === 'text' && layer.visible !== false;
  }

  function backdropPadding(layer, opts) {
    if (!opts.includeBackdrop) return 0;
    var bd = layer && layer.backdrop;
    if (!bd || !bd.type || bd.type === 'none') return 0;
    return Math.max(0, num(bd.padding, 12));
  }

  function makeBox(layer, index, opts) {
    var w = Math.max(1, num(layer.width, opts.canvasWidth));
    var declared = Math.max(0, num(layer.height, 0));
    var measured = 0;
    if (typeof opts.measure === 'function') {
      try { measured = num(opts.measure(layer), 0); } catch (e) { measured = 0; }
    }
    var textH = Math.max(declared, measured);
    if (textH <= 0) return null;

    var pad = backdropPadding(layer, opts);
    var extraY = 0, visualW = w;
    if (opts.includeRotation) {
      var rad = Math.abs(num(layer.rotation, 0)) * Math.PI / 180;
      var cos = Math.cos(rad), sin = Math.sin(rad);
      var visualH = w * sin + textH * cos;
      extraY = Math.max(0, (visualH - textH) / 2);
      visualW = w * cos + textH * sin;
    }
    var y = num(layer.y, 0);
    var x = num(layer.x, 0);
    var centerX = x + w / 2;

    return {
      layer: layer,
      index: index,
      textH: textH,
      topExtra: pad + extraY,
      bottomExtra: pad + extraY,
      left: centerX - visualW / 2,
      right: centerX + visualW / 2,
      top: y - pad - extraY,
      bottom: y + textH + pad + extraY,
      fromY: y
    };
  }

  function refresh(box) {
    var y = num(box.layer.y, 0);
    box.top = y - box.topExtra;
    box.bottom = y + box.textH + box.bottomExtra;
  }

  function overlapsX(a, b) {
    return a.left < b.right - 0.5 && a.right > b.left + 0.5;
  }

  function moveBox(box, delta) {
    if (Math.abs(delta) < 0.5) return false;
    box.layer.y = round(num(box.layer.y, 0) + delta);
    refresh(box);
    return true;
  }

  function maxBottom(boxes) {
    var m = -Infinity;
    boxes.forEach(function (b) { if (b.bottom > m) m = b.bottom; });
    return m === -Infinity ? 0 : m;
  }
  function minTop(boxes) {
    var m = Infinity;
    boxes.forEach(function (b) { if (b.top < m) m = b.top; });
    return m === Infinity ? 0 : m;
  }

  /** 从上到下排布；mode=normal 只往下推，mode=compress 允许拉回以压缩间距 */
  function stack(boxes, gap, mode, safeTop) {
    var moved = 0;
    for (var i = 1; i < boxes.length; i++) {
      var b = boxes[i];
      var desired = null;
      for (var j = 0; j < i; j++) {
        if (!overlapsX(boxes[j], b)) continue;
        var cand = boxes[j].bottom + gap;
        if (desired === null || cand > desired) desired = cand;
      }
      if (desired === null) continue;
      if (desired < safeTop) desired = safeTop;

      if (mode === 'compress') {
        if (moveBox(b, desired - b.top)) moved++;
      } else if (desired > b.top + 0.5) {
        if (moveBox(b, desired - b.top)) moved++;
      }
    }
    return moved;
  }

  function shiftUp(boxes, amount, safeTop) {
    if (amount <= 0.5) return 0;
    var room = Math.max(0, minTop(boxes) - safeTop);
    var shift = Math.min(amount, room);
    if (shift <= 0.5) return 0;
    boxes.forEach(function (b) { moveBox(b, -shift); });
    return shift;
  }

  function resolveBoxes(layers, options) {
    var opts = optsOf(options);
    var boxes = (layers || [])
      .map(function (l, i) { return isTextLayer(l) ? makeBox(l, i, opts) : null; })
      .filter(Boolean);

    var result = { ok: true, fixed: 0, details: [], boxes: boxes, overflow: 0, gap: opts.gap, minGap: null };
    if (boxes.length < 2) return result;

    boxes.sort(function (a, b) {
      if (a.top !== b.top) return a.top - b.top;
      return a.left - b.left;
    });

    var changed = stack(boxes, opts.gap, 'normal', opts.safeTop);
    var overflow = maxBottom(boxes) - opts.safeBottom;
    if (overflow > 0.5) {
      var shift = shiftUp(boxes, overflow, opts.safeTop);
      if (shift > 0) changed++;
      overflow = maxBottom(boxes) - opts.safeBottom;

      if (overflow > 0.5) {
        var compressGap = Math.max(opts.minGap, opts.gap - Math.ceil(overflow / Math.max(1, boxes.length - 1)));
        changed += stack(boxes, compressGap, 'compress', opts.safeTop);
        var shift2 = shiftUp(boxes, maxBottom(boxes) - opts.safeBottom, opts.safeTop);
        if (shift2 > 0) changed++;
        overflow = maxBottom(boxes) - opts.safeBottom;
      }
    }

    // 统计实际相邻间距（只统计水平相交、中间没有其它层的相邻对）
    var gaps = [];
    for (var i = 0; i < boxes.length; i++) {
      for (var j = 0; j < boxes.length; j++) {
        if (i === j) continue;
        var a = boxes[i], b = boxes[j];
        if (a.top >= b.top) continue;
        if (!overlapsX(a, b)) continue;
        var blocked = boxes.some(function (c) {
          return c !== a && c !== b && overlapsX(a, c) && overlapsX(c, b) &&
            c.top >= a.top && c.top < b.top;
        });
        if (!blocked) gaps.push(round(b.top - a.bottom));
      }
    }
    result.minGap = gaps.length ? Math.min.apply(null, gaps) : null;
    result.fixed = changed;
    result.overflow = Math.max(0, round(overflow));
    result.ok = overflow <= 0.5 && (result.minGap === null || result.minGap >= opts.minGap - 0.5);
    boxes.forEach(function (b) {
      if (Math.abs(b.layer.y - b.fromY) >= 0.5) {
        result.details.push('图层 ' + (b.index + 1) + '：y ' + b.fromY + ' → ' + b.layer.y);
      }
    });
    return result;
  }

  function resolveLayers(layers, options) {
    return resolveBoxes(layers, options);
  }

  function resolveSpec(spec, options) {
    var result = { ok: true, fixed: 0, pages: [], details: [] };
    if (!spec || !Array.isArray(spec.pages)) {
      result.ok = false;
      return result;
    }
    spec.pages.forEach(function (page, pi) {
      var r = resolveBoxes(page && page.layers, options);
      result.pages.push({ page: pi + 1, fixed: r.fixed, overflow: r.overflow, minGap: r.minGap });
      result.fixed += r.fixed;
      if (!r.ok) result.ok = false;
      r.details.forEach(function (d) {
        result.details.push('P' + (pi + 1) + ' ' + d);
      });
    });
    return result;
  }

  return {
    VERSION: '1.0.0',
    DEFAULTS: DEFAULTS,
    resolveSpec: resolveSpec,
    resolveLayers: resolveLayers
  };
});


