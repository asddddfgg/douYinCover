/* AI V2 Brand Adapter — douYinCover fcd3e7f
 * 只读读取 BrandManager；经典 script / file://。
 */
(function (w) {
  'use strict';
  function call(obj, name, fallback) {
    try { return obj && typeof obj[name] === 'function' ? obj[name]() : fallback; }
    catch (e) { return fallback; }
  }
  function validHex(v) {
    v = String(v || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(v) ? v : null;
  }
  function rgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lum(h) {
    return rgb(h).map(function (v) {
      v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }).reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function contrast(fg, bg) {
    var a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  function sat(h) {
    var c = rgb(h), max = Math.max.apply(null, c), min = Math.min.apply(null, c);
    if (max === min) return 0;
    var l = (max + min) / 2 / 255;
    return l > 0.5 ? (max - min) / (510 - max - min) : (max - min) / (max + min);
  }
  function snapshot() {
    var bm = w.BrandManager;
    if (!bm) return {
      available: false, brandId: null, brandName: '未设置品牌',
      colors: [], fonts: [], bgPresets: [], strictColors: false, strictFonts: false,
      roles: {}, palette: {}, warnings: ['未检测到 BrandManager。']
    };

    var p = call(bm, 'getActivePalette', null) || {};
    var colors = (call(bm, 'getActiveColors', []) || []).map(validHex).filter(Boolean);
    var fonts = ((bm.data && bm.data.fonts) || []).map(function (f) {
      return f && typeof f.name === 'string' ? f.name : null;
    }).filter(Boolean);
    var bgPresets = (call(bm, 'getActiveBgPresets', []) || []).map(function (b) {
      return b && {
        id: b.id, name: b.name, type: b.type,
        color1: validHex(b.color1), color2: validHex(b.color2),
        angle: Number.isFinite(Number(b.angle)) ? Number(b.angle) : 135,
        texture: b.texture || 'none'
      };
    }).filter(function (b) { return b && b.id; });

    var sorted = colors.slice().sort(function (a, b) { return lum(b) - lum(a); });
    var light = sorted.filter(function (c) { return lum(c) >= 0.55; });
    var dark = sorted.filter(function (c) { return lum(c) < 0.25; });
    var middle = sorted.filter(function (c) { return lum(c) >= 0.25 && lum(c) < 0.75; });
    var background = light[0] || null;
    var text = dark.length ? dark[dark.length - 1] : (colors[0] || null);
    // 非背景/非正文色里：第一个当 primary，第二个当 secondary，
    // accent 取饱和度最高的一个（不再盲取“色板最后一个”）
    var nonBase = colors.filter(function (c) { return c !== background && c !== text; });
    var primary = nonBase[0] || middle[0] || colors[0] || null;
    var secondary = nonBase[1] || middle[1] || middle[0] || primary;
    var accent = nonBase.slice().sort(function (a, b) { return sat(b) - sat(a); })[0] || primary;
    var roles = {
      background: background,
      surface: light[1] || background,
      text: text,
      textInverse: light[0] || '#FFFFFF',
      primary: primary,
      secondary: secondary,
      accent: accent,
      border: secondary || text
    };
    // 扁平色板：适配器/校验器直接消费，避免再猜一次
    var palette = {};
    Object.keys(roles).forEach(function (k) {
      var v = validHex(roles[k]);
      if (v) palette[k] = v;
    });
    var warnings = [];
    if (!colors.length) warnings.push('当前色板没有有效 HEX 颜色。');
    if (!fonts.length) warnings.push('当前品牌没有登记字体。');
    return {
      available: true,
      brandId: p.id || (bm.data && bm.data.activePaletteId) || null,
      brandName: p.name || '当前品牌',
      colors: colors,
      fonts: fonts,
      bgPresets: bgPresets,
      strictColors: !!call(bm, 'isStrictColors', false),
      strictFonts: !!call(bm, 'isStrictFonts', false),
      roles: roles,
      palette: palette,
      warnings: warnings
    };
  }
  function validateColor(value, snap) {
    var c = validHex(value), s = snap || snapshot();
    if (!c) return { ok: false, reason: '颜色必须是 #RRGGBB 格式。' };
    if (s.strictColors && s.colors.indexOf(c) < 0)
      return { ok: false, reason: '严格品牌色模式：颜色不在当前色板中。' };
    return { ok: true, value: c };
  }
  function validateFont(value, snap) {
    var s = snap || snapshot();
    if (!value) return { ok: true, value: 'sans-serif' };
    if (s.strictFonts && s.fonts.length && s.fonts.indexOf(value) < 0)
      return { ok: false, reason: '严格品牌字体模式：字体未登记在当前品牌中。' };
    return { ok: true, value: value };
  }
  function checkContrast(fg, bg, large) {
    var f = validHex(fg), b = validHex(bg), required = large ? 3 : 4.5;
    if (!f || !b) return { ok: false, ratio: null, required: required };
    var DC = w.DesignConstants;
    var ratio = (DC && DC.contrast) ? DC.contrast(f, b) : contrast(f, b);
    return { ok: ratio >= required, ratio: Math.round(ratio * 100) / 100, required: required };
  }
  w.AIV2Brand = {
    getSnapshot: snapshot,
    validateColor: validateColor,
    validateFont: validateFont,
    checkContrast: checkContrast,
    resolveColor: function (role, snap) {
      var s = snap || snapshot();
      var DC = w.DesignConstants;
      return (DC && DC.resolveColorRole) ? DC.resolveColorRole(s, role) : (s.roles && s.roles[role] || null);
    }
  };
})(window);
