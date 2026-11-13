/* ============================================================
   ai-v2-orchestrator.js — AI 可选 Provider 的编排层
   流程：
     analyze → 选候选 → 两阶段提示词 → Provider.generate
     → parseJsonLoose → Validator → repair 一次 → layout 预检
     → 成功缓存；失败回退本地 auto-design-core
   原则：
     ✅ 没有 Provider 时明确返回“回退本地”，不假装自动调用免费网站
     ✅ Provider 只负责生成 JSON；校验/排版/应用仍由本地掌控
     ✅ 缓存 key = 文案 + 品牌 + 注册表版本 + 提示词版本 + seed
   ============================================================ */
(function (w) {
  'use strict';
  var DC = w.DesignConstants || {};
  var cache = new Map();

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < String(str).length; i++) h = ((h << 5) + h + String(str).charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36);
  }
  function parseJsonLoose(raw) {
    if (raw && typeof raw === 'object') return raw;
    var s = String(raw == null ? '' : raw).trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    var start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    s = s.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(s);
  }
  function paletteOf(brand) {
    if (!brand) return null;
    if (brand.palette) return brand.palette;
    if (brand.roles) return brand.roles;
    return brand;
  }
  function coreBrand(brand) {
    if (!brand) return {};
    if (brand.colors && brand.bgPresets) return brand;
    var pal = paletteOf(brand) || {};
    var colors = brand.colors || Object.keys(pal).map(function (k) { return pal[k]; });
    return {
      colors: colors,
      bgPresets: brand.bgPresets || [],
      fonts: brand.fonts || [],
      brandName: brand.brandName || ''
    };
  }
  function withLocal(result, input) {
    if (input.localFallback !== false && w.AutoDesignCore && typeof w.AutoDesignCore.buildAll === 'function') {
      try {
        result.local = w.AutoDesignCore.buildAll(input.text, {
          brand: coreBrand(input.brand),
          richness: input.richness || 'subtle'
        });
      } catch (e) {
        result.localError = String(e && e.message ? e.message : e);
      }
    }
    return result;
  }
  function runLocal(input) {
    input = input || {};
    if (!w.AutoDesignCore || typeof w.AutoDesignCore.buildAll !== 'function') return null;
    return w.AutoDesignCore.buildAll(input.text, {
      brand: coreBrand(input.brand),
      richness: input.richness || 'subtle'
    });
  }

  function defaultAnalysis() {
    if (w.AiV2Analyzer && typeof w.AiV2Analyzer.analyze === 'function') {
      return w.AiV2Analyzer.analyze('');
    }
    return { intensity: 3, tone: [], keywords: [], contentLength: 'short' };
  }

  /**
   * @param {{text:string, brand?:object, provider?:object, seed?:number,
   *          cache?:boolean, repair?:boolean, localFallback?:boolean,
   *          analysis?:object, candidateLimit?:number, fonts?:string[]}} input
   * @returns {Promise<object>}
   */
  async function run(input) {
    input = input || {};
    var text = String(input.text == null ? '' : input.text);
    if (!text.trim()) {
      return {
        ok: false, stage: 'empty-text',
        errors: [{ path: 'text', code: 'E_EMPTY_TEXT', message: '文案为空' }]
      };
    }
    if (!w.AiV2Prompt || !w.AiV2Validator) {
      return {
        ok: false, stage: 'dependency',
        errors: [{ path: '$', code: 'E_DEPENDENCY', message: 'AiV2Prompt / AiV2Validator 未加载' }]
      };
    }

    var analysis = input.analysis
      || (w.AiV2Analyzer ? w.AiV2Analyzer.analyze(text, { title: input.title || '' }) : defaultAnalysis());
    var registry = (w.VisualRegistry && w.VisualRegistry.getSnapshot)
      ? w.VisualRegistry.getSnapshot() : { presets: [], version: '0' };
    var candidates = w.AiV2Prompt.selectCandidates(
      registry.presets || [], analysis, input.candidateLimit || 10
    );
    var budgets = DC.budgetFor ? DC.budgetFor(analysis.intensity) : { glyph: 1, container: 1, annotation: 2, decoration: 2, colorRoles: 4, fontSizes: 3, maxEffectsPerLayer: 1 };
    var prompt = w.AiV2Prompt.buildPlanPrompt({
      text: text, brand: input.brand || {}, analysis: analysis, candidates: candidates, budgets: budgets
    });
    var seed = Number.isFinite(Number(input.seed)) ? Number(input.seed) : 0;
    var brandId = (input.brand && input.brand.brandId) || '';
    var key = hash([text, brandId, registry.version || '', w.AiV2Prompt.PROMPT_VERSION, seed].join('|'));
    var base = {
      analysis: analysis, candidates: candidates, budgets: budgets,
      prompt: prompt, cacheKey: key, seed: seed
    };

    if (input.cache !== false && cache.has(key)) {
      return Object.assign({}, cache.get(key), { cached: true });
    }
    if (!input.provider || typeof input.provider.generate !== 'function') {
      return withLocal(Object.assign(base, {
        ok: false, stage: 'no-provider',
        errors: [{ path: 'provider', code: 'E_NO_PROVIDER', message: '未提供 AI Provider，已回退本地引擎' }]
      }), input);
    }

    var raw, obj, repaired = false;
    try {
      raw = await input.provider.generate(prompt, {
        text: text, analysis: analysis, candidates: candidates, budgets: budgets, brand: input.brand
      });
    } catch (e) {
      return withLocal(Object.assign(base, {
        ok: false, stage: 'provider-error',
        errors: [{ path: 'provider', code: 'E_PROVIDER', message: String(e && e.message ? e.message : e) }]
      }), input);
    }
    try {
      obj = parseJsonLoose(raw);
    } catch (e) {
      return withLocal(Object.assign(base, {
        ok: false, stage: 'parse-error',
        errors: [{ path: '$', code: 'E_PARSE', message: 'AI 返回的不是合法 JSON：' + (e && e.message ? e.message : e) }],
        raw: raw
      }), input);
    }

    var validationOptions = { palette: paletteOf(input.brand), original: text, checkSafeArea: false };
    if (input.fonts) validationOptions.fonts = input.fonts;
    var checked = w.AiV2Validator.validate(obj, validationOptions);

    if (!checked.ok && typeof input.provider.repair === 'function' && input.repair !== false) {
      try {
        var fixed = await input.provider.repair(obj, checked.errors, {
          text: text, analysis: analysis, candidates: candidates, budgets: budgets, brand: input.brand
        });
        obj = parseJsonLoose(fixed);
        checked = w.AiV2Validator.validate(obj, validationOptions);
        repaired = true;
      } catch (e) {
        // 修复失败保留原始校验错误
      }
    }

    if (!checked.ok) {
      return withLocal(Object.assign(base, {
        ok: false, stage: 'validation',
        errors: checked.errors, raw: raw, repaired: repaired
      }), input);
    }

    var layouts = {};
    if (w.AIV2Layout && typeof w.AIV2Layout.layoutPlan === 'function') {
      (checked.spec.plans || []).forEach(function (plan) {
        try {
          layouts[plan.id] = w.AIV2Layout.layoutPlan(plan, checked.spec.constraints).report;
        } catch (e) {
          layouts[plan.id] = { issueCount: 1, issues: [{ code: 'LAYOUT_ERROR', message: String(e && e.message ? e.message : e) }] };
        }
      });
    }

    var result = Object.assign(base, {
      ok: true, spec: checked.spec, layouts: layouts,
      repaired: repaired, cached: false
    });
    if (input.cache !== false) cache.set(key, result);
    return result;
  }


  function createStaticProvider(generate, repair) {
    return {
      name: 'static',
      generate: generate,
      repair: repair
    };
  }

  /**
   * OpenAI 兼容的 fetch Provider（可选；不内置任何 API Key）
   * @param {{endpoint:string, apiKey?:string, model?:string, fetchImpl?:Function,
   *          jsonMode?:boolean, temperature?:number, system?:string}} opts
   */
  function createFetchProvider(opts) {
    opts = opts || {};
    var fetchImpl = opts.fetchImpl || (typeof w.fetch === 'function' ? w.fetch : null);
    if (!fetchImpl) throw new Error('当前环境没有 fetch');
    if (!opts.endpoint) throw new Error('缺少 endpoint');
    function call(messages, temperature) {
      var headers = { 'Content-Type': 'application/json' };
      if (opts.apiKey) headers.Authorization = 'Bearer ' + opts.apiKey;
      var body = {
        model: opts.model || 'gpt-4o-mini',
        messages: messages,
        temperature: temperature
      };
      if (opts.jsonMode !== false) body.response_format = { type: 'json_object' };
      return fetchImpl(opts.endpoint, {
        method: 'POST', headers: headers, body: JSON.stringify(body)
      }).then(function (res) {
        if (!res || !res.ok) throw new Error('AI HTTP ' + (res ? res.status : 'unknown'));
        return res.json();
      }).then(function (data) {
        var msg = data && data.choices && data.choices[0] && data.choices[0].message;
        return msg && msg.content ? msg.content : data;
      });
    }
    return {
      name: 'fetch',
      generate: function (prompt) {
        return call([
          { role: 'system', content: opts.system || '你是封面设计 JSON 生成器，只输出 JSON。' },
          { role: 'user', content: prompt }
        ], Number.isFinite(opts.temperature) ? opts.temperature : 0.4);
      },
      repair: function (json, errors) {
        return call([
          { role: 'system', content: '你是 JSON 修复器。只输出修复后的 JSON，不要解释。' },
          { role: 'user', content: '原始 JSON：\n' + JSON.stringify(json) + '\n\n校验错误：\n' + JSON.stringify(errors) + '\n\n请只修复这些错误，不要改原文。' }
        ], 0);
      }
    };
  }

  w.AiV2Orchestrator = Object.freeze({
    run: run,
    runLocal: runLocal,
    parseJsonLoose: parseJsonLoose,
    createStaticProvider: createStaticProvider,
    createFetchProvider: createFetchProvider,
    clearCache: function () { cache.clear(); },
    cacheSize: function () { return cache.size; }
  });
})(window);
