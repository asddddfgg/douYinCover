/* ============================================================
   effect-stack.js — 图层特效栈（effectClasses/effectParams ↔ 数组）
   目的：
     ✅ 把 effectClass / effectClasses / effectParams 统一成可读栈
     ✅ 支持添加 / 删除 / 上移 / 下移，写回旧字段时保持兼容
     ✅ 只暴露 renderable + brandSafe 的 preset
   ============================================================ */
(function (w) {
  'use strict';

  function idsOf(layer) {
    if (!layer) return [];
    if (Array.isArray(layer.effectClasses) && layer.effectClasses.length) {
      return layer.effectClasses.slice();
    }
    return layer.effectClass ? [layer.effectClass] : [];
  }
  function paramsOf(layer, id) {
    return (layer && layer.effectParams && layer.effectParams[id]) || {};
  }
  function presetOf(id) {
    try {
      return (w.VisualRegistry && w.VisualRegistry.getPreset) ? w.VisualRegistry.getPreset(id) : null;
    } catch (e) { return null; }
  }
  function fromLayer(layer) {
    return idsOf(layer).map(function (id) {
      var p = presetOf(id) || {};
      return {
        id: id,
        name: p.name || id,
        family: p.family || '',
        preset: p.preset || id,
        status: p.status || 'renderable',
        brandSafe: p.brandSafe !== false,
        params: paramsOf(layer, id)
      };
    });
  }
  function apply(layer, stack) {
    if (!layer) return;
    var ids = (stack || []).map(function (x) { return x.id; }).filter(Boolean);
    if (ids.length) {
      layer.effectClasses = ids;
      layer.effectClass = ids[0];
    } else {
      delete layer.effectClasses;
      layer.effectClass = null;
    }
    var params = {};
    (stack || []).forEach(function (x) {
      if (x.id) params[x.id] = x.params || {};
    });
    if (Object.keys(params).length) layer.effectParams = params;
    else delete layer.effectParams;
  }
  function add(layer, id, params) {
    var stack = fromLayer(layer);
    if (!id || stack.some(function (x) { return x.id === id; })) return stack;
    var p = presetOf(id) || {};
    stack.push({ id: id, name: p.name || id, family: p.family || '', preset: p.preset || id, status: p.status || 'renderable', brandSafe: p.brandSafe !== false, params: params || {} });
    apply(layer, stack);
    return stack;
  }
  // 原地替换一个特效（保留顺序，供检查器「不喜欢这个特效」时一键换掉）
  function replace(layer, id, newId, params) {
    var stack = fromLayer(layer);
    var i = stack.findIndex(function (x) { return x.id === id; });
    if (i < 0 || !newId || newId === id) return stack;
    if (stack.some(function (x) { return x.id === newId; })) return stack;
    var p = presetOf(newId);
    if (!p) return stack;
    stack[i] = {
      id: newId,
      name: p.name || newId,
      family: p.family || '',
      preset: p.preset || newId,
      status: p.status || 'renderable',
      brandSafe: p.brandSafe !== false,
      params: params || {}
    };
    apply(layer, stack);
    return stack;
  }
  function remove(layer, id) {
    var stack = fromLayer(layer).filter(function (x) { return x.id !== id; });
    apply(layer, stack);
    return stack;
  }
  function move(layer, id, dir) {
    var stack = fromLayer(layer);
    var i = stack.findIndex(function (x) { return x.id === id; });
    if (i < 0) return stack;
    var j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= stack.length) return stack;
    var tmp = stack[i]; stack[i] = stack[j]; stack[j] = tmp;
    apply(layer, stack);
    return stack;
  }
  function listPresets() {
    try {
      var snap = (w.VisualRegistry && w.VisualRegistry.getSnapshot) ? w.VisualRegistry.getSnapshot() : { presets: [] };
      return (snap.presets || []).filter(function (p) {
        return p && p.status === 'renderable' && p.brandSafe !== false;
      }).map(function (p) {
        return {
          id: p.id,
          name: p.name || p.id,
          family: p.family || '',
          preset: p.preset || p.id,
          category: p.category || 'glyph',
          params: p.params || {},
          semanticTags: p.semanticTags || []
        };
      });
    } catch (e) { return []; }
  }
  function label(item) {
    if (!item) return '';
    return (item.name || item.id) + ' · ' + (item.family || '') + (item.preset ? ' / ' + item.preset : '');
  }

  w.EffectStack = Object.freeze({
    fromLayer: fromLayer,
    apply: apply,
    add: add,
    replace: replace,
    remove: remove,
    move: move,
    listPresets: listPresets,
    label: label,
    idsOf: idsOf
  });
})(window);
