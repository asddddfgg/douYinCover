/* ============================================================
   ai-v2-prompt.js — AI V2 提示词生成器（两阶段）
   阶段 1：analysis（只输出语义分析，几十个 token）
   阶段 2：plan（分析 + 候选特效 + 预算 → A/B/C 完整 JSON）
   原则：
     ✅ 只下发“可渲染”的候选 preset，不下发全部 19 family
     ✅ 明确禁止 CSS/HTML/HEX/像素几何
     ✅ 预算、兼容、安全区、尺寸令牌写死在提示词里
     ✅ 提示词可复现：同一输入同一版本得到同一文本
   ============================================================ */
(function (w) {
  'use strict';
  var DC = w.DesignConstants || {};
  var S = w.AiV2Schema || {};
  var PROMPT_VERSION = '3.0';

  function compact(obj) {
    try { return JSON.stringify(obj); } catch (e) { return '{}'; }
  }
  function desiredTags(analysis) {
    if (w.AiV2Selector && w.AiV2Selector.desiredTags) return w.AiV2Selector.desiredTags(analysis);
    var tags = [];
    (analysis.tone || []).forEach(function (t) {
      if (t === '温暖') tags.push('warm', 'soft');
      if (t === '有力量') tags.push('impact', 'bold');
      if (t === '克制' || t === '专业') tags.push('professional', 'legibility');
    });
    if (analysis.intensity >= 4) tags.push('impact', 'energy');
    return tags;
  }

  function selectCandidates(presets, analysis, limit) {
    limit = limit || 10;
    var tags = desiredTags(analysis);
    var avoid = (w.EffectPrefs && w.EffectPrefs.avoidFamilies) ? w.EffectPrefs.avoidFamilies() : [];
    return (presets || [])
      .filter(function (p) {
        return p && p.status === 'renderable' && p.category === 'glyph' && p.brandSafe !== false &&
          avoid.indexOf(p.family) < 0;
      })
      .map(function (p) {
        var score = 0;
        (p.semanticTags || []).forEach(function (t) { if (tags.indexOf(t) >= 0) score += 10; });
        score -= (Number.isFinite(p.renderCost) ? p.renderCost : 1) * 0.8;
        return { p: p, score: score };
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.p.id < b.p.id ? -1 : (a.p.id > b.p.id ? 1 : 0);
      })
      .slice(0, limit)
      .map(function (x) { return x.p; });
  }

  function candidateBrief(p) {
    return {
      presetId: p.id,
      family: p.family,
      preset: p.preset,
      category: p.category,
      semanticTags: p.semanticTags || [],
      renderCost: p.renderCost,
      params: p.params || {}
    };
  }

  function buildAnalysisPrompt(text) {
    return [
      '你是抖音封面设计系统的文案分析器。',
      '只输出一个 JSON 对象，不要解释、不要 Markdown。',
      '字段：topic, intent, audience, tone（数组）, emotion, intensity（1-5 数字）, keywords（数组）, visualDirection, contentLength（short|medium|long）, contentStructure。',
      '不要改写原文，不要输出任何设计或特效。',
      '',
      '文案：',
      String(text || '')
    ].join('\n');
  }

  function buildPlanPrompt(input) {
    input = input || {};
    var analysis = input.analysis || {};
    var brand = input.brand || {};
    var candidates = input.candidates || [];
    var budgets = input.budgets || DC.budgetFor(analysis.intensity);
    var palette = brand.palette || brand.roles || brand;
    var lines = [
      '你是抖音竖版封面设计系统。只输出一个 JSON 对象，不要解释、不要 Markdown 代码围栏。',
      '',
      '【硬约束】',
      '1. 画布必须是 360×640；所有文字必须在安全区内：左/右 28、上 46、下 62。',
      '2. 只允许 colorRole，不允许写任何 HEX；颜色角色：' + (DC.COLOR_ROLES || S.COLOR_ROLES || []).join('/') + '。',
      '3. 字号优先用 sizeToken：' + Object.keys(DC.FONT_TOKENS || S.FONT_TOKENS || {}).join('/') + '；不要输出超大字号。',
      '4. 只允许从下面候选 presetId 里选特效；不允许发明 family/preset，不允许输出 CSS/HTML/SVG/JS。',
      '5. 三个方案 A/B/C 必须结构不同：A 居中编辑感、B 左对齐冲击、C 顶对齐留白；不能只换颜色。',
      '6. 每页只承载一个信息中心；不得删原文、不得摘要冒充原文。',
      '7. 预算：每页 glyph≤' + budgets.glyph + '、container≤' + budgets.container +
        '、annotation≤' + budgets.annotation + '、decoration≤' + budgets.decoration +
        '、颜色角色≤' + budgets.colorRoles + '、字号层级≤' + budgets.fontSizes +
        '、每层特效≤' + budgets.maxEffectsPerLayer + '。0 是合法值。',
      '8. 同层禁止同 family、同通道、明确不兼容的组合。',
      (w.EffectPrefs && w.EffectPrefs.getNoStroke()
        ? '9. 用户明确不喜欢描边类特效：禁止选择 family=stroke 的 preset。'
        : ''),
      '10. 同一页文字层垂直间距至少 20px；不得出现文字框重叠。',
      '',
      '【品牌】',
      compact({ brandId: brand.brandId || null, brandName: brand.brandName || '', palette: palette }),
      '',
      '【已确定的文案分析】',
      compact(analysis),
      '',
      '【候选特效（只能选这些）】',
      compact(candidates.map(candidateBrief)),
      '',
      '【输出结构】',
      compact({
        format: 'douyin-ai-design',
        version: '2.0',
        requestId: 'req-ai-001',
        analysis: analysis,
        brand: { brandId: brand.brandId || 'brand_001' },
        plans: [{
          id: 'A', name: '语义匹配', strategy: 'editorial-center',
          canvas: { width: 360, height: 640, backgroundRole: 'background' },
          pages: [{
            id: 'A-1', title: '第 1 页', backgroundRole: 'background',
            layers: [{
              id: 'A-title', type: 'text', role: 'headline', content: '标题',
              geometry: { x: 28, y: 140, width: 304, height: 120, rotation: 0 },
              style: { sizeToken: 'display', fontSize: 46, fontFamily: 'sans-serif', bold: true, align: 'center', colorRole: 'text', lineHeight: 1.18, opacity: 1 },
              effects: [], order: 10, visible: true
            }]
          }]
        }],
        constraints: {
          safeArea: DC.SAFE || S.SAFE,
          maxPages: 8,
          budgets: budgets,
          maxEffectsPerLayer: budgets.maxEffectsPerLayer,
          preserveOriginalText: true,
          allowHtml: false,
          checkContrast: true
        }
      }),
      '',
      '【原文（不得删改）】',
      String(input.text || ''),
      '',
      '现在输出完整 A/B/C JSON。'
    ];
    return lines.join('\n');
  }

  w.AiV2Prompt = Object.freeze({
    PROMPT_VERSION: PROMPT_VERSION,
    buildAnalysisPrompt: buildAnalysisPrompt,
    buildPlanPrompt: buildPlanPrompt,
    build: buildPlanPrompt,
    selectCandidates: selectCandidates,
    candidateBrief: candidateBrief
  });
})(window);
