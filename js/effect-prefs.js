/* ============================================================
   effect-prefs.js — 用户级特效偏好（持久化）
   目前只有一项：
     ✅ 不要描边（stroke family）
   用途：
     - 本地一键成图：过滤掉 stroke family 的候选
     - AI 提示词：不把描边类特效下发给 AI，并明确禁止输出
     - 粘贴 AI 方案：自动把描边替换成品牌色渐变（effect-gold）
   ============================================================ */
(function (w) {
  'use strict';

  var KEY = 'douyin_effect_no_stroke';
  var memory = {};

  function read(key) {
    try { return w.localStorage.getItem(key); } catch (e) { return memory[key] == null ? null : memory[key]; }
  }
  function write(key, val) {
    try { w.localStorage.setItem(key, val); } catch (e) { memory[key] = val; }
  }

  function getNoStroke() { return read(KEY) === '1'; }
  function setNoStroke(v) { write(KEY, v ? '1' : '0'); }

  function avoidFamilies() { return getNoStroke() ? ['stroke'] : []; }

  function filterPresets(list) {
    var avoid = avoidFamilies();
    return (list || []).filter(function (p) {
      return p && avoid.indexOf(p.family) < 0;
    });
  }

  w.EffectPrefs = Object.freeze({
    getNoStroke: getNoStroke,
    setNoStroke: setNoStroke,
    avoidFamilies: avoidFamilies,
    filterPresets: filterPresets
  });
})(window);
