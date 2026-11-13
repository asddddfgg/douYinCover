/* ============================================================
   rich-text-runs.js — 行内样式结构化（runs / marks）
   目的：
     ✅ 把 content 里的 <span style="..."> 解析成可枚举的 runs
     ✅ 查看 / 删除单段行内样式，不再靠肉眼找 HTML
     ✅ 渲染回 HTML 时保持文字可编辑（老画布继续可用）
   说明：这不是最终存储格式；V2 会直接用 runs/emphasis，V1 先做兼容解析。
   ============================================================ */
(function (w) {
  'use strict';

  var STYLE_KEYS = [
    'color', 'backgroundColor', 'backgroundImage', 'fontSize',
    'fontWeight', 'fontStyle', 'textDecoration', 'webkitTextStroke',
    'borderBottom', 'padding'
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function cpLen(s) { return Array.from(String(s == null ? '' : s)).length; }

  function readStyle(el) {
    var out = {};
    if (!el || !el.style) return out;
    STYLE_KEYS.forEach(function (k) {
      var v = el.style[k];
      if (v) out[k] = v;
    });
    // Edge/Chrome 对 -webkit-text-stroke 的序列化可能不在 camelCase 上
    try {
      var raw = el.getAttribute && el.getAttribute('style');
      if (raw) {
        var m = raw.match(/(?:^|;)\s*(-webkit-text-stroke)\s*:\s*([^;]+)/i);
        if (m) out.webkitTextStroke = m[2].trim();
        var m2 = raw.match(/(?:^|;)\s*(background)\s*:\s*([^;]+)/i);
        if (m2 && !out.backgroundColor && !out.backgroundImage) out.backgroundImage = m2[2].trim();
      }
    } catch (e) { }
    return out;
  }
  function mergeStyle(parent, own) {
    var out = Object.assign({}, parent || {});
    Object.keys(own || {}).forEach(function (k) { out[k] = own[k]; });
    return out;
  }
  function signature(styles) {
    var keys = Object.keys(styles || {}).sort();
    return keys.map(function (k) { return k + ':' + styles[k]; }).join('|');
  }

  function parse(html) {
    var source = String(html == null ? '' : html);
    var root = document.createElement('div');
    root.innerHTML = source;
    var runs = [], offset = 0;
    function push(text, styles) {
      var len = cpLen(text);
      if (!len) return;
      var sig = signature(styles);
      var last = runs[runs.length - 1];
      if (last && last.end === offset && last.sig === sig) {
        last.end += len;
        last.text += text;
      } else {
        runs.push({ start: offset, end: offset + len, text: text, styles: Object.assign({}, styles), sig: sig });
      }
      offset += len;
    }
    function walk(node, inherited) {
      if (!node) return;
      if (node.nodeType === 3) {
        push(node.nodeValue || '', inherited);
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.tagName === 'BR') {
        push('\n', inherited);
        return;
      }
      var styles = mergeStyle(inherited, readStyle(node));
      for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i], styles);
    }
    for (var i = 0; i < root.childNodes.length; i++) walk(root.childNodes[i], {});
    return { runs: runs, plainText: root.textContent || '', html: source };
  }

  function cssOf(styles) {
    var map = {
      color: 'color', backgroundColor: 'background-color', backgroundImage: 'background-image',
      fontSize: 'font-size', fontWeight: 'font-weight', fontStyle: 'font-style',
      textDecoration: 'text-decoration', webkitTextStroke: '-webkit-text-stroke',
      borderBottom: 'border-bottom', padding: 'padding'
    };
    return Object.keys(styles || {}).map(function (k) {
      return (map[k] || k) + ':' + styles[k];
    }).join(';');
  }

  function renderRuns(runs) {
    return (runs || []).map(function (r) {
      var css = cssOf(r.styles);
      return css ? '<span style="' + css + '">' + esc(r.text) + '</span>' : esc(r.text);
    }).join('');
  }

  function styledRuns(parsed) {
    return (parsed.runs || []).filter(function (r) { return Object.keys(r.styles || {}).length > 0; });
  }

  function describe(run) {
    var s = (run && run.styles) || {};
    var labels = [];
    if (s.color) labels.push('文字 ' + s.color);
    if (s.backgroundColor || s.backgroundImage) labels.push('高亮');
    if (s.textDecoration && /underline/i.test(s.textDecoration)) labels.push('下划线');
    if (s.borderBottom) labels.push('下划线/边框');
    if (s.webkitTextStroke) labels.push('描边');
    if (s.fontSize) labels.push('字号 ' + s.fontSize);
    if (s.fontWeight && /bold|[6-9]00/i.test(s.fontWeight)) labels.push('加粗');
    if (s.fontStyle && /italic/i.test(s.fontStyle)) labels.push('斜体');
    if (s.padding) labels.push('内边距');
    return labels.length ? labels : ['普通'];
  }

  function removeStyleAt(html, index, kind) {
    var parsed = parse(html);
    var run = parsed.runs[index];
    if (!run) return { ok: false, html: html, runs: parsed.runs };
    var s = Object.assign({}, run.styles);
    var k = kind || 'all';
    if (k === 'all') {
      s = {};
    } else if (k === 'color') {
      delete s.color;
      delete s.webkitTextFillColor;
    } else if (k === 'highlight') {
      delete s.backgroundColor;
      delete s.backgroundImage;
    } else if (k === 'underline') {
      delete s.textDecoration;
      delete s.borderBottom;
    } else if (k === 'size') {
      delete s.fontSize;
    } else if (k === 'weight') {
      delete s.fontWeight;
      delete s.fontStyle;
    }
    parsed.runs[index].styles = s;
    parsed.runs[index].sig = signature(s);
    return { ok: true, html: renderRuns(parsed.runs), runs: parsed.runs };
  }

  function clearAllStyles(html) {
    var parsed = parse(html);
    parsed.runs.forEach(function (r) { r.styles = {}; r.sig = ''; });
    return { html: renderRuns(parsed.runs), runs: parsed.runs };
  }

  w.RichTextRuns = Object.freeze({
    parse: parse,
    renderRuns: renderRuns,
    styledRuns: styledRuns,
    describe: describe,
    removeStyleAt: removeStyleAt,
    clearAllStyles: clearAllStyles,
    cssOf: cssOf,
    signature: signature
  });
})(window);
