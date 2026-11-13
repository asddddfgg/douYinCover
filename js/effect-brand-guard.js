/* ============================================================
   effect-brand-guard.js — 特效/行内颜色的品牌守卫
   解决：
     ✅ 特效默认色（如 effect-gold 的 #D4AF37）不属于品牌色
     ✅ effectParams 只校验 HEX、不校验品牌
     ✅ 渐变特效用 background-clip，layer.color 校验通过但实际是金色
     ✅ 行内 span 的 #D7B66D 等颜色绕过校验
   策略：
     - 颜色参数缺省/非品牌 → 替换为最近品牌色
     - 特效 CSS 仍有硬编码强色 → strict 报错；非 strict 禁用该特效
     - 行内颜色 → strict 报错；非 strict 替换为最近品牌色
   ============================================================ */
(function (w) {
  'use strict';

  var TOLERANCE = 45; // 加权 RGB 距离；小于它视为“相似色”

  function hexToRgb(hex) {
    var h = String(hex || '').trim();
    if (h[0] !== '#') return null;
    h = h.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) return null;
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    function h(v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }
    return ('#' + h(r) + h(g) + h(b)).toUpperCase();
  }
  function parseColor(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) {
      var a = m[4] === undefined ? 1 : Number(m[4]);
      if (!(a > 0.01)) return null;
      return { hex: rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])), alpha: a, raw: s };
    }
    var rgb = hexToRgb(s);
    if (!rgb) return null;
    return { hex: rgbToHex(rgb.r, rgb.g, rgb.b), alpha: 1, raw: s };
  }
  function distance(a, b) {
    var A = hexToRgb(a), B = hexToRgb(b);
    if (!A || !B) return Infinity;
    var rm = (A.r + B.r) / 2;
    var dr = A.r - B.r, dg = A.g - B.g, db = A.b - B.b;
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }
  function isNeutral(hex) {
    var c = hexToRgb(hex);
    if (!c) return false;
    var max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    var lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    var sat = max === 0 ? 0 : (max - min) / max;
    return sat <= 0.12 || lum <= 0.10 || lum >= 0.93;
  }
  function palette() {
    var out = [];
    try {
      var bm = w.BrandManager;
      if (!bm) return out;
      var active = (bm.getActiveColors && bm.getActiveColors()) || [];
      var all = (bm.getAllColors && bm.getAllColors()) || [];
      out = (active.length ? active : all).map(function (c) { return parseColor(c); })
        .filter(Boolean).map(function (c) { return c.hex; });
    } catch (e) { }
    return Array.from(new Set(out));
  }
  function nearest(hex, pal) {
    var list = pal && pal.length ? pal : palette();
    if (!list.length) return null;
    var best = null, bestD = Infinity;
    list.forEach(function (c) {
      var d = distance(hex, c);
      if (d < bestD) { bestD = d; best = c; }
    });
    return best ? { hex: best, distance: Math.round(bestD * 100) / 100 } : null;
  }
  function acceptable(hex, pal, tolerance) {
    if (!hex) return true;
    if (isNeutral(hex)) return true;
    var list = pal && pal.length ? pal : palette();
    if (!list.length) return true;
    if (list.indexOf(String(hex).toUpperCase()) >= 0) return true;
    var n = nearest(hex, list);
    return !!n && n.distance <= (Number.isFinite(tolerance) ? tolerance : TOLERANCE);
  }
  /** 特效大面积颜色只接受精确品牌色或中性色，避免“接近金色”继续显示为大黄色 */
  function exactOrNeutral(hex, pal) {
    if (!hex) return true;
    if (isNeutral(hex)) return true;
    var list = pal && pal.length ? pal : palette();
    return list.indexOf(String(hex).toUpperCase()) >= 0;
  }
  function extractColors(css) {
    var out = [], seen = {};
    var s = String(css == null ? '' : css);
    var re = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
    var m;
    while ((m = re.exec(s))) {
      var p = parseColor(m[0]);
      if (!p || p.alpha <= 0.01) continue;
      var key = p.hex + '|' + p.alpha;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ hex: p.hex, alpha: p.alpha, raw: m[0] });
    }
    return out;
  }
  function auditColors(colors, pal, tolerance) {
    var list = pal && pal.length ? pal : palette();
    var offenders = [];
    colors.forEach(function (c) {
      if (!acceptable(c.hex, list, tolerance)) {
        var n = nearest(c.hex, list);
        offenders.push({
          color: c.hex, raw: c.raw, alpha: c.alpha,
          nearest: n ? n.hex : null, distance: n ? n.distance : null
        });
      }
    });
    return { ok: offenders.length === 0, colors: colors, offenders: offenders };
  }
  function auditCss(css, pal, tolerance) {
    return auditColors(extractColors(css), pal, tolerance);
  }

  function effectDef(id) {
    try {
      if (typeof w.getEffectParamsDef === 'function') {
        var d = w.getEffectParamsDef(id);
        if (d) return d;
      }
      if (typeof w.getAllEffectsMaster === 'function') {
        var e = (w.getAllEffectsMaster() || []).filter(function (x) { return x && x.id === id; })[0];
        if (e && e.params) return e.params;
      }
    } catch (e) { }
    return null;
  }

  /** 把特效颜色参数补成/替换成品牌色；缺省参数也处理，避免渲染器吃默认金色 */
  function resolveEffectParams(effectId, params, pal) {
    var list = pal && pal.length ? pal : palette();
    var defs = effectDef(effectId);
    var out = Object.assign({}, params || {});
    var changes = [];
    if (!defs || !list.length) return { params: out, changes: changes };
    Object.keys(defs).forEach(function (k) {
      var meta = defs[k] || {};
      if (meta.type !== 'color') return;
      var cur = out[k];
      var parsed = parseColor(cur);
      if (parsed && exactOrNeutral(parsed.hex, list)) return;
      var fallback = parseColor(meta.default);
      var target = null;
      if (fallback && exactOrNeutral(fallback.hex, list)) {
        target = cur === undefined ? meta.default : fallback.hex;
      } else {
        var base = parsed ? parsed.hex : (fallback ? fallback.hex : '#808080');
        var n = nearest(base, list);
        target = n ? n.hex : null;
      }
      if (target && String(target).toUpperCase() !== String(cur || '').toUpperCase()) {
        changes.push({ key: k, from: cur, to: target });
        out[k] = target;
      }
    });
    return { params: out, changes: changes };
  }

  /** 审核一个特效：先补品牌色，再检查 CSS 里是否还有硬编码强色 */
  function auditEffect(effectId, params, pal, tolerance) {
    var list = pal && pal.length ? pal : palette();
    var resolved = resolveEffectParams(effectId, params, list);
    var css = '';
    try {
      if (typeof w.renderEffectCss === 'function') css = w.renderEffectCss(effectId, resolved.params) || '';
    } catch (e) { css = ''; }
    var audit = auditCss(css, list, tolerance);
    return {
      ok: audit.offenders.length === 0,
      resolved: resolved.params,
      changes: resolved.changes,
      colors: audit.colors,
      offenders: audit.offenders,
      hardcoded: audit.offenders,
      css: css
    };
  }

  /** 审核文字内容里的行内颜色（span style / 渐变 / 下划线色） */
  function auditContent(content, pal, tolerance) {
    return auditCss(String(content == null ? '' : content), pal, tolerance);
  }

  function replaceColorTokens(text, pal, tolerance) {
    var list = pal && pal.length ? pal : palette();
    var changes = [];
    var out = String(text == null ? '' : text).replace(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g, function (token) {
      var p = parseColor(token);
      if (!p || p.alpha <= 0.01 || acceptable(p.hex, list, tolerance)) return token;
      var n = nearest(p.hex, list);
      if (!n) return token;
      changes.push({ from: token, to: n.hex, nearest: n.hex, distance: n.distance });
      if (/^rgba?\(/i.test(token)) {
        var rgb = hexToRgb(n.hex);
        return p.alpha < 1
          ? 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + p.alpha + ')'
          : 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
      }
      return n.hex;
    });
    return { text: out, changes: changes };
  }

  function replaceContentColors(content, pal, tolerance) {
    return replaceColorTokens(content, pal, tolerance);
  }

  var UNSAFE = {
    'effect-fire': 1, 'effect-ice': 1, 'effect-purple-mist': 1,
    'effect-glitch': 1, 'effect-hk': 1, 'effect-lightning': 1, 'effect-viral': 1
  };
  function brandSafeEffect(effectId) {
    if (UNSAFE[effectId]) return false;
    try {
      if (w.EffectSemantics && typeof w.EffectSemantics.getMeta === 'function') {
        var m = w.EffectSemantics.getMeta(effectId);
        if (m && m.brandSafe === false) return false;
      }
    } catch (e) { }
    return true;
  }

  w.EffectBrandGuard = Object.freeze({
    TOLERANCE: TOLERANCE,
    palette: palette,
    parseColor: parseColor,
    distance: distance,
    isNeutral: isNeutral,
    nearest: nearest,
    acceptable: acceptable,
    extractColors: extractColors,
    auditColors: auditColors,
    auditCss: auditCss,
    auditContent: auditContent,
    resolveEffectParams: resolveEffectParams,
    auditEffect: auditEffect,
    replaceColorTokens: replaceColorTokens,
    replaceContentColors: replaceContentColors,
    brandSafeEffect: brandSafeEffect
  });
})(window);
