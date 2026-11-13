/* ============================================================
   ai-v2-selector.js — 语义选特效（本地、确定性、预算内）
   输入：analysis + 注册表 presets + richness
   输出：{ effectPlan: {A,B,C}, details: [...] }
   规则：
     ✅ 只选 status=renderable 且 category=glyph 的特效
     ✅ 按语气/情绪/强度匹配 semanticTags
     ✅ A/B 尽量不同 family；C 永远干净
     ✅ 强度低时惩罚高渲染成本；richness=clean 时全空
   ============================================================ */
(function (w) {
  'use strict';

  var PLAN_PREF = {
    A: ['stroke', 'shadow', 'gradient', 'glow', 'texture'],
    B: ['gradient', 'glow', 'stroke', 'extrude', 'texture']
  };

  var TAG_MAP = {
    '温暖': ['warm', 'warmth', 'soft'],
    '克制': ['professional', 'calm', 'soft', 'legibility'],
    '专业': ['professional', 'legibility', 'depth'],
    '有力量': ['impact', 'bold', 'legibility'],
    '活泼': ['playful', 'soft'],
    '焦虑': ['calm', 'soft', 'legibility'],
    '清晰': ['legibility'],
    '中性': []
  };

  function desiredTags(analysis) {
    var tags = [];
    (analysis.tone || []).forEach(function (t) {
      (TAG_MAP[t] || []).forEach(function (x) { if (tags.indexOf(x) < 0) tags.push(x); });
    });
    if (analysis.emotion === '温暖') tags.push('warm');
    if (analysis.emotion === '激励') { tags.push('energy'); tags.push('impact'); }
    if (analysis.intensity >= 4) { tags.push('impact'); tags.push('energy'); tags.push('bold'); }
    if (analysis.intensity <= 2) { tags.push('soft'); tags.push('legibility'); }
    return tags;
  }

  function scorePreset(preset, analysis, planId, tags) {
    if (!preset || preset.category !== 'glyph' || preset.status !== 'renderable') return -Infinity;
    var score = 0;
    var reasons = [];
    (preset.semanticTags || []).forEach(function (t) {
      if (tags.indexOf(t) >= 0) { score += 10; reasons.push(t); }
    });
    var pref = PLAN_PREF[planId] || PLAN_PREF.A;
    var idx = pref.indexOf(preset.family);
    if (idx >= 0) { score += (8 - idx * 1.5); reasons.push('plan:' + preset.family); }
    var cost = Number.isFinite(preset.renderCost) ? preset.renderCost : 1;
    score -= cost * 1.2;
    if (analysis.intensity <= 2) score -= cost * 2.0;
    if (analysis.intensity >= 4 && cost >= 3) score -= 1.5;
    return { score: score, reasons: reasons, cost: cost };
  }

  function pick(analysis, presets, planId, tags, excludeFamilies) {
    var ranked = (presets || [])
      .filter(function (p) { return p && p.category === 'glyph' && p.status === 'renderable' && p.brandSafe !== false; })
      .map(function (p) {
        var s = scorePreset(p, analysis, planId, tags);
        return { preset: p, score: s.score, reasons: s.reasons, cost: s.cost };
      })
      .filter(function (x) { return Number.isFinite(x.score); })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (a.cost !== b.cost) return a.cost - b.cost;
        return a.preset.id < b.preset.id ? -1 : (a.preset.id > b.preset.id ? 1 : 0);
      });
    if (!ranked.length) return null;
    var excluded = excludeFamilies || [];
    var chosen = null;
    for (var i = 0; i < ranked.length; i++) {
      if (excluded.indexOf(ranked[i].preset.family) < 0) { chosen = ranked[i]; break; }
    }
    // 全部被偏好排除时宁可不加特效，也不偷偷塞回被排除的 family
    if (!chosen) return null;
    return {
      presetId: chosen.preset.id,
      family: chosen.preset.family,
      preset: chosen.preset.preset,
      score: Math.round(chosen.score * 10) / 10,
      renderCost: chosen.cost,
      reasons: chosen.reasons
    };
  }

  function selectPlans(input) {
    input = input || {};
    var analysis = input.analysis || { tone: [], intensity: 3 };
    var presets = input.presets || [];
    var richness = input.richness || 'subtle';
    if (richness === 'clean') {
      return { effectPlan: { A: '', B: '', C: '' }, details: [], tags: [] };
    }
    var tags = desiredTags(analysis);
    var avoid = Array.isArray(input.avoidFamilies) ? input.avoidFamilies : [];
    var a = pick(analysis, presets, 'A', tags, avoid);
    var b = pick(analysis, presets, 'B', tags, avoid.concat(a ? [a.family] : []));
    return {
      effectPlan: {
        A: a ? a.presetId : '',
        B: b ? b.presetId : '',
        C: ''
      },
      details: [a, b],
      tags: tags
    };
  }

  w.AiV2Selector = Object.freeze({
    selectPlans: selectPlans,
    desiredTags: desiredTags,
    scorePreset: scorePreset
  });
})(window);
