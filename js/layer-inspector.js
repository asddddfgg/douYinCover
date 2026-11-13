/* ============================================================
   layer-inspector.js — 图层检查器（P0–P4 统一入口）
   选中图层后可查看并增删：
     ✅ 行内样式（content 里的 span → runs）
     ✅ 图层特效栈（effectClasses / effectParams）
     ✅ 背景色 / 容器（bgColor / bgRadius / bgPadding）
     ✅ 底衬（backdrop）
     ✅ 品牌色 / 对比度 / 合规审计
   所有修改走 state.saveState()，一次操作一次撤销。
   ============================================================ */
(function (w) {
  'use strict';
  var DC = w.DesignConstants || {};
  var state = w.state;
  var currentLayerId = null;
  var overlay = null, panel = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function toast(msg) {
    try { if (typeof w.showBgToast === 'function') { w.showBgToast(msg, 2200); return; } } catch (e) { }
    try { console.log('[LayerInspector]', msg); } catch (e) { }
  }
  function currentPage() {
    if (!state || !Array.isArray(state.pages)) return null;
    return state.pages.filter(function (p) { return p.id === state.currentPageId; })[0] || state.pages[0] || null;
  }
  function getLayer(id) {
    var page = currentPage();
    if (!page) return null;
    var lid = id || currentLayerId;
    return (page.layers || []).filter(function (l) { return l.id === lid; })[0] || null;
  }
  function palette() {
    var out = [];
    try {
      var bm = w.BrandManager;
      if (bm) {
        var active = (bm.getActiveColors && bm.getActiveColors()) || [];
        var all = (bm.getAllColors && bm.getAllColors()) || [];
        out = active.length ? active : all;
      }
    } catch (e) { }
    if (!out.length && w.AIV2Brand && w.AIV2Brand.getSnapshot) {
      try { out = w.AIV2Brand.getSnapshot().colors || []; } catch (e) { }
    }
    return Array.from(new Set((out || []).map(function (c) {
      return String(c || '').toUpperCase();
    }).filter(function (c) { return /^#[0-9A-F]{6}$/.test(c); })));
  }
  function backdropColor(type, layer) {
    try {
      if (w.BackdropBrand && w.BackdropBrand.defaultColor) {
        return w.BackdropBrand.defaultColor(type || 'sticky', layer, palette());
      }
    } catch (e) { }
    return null;
  }
  function swatches(attr, selected) {
    var pal = palette();
    if (!pal.length) return '<span class="li-muted">当前品牌没有可用色板</span>';
    return pal.map(function (c) {
      return '<button class="li-swatch' + (selected && selected.toUpperCase() === c ? ' on' : '') +
        '" style="background:' + c + '" data-li-color="' + c + '" data-li-target="' + attr + '" title="' + c + '"></button>';
    }).join('');
  }

  function commit(mutator) {
    var layer = getLayer();
    if (!layer) return;
    try { if (mutator) mutator(layer); } catch (e) { toast('操作失败：' + (e.message || e)); return; }
    try { if (state && state.saveState) state.saveState(); } catch (e) { }
    try {
      if (typeof w.renderAll === 'function') w.renderAll();
      else if (typeof w.renderCanvas === 'function') w.renderCanvas();
    } catch (e) { }
    render();
  }

  function applyInline(styleList, label) {
    var layer = getLayer();
    if (!layer) return;
    if (!state || state.editingLayerId !== layer.id) {
      toast('请先双击文字进入编辑，并选中要强调的一段');
      return;
    }
    var ctx = null;
    try { ctx = (typeof w.getActiveSelectionRange === 'function') ? w.getActiveSelectionRange() : null; } catch (e) { }
    if (!ctx || ctx.collapsed || !ctx.range) {
      toast('请先在画布中选中一段文字');
      return;
    }
    var ok = false;
    try { ok = w.wrapSelectionWithStyle(styleList, true, ctx); } catch (e) { }
    if (!ok) { toast('没有选中可应用样式的文字'); return; }
    try { layer.content = ctx.el.innerHTML; } catch (e) { }
    commit(null);
    toast('已添加行内样式：' + label);
  }

  function inlineHtml(layer) {
    var parsed = (w.RichTextRuns && w.RichTextRuns.parse) ? w.RichTextRuns.parse(layer.content || '') : { runs: [] };
    var runs = parsed.runs || [];
    var rows = [];
    runs.forEach(function (run, idx) {
      var labels = (w.RichTextRuns && w.RichTextRuns.describe) ? w.RichTextRuns.describe(run) : [];
      if (!labels.length || labels[0] === '普通') return;
      rows.push(
        '<div class="li-row">' +
        '  <div class="li-row-main"><b>' + esc(run.text.slice(0, 16)) + (run.text.length > 16 ? '…' : '') + '</b>' +
        '    <span class="li-tags">' + labels.map(function (x) { return '<em>' + esc(x) + '</em>'; }).join('') + '</span>' +
        '  </div>' +
        '  <button class="li-x" data-li-inline-remove="' + idx + '" title="删除这段行内样式">×</button>' +
        '</div>'
      );
    });
    if (!rows.length) rows.push('<div class="li-empty">没有行内样式；文字是纯文本或只有图层级样式。</div>');
    var pal = palette();
    var colorButtons = pal.map(function (c) {
      return '<button class="li-swatch" style="background:' + c + '" data-li-inline-color="' + c + '" title="' + c + '"></button>';
    }).join('');
    return [
      rows.join(''),
      '<div class="li-add">',
      '  <div class="li-add-line"><span>文字色</span>' + (colorButtons || '<span class="li-muted">无色板</span>') + '</div>',
      '  <div class="li-add-line">',
      '    <button class="li-btn" data-li-inline="highlight" data-li-inline-color="' + (pal[0] || '#C27C5A') + '">高亮</button>',
      '    <button class="li-btn" data-li-inline="underline">下划线</button>',
      '    <button class="li-btn" data-li-inline="bold">加粗</button>',
      '    <button class="li-btn danger" data-li-inline-clear="1">清除全部行内样式</button>',
      '  </div>',
      '  <div class="li-hint">先在画布中双击文字并选中一段，再点上面的按钮。</div>',
      '</div>'
    ].join('');
  }

  function effectsHtml(layer) {
    var stack = (w.EffectStack && w.EffectStack.fromLayer) ? w.EffectStack.fromLayer(layer) : [];
    var appliedIds = stack.map(function (x) { return x.id; });
    var available = (w.EffectStack && w.EffectStack.listPresets) ? w.EffectStack.listPresets() : [];
    if (w.EffectPrefs && w.EffectPrefs.filterPresets) available = w.EffectPrefs.filterPresets(available);
    var replaceable = available.filter(function (p) { return appliedIds.indexOf(p.id) < 0; });
    var options = function (selectedId, placeholder) {
      var out = ['<option value="">' + esc(placeholder) + '</option>'];
      available.forEach(function (p) {
        if (p.id === selectedId) return;
        out.push('<option value="' + esc(p.id) + '">' + esc(p.name + '（' + p.id + '）') + '</option>');
      });
      return out.join('');
    };
    var rows = stack.map(function (x, i) {
      var bad = x.status !== 'renderable' || x.brandSafe === false;
      var hasAlt = replaceable.some(function (p) { return p.id !== x.id; });
      return '<div class="li-row">' +
        '<div class="li-row-main"><b>' + esc(x.name || x.id) + '</b> <code>' + esc(x.id) + '</code>' +
        '<span class="li-tags"><em>' + esc(x.family || '?') + ' / ' + esc(x.preset || '?') + '</em>' +
        (bad ? '<em class="bad">非品牌安全</em>' : '<em class="ok">可渲染</em>') + '</span>' +
        '<div class="li-sub">' + esc(JSON.stringify(x.params || {}).slice(0, 120)) + '</div>' +
        (hasAlt ? '<div class="li-sub"><select class="li-select" data-li-fx-swap="' + i + '">' +
          options(x.id, '替换为…') + '</select></div>' : '') +
        '</div>' +
        '<div class="li-actions">' +
        '<button class="li-mini" data-li-fx-move="' + i + '" data-li-fx-dir="-1">↑</button>' +
        '<button class="li-mini" data-li-fx-move="' + i + '" data-li-fx-dir="1">↓</button>' +
        '<button class="li-x" data-li-fx-remove="' + esc(x.id) + '">×</button>' +
        '</div></div>';
    });
    if (!rows.length) rows.push('<div class="li-empty">没有图层特效。</div>');
    var addOpts = ['<option value="">选择要添加的特效…</option>'];
    available.forEach(function (p) {
      if (appliedIds.indexOf(p.id) >= 0) return;
      addOpts.push('<option value="' + esc(p.id) + '">' + esc(p.name + '（' + p.id + '）') + '</option>');
    });
    var hasStroke = stack.some(function (x) { return x.family === 'stroke'; });
    return [
      '<div class="li-sub">已应用（' + stack.length + '）</div>',
      rows.join(''),
      '<div class="li-sub" style="margin-top:8px;">可添加（未应用，点按钮才会生效）</div>',
      '<div class="li-add-line"><select class="li-select" id="li-fx-add">' + addOpts.join('') + '</select>',
      '  <button class="li-btn" data-li-fx-add="1">添加特效</button>',
      (hasStroke ? '  <button class="li-btn danger" data-li-fx-drop-family="stroke">移除描边</button>' : ''),
      '</div>'
    ].join('');
  }

  function fillHtml(layer) {
    var cur = layer.bgColor && layer.bgColor !== 'transparent' ? String(layer.bgColor).toUpperCase() : '';
    return [
      '<div class="li-row"><div class="li-row-main"><b>背景色</b>',
      '<div class="li-sub">' + (cur ? '<span class="li-dot" style="background:' + esc(cur) + '"></span>' + esc(cur) : '透明') + '</div></div>',
      '<button class="li-x" data-li-fill-clear="1">×</button></div>',
      '<div class="li-add-line">' + (swatches('fill', cur) || '') + '</div>',
      '<div class="li-grid">',
      '<label>圆角 <input class="li-num" id="li-fill-radius" type="number" min="0" max="80" value="' + (layer.bgRadius == null ? 6 : layer.bgRadius) + '"></label>',
      '<label>内边距 <input class="li-num" id="li-fill-padding" type="number" min="0" max="24" value="' + (layer.bgPadding == null ? 6 : layer.bgPadding) + '"></label>',
      '</div>'
    ].join('');
  }

  function backdropHtml(layer) {
    var bd = layer.backdrop || {};
    var list = Array.isArray(w.BACKDROP_PRESETS) ? w.BACKDROP_PRESETS : [];
    var opts = list.map(function (p) {
      return '<option value="' + esc(p.type) + '"' + (bd.type === p.type ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    if (!opts) opts = '<option value="none">无</option>';
    return [
      '<div class="li-grid">',
      '<label>类型 <select class="li-select" id="li-bd-type">' + opts + '</select></label>',
      '<label>透明度 <input class="li-num" id="li-bd-opacity" type="number" min="0" max="100" value="' + Math.round((bd.opacity == null ? 1 : bd.opacity) * 100) + '"></label>',
      '<label>内边距 <input class="li-num" id="li-bd-padding" type="number" min="0" max="40" value="' + (bd.padding == null ? 12 : bd.padding) + '"></label>',
      '<label>旋转 <input class="li-num" id="li-bd-rotate" type="number" min="-15" max="15" value="' + (bd.rotate == null ? 0 : bd.rotate) + '"></label>',
      '</div>',
      '<div class="li-add-line"><span>底衬色</span>' + (swatches('bd', bd.color) || '') + '</div>',
      '<div class="li-add-line"><button class="li-btn" data-li-bd-apply="1">应用底衬</button>',
      '<button class="li-btn danger" data-li-bd-clear="1">清除底衬</button></div>'
    ].join('');
  }

  function auditHtml(layer) {
    var pal = palette();
    var msgs = [];
    try {
      if (w.EffectBrandGuard) {
        var ca = w.EffectBrandGuard.auditContent(layer.content || '', pal);
        ca.offenders.forEach(function (o) { msgs.push('行内色 ' + o.raw + ' → 最近品牌色 ' + o.nearest); });
        if (layer.bgColor && layer.bgColor !== 'transparent') {
          var b = w.EffectBrandGuard.parseColor(layer.bgColor);
          if (b && !w.EffectBrandGuard.acceptable(b.hex, pal, 0)) {
            var n = w.EffectBrandGuard.nearest(b.hex, pal);
            msgs.push('背景色 ' + layer.bgColor + ' → 最近品牌色 ' + (n && n.hex));
          }
        }
        if (layer.backdrop && layer.backdrop.type && layer.backdrop.type !== 'none') {
          if (!layer.backdrop.color) {
            var dc = backdropColor(layer.backdrop.type, layer);
            if (dc) msgs.push('底衬色缺省 → 渲染将使用品牌色 ' + dc);
          } else {
            var bd = w.EffectBrandGuard.parseColor(layer.backdrop.color);
            if (bd && !w.EffectBrandGuard.acceptable(bd.hex, pal, 0)) {
              var n2 = w.EffectBrandGuard.nearest(bd.hex, pal);
              msgs.push('底衬色 ' + layer.backdrop.color + ' → 最近品牌色 ' + (n2 && n2.hex));
            }
          }
        }
        (w.EffectStack && w.EffectStack.fromLayer ? w.EffectStack.fromLayer(layer) : []).forEach(function (x) {
          var a = w.EffectBrandGuard.auditEffect(x.id, x.params, pal);
          a.offenders.forEach(function (o) { msgs.push('特效 ' + x.id + ' 硬编码色 ' + o.raw + ' → 最近品牌色 ' + o.nearest); });
        });
      }
    } catch (e) { }
    var contrast = '';
    try {
      if (layer.color && layer.bgColor && layer.bgColor !== 'transparent' && DC.contrast) {
        contrast = ' · 对比度 ' + DC.contrast(layer.color, layer.bgColor).toFixed(2) + ':1';
      }
    } catch (e) { }
    return msgs.length
      ? '<div class="li-warn">' + msgs.map(esc).join('<br>') + '</div>'
      : '<div class="li-ok">✓ 未发现非品牌色 / 硬编码特效' + contrast + '</div>';
  }


  function bindBody(body) {
    var layer = getLayer();
    if (!layer) return;
    body.querySelectorAll('[data-li-inline-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-li-inline-remove'));
        if (!w.RichTextRuns) return;
        var r = w.RichTextRuns.removeStyleAt(layer.content || '', idx, 'all');
        if (!r.ok) return;
        layer.content = r.html;
        commit(null);
        toast('已删除该段行内样式');
      });
    });
    body.querySelectorAll('[data-li-inline-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!w.RichTextRuns) return;
        var r = w.RichTextRuns.clearAllStyles(layer.content || '');
        layer.content = r.html;
        commit(null);
        toast('已清除全部行内样式');
      });
    });
    body.querySelectorAll('[data-li-inline-color]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        var color = btn.getAttribute('data-li-inline-color');
        if (!color) return;
        applyInline([{ prop: 'color', val: color }], color);
      });
    });
    body.querySelectorAll('[data-li-inline]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-li-inline');
        var color = btn.getAttribute('data-li-inline-color') || palette()[0] || '#C27C5A';
        if (kind === 'highlight') {
          applyInline([
            { prop: 'background-color', val: color },
            { prop: 'padding', val: '0 2px' },
            { prop: 'border-radius', val: '2px' }
          ], '高亮');
        } else if (kind === 'underline') {
          applyInline([
            { prop: 'text-decoration', val: 'underline' },
            { prop: 'text-underline-offset', val: '2px' }
          ], '下划线');
        } else if (kind === 'bold') {
          applyInline([{ prop: 'font-weight', val: '700' }], '加粗');
        }
      });
    });

    body.querySelectorAll('[data-li-fx-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-li-fx-remove');
        if (!w.EffectStack) return;
        commit(function (l) { w.EffectStack.remove(l, id); });
      });
    });
    body.querySelectorAll('[data-li-fx-move]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-li-fx-move'));
        var dir = Number(btn.getAttribute('data-li-fx-dir'));
        var stack = w.EffectStack ? w.EffectStack.fromLayer(layer) : [];
        var item = stack[idx];
        if (!item) return;
        commit(function (l) { w.EffectStack.move(l, item.id, dir); });
      });
    });
    body.querySelectorAll('[data-li-fx-swap]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var idx = Number(sel.getAttribute('data-li-fx-swap'));
        var stack = w.EffectStack ? w.EffectStack.fromLayer(layer) : [];
        var item = stack[idx];
        var newId = sel.value;
        if (!item || !newId || newId === item.id) return;
        var params = {};
        try {
          if (w.EffectBrandGuard) {
            var a = w.EffectBrandGuard.auditEffect(newId, {}, palette());
            params = a.resolved || {};
          }
        } catch (e) { }
        commit(function (l) { w.EffectStack.replace(l, item.id, newId, params); });
        toast('已替换特效：' + item.id + ' → ' + newId);
      });
    });
    body.querySelectorAll('[data-li-fx-drop-family]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var family = btn.getAttribute('data-li-fx-drop-family');
        var victims = (w.EffectStack ? w.EffectStack.fromLayer(layer) : [])
          .filter(function (x) { return x.family === family; });
        if (!victims.length) return;
        commit(function (l) {
          victims.forEach(function (x) { w.EffectStack.remove(l, x.id); });
        });
        toast('已移除 ' + victims.length + ' 个' + (family === 'stroke' ? '描边' : family) + '特效');
      });
    });
    var fxAdd = body.querySelector('[data-li-fx-add]');
    if (fxAdd) {
      fxAdd.addEventListener('click', function () {
        var sel = body.querySelector('#li-fx-add');
        var id = sel && sel.value;
        if (!id || !w.EffectStack) return;
        var pal = palette();
        var params = {};
        try {
          if (w.EffectBrandGuard) {
            var a = w.EffectBrandGuard.auditEffect(id, {}, pal);
            params = a.resolved || {};
          }
        } catch (e) { }
        commit(function (l) { w.EffectStack.add(l, id, params); });
        toast('已添加特效：' + id);
      });
    }

    body.querySelectorAll('[data-li-color][data-li-target="fill"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var c = btn.getAttribute('data-li-color');
        commit(function (l) { l.bgColor = c; });
      });
    });
    var fillClear = body.querySelector('[data-li-fill-clear]');
    if (fillClear) fillClear.addEventListener('click', function () {
      commit(function (l) { l.bgColor = 'transparent'; });
    });
    ['radius', 'padding'].forEach(function (k) {
      var el = body.querySelector('#li-fill-' + k);
      if (!el) return;
      el.addEventListener('change', function () {
        var n = Number(el.value);
        if (!Number.isFinite(n)) return;
        commit(function (l) {
          if (k === 'radius') l.bgRadius = Math.max(0, Math.min(80, n));
          else l.bgPadding = Math.max(0, Math.min(24, n));
        });
      });
    });
  }


  function bindBackdrop(body) {
    body.querySelectorAll('[data-li-color][data-li-target="bd"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var c = btn.getAttribute('data-li-color');
        commit(function (l) {
          l.backdrop = Object.assign({ type: 'sticky', color: backdropColor('sticky', l), opacity: 1, padding: 12, rotate: 0 }, l.backdrop || {});
          l.backdrop.color = c;
        });
      });
    });
    var bdApply = body.querySelector('[data-li-bd-apply]');
    if (bdApply) bdApply.addEventListener('click', function () {
      var type = (body.querySelector('#li-bd-type') || {}).value || 'sticky';
      var opacity = Number((body.querySelector('#li-bd-opacity') || {}).value);
      var padding = Number((body.querySelector('#li-bd-padding') || {}).value);
      var rotate = Number((body.querySelector('#li-bd-rotate') || {}).value);
      commit(function (l) {
        l.backdrop = Object.assign({ type: 'sticky', color: backdropColor(type, l), opacity: 1, padding: 12, rotate: 0 }, l.backdrop || {});
        l.backdrop.type = type;
        if (Number.isFinite(opacity)) l.backdrop.opacity = Math.max(0, Math.min(1, opacity / 100));
        if (Number.isFinite(padding)) l.backdrop.padding = Math.max(0, Math.min(40, padding));
        if (Number.isFinite(rotate)) l.backdrop.rotate = Math.max(-15, Math.min(15, rotate));
        if (!l.backdrop.color) l.backdrop.color = backdropColor(type, l);
      });
      toast('已应用底衬');
    });
    var bdClear = body.querySelector('[data-li-bd-clear]');
    if (bdClear) bdClear.addEventListener('click', function () {
      commit(function (l) { l.backdrop = { type: 'none', color: backdropColor('none', l), opacity: 1, padding: 12, rotate: 0 }; });
      toast('已清除底衬');
    });
  }

  function render() {
    if (!panel) return;
    var layer = getLayer();
    var body = panel.querySelector('#li-body');
    if (!body) return;
    if (!layer) {
      body.innerHTML = '<div class="li-empty">请先选中一个图层。</div>';
      return;
    }
    body.innerHTML = [
      '<div class="li-layer">',
      '<div><b>' + esc(layer.type === 'shape' ? '形状图层' : '文字图层') + '</b> · <code>' + esc(layer.id) + '</code></div>',
      '<div class="li-sub">' + esc(String(layer.content || '').replace(/<[^>]*>/g, '').slice(0, 60) || '（无文字）') + '</div>',
      '</div>',
      '<section class="li-sec"><h3>行内样式 <small>content 里的 span</small></h3>' + inlineHtml(layer) + '</section>',
      '<section class="li-sec"><h3>图层特效 <small>effectClasses / effectParams</small></h3>' + effectsHtml(layer) + '</section>',
      '<section class="li-sec"><h3>背景色 / 容器 <small>bgColor / bgRadius / bgPadding</small></h3>' + fillHtml(layer) + '</section>',
      '<section class="li-sec"><h3>底衬 <small>backdrop</small></h3>' + backdropHtml(layer) + '</section>',
      '<section class="li-sec"><h3>合规审计</h3>' + auditHtml(layer) + '</section>'
    ].join('');
    bindBody(body);
    bindBackdrop(body);
  }


  function injectStyle() {
    if (document.getElementById('li-style')) return;
    var st = document.createElement('style');
    st.id = 'li-style';
    st.textContent = [
      '#li-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;}',
      '#li-overlay.on{display:flex;}',
      '.li-panel{width:min(780px,94vw);max-height:88vh;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;}',
      '.li-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #30363d;background:#161b22;}',
      '.li-head h2{margin:0;font-size:16px;color:#e6edf3;display:flex;gap:8px;align-items:center;}',
      '.li-head small{font-size:11px;font-weight:400;color:#8b949e;}',
      '.li-close{background:none;border:0;color:#8b949e;font-size:24px;line-height:1;cursor:pointer;}',
      '.li-close:hover{color:#fff;}',
      '.li-body{padding:14px 18px 22px;overflow:auto;}',
      '.li-layer{padding:10px 12px;border:1px solid #30363d;border-radius:8px;background:#161b22;margin-bottom:12px;}',
      '.li-sub{font-size:11px;color:#8b949e;margin-top:4px;word-break:break-all;}',
      '.li-sec{border-top:1px solid #21262d;padding:12px 0;}',
      '.li-sec h3{margin:0 0 10px;font-size:13px;color:#e6edf3;display:flex;gap:8px;align-items:baseline;}',
      '.li-sec h3 small{font-size:10px;color:#6e7681;font-weight:400;}',
      '.li-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed #21262d;}',
      '.li-row:last-child{border-bottom:0;}',
      '.li-row-main{min-width:0;flex:1;font-size:12px;}',
      '.li-row-main b{color:#e6edf3;font-weight:600;}',
      '.li-tags{display:inline-flex;gap:4px;flex-wrap:wrap;margin-left:6px;vertical-align:middle;}',
      '.li-tags em{font-style:normal;font-size:10px;color:#8b949e;background:#21262d;border:1px solid #30363d;border-radius:9px;padding:1px 6px;}',
      '.li-tags em.ok{color:#7ee787;border-color:rgba(126,231,135,.35);}',
      '.li-tags em.bad{color:#f85149;border-color:rgba(248,81,73,.35);}',
      '.li-actions{display:flex;gap:3px;flex-shrink:0;}',
      '.li-x{background:none;border:1px solid #30363d;color:#f85149;border-radius:5px;width:24px;height:24px;line-height:1;cursor:pointer;font-size:15px;}',
      '.li-x:hover{background:rgba(248,81,73,.12);}',
      '.li-mini{background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:5px;width:22px;height:24px;cursor:pointer;font-size:11px;}',
      '.li-add{margin-top:8px;}',
      '.li-add-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0;font-size:11px;color:#8b949e;}',
      '.li-btn{background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;}',
      '.li-btn:hover{border-color:#58a6ff;color:#fff;}',
      '.li-btn.danger{color:#f85149;border-color:rgba(248,81,73,.35);}',
      '.li-select{background:#0d1117;border:1px solid #30363d;color:#c9d1d9;border-radius:6px;padding:4px 8px;font-size:11px;max-width:330px;}',
      '.li-num{width:60px;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;border-radius:5px;padding:3px 6px;font-size:11px;}',
      '.li-grid{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0;font-size:11px;color:#8b949e;}',
      '.li-grid label{display:flex;align-items:center;gap:6px;}',
      '.li-swatch{width:22px;height:22px;border-radius:5px;border:1px solid rgba(255,255,255,.18);cursor:pointer;padding:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);}',
      '.li-swatch.on{outline:2px solid #58a6ff;outline-offset:1px;}',
      '.li-dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:middle;border:1px solid rgba(255,255,255,.2);}',
      '.li-empty{font-size:11px;color:#6e7681;padding:6px 0;}',
      '.li-hint{font-size:10px;color:#6e7681;margin-top:4px;}',
      '.li-warn{font-size:11px;line-height:1.7;color:#f1e05a;background:rgba(241,224,90,.08);border:1px solid rgba(241,224,90,.3);border-radius:7px;padding:8px 10px;}',
      '.li-ok{font-size:11px;color:#7ee787;background:rgba(126,231,135,.08);border:1px solid rgba(126,231,135,.25);border-radius:7px;padding:8px 10px;}',
      '.li-muted{color:#6e7681;font-size:11px;}'
    ].join('\n');
    document.head.appendChild(st);
  }


  function ensurePanel() {
    if (overlay) return;
    injectStyle();
    overlay = document.createElement('div');
    overlay.id = 'li-overlay';
    overlay.innerHTML = [
      '<div class="li-panel" role="dialog" aria-label="图层检查器">',
      '  <div class="li-head"><h2><i class="fa-solid fa-magnifying-glass-chart"></i> 图层检查器 <small>行内 / 特效 / 背景 / 底衬</small></h2>',
      '    <button class="li-close" id="li-close" title="关闭">×</button></div>',
      '  <div class="li-body" id="li-body"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    panel = overlay.querySelector('.li-panel');
    overlay.querySelector('#li-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  function open(layerId) {
    if (!state || !Array.isArray(state.pages)) { toast('编辑器尚未就绪'); return; }
    var layer = layerId ? getLayer(layerId) : (state.getSelectedLayer ? state.getSelectedLayer() : null);
    if (!layer) { toast('请先在画布上选中一个图层'); return; }
    currentLayerId = layer.id;
    ensurePanel();
    overlay.classList.add('on');
    render();
  }
  function openForSelected() { open(null); }
  function close() {
    if (overlay) overlay.classList.remove('on');
  }

  function bindGlobal() {
    var btn = document.getElementById('btn-layer-inspector');
    if (btn) btn.addEventListener('click', openForSelected);
    var ctx = document.getElementById('ctx-layer-inspector');
    if (ctx) ctx.addEventListener('click', function () {
      openForSelected();
      var menu = document.getElementById('context-menu');
      if (menu) menu.style.display = 'none';
    });
    document.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        openForSelected();
      }
      if (e.key === 'Escape' && overlay && overlay.classList.contains('on')) close();
    });
  }

  w.LayerInspector = Object.freeze({
    open: open,
    openForSelected: openForSelected,
    close: close,
    refresh: render,
    getCurrentLayer: function () { return getLayer(); }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindGlobal);
  } else {
    bindGlobal();
  }
})(window);
