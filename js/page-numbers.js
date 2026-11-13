/* ============================================================
   page-numbers.js — 页码规则（纯函数）
   规则：
     ✅ 只有 1 页：不加页码；已有的页码层会被移除
     ✅ 多页：每页右下角加 "01 / 07"
     ✅ 幂等：重复执行不会叠出多个页码
     ✅ 页码层标记 _role:'footer' / _isPageNumber:true
   坐标：360×640，页码 y=572、height=16，底部 588 < 安全线 596
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof window !== 'undefined') window.PageNumbers = api;
  else root.PageNumbers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 内容底部安全线 546（平台 62 + 一行正文 32）；页码放在其后
  var DEFAULTS = {
    y: 562, height: 16, x: 28, width: 304,
    fontSize: 12, opacity: 0.5, color: '#292B27', fontFamily: 'sans-serif'
  };

  function pad2(n) { return String(n).padStart(2, '0'); }
  function isHex(v) { return /^#[0-9A-F]{6}$/i.test(String(v || '')); }

  function plain(layer) {
    return String((layer && layer.content) || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isPageNumberLayer(layer) {
    if (!layer || layer.type !== 'text') return false;
    if (layer._isPageNumber === true || layer._role === 'footer') return true;
    if (Number(layer.y) < 500) return false;
    var text = plain(layer);
    return /^\d{1,2}\s*\/\s*\d{1,2}$/.test(text) ||
      /^第\s*\d{1,2}\s*页(\s*\/\s*(共\s*)?\d{1,2}\s*页)?$/.test(text) ||
      /^(p|page)\s*\d{1,2}(\s*\/\s*\d{1,2})?$/i.test(text);
  }

  function pickStyle(pages, options) {
    options = options || {};
    var firstText = null;
    (pages || []).forEach(function (page) {
      if (firstText) return;
      (page && page.layers || []).forEach(function (l) {
        if (!firstText && l && l.type === 'text' && !isPageNumberLayer(l) && plain(l)) firstText = l;
      });
    });
    return {
      color: isHex(options.color) ? String(options.color).toUpperCase()
        : (firstText && isHex(firstText.color) ? String(firstText.color).toUpperCase() : DEFAULTS.color),
      fontFamily: options.fontFamily || (firstText && firstText.fontFamily) || DEFAULTS.fontFamily
    };
  }

  function makePageNumberLayer(index, total, style) {
    style = style || DEFAULTS;
    return {
      id: 'page-no-' + (index + 1) + '-of-' + total,
      type: 'text',
      content: pad2(index + 1) + ' / ' + pad2(total),
      fontSize: DEFAULTS.fontSize + 'px',
      fontFamily: style.fontFamily || DEFAULTS.fontFamily,
      color: style.color || DEFAULTS.color,
      bgColor: 'transparent',
      bold: false, italic: false, underline: false, strike: false,
      align: 'right', vertical: false,
      letterSpacing: 1, lineHeight: 1.1, opacity: DEFAULTS.opacity,
      effectClass: null, effectParams: {},
      x: DEFAULTS.x, y: DEFAULTS.y,
      width: DEFAULTS.width, height: DEFAULTS.height,
      heightMode: 'fixed',
      rotation: 0, flipH: false, flipV: false,
      locked: false, groupId: null, backdrop: null,
      _role: 'footer', _isPageNumber: true
    };
  }

  function ensurePageNumbers(pages, options) {
    if (!Array.isArray(pages)) return { ok: false, total: 0, added: 0, removed: 0 };
    var total = pages.length;
    var removed = 0;
    pages.forEach(function (page) {
      if (!page || !Array.isArray(page.layers)) return;
      for (var i = page.layers.length - 1; i >= 0; i--) {
        if (isPageNumberLayer(page.layers[i])) {
          page.layers.splice(i, 1);
          removed++;
        }
      }
    });

    if (total <= 1) {
      return { ok: true, total: total, added: 0, removed: removed, style: null };
    }

    var style = pickStyle(pages, options);
    var added = 0;
    pages.forEach(function (page, i) {
      if (!page) return;
      if (!Array.isArray(page.layers)) page.layers = [];
      page.layers.push(makePageNumberLayer(i, total, style));
      added++;
    });
    return { ok: true, total: total, added: added, removed: removed, style: style };
  }

  return {
    VERSION: '1.0.0',
    DEFAULTS: DEFAULTS,
    isPageNumberLayer: isPageNumberLayer,
    pickStyle: pickStyle,
    makePageNumberLayer: makePageNumberLayer,
    ensurePageNumbers: ensurePageNumbers
  };
});
