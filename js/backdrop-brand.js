/* ============================================================
   backdrop-brand.js — 底衬颜色的品牌语义解析
   问题：
     backdrop:{type:'sticky'} 没有 color 时，renderer 用了写死的
     #fff740 / #fff8dc 等非品牌色。
   规则：
     ✅ 底衬颜色属于品牌约束，不再使用硬编码默认色
     ✅ 缺省/非品牌 → 从 surface / background / accent / text 中
        选与文字对比度最合适的精确品牌色
     ✅ mark / custom mask 的颜色也一起解析
   ============================================================ */
(function (w) {
  'use strict';

  function isValidHex(v) { return /^#[0-9A-F]{6}$/i.test(String(v || '')); }
  function hexToRgb(h) {
    var n = parseInt(String(h).slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function luminance(h) {
    var c = hexToRgb(h);
    return [c.r, c.g, c.b].map(function (v) {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }).reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function saturation(h) {
    var c = hexToRgb(h), max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    if (max === min) return 0;
    var l = (max + min) / 510;
    return l > 0.5 ? (max - min) / (510 - max - min) : (max - min) / (max + min);
  }

  function deriveRoles(colors) {
    var roles = {};
    var sorted = colors.slice().sort(function (a, b) { return luminance(b) - luminance(a); });
    var lightest = sorted[0], darkest = sorted[sorted.length - 1];
    var middle = sorted.filter(function (c) { var l = luminance(c); return l >= 0.25 && l < 0.75; });
    roles.background = lightest;
    roles.surface = sorted[1] || lightest;
    roles.text = darkest;
    roles.primary = middle[0] || colors[0];
    roles.accent = colors.slice().sort(function (a, b) { return saturation(b) - saturation(a); })[0] || roles.primary;
    roles.secondary = middle[1] || roles.primary;
    return roles;
  }

  // explicitColors：可选，直接作为品牌色板（供 AI 校验等已算出色板的链路复用）
  function info(explicitColors) {
    var colors = [], roles = {};
    if (Array.isArray(explicitColors) && explicitColors.length) {
      colors = explicitColors.map(function (c) { return String(c).toUpperCase(); }).filter(isValidHex);
      colors = Array.from(new Set(colors));
      if (colors.length) return { colors: colors, roles: deriveRoles(colors) };
    }
    try {
      if (w.AIV2Brand && w.AIV2Brand.getSnapshot) {
        var snap = w.AIV2Brand.getSnapshot();
        colors = (snap.colors || []).map(function (c) { return String(c).toUpperCase(); }).filter(isValidHex);
        roles = snap.roles || {};
      }
    } catch (e) { }
    if (!colors.length) {
      try {
        var bm = w.BrandManager;
        var active = (bm && bm.getActiveColors && bm.getActiveColors()) || [];
        var all = (bm && bm.getAllColors && bm.getAllColors()) || [];
        colors = (active.length ? active : all).map(function (c) { return String(c).toUpperCase(); }).filter(isValidHex);
      } catch (e) { }
    }
    colors = Array.from(new Set(colors));
    if (!colors.length) return { colors: [], roles: {} };
    var derived = deriveRoles(colors);
    var key;
    for (key in derived) { if (!roles[key]) roles[key] = derived[key]; }
    return { colors: colors, roles: roles };
  }

  var DARK_TYPES = { chalkboard: 1, blackboard: 1 };
  function defaultColor(type, layer, explicitColors) {
    var data = info(explicitColors);
    if (!data.colors.length) return null;
    var roles = data.roles;
    var prefs = DARK_TYPES[type]
      ? [roles.text, roles.primary, roles.accent, roles.surface, roles.background]
      : [roles.surface, roles.background, roles.accent, roles.primary, roles.text];
    var text = (layer && layer.color && isValidHex(layer.color)) ? String(layer.color).toUpperCase() : null;
    var candidates = prefs.filter(isValidHex).filter(function (c, i, arr) { return arr.indexOf(c) === i; });
    if (text) {
      var best = null, bestRatio = 0;
      for (var i = 0; i < candidates.length; i++) {
        var r = contrast(text, candidates[i]);
        if (r >= 3.0) return candidates[i];
        if (r > bestRatio) { bestRatio = r; best = candidates[i]; }
      }
      if (best) return best;
    } else if (candidates.length) {
      return candidates[0];
    }
    return candidates[0] || data.colors[0];
  }

  function brandColors(explicitColors) { return info(explicitColors).colors; }
  function isExactBrand(color, colors) {
    return !!color && colors.indexOf(String(color).toUpperCase()) >= 0;
  }
  function resolve(layer, explicitColors) {
    var bd = layer && layer.backdrop;
    var out = { backdrop: bd, changes: [] };
    if (!bd || !bd.type || bd.type === 'none') return out;
    var data = info(explicitColors);
    if (!data.colors.length) return out;
    var next = Object.assign({}, bd);
    if (!isExactBrand(next.color, data.colors)) {
      var fallback = defaultColor(next.type, layer, explicitColors);
      if (fallback) {
        out.changes.push({ key: 'color', from: next.color || '缺省', to: fallback });
        next.color = fallback;
      }
    }
    if (next.type === 'mark') {
      if (!isExactBrand(next.markColor, data.colors)) {
        var markColor = data.roles.accent || defaultColor('mark', layer, explicitColors);
        if (markColor) {
          out.changes.push({ key: 'markColor', from: next.markColor || '缺省', to: markColor });
          next.markColor = markColor;
        }
      }
    }
    out.backdrop = next;
    return out;
  }

  w.BackdropBrand = Object.freeze({
    info: info,
    colors: brandColors,
    defaultColor: defaultColor,
    resolve: resolve,
    contrast: contrast
  });
})(window);
