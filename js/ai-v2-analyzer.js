/* ============================================================
   ai-v2-analyzer.js — 本地文案语义分析（无 AI、确定性）
   输出字段与 V2 契约 analysis 对齐：
     topic / intent / audience / tone / emotion / intensity /
     keywords / visualDirection / contentLength / contentStructure
   说明：这是“本地 Provider”，不是大模型；用于默认出图和 AI 兜底。
   ============================================================ */
(function (w) {
  'use strict';

  var STOP = {};
  ('的了是在我你他她它们这那就也都和与及而但或一个我们你们他们因为所以如果这样那样自己'
  ).split('').forEach(function (c) { STOP[c] = 1; });

  function chars(s) { return Array.from(String(s == null ? '' : s)); }
  function textOf(raw) { return String(raw == null ? '' : raw).trim(); }
  function includesAny(s, list) {
    for (var i = 0; i < list.length; i++) if (s.indexOf(list[i]) >= 0) return true;
    return false;
  }
  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function localKeywords(text) {
    var freq = {};
    String(text).split(/[^\u4e00-\u9fff]+/).filter(function (s) { return chars(s).length >= 2; })
      .forEach(function (run) {
        var r = chars(run).join('');
        for (var n = 2; n <= 3; n++) {
          for (var i = 0; i + n <= r.length; i++) {
            var g = r.slice(i, i + n), bad = false;
            for (var k = 0; k < g.length; k++) if (STOP[g[k]]) { bad = true; break; }
            if (bad) continue;
            freq[g] = (freq[g] || 0) + 1;
          }
        }
      });
    return Object.keys(freq)
      .filter(function (k) { return freq[k] >= 2; })
      .sort(function (a, b) { return (freq[b] - freq[a]) || (b.length - a.length) || (a < b ? -1 : 1); })
      .slice(0, 6);
  }

  function analyze(raw, opts) {
    opts = opts || {};
    var text = textOf(raw);
    var core = w.AutoDesignCore;
    var base = null;
    if (core && typeof core.analyze === 'function') {
      try { base = core.analyze(text, { title: opts.title }); } catch (e) { base = null; }
    }
    var charCount = base && base.charCount ? base.charCount : chars(text.replace(/\s/g, '')).length;
    var sentences = base && base.sentences ? base.sentences : text.split(/[。！？!?；;\n]+/).filter(Boolean);
    var keywords = (base && base.keywords && base.keywords.length) ? base.keywords.slice(0, 6) : localKeywords(text);
    var title = (base && base.title) || (sentences[0] || text).slice(0, 22);

    var qCount = (text.match(/[?？]/g) || []).length;
    var exCount = (text.match(/[!！]/g) || []).length;

    var tone = [];
    if (includesAny(text, ['温暖', '拥抱', '柔软', '爱', '陪伴'])) tone.push('温暖');
    if (includesAny(text, ['克制', '留白', '安静', '放手', '边界'])) tone.push('克制');
    if (includesAny(text, ['专业', '研究', '数据', '方法', '步骤'])) tone.push('专业');
    if (includesAny(text, ['必须', '不要', '别再', '立刻', '一定'])) tone.push('有力量');
    if (includesAny(text, ['快乐', '玩', '有趣', '可爱'])) tone.push('活泼');
    if (includesAny(text, ['焦虑', '担心', '害怕', '失控'])) tone.push('焦虑');
    if (!tone.length) tone = ['清晰', '中性'];

    var intent = '表达观点';
    if (qCount > 0) intent = '解答疑问';
    else if (includesAny(text, ['不要', '别', '必须', '应该', '建议'])) intent = '给出建议';
    else if (includesAny(text, ['为什么', '原因', '因为'])) intent = '解释原因';
    else if (includesAny(text, ['如何', '怎么', '方法', '步骤'])) intent = '提供方法';
    else if (includesAny(text, ['故事', '那天', '记得'])) intent = '讲述故事';

    var audience = '大众';
    if (includesAny(text, ['孩子', '家长', '父母', '育儿', '宝宝'])) audience = '家长';
    else if (includesAny(text, ['职场', '同事', '老板', '工作'])) audience = '职场人';
    else if (includesAny(text, ['学生', '考试', '老师', '学习'])) audience = '学生';
    else if (includesAny(text, ['妈妈', '女性', '女孩'])) audience = '女性';

    var emotion = '平静';
    if (tone.indexOf('温暖') >= 0) emotion = '温暖';
    else if (tone.indexOf('焦虑') >= 0) emotion = '焦虑';
    else if (tone.indexOf('有力量') >= 0) emotion = '激励';
    else if (tone.indexOf('克制') >= 0) emotion = '克制';

    var intensity = 3;
    if (charCount <= 60) intensity += 1;
    if (charCount > 220) intensity -= 1;
    if (exCount >= 2) intensity += 1;
    if (qCount >= 2) intensity -= 1;
    if (includesAny(text, ['强烈', '必须', '立刻', '别再', '爆款', '震惊'])) intensity += 1;
    intensity = Math.max(1, Math.min(5, intensity));

    var lines = text.split(/\n+/).filter(Boolean);
    var structure = '观点表达';
    if (lines.some(function (l) { return /^\s*(?:\d{1,2}[.、)]|[①-⑳]|[-*·•])\s+/.test(l); })) structure = '清单';
    else if (qCount > 0) structure = '问答';
    else if (sentences.length >= 8) structure = '长文分页';
    else if (includesAny(text, ['故事', '那天', '记得'])) structure = '故事';

    var contentLength = charCount <= 60 ? 'short' : (charCount <= 220 ? 'medium' : 'long');
    var direction = tone.join('、') + (intensity >= 4 ? '、强对比' : '、克制留白');

    return {
      topic: keywords.slice(0, 2).join(' / ') || '通用主题',
      intent: intent,
      audience: audience,
      tone: uniq(tone),
      emotion: emotion,
      intensity: intensity,
      keywords: keywords,
      visualDirection: direction,
      contentLength: contentLength,
      contentStructure: structure,
      title: title,
      charCount: charCount,
      source: 'local-heuristic'
    };
  }

  w.AiV2Analyzer = Object.freeze({ analyze: analyze, localKeywords: localKeywords });
})(window);
