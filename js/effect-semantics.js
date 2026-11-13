/* ============================================================
   effect-semantics.js — 现有特效库的显式语义元数据
   目的：
     ✅ 不再靠正则从 id/name/css 猜 family
     ✅ 给每个真实特效声明 category / family / preset / 语义标签 / 渲染成本 / 状态
     ✅ visual-registry 读取本表；AI 只能选 status = renderable 的 preset
   说明：本文件只描述“机制与语义”，不重复定义参数；
        参数仍以 effects.js 的 params 为准（validator 用注册表校验）。
   ============================================================ */
(function (w) {
  'use strict';

  var META = Object.freeze({
    // ---------- 渐变 ----------
    'effect-gradient': { family: 'gradient', preset: 'linear-gradient', category: 'glyph', semanticTags: ['mood', 'warm', 'energy'], renderCost: 1 },
    'effect-gold': { family: 'gradient', preset: 'gold-gradient', category: 'glyph', semanticTags: ['material', 'luxury', 'warm'], renderCost: 2 },
    'effect-fire': { family: 'gradient', preset: 'fire-gradient', category: 'glyph', semanticTags: ['energy', 'warm', 'impact'], renderCost: 2, brandSafe: false },
    'effect-sunset': { family: 'gradient', preset: 'sunset-gradient', category: 'glyph', semanticTags: ['mood', 'warm', 'soft'], renderCost: 1 },
    'effect-deep-sea': { family: 'gradient', preset: 'deep-gradient', category: 'glyph', semanticTags: ['cool', 'professional', 'depth'], renderCost: 1 },
    'effect-jade': { family: 'gradient', preset: 'jade-gradient', category: 'glyph', semanticTags: ['fresh', 'natural', 'calm'], renderCost: 1 },
    'effect-candy': { family: 'gradient', preset: 'candy-gradient', category: 'glyph', semanticTags: ['playful', 'soft', 'warm'], renderCost: 1 },

    // ---------- 发光 ----------
    'effect-neon': { family: 'glow', preset: 'neon-glow', category: 'glyph', semanticTags: ['energy', 'night', 'tech'], renderCost: 3 },
    'effect-ice': { family: 'glow', preset: 'ice-glow', category: 'glyph', semanticTags: ['cool', 'soft', 'night'], renderCost: 2, brandSafe: false },
    'effect-purple-mist': { family: 'glow', preset: 'soft-glow', category: 'glyph', semanticTags: ['dreamy', 'soft', 'night'], renderCost: 2, brandSafe: false },
    'effect-lightning': { family: 'glow', preset: 'lightning-glow', category: 'glyph', semanticTags: ['energy', 'impact', 'tech'], renderCost: 3, brandSafe: false },
    'effect-viral': { family: 'glow', preset: 'viral-glow', category: 'glyph', semanticTags: ['impact', 'viral', 'energy'], renderCost: 3, brandSafe: false },
    'effect-hk': { family: 'glow', preset: 'retro-glow', category: 'glyph', semanticTags: ['warmth', 'retro', 'night'], renderCost: 2, brandSafe: false },

    // ---------- 描边 ----------
    'effect-black-stroke': { family: 'stroke', preset: 'bold-outline', category: 'glyph', semanticTags: ['legibility', 'impact', 'bold'], renderCost: 1 },
    'effect-red-stroke': { family: 'stroke', preset: 'red-outline', category: 'glyph', semanticTags: ['impact', 'viral', 'legibility'], renderCost: 1 },

    // ---------- 立体 / 材质 ----------
    'effect-3d': { family: 'extrude', preset: '3d-depth', category: 'glyph', semanticTags: ['depth', 'impact', 'bold'], renderCost: 2 },
    'effect-metal': { family: 'texture', preset: 'metal-texture', category: 'glyph', semanticTags: ['material', 'industrial', 'bold'], renderCost: 2 },
    'effect-chalk': { family: 'texture', preset: 'chalk-texture', category: 'glyph', semanticTags: ['handmade', 'warmth', 'soft'], renderCost: 1 },

    // ---------- 故障 ----------
    'effect-glitch': { family: 'glitch', preset: 'digital-noise', category: 'glyph', semanticTags: ['tech', 'edge', 'impact'], renderCost: 2, brandSafe: false },
    'effect-cyber': { family: 'glitch', preset: 'rgb-split', category: 'glyph', semanticTags: ['tech', 'edge', 'night'], renderCost: 2 }
  });

  function getMeta(id) {
    var m = META[id];
    if (!m) return null;
    // 返回副本，避免调用方改到冻结表
    return {
      family: m.family,
      preset: m.preset,
      category: m.category,
      semanticTags: m.semanticTags.slice(),
      renderCost: m.renderCost,
      brandSafe: m.brandSafe !== false,
      status: 'renderable'
    };
  }
  function ids() { return Object.keys(META); }
  function byFamily(family) {
    return ids().filter(function (id) { return META[id].family === family; });
  }

  w.EffectSemantics = Object.freeze({
    META: META,
    getMeta: getMeta,
    ids: ids,
    byFamily: byFamily
  });
})(window);
