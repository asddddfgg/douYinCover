// ============================================================
// ai-import-ui.js — AI 方案导入面板（精简干净版 v3）
// 依赖：ai-spec.js / ai-spec-generator.js / state / renderAll / Utils.clipboard
// 加载顺序：必须晚于 ai-spec.js / ai-spec-generator.js
// ============================================================

window.__AI_IMPORT_UI_READY__ = true;

const AiImportUI = (function () {
    let inited = false;
    let _lastChosenSpec = null;
    let _lastSpecInputSnapshot = '';

    function ensurePanel() {
        let panel = document.getElementById('ai-import-panel');
        if (panel) return panel;

        const sidebar = document.querySelector('.sidebar-left');
        if (!sidebar) return null;

        panel = document.createElement('div');
        panel.id = 'ai-import-panel';
        panel.className = 'panel-section';
        panel.style.maxHeight = 'none';

        panel.innerHTML = [
            '<h3 style="display:flex;justify-content:space-between;align-items:center;">',
            '  <span><i class="fa-solid fa-wand-magic-sparkles"></i> AI 生成封面</span>',
            '  <button id="ai-panel-toggle" class="btn" style="padding:0 6px;font-size:10px;height:20px;" title="折叠/展开"><i class="fa-solid fa-chevron-up"></i></button>',
            '</h3>',
            '<div id="ai-panel-body">',

            // Stepper 时间线
            '<div id="ai-stepper" style="display:flex;align-items:flex-start;justify-content:space-between;gap:0;margin:6px 0 12px;">',
            '  <div class="ai-step" data-step="1" style="flex:1;text-align:center;position:relative;">',
            '    <div class="ai-step-dot" style="width:22px;height:22px;border-radius:50%;margin:0 auto 4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #30363d;background:#0d1117;color:#6e7681;">1</div>',
            '    <div class="ai-step-label" style="font-size:10px;color:#6e7681;line-height:1.2;">粘贴原文</div>',
            '  </div>',
            '  <div class="ai-step" data-step="2" style="flex:1;text-align:center;position:relative;">',
            '    <div class="ai-step-dot" style="width:22px;height:22px;border-radius:50%;margin:0 auto 4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #30363d;background:#0d1117;color:#6e7681;">2</div>',
            '    <div class="ai-step-label" style="font-size:10px;color:#6e7681;line-height:1.2;">复制提示词</div>',
            '  </div>',
            '  <div class="ai-step" data-step="3" style="flex:1;text-align:center;position:relative;">',
            '    <div class="ai-step-dot" style="width:22px;height:22px;border-radius:50%;margin:0 auto 4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #30363d;background:#0d1117;color:#6e7681;">3</div>',
            '    <div class="ai-step-label" style="font-size:10px;color:#6e7681;line-height:1.2;">粘贴 AI 回复</div>',
            '  </div>',
            '  <div class="ai-step" data-step="4" style="flex:1;text-align:center;position:relative;">',
            '    <div class="ai-step-dot" style="width:22px;height:22px;border-radius:50%;margin:0 auto 4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #30363d;background:#0d1117;color:#6e7681;">4</div>',
            '    <div class="ai-step-label" style="font-size:10px;color:#6e7681;line-height:1.2;">对比并应用</div>',
            '  </div>',
            '</div>',

            // 节点 1：粘贴原文
            '<div id="ai-node-1" class="ai-node" data-node="1" style="margin-bottom:10px;">',
            '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">',
            '    <span style="font-size:11px;color:#c9d1d9;font-weight:600;">① 粘贴原文</span>',
            '    <button id="ai-clear-1" class="btn" style="padding:0 6px;font-size:10px;height:20px;">清空</button>',
            '  </div>',
            '  <textarea id="ai-chunk-input" rows="5" style="width:100%;background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:6px;border-radius:4px;font-size:11px;resize:vertical;font-family:monospace;" placeholder="把要排版的原文粘贴到这里（可用 --- / *** / === 分块）..."></textarea>',
            '</div>',

            // 节点 2：复制提示词
            '<div id="ai-node-2" class="ai-node" data-node="2" style="margin-bottom:10px;opacity:0.4;">',
            '  <div style="font-size:11px;color:#c9d1d9;font-weight:600;margin-bottom:4px;">② 复制提示词</div>',
            '  <button id="ai-one-click" class="btn btn-primary" style="width:100%;justify-content:center;font-size:11px;" disabled><i class="fa-solid fa-copy"></i> 复制提示词并打开 DeepSeek</button>',
            '  <div id="ai-node-2-hint" style="font-size:10px;color:#6e7681;margin-top:4px;line-height:1.4;">需要先在 ① 中粘贴原文</div>',
            '</div>',

            // 节点 3：粘贴 AI 回复
            '<div id="ai-node-3" class="ai-node" data-node="3" style="margin-bottom:10px;opacity:0.4;">',
            '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">',
            '    <span style="font-size:11px;color:#c9d1d9;font-weight:600;">③ 粘贴 AI 回复的 JSON</span>',
            '    <button id="ai-clear-3" class="btn" style="padding:0 6px;font-size:10px;height:20px;">清空</button>',
            '  </div>',
            '  <textarea id="ai-spec-input" rows="6" style="width:100%;background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:6px;border-radius:4px;font-size:11px;resize:vertical;font-family:monospace;" placeholder="把 DeepSeek 回复的 JSON 粘贴到这里..." disabled></textarea>',
            '  <div id="ai-node-3-hint" style="font-size:10px;color:#6e7681;margin-top:4px;line-height:1.4;">需要先完成 ② 复制提示词</div>',
            '</div>',

            // 节点 4 已移除：粘贴 ≥2 份 JSON 即自动应用三方案（见 doPreview 与 paste 监听）

            // 高级选项（折叠）
            '<div style="border-top:1px dashed #30363d;padding-top:8px;margin-top:8px;">',
            '  <button id="ai-advanced-toggle" class="btn" style="width:100%;justify-content:space-between;font-size:11px;padding:4px 8px;"><span><i class="fa-solid fa-sliders"></i> 高级选项</span><i class="fa-solid fa-chevron-down" style="font-size:9px;"></i></button>',
            '  <div id="ai-advanced-body" style="display:none;margin-top:8px;padding:8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;">',
            '    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8b949e;cursor:pointer;margin-bottom:6px;">',
            '      <input type="checkbox" id="ai-append-mode" style="accent-color:#ff2442;cursor:pointer;"> 加到现有封面后面（不覆盖）',
            '    </label>',
            '    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8b949e;cursor:pointer;margin-bottom:6px;">',
            '      <input type="checkbox" id="ai-strict-mode" style="accent-color:#ff2442;cursor:pointer;"> 严格校验（警告也视为错误）',
            '    </label>',
            '    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8b949e;cursor:pointer;margin-bottom:6px;">',
            '      <input type="checkbox" id="ai-no-stroke" style="accent-color:#ff2442;cursor:pointer;"> 不要描边类特效（提示词排除，粘贴方案自动换品牌渐变）',
            '    </label>',
            '    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8b949e;cursor:pointer;margin-bottom:6px;">',
            '      <input type="checkbox" id="ai-auto-decorate" checked style="accent-color:#ff2442;cursor:pointer;"> 自动配贴纸',
            '    </label>',
            '    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">',
            '      <span style="font-size:11px;color:#8b949e;white-space:nowrap;">应用后：</span>',
            '      <select id="ai-auto-export" style="flex:1;background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:3px 6px;border-radius:4px;font-size:11px;">',
            '        <option value="none">不导出</option>',
            '        <option value="current">仅当前页</option>',
            '        <option value="all">全部页 PNG</option>',
            '      </select>',
            '    </div>',
            '    <div style="display:flex;gap:6px;margin-top:6px;">',
            '      <button id="ai-fallback-apply" class="btn" style="flex:1;justify-content:center;font-size:11px;" title="不依赖 AI，直接用原文生成可用封面"><i class="fa-solid fa-bolt"></i> 本地快速生成</button>',
            '      <button id="ai-undo-apply" class="btn" style="flex:1;justify-content:center;font-size:11px;" title="撤销上次 AI 应用"><i class="fa-solid fa-rotate-left"></i> 撤销应用</button>',
            '    </div>',
            '    <div style="display:flex;gap:6px;margin-top:6px;">',
            '      <select id="ai-history-select" style="flex:1;background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:4px;font-size:11px;">',
            '        <option value="">最近方案（点此载入）</option>',
            '      </select>',
            '    </div>',
            '  </div>',
            '</div>',

            // 状态栏
            '<div id="ai-status-bar" style="margin-top:10px;padding:6px 8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;font-size:10px;color:#8b949e;line-height:1.5;">等待在 ① 中粘贴原文…</div>',

            // 结果区
            '<div id="ai-spec-result" style="margin-top:8px;font-size:11px;line-height:1.5;"></div>',

            '</div>',
            '<input type="file" id="ai-pack-file" accept=".json,application/json" multiple style="display:none;">',
            '<input type="file" id="ai-backup-file" accept=".json,application/json" style="display:none;">'
        ].join('');

        sidebar.insertBefore(panel, sidebar.firstChild);
        bindPanelEvents();
        return panel;
    }

    function showResult(html, kind) {
        const el = document.getElementById('ai-spec-result');
        if (!el) return;
        const color = kind === 'error' ? '#f85149' : (kind === 'warn' ? '#f1e05a' : '#7ee787');
        el.style.color = color;
        el.innerHTML = html;
    }

    /**
     * 依次执行两条硬约束（安全区越界 / 单页高度预算）。
     * 失败时统一渲染错误提示并返回 ok:false，成功返回 { ok:true, spec }。
     * 历史重复：parseSpec 主路径与兜底路径各写了完全相同的一份（共 4 段）。
     */
    function applyHardConstraints(spec) {
        if (typeof enforceSafeAreaHardConstraint === 'function') {
            const a = enforceSafeAreaHardConstraint(spec);
            if (!a.ok) {
                const failures = a.failures || [];
                const lines = failures.map(f => '· 第 ' + f.page + ' 页图层 ' + f.layer + '：' + f.reason);
                showResult(
                    '<div style="color:#f85149;line-height:1.6;"><b>❌ 安全区越界无法自动修复（' + failures.length + ' 处）</b><br>' +
                    lines.join('<br>') +
                    '<br><small style="color:#8b949e;">请把上面的提示贴回 AI，让它删减内容或拆页后重新生成。</small></div>',
                    'error'
                );
                return { ok: false, spec: spec };
            }
            spec = a.spec;
        }
        if (typeof enforceHeightBudget === 'function') {
            const b = enforceHeightBudget(spec);
            if (!b.ok) {
                const pages = b.pages || [];
                const lines = pages.map(p => '· 第 ' + p.page + ' 页总高 ' + p.total + 'px，超出预算 ' + (p.total - p.budget) + 'px（预算 ' + p.budget + 'px）');
                showResult(
                    '<div style="color:#f85149;line-height:1.6;"><b>❌ 单页文字总高度超出预算（' + pages.length + ' 页）</b><br>' +
                    lines.join('<br>') +
                    '<br><small style="color:#8b949e;">请让 AI 把超出的页拆成两页，或删减内容后重新生成。</small></div>',
                    'error'
                );
                return { ok: false, spec: spec };
            }
        }
        return { ok: true, spec: spec };
    }

    /** 把每层 height 同步为实测高度（唯一实现：ai-spec.js → syncSpecTextHeights） */
    function syncHeights(spec) {
        if (!spec) return;
        if (typeof syncSpecTextHeights === 'function') syncSpecTextHeights(spec);
    }

    function sanitizeBrandInSpec(spec) {
        if (!spec || typeof sanitizeSpecBrand !== 'function') return spec;
        let strict = false;
        try {
            strict = !!(window.BrandManager && BrandManager.isStrictColors && BrandManager.isStrictColors());
        } catch (e) {}
        try { sanitizeSpecBrand(spec, { strict: strict }); } catch (e) {}
        return spec;
    }

    function parseSpec() {
        const ta = document.getElementById('ai-spec-input');
        if (!ta) return null;
        const raw = (ta.value || '').trim();
        if (!raw) {
            showResult('❌ 请先粘贴 JSON', 'error');
            return null;
        }

        let text = raw;
        if (typeof repairTruncatedJson === 'function') {
            const fixed = repairTruncatedJson(text);
            if (fixed && fixed.trim().endsWith('}')) {
                try { JSON.parse(fixed); text = fixed; } catch (e) {}
            }
        }
        if (typeof repairAiJsonText === 'function') {
            text = repairAiJsonText(text) || text;
        } else {
            const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (fence) text = fence[1].trim();
        }

        try {
            let spec = JSON.parse(text);
            if (typeof fixSpecStructure === 'function') spec = fixSpecStructure(spec);
            if (typeof migrateSpecToLatest === 'function') spec = migrateSpecToLatest(spec);
            if (typeof migrateSpec === 'function') spec = migrateSpec(spec);
            // ✅ 硬约束 A+B：安全区越界 / 单页高度预算，修不好直接返回 null
            const guard = applyHardConstraints(spec);
            if (!guard.ok) return null;
            return sanitizeBrandInSpec(guard.spec);
        } catch (e) {
            if (typeof extractMultipleSpecs === 'function') {
                const multi = extractMultipleSpecs(raw);
                if (multi.length >= 1) {
                    const fixed = multi.map(s => (typeof fixSpecStructure === 'function') ? fixSpecStructure(s) : s);
                    let best = (typeof pickBestSpec === 'function') ? pickBestSpec(fixed) : fixed[0];
                    if (best) {
                        if (typeof migrateSpec === 'function') best = migrateSpec(best);
                        // 与主路径一致：硬约束不过则整份作废
                        const guard2 = applyHardConstraints(best);
                        if (!guard2.ok) return null;
                        best = guard2.spec;
                        if (multi.length > 1) {
                            showResult('📦 检测到 ' + multi.length + ' 份候选方案，已自动选最高质量的一份。', 'ok');
                        }
                        return sanitizeBrandInSpec(best);
                    }
                }
            }
            const msg = String(e.message || '');
            showResult('❌ JSON 解析失败：' + msg, 'error');
            try { if (typeof saveDebugSnapshot === 'function') saveDebugSnapshot(raw, { stage: 'parseFail', error: msg }); } catch (err) {}
            return null;
        }
    }

    function renderValidateResult(r) {
        const parts = [];
        let spec = null;
        try { spec = parseSpec(); } catch (e) { spec = null; }
        if (spec && typeof scoreSpecQuality === 'function') {
            const q = scoreSpecQuality(spec);
            const color = q.total >= 80 ? '#7ee787' : (q.total >= 60 ? '#f1e05a' : '#f85149');
            parts.push('<div style="padding:6px 8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;margin-bottom:6px;"><span style="font-size:14px;font-weight:700;color:' + color + ';">质量 ' + q.total + '</span><span style="font-size:10px;color:#6e7681;"> / 100</span></div>');
        }
        parts.push(r.ok ? '✅ 校验通过' : '❌ 校验未通过');
        if (r.errors && r.errors.length) {
            parts.push('<div style="color:#f85149;margin-top:4px;"><b>错误 ' + r.errors.length + ' 条：</b><br>' + r.errors.map(e => '· ' + e).join('<br>') + '</div>');
        }
        if (r.warnings && r.warnings.length) {
            parts.push('<div style="color:#f1e05a;margin-top:4px;"><b>警告 ' + r.warnings.length + ' 条（已自动修复）：</b><br>' + r.warnings.slice(0, 10).map(w => '· ' + w).join('<br>') + (r.warnings.length > 10 ? '<br>…还有 ' + (r.warnings.length - 10) + ' 条' : '') + '</div>');
        }
        // ✅ 语义多样性检查（不阻断，只提示）
        try {
            if (spec && typeof validateSpecSemantics === 'function') {
                const sm = validateSpecSemantics(spec);
                if (sm.warnings && sm.warnings.length) {
                    parts.push('<div style="color:#f1e05a;margin-top:6px;padding:6px 8px;background:rgba(241,224,90,0.06);border:1px solid rgba(241,224,90,0.3);border-radius:6px;"><b>🎨 视觉多样性提示（' + sm.warnings.length + ' 条，不影响应用）：</b><br>' + sm.warnings.map(w => '· ' + w).join('<br>') + '</div>');
                }
                if (sm.metrics && sm.metrics.layersWithEffect > 0) {
                    const famList = Object.keys(sm.metrics.families || {}).map(f => f + '×' + sm.metrics.families[f]).join(' · ');
                    parts.push('<div style="color:#8b949e;margin-top:4px;font-size:10px;">视觉机制分布：' + famList + (sm.metrics.coverFamily ? ' · 封面机制：' + sm.metrics.coverFamily : '') + '</div>');
                }
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiImportUI] 语义多样性检查失败', e);
        }
        showResult(parts.join(''), r.ok ? 'ok' : 'error');
    }

    function runValidate(spec) {
        const strictCb = document.getElementById('ai-strict-mode');
        const strict = !!(strictCb && strictCb.checked);
        if (strict && typeof validateSpecStrict === 'function') return validateSpecStrict(spec);
        return validateSpec(spec);
    }

    async function doValidate() {
        const raw = (document.getElementById('ai-spec-input') || {}).value || '';
        let specs = [];
        try { specs = splitRawSpecs(raw); } catch (e) { specs = []; }
        if (specs.length >= 2) {
            const list = rankSpecsLocal(specs);
            if (list.length >= 2) {
                openMultiCandidatePreview(list, (chosen) => {
                    if (!chosen) { showResult('已取消候选选择。', 'info'); return; }
                    // ✅ 不覆盖 ai-spec-input，保留 3 份原始 JSON 供后续「打开对比」
                    _lastChosenSpec = chosen.spec;
                    _lastSpecInputSnapshot = raw;
                    window.__aiChosen = true;
                    const r = runValidate(chosen.spec);
                    renderValidateResult(r);
                    showResult('✅ 已选中方案 ' + String.fromCharCode(65 + list.indexOf(chosen)) + '（质量 ' + chosen.quality + '，' + chosen.pages + ' 页）', 'ok');
                });
                return;
            }
        }
        const spec = parseSpec();
        if (!spec) return;
        const r = runValidate(spec);
        renderValidateResult(r);
    }

    async function doPreview() {
        const raw = (document.getElementById('ai-spec-input') || {}).value || '';
        let specs = [];
        try { specs = splitRawSpecs(raw); } catch (e) { specs = []; }

        if (specs.length >= 2) {
            const list = rankSpecsLocal(specs);
            if (list.length >= 2) {
                const planMeta = [];
                const plansByLabel = {};
                list.forEach((item, gi) => {
                    const label = String.fromCharCode(65 + gi);
                    let normalized = [];
                    try {
                        if (typeof autoFitToSafeArea === 'function') {
                            try { autoFitToSafeArea(item.spec, {}); } catch (e) {}
                        }
                        syncHeights(item.spec);
                        normalized = (item.spec.pages || []).map((p, i) => normalizeSpecPage(p, i));
                    } catch (e) { normalized = []; }
                    normalized.forEach(p => { p._planLabel = label; });
                    // ✅ 页码：单页不加；多页每页加 "01 / 07"
                    try {
                        if (window.PageNumbers && PageNumbers.ensurePageNumbers) {
                            PageNumbers.ensurePageNumbers(normalized);
                        }
                    } catch (e) {}
                    plansByLabel[label] = normalized;
                    planMeta.push({ label, pageCount: normalized.length, quality: item.quality });
                });
                const totalPages = Object.keys(plansByLabel).reduce(function(s, k){ return s + plansByLabel[k].length; }, 0);
                if (totalPages === 0) { showResult('❌ 三套方案页为空，无法应用', 'error'); return; }
                try {
                    window.__aiSpecBackup = {
                        appliedAt: Date.now(),
                        pages: JSON.parse(JSON.stringify(state.pages || [])),
                        currentPageId: state.currentPageId,
                        background: state.background ? JSON.parse(JSON.stringify(state.background)) : null
                    };
                } catch (e) {}
                _lastSpecInputSnapshot = raw;
                window.__aiChosen = true;
                injectPlanSwitcher(planMeta, plansByLabel);
                window.__aiApplied = true;
                if (typeof window.__aiRefreshStepper === 'function') window.__aiRefreshStepper();
                try { refreshHistorySelect(); } catch (e) {}
                showResult('✅ 已应用 A 方案（默认）。顶部切换 A/B/C，画布整页替换为对应方案。', 'ok');
                if (typeof showBgToast === 'function') showBgToast('AI 三方案已就绪，可切换 A/B/C');
                return;
            }
        }

        const spec = parseSpec();
        if (!spec) return;
        if (specs.length === 1) {
            showResult('⚠️ 只检测到 1 份方案。如果 AI 应输出 3 份，请检查复制是否完整。\n正在应用…', 'warn');
        } else {
            showResult('⏳ 正在应用…', 'warn');
        }
        if (typeof autoFitToSafeArea === 'function') {
            try { autoFitToSafeArea(spec, {}); } catch (e) {}
        }
        syncHeights(spec);
        const appendCb2 = document.getElementById('ai-append-mode');
        const append2 = !!(appendCb2 && appendCb2.checked);
        const decCb2 = document.getElementById('ai-auto-decorate');
        const autoDecorate2 = !(decCb2 && !decCb2.checked);
        let r;
        try { r = await applyCoverSpec(spec, { dryRun: false, append: append2, autoDecorate: autoDecorate2 }); }
        catch (e) { showResult('❌ 应用失败：' + e.message, 'error'); return; }
        if (!r || r.ok === false || !r.applied) {
            const errs = (r && r.errors) ? r.errors.join('；') : '未知错误';
            showResult('❌ 方案不合规，无法应用：' + errs, 'error');
            return;
        }
        removePlanSwitcher();
        window.__aiApplied = true;
        if (typeof window.__aiRefreshStepper === 'function') window.__aiRefreshStepper();
        try { refreshHistorySelect(); } catch (e) {}
        showResult('✅ 已应用到画布（共 ' + (r.pages ? r.pages.length : 0) + ' 页）', 'ok');
        if (typeof showBgToast === 'function') showBgToast('AI 方案已应用 ✓');
    }

    // ✅ 悬浮胶囊条：fixed 挂 body 上，按 canvas-container 位置定位，避免被 renderCanvas 的 innerHTML 清空
    function injectPlanSwitcher(planMeta, plansByLabel) {
        removePlanSwitcher();
        const container = document.querySelector('.canvas-container');
        if (!container) return;

        const bar = document.createElement('div');
        bar.id = 'ai-plan-switcher';
        bar.style.cssText = [
            'position:fixed',
            'z-index:9000',
            'display:inline-flex',
            'gap:6px',
            'align-items:center',
            'padding:6px 8px',
            'background:rgba(13,17,23,0.94)',
            'border:1px solid #30363d',
            'border-radius:10px',
            'box-shadow:0 4px 14px rgba(0,0,0,0.4)',
            'backdrop-filter:blur(6px)'
        ].join(';');

        // ✅ 拖动把手：用户手动定位后停用自动重定位
        let userPinned = false;
        let dragOffset = null;
        const dragHandle = document.createElement('span');
        dragHandle.textContent = '⠿';
        dragHandle.title = '拖动以固定位置（双击恢复自动跟随）';
        dragHandle.style.cssText = 'cursor:grab;color:#6e7681;font-size:14px;padding:0 4px;user-select:none;line-height:1;';
        dragHandle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const r = bar.getBoundingClientRect();
            dragOffset = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            dragHandle.style.cursor = 'grabbing';
            dragHandle.setPointerCapture(e.pointerId);
        });
        dragHandle.addEventListener('pointermove', (e) => {
            if (!dragOffset) return;
            bar.style.left = (e.clientX - dragOffset.dx) + 'px';
            bar.style.top = (e.clientY - dragOffset.dy) + 'px';
            userPinned = true;
        });
        dragHandle.addEventListener('pointerup', (e) => {
            dragOffset = null;
            dragHandle.style.cursor = 'grab';
            try { dragHandle.releasePointerCapture(e.pointerId); } catch (err) {}
        });
        dragHandle.addEventListener('dblclick', () => {
            userPinned = false;
            reposition();
        });
        bar.insertBefore(dragHandle, bar.firstChild);

        function reposition() {
            if (userPinned) return;
            const r = container.getBoundingClientRect();
            bar.style.left = (r.left + 12) + 'px';
            bar.style.top = (r.top + 12) + 'px';
        }

        let activeLabel = planMeta.length > 0 ? planMeta[0].label : 'A';
        const ACTIVE_BG = '#ff2442';
        const ACTIVE_BORDER = '#ff2442';
        const ACTIVE_COLOR = '#fff';
        const IDLE_BG = 'transparent';
        const IDLE_BORDER = '#30363d';
        const IDLE_COLOR = '#8b949e';

        function paintBar() {
            bar.querySelectorAll('.ai-plan-btn').forEach(b => {
                const on = b.dataset.plan === activeLabel;
                b.textContent = on ? (b.dataset.plan + '方案：第 1 页') : (b.dataset.plan + '方案');
                b.style.background = on ? ACTIVE_BG : IDLE_BG;
                b.style.borderColor = on ? ACTIVE_BORDER : IDLE_BORDER;
                b.style.color = on ? ACTIVE_COLOR : IDLE_COLOR;
                b.style.fontWeight = on ? '600' : '500';
            });
        }

        // ✅ 全局方案缓存：记录每个方案被用户修改后的真实页面数据
        window.__aiPlansCache = window.__aiPlansCache || {};

        function applyPlan(label) {
            const pages = plansByLabel[label] || [];
            if (!pages.length) return false;

            // ✅ 1. 如果画布现在有已应用的内容，先把用户的最新修改存入上一个方案的缓存
            if (window.__currentActivePlanLabel && window.__currentActivePlanLabel !== label && window.state && window.state.pages) {
                window.__aiPlansCache[window.__currentActivePlanLabel] = JSON.parse(JSON.stringify(window.state.pages));
            }

            // ✅ 2. 优先使用缓存中的修改版，如果没有再用初始模板
            const targetPages = window.__aiPlansCache[label] || pages;

            state.pages = JSON.parse(JSON.stringify(targetPages));
            state.pages.forEach((p, i) => {
                p._planLabel = label;
                p._planPageNo = i + 1;
            });
            state.currentPageId = state.pages[0].id;
            state.selectedLayerId = null;
            state.selectedLayerIds = [];
            state.editingLayerId = null;
            try {
                if (state.pages[0].bg && typeof normalizeBackground === 'function') {
                    state.background = normalizeBackground(state.pages[0].bg);
                }
            } catch (e) {}

            // ✅ 3. 记录当前画布绑定的是哪个方案
            window.__currentActivePlanLabel = label;

            if (state.history && typeof state.history.record === 'function') state.history.record();
            if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
            if (typeof renderAll === 'function') renderAll();
            return true;
        }

        planMeta.forEach((m) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-plan-btn';
            btn.dataset.plan = m.label;
            btn.style.cssText = 'height:26px;padding:0 12px;border-radius:6px;border:1px solid #30363d;background:transparent;color:#8b949e;font-size:12px;cursor:pointer;transition:all .15s;white-space:nowrap;';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeLabel === m.label) return;
                const ok = applyPlan(m.label);
                if (!ok) return;
                activeLabel = m.label;
                paintBar();
                reposition();
                if (typeof window.__aiRefreshStepper === 'function') window.__aiRefreshStepper();
                showResult('✅ 已应用 ' + m.label + ' 方案（' + m.pageCount + ' 页）', 'ok');
                const first = document.querySelector('.canvas-page-wrapper');
                if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            bar.appendChild(btn);
        });

        document.body.appendChild(bar);

        // 初始定位 + 跟随窗口尺寸/画布滚动更新
        reposition();
        window.addEventListener('resize', reposition);
        if (window.__planSwitcherScrollHandler) {
            container.removeEventListener('scroll', window.__planSwitcherScrollHandler);
        }
        window.__planSwitcherScrollHandler = reposition;
        container.addEventListener('scroll', reposition, { passive: true });

        paintBar();
        applyPlan(activeLabel);
        paintBar();
        reposition();
    }

    function removePlanSwitcher() {
        const old = document.getElementById('ai-plan-switcher');
        if (old) old.remove();
        if (window.__planSwitcherScrollHandler) {
            const c = document.querySelector('.canvas-container');
            if (c) c.removeEventListener('scroll', window.__planSwitcherScrollHandler);
            window.removeEventListener('resize', window.__planSwitcherScrollHandler);
            window.__planSwitcherScrollHandler = null;
        }
    }

    async function doApply() {
        const raw = (document.getElementById('ai-spec-input') || {}).value || '';
        let specs = [];
        try { specs = splitRawSpecs(raw); } catch (e) { specs = []; }

        // ✅ 语义2：≥2 份永远弹对比，行为与 doPreview 一致
        if (specs.length >= 2) {
            const list = rankSpecsLocal(specs);
            if (list.length >= 2) {
                const chosen = await new Promise(resolve => {
                    try { openMultiCandidatePreview(list, resolve); }
                    catch (err) { console.warn('[doApply] multiPreview 异常，回退', err); resolve(null); }
                });
                if (!chosen) { showResult('已取消应用。', 'info'); return; }
                _lastChosenSpec = chosen.spec;
                _lastSpecInputSnapshot = raw;
                window.__aiChosen = true;
                showResult('✅ 已选中方案 ' + String.fromCharCode(65 + list.indexOf(chosen)) + '（质量 ' + chosen.quality + '，' + chosen.pages + ' 页），继续应用…', 'ok');
            }
        }

        let spec = (_lastChosenSpec && _lastSpecInputSnapshot === raw) ? _lastChosenSpec : parseSpec();
        if (!spec) return;
        // ✅ 应用前自动修复安全区越界（不改品牌色/背景/特效）
        if (typeof autoFitToSafeArea === 'function') {
            try {
                const fit = autoFitToSafeArea(spec, {});
                if (fit && fit.fixed > 0) {
                    showResult('🔧 已自动修复 ' + fit.fixed + ' 处排版问题（越界/重叠）：<br>' + (fit.details || []).slice(0, 5).join('<br>'), 'warn');
                    if (_lastChosenSpec) _lastChosenSpec = spec;
                }
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[doApply] autoFitToSafeArea 失败', e);
            }
        }
        const check = runValidate(spec);
        if (!check.ok) {
            renderValidateResult(check);
            // ✅ 品牌硬约束：校验不通过一律禁止应用
            showResult(
                '<div style="color:#f85149;line-height:1.6;"><b>已禁止应用：方案不符合品牌契约（' + check.errors.length + ' 处硬违规）</b><br>' +
                '请把下列问题贴回 AI 让它修正后重试，或点「自动修复」处理机械类错误。<br>' +
                '<small style="color:#8b949e;">提示：品牌背景 / 颜色 / 特效 / titleCandidates 属于硬约束，自动修复不会改写它们。</small></div>',
                'error'
            );
            return;
        }
        const appendCb = document.getElementById('ai-append-mode');
        const append = !!(appendCb && appendCb.checked);
        const decCb = document.getElementById('ai-auto-decorate');
        const autoDecorate = !(decCb && !decCb.checked);

        if (typeof diffSpecAgainstCanvas === 'function') {
            const d = diffSpecAgainstCanvas(spec);
            const msg = append
                ? ('即将【追加】AI 方案到画布末尾：\n\n当前画布：' + d.pagesBefore + ' 页\n将追加：' + d.pagesAfter + ' 页\n\n现有页面会完整保留。继续？')
                : ('即将【覆盖】画布：\n\n当前画布：' + d.pagesBefore + ' 页 / ' + d.layersBefore + ' 图层\n应用后：' + d.pagesAfter + ' 页 / ' + d.layersAfter + ' 图层\n\n注意：当前画布内容会被整体替换。继续？');
            if (!confirm(msg)) return;
        }

        const r = await applyCoverSpec(spec, { dryRun: false, append, autoDecorate });
        renderValidateResult(r);
        if (r.applied) {
            window.__aiApplied = true;
            showResult('✅ 已应用到画布（共 ' + (r.pages ? r.pages.length : 0) + ' 页）。如需回退点「撤销应用」。', 'ok');
            if (typeof showBgToast === 'function') showBgToast('AI 方案已应用 ✓');
            if (typeof window.__aiRefreshStepper === 'function') window.__aiRefreshStepper();
            try { refreshHistorySelect(); } catch (e) {}

            try {
                const expSel = document.getElementById('ai-auto-export');
                const scope = expSel ? expSel.value : 'none';
                if (scope && scope !== 'none' && typeof autoExportAfterApply === 'function') {
                    showResult('⏳ 正在导出…', 'warn');
                    setTimeout(async () => {
                        const er = await autoExportAfterApply(scope);
                        if (typeof showBgToast === 'function') {
                            showBgToast(er.ok ? ('导出完成：' + er.success + ' 页 ✓') : ('导出结束：成功 ' + er.success + ' / 失败 ' + er.fail));
                        }
                    }, 100);
                }
            } catch (e) {}
        }
    }

    /**
     * 多套候选 · 全部页对比预览（国际主流做法）
     * 每套候选横向排布「全部页」缩略图，用户横向滑动对比节奏，组尾有「应用这套」按钮。
     * @param {Array<{spec, quality, pages, title, contrast, risk}>} ranked
     * @param {(chosen: object|null) => void} onPick
     */
    function openMultiCandidatePreview(ranked, onPick) {
        const old = document.getElementById('ai-multi-preview');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ai-multi-preview';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.94);z-index:99999;overflow-y:auto;padding:20px 24px 40px;';

        const header = document.createElement('div');
        header.style.cssText = 'position:sticky;top:0;background:rgba(0,0,0,0.94);padding:8px 0 12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:#e1e4e8;z-index:10;border-bottom:1px solid #30363d;';
        header.innerHTML = '<div style="font-size:16px;font-weight:600;">🎬 AI 生成了 ' + ranked.length + ' 套方案 · 全部 ' + ranked.reduce((s,x)=>s+(x.pages||0),0) + ' 页，横向滑动对比后选一套</div>';
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn';
        btnCancel.textContent = '关闭';
        btnCancel.addEventListener('click', () => { overlay.remove(); onPick && onPick(null); });
        header.appendChild(btnCancel);
        overlay.appendChild(header);

        const groups = document.createElement('div');
        groups.style.cssText = 'display:flex;flex-direction:column;gap:20px;max-width:1400px;margin:0 auto;';

        ranked.forEach((item, gi) => {
          try {
            const spec = sanitizeBrandInSpec(item.spec || {});
            const q = item.quality != null ? item.quality : 0;
            const pagesArr = (spec.pages || []);
            const pagesCount = pagesArr.length;
            const qColor = q >= 80 ? '#7ee787' : (q >= 60 ? '#f1e05a' : '#f85149');
            const riskColor = item.risk === 'low' ? '#7ee787' : (item.risk === 'medium' ? '#f1e05a' : '#f85149');
            const riskLabel = item.risk === 'low' ? '可读性好' : (item.risk === 'medium' ? '可读性一般' : (item.risk === 'high' ? '对比度弱' : '—'));

            const group = document.createElement('div');
            group.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:12px;overflow:hidden;';

            // 组头
            const gHead = document.createElement('div');
            gHead.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;gap:12px;flex-wrap:wrap;border-bottom:1px solid #30363d;';
            const titleRaw = (item.title || '').replace(/[<>]/g, '').trim();
            let semInfo = '';
            try {
                if (typeof validateSpecSemantics === 'function') {
                    const sm = validateSpecSemantics(item.spec);
                    const fams = sm.metrics && sm.metrics.families ? Object.keys(sm.metrics.families) : [];
                    if (fams.length > 0) {
                        const famColor = fams.length >= 3 ? '#7ee787' : (fams.length === 2 ? '#f1e05a' : '#f85149');
                        semInfo = '  <span style="font-size:11px;color:' + famColor + ';" title="视觉机制分布">机制 ' + fams.length + ' 种</span>';
                    }
                }
            } catch (e) {}
            gHead.innerHTML =
                '<div style="display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap;">' +
                '  <span style="font-size:15px;font-weight:700;color:#e1e4e8;">' + (gi === 0 ? '🏆 ' : '') + '方案 ' + String.fromCharCode(65 + gi) + '</span>' +
                '  <span style="font-size:12px;color:' + qColor + ';font-weight:700;">质量 ' + q + '</span>' +
                '  <span style="font-size:12px;color:#8b949e;">' + pagesCount + ' 页</span>' +
                '  <span style="font-size:11px;color:' + riskColor + ';">' + riskLabel + (item.contrast ? ' (' + item.contrast + ':1)' : '') + '</span>' +
                semInfo +
                (titleRaw ? '  <span style="font-size:11px;color:#6e7681;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px;">' + titleRaw.replace(/"/g, '&quot;') + '</span>' : '') +
                '</div>';
            const btnUse = document.createElement('button');
            btnUse.className = 'btn btn-primary';
            btnUse.style.cssText = 'padding:6px 14px;font-size:12px;flex-shrink:0;';
            btnUse.innerHTML = '<i class="fa-solid fa-check"></i> 应用方案 ' + String.fromCharCode(65 + gi);
            btnUse.addEventListener('click', async () => {
                overlay.remove();
                // ✅ 选择即应用：直接执行 applyCoverSpec，不再需要第⑤步
                _lastChosenSpec = item.spec;
                _lastSpecInputSnapshot = (document.getElementById('ai-spec-input') || {}).value || '';
                window.__aiChosen = true;
                // ✅ 应用前自动修复安全区越界
                if (typeof autoFitToSafeArea === 'function') {
                    try {
                        const fit = autoFitToSafeArea(item.spec, {});
                        if (fit && fit.fixed > 0) {
                            showResult('🔧 已自动修复 ' + fit.fixed + ' 处排版问题（越界/重叠），正在应用…', 'warn');
                        }
                    } catch (e) {
                        if (window.Utils && Utils.log) Utils.log.warn('[CandidatePreview] autoFitToSafeArea 失败', e);
                    }
                }
                // ✅ autoFit 修完后把每层 height 同步成实测高度（唯一实现：syncSpecTextHeights）
                syncHeights(item.spec);
                const check = runValidate(item.spec);
                if (!check.ok) {
                    renderValidateResult(check);
                    showResult('❌ 该方案校验未通过，请换一套或检查 JSON', 'error');
                    return;
                }
                const appendCb = document.getElementById('ai-append-mode');
                const append = !!(appendCb && appendCb.checked);
                const decCb = document.getElementById('ai-auto-decorate');
                const autoDecorate = !(decCb && !decCb.checked);
                showResult('⏳ 正在应用…', 'warn');
                try {
                    // ✅ 深拷贝，防止 autoFitToSafeArea / validateSpec 的原地修改污染 ranked 里的 spec
                    const _specForApply = JSON.parse(JSON.stringify(item.spec));
                    const r = await applyCoverSpec(_specForApply, { dryRun: false, append, autoDecorate });
                    if (r.applied) {
                        window.__aiApplied = true;
                        if (typeof window.__aiRefreshStepper === 'function') window.__aiRefreshStepper();
                        showResult('✅ 已应用方案 ' + String.fromCharCode(65 + gi) + '（' + (r.pages ? r.pages.length : 0) + ' 页）', 'ok');
                        if (typeof showBgToast === 'function') showBgToast('方案 ' + String.fromCharCode(65 + gi) + ' 已应用 ✓');
                        try { refreshHistorySelect(); } catch (e) {}
                    } else {
                        showResult('❌ 应用失败', 'error');
                    }
                } catch (e) {
                    showResult('❌ 应用失败：' + e.message, 'error');
                }
            });
            gHead.appendChild(btnUse);
            group.appendChild(gHead);

            // 页横条
            const rail = document.createElement('div');
            rail.style.cssText = 'display:flex;gap:12px;overflow-x:auto;padding:14px 16px;scrollbar-width:thin;scrollbar-color:#484f58 transparent;';
            rail.addEventListener('wheel', (e) => {
                if (e.deltaY && !e.shiftKey) { rail.scrollLeft += e.deltaY; e.preventDefault(); }
            }, { passive: false });

            pagesArr.forEach((page, pi) => {
              try {
                const card = document.createElement('div');
                card.style.cssText = 'position:relative;width:180px;flex-shrink:0;cursor:default;';
                const thumb = document.createElement('div');
                thumb.style.cssText = 'position:relative;width:180px;height:320px;background:#000;border-radius:6px;overflow:hidden;border:1px solid #30363d;';

                // ✅ 页面渲染统一走 buildSpecPageNode（scale 0.5 → 整页正好放进 180×320 缩略图）
                thumb.appendChild(buildSpecPageNode(page, {
                    scale: 0.5,
                    pageNumber: pi + 1,
                    totalPages: pagesArr.length,
                    background: (window.state && state.background) || null
                }));

                const pageBadge = document.createElement('div');
                pageBadge.style.cssText = 'position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.72);color:#fff;font-size:10px;padding:2px 7px;border-radius:4px;z-index:5;';
                pageBadge.textContent = 'P' + (pi + 1) + (pi === 0 ? ' · 封面' : '');
                thumb.appendChild(pageBadge);
                // ✅ 越界角标：估算该页是否有图层越出底部安全区
                try {
                    if (typeof _estimateTextRenderHeight === 'function') {
                        let overflowCount = 0;
                        (page.layers || []).forEach(l => {
                            if (!l || l.type !== 'text') return;
                            const estH = _estimateTextRenderHeight(l);
                            const realH = Math.max(estH, Number(l.height) || 0);
                            if ((Number(l.y) || 0) + realH > 596) overflowCount++;
                        });
                        if (overflowCount > 0) {
                            const warnBadge = document.createElement('div');
                            warnBadge.style.cssText = 'position:absolute;top:6px;right:6px;background:#f85149;color:#fff;font-size:10px;padding:2px 7px;border-radius:4px;z-index:6;font-weight:600;';
                            warnBadge.textContent = '⚠ ' + overflowCount + ' 越界';
                            warnBadge.title = '该页有 ' + overflowCount + ' 个图层越出底部安全区，应用时会自动上移或缩字';
                            thumb.appendChild(warnBadge);
                        }
                    }
                } catch (e) {}
                card.appendChild(thumb);

                const cap = document.createElement('div');
                cap.style.cssText = 'margin-top:4px;font-size:10px;color:#8b949e;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                cap.textContent = page.title || ('第 ' + (pi + 1) + ' 页');
                card.appendChild(cap);

                rail.appendChild(card);
              } catch (err) {
                console.warn('[openMultiCandidatePreview] 方案' + gi + ' 第' + pi + '页渲染失败', err);
              }
            });

            if (!pagesArr.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:20px;color:#f85149;font-size:12px;';
                empty.textContent = '这套方案没有页数据';
                rail.appendChild(empty);
            }

            group.appendChild(rail);
            groups.appendChild(group);
          } catch (err) {
            console.warn('[openMultiCandidatePreview] 方案组 ' + gi + ' 渲染失败', err);
          }
        });

        overlay.appendChild(groups);
        document.body.appendChild(overlay);

        // ESC 关闭
        const onKey = (e) => {
            if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); overlay.remove(); onPick && onPick(null); }
        };
        document.addEventListener('keydown', onKey);
    }

    /**
     * 候选选择器：AI 一次输出 ≥2 份 spec 时，弹网格让用户挑
     * @param {Array<{spec, quality, pages, title, contrast, risk}>} ranked 已按质量降序
     * @param {(chosen: object|null) => void} onPick 用户选中（null = 取消）
     */
    function openCandidatePicker(ranked, onPick) {
        const old = document.getElementById('ai-candidate-picker');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ai-candidate-picker';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;overflow-y:auto;padding:24px;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;color:#e1e4e8;gap:12px;flex-wrap:wrap;';
        header.innerHTML = '<div style="font-size:15px;font-weight:600;">🎯 AI 生成了 ' + ranked.length + ' 份候选，挑一份应用</div>';
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn';
        btnCancel.textContent = '取消';
        btnCancel.addEventListener('click', () => { overlay.remove(); onPick && onPick(null); });
        header.appendChild(btnCancel);
        overlay.appendChild(header);

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;max-width:1200px;margin:0 auto;';

        ranked.forEach((item, i) => {
          try {
            const spec = item.spec;
            const q = item.quality != null ? item.quality : 0;
            const pages = item.pages != null ? item.pages : ((spec.pages || []).length);
            const qColor = q >= 80 ? '#7ee787' : (q >= 60 ? '#f1e05a' : '#f85149');
            const riskColor = item.risk === 'low' ? '#7ee787' : (item.risk === 'medium' ? '#f1e05a' : '#f85149');
            const riskLabel = item.risk === 'low' ? '可读性好' : (item.risk === 'medium' ? '可读性一般' : (item.risk === 'high' ? '对比度弱' : '—'));

            const card = document.createElement('div');
            card.style.cssText = 'position:relative;background:#161b22;border:2px solid #30363d;border-radius:10px;overflow:hidden;cursor:pointer;transition:border-color .15s,transform .15s;';
            card.onmouseenter = () => { card.style.borderColor = '#ff2442'; card.style.transform = 'translateY(-2px)'; };
            card.onmouseleave = () => { card.style.borderColor = '#30363d'; card.style.transform = 'translateY(0)'; };

            const thumbWrap = document.createElement('div');
            thumbWrap.style.cssText = 'position:relative;width:100%;aspect-ratio:9/16;background:#000;overflow:hidden;';
            const firstPage = (spec.pages || [])[0];
            if (firstPage) {
                // ✅ 页面渲染统一走 buildSpecPageNode（按卡片基准宽度 280 等比缩放）
                thumbWrap.appendChild(buildSpecPageNode(firstPage, {
                    scale: 280 / 360,
                    background: (window.state && state.background) || null
                }));
            }

            const badge = document.createElement('div');
            badge.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);color:#fff;font-size:11px;padding:3px 8px;border-radius:4px;z-index:5;';
            badge.textContent = (i === 0 ? '🏆 推荐 ' : '') + '#' + (i + 1);
            thumbWrap.appendChild(badge);
            card.appendChild(thumbWrap);

            const info = document.createElement('div');
            info.style.cssText = 'padding:10px 12px;';
            const titleText = (item.title || '').replace(/[<>]/g, '').trim() || '（无标题）';
            info.innerHTML =
                '<div style="font-size:12px;color:#e1e4e8;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;" title="' + titleText.replace(/"/g, '&quot;') + '">' + titleText + '</div>' +
                '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">' +
                '  <span style="color:' + qColor + ';font-weight:700;">质量 ' + q + '</span>' +
                '  <span style="color:#8b949e;">' + pages + ' 页</span>' +
                '</div>' +
                '<div style="font-size:10px;color:' + riskColor + ';">' + riskLabel + (item.contrast ? ' (' + item.contrast + ':1)' : '') + '</div>';
            card.appendChild(info);

            card.addEventListener('click', () => {
                overlay.remove();
                if (onPick) onPick(item);
            });

            grid.appendChild(card);
          } catch (err) {
            console.warn('[openCandidatePicker] 卡片 #' + (i + 1) + ' 渲染失败', err);
          }
        });

        overlay.appendChild(grid);
        document.body.appendChild(overlay);
    }

    /**
     * 按 `"format":"douyin-cover-spec"` 出现位置 + 括号配对，把原文切成多份 spec。
     * 不依赖 extractMultipleSpecs（它处理复杂转义时会漏份，返回 1）。
     */
    function splitRawSpecs(raw) {
        const out = [];
        if (!raw || typeof raw !== 'string') return out;
        const positions = [];
        const re = /"format"\s*:\s*"douyin-cover-spec"/g;
        let m;
        while ((m = re.exec(raw)) !== null) positions.push(m.index);
        if (positions.length === 0) return out;

        positions.forEach((pos) => {
            let start = -1;
            for (let i = pos; i >= 0; i--) { if (raw[i] === '{') { start = i; break; } }
            if (start === -1) return;
            let depth = 0, inStr = false, esc = false, end = -1;
            for (let j = start; j < raw.length; j++) {
                const ch = raw[j];
                if (inStr) {
                    if (esc) { esc = false; continue; }
                    if (ch === '\\') { esc = true; continue; }
                    if (ch === '"') { inStr = false; }
                    continue;
                }
                if (ch === '"') { inStr = true; continue; }
                if (ch === '{') depth++;
                else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
            }
            if (end === -1) return;
            const slice = raw.slice(start, end + 1);
            let obj = null;
            try { obj = JSON.parse(slice); }
            catch (e1) {
                try {
                    const fixed = (typeof repairAiJsonText === 'function') ? repairAiJsonText(slice) : slice;
                    obj = JSON.parse(fixed);
                } catch (e2) { obj = null; }
            }
            if (obj && obj.format === 'douyin-cover-spec' && Array.isArray(obj.pages)) {
                try { if (typeof fixSpecStructure === 'function') obj = fixSpecStructure(obj); } catch (e) {}
                try { if (typeof migrateSpec === 'function') obj = migrateSpec(obj); } catch (e) {}
                out.push(obj);
            }
        });
        return out;
    }

    /** 把多份 spec 打分排序成 {spec, quality, pages, title, contrast, risk} */
    function rankSpecsLocal(specs) {
        if (!Array.isArray(specs) || !specs.length) return [];
        const items = specs.map((spec) => {
            let q = { total: 0 };
            try { if (typeof scoreSpecQuality === 'function') q = scoreSpecQuality(spec); } catch (e) {}
            let cr = null;
            try { if (typeof estimateCoverReadability === 'function') cr = estimateCoverReadability(spec); } catch (e) {}
            const pages = (spec.pages || []).length;
            const firstText = spec.pages && spec.pages[0] && (spec.pages[0].layers || []).find(l => l && l.type === 'text');
            const title = firstText ? String(firstText.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
            return {
                spec,
                quality: (q && q.total != null) ? q.total : 0,
                pages,
                title,
                contrast: cr ? cr.contrast : null,
                risk: cr ? cr.risk : null
            };
        });
        items.sort((a, b) => b.quality - a.quality);
        return items;
    }

    function openPreviewOverlay(pages, validateResult) {
        const old = document.getElementById('ai-spec-preview-overlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ai-spec-preview-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;overflow-y:auto;padding:24px;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap;';
        header.innerHTML = '<div style="color:#e1e4e8;font-size:14px;font-weight:600;">🤖 AI 方案预览 · ' + (pages ? pages.length : 0) + ' 页</div>';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;';
        const btnClose = document.createElement('button');
        btnClose.className = 'btn';
        btnClose.textContent = '关闭';
        btnClose.addEventListener('click', () => overlay.remove());
        const btnApply = document.createElement('button');
        btnApply.className = 'btn btn-primary';
        btnApply.innerHTML = '<i class="fa-solid fa-check"></i> 确认应用';
        btnApply.addEventListener('click', async () => {
            const spec = parseSpec();
            if (!spec) return;
            overlay.remove();
            const r = await applyCoverSpec(spec, { dryRun: false });
            renderValidateResult(r);
            if (r.applied && typeof showBgToast === 'function') showBgToast('AI 方案已应用 ✓');
        });
        actions.appendChild(btnClose);
        actions.appendChild(btnApply);
        header.appendChild(actions);
        overlay.appendChild(header);

        const stage = document.createElement('div');
        stage.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;justify-content:center;align-items:flex-start;';
        overlay.appendChild(stage);
        document.body.appendChild(overlay);

        (pages || []).forEach((page, i) => {
            const card = document.createElement('div');
            card.style.cssText = 'position:relative;width:360px;height:640px;background:#000;border-radius:8px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.6);flex-shrink:0;';
            const badge = document.createElement('div');
            badge.style.cssText = 'position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.7);color:#fff;font-size:11px;padding:2px 8px;border-radius:4px;z-index:5;';
            badge.textContent = '第 ' + (i + 1) + ' 页 · ' + (page.title || '');
            card.appendChild(badge);

            // ✅ 页面渲染统一走 buildSpecPageNode（360×640 1:1 预览）
            card.appendChild(buildSpecPageNode(page, {
                scale: 1,
                zIndex: 2,
                pageNumber: i + 1,
                totalPages: pages.length,
                background: (window.state && state.background) || null
            }));
            stage.appendChild(card);
        });
    }

    function runChunk() {
        const ta = document.getElementById('ai-chunk-input');
        const out = document.getElementById('ai-chunk-result');
        const copyBtn = document.getElementById('ai-chunk-copy');
        if (!ta || !out) return;
        const raw = ta.value || '';
        if (!raw.trim()) {
            out.innerHTML = '<span style="color:#f85149;">请先粘贴原文</span>';
            return;
        }
        if (typeof buildChunkPayload !== 'function') return;
        const payload = buildChunkPayload(raw);
        window.__lastChunkPayload = payload;
        if (copyBtn) copyBtn.disabled = false;

        const html = [];
        html.push('<div style="margin-bottom:6px;color:#e1e4e8;">共 ' + payload.chunks.length + ' 块：</div>');
        payload.chunks.forEach(c => {
            const meta = '[' + c.layout.layout + '] ' + c.charCount + ' 字 / ' + c.lineCount + ' 行 → ' + c.layout.pagesNeeded + ' 页';
            html.push('<div style="padding:4px 6px;background:#161b22;border:1px solid #30363d;border-radius:4px;margin-bottom:4px;line-height:1.3;">' +
                '<div style="color:#e1e4e8;font-size:11px;">#' + c.index + ' ' + meta + '</div>' +
                '<div style="color:#6e7681;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + c.text.replace(/[<>]/g, '').slice(0, 40) + (c.text.length > 40 ? '…' : '') + '</div>' +
                '</div>');
        });
        out.innerHTML = html.join('');
    }

    async function copyChunk() {
        const payload = window.__lastChunkPayload;
        if (!payload) return;
        const text = JSON.stringify(payload, null, 2);
        if (window.Utils && Utils.clipboard && Utils.clipboard.copy) await Utils.clipboard.copy(text);
        else if (navigator.clipboard) await navigator.clipboard.writeText(text).catch(() => {});
        if (typeof showBgToast === 'function') showBgToast('分块 JSON 已复制');
    }

    async function copyContract() {
        if (typeof generateAiSpecMarkdown !== 'function') return;
        const md = generateAiSpecMarkdown();
        if (window.Utils && Utils.clipboard && Utils.clipboard.copy) await Utils.clipboard.copy(md);
        else if (navigator.clipboard) await navigator.clipboard.writeText(md).catch(() => {});
        if (typeof showBgToast === 'function') showBgToast('AI 契约已复制');
    }

    async function openDeepSeek() {
        const w = window.open('https://chat.deepseek.com', 'deepseek_web',
            'width=480,height=800,left=' + Math.max(0, screen.width - 500) + ',top=100');
        if (!w) {
            if (typeof showBgToast === 'function') showBgToast('弹窗被拦截，请允许弹窗');
        }
    }

    async function oneClickPrompt() {
        const ta = document.getElementById('ai-chunk-input');
        const raw = ta ? (ta.value || '').trim() : '';
        if (!raw) {
            showResult('❌ 请先展开「原文分块」并粘贴原文', 'error');
            const body = document.getElementById('ai-chunk-body');
            if (body) body.style.display = 'block';
            return;
        }
        if (typeof buildDeepSeekPrompt !== 'function') {
            showResult('❌ buildDeepSeekPrompt 未就绪', 'error');
            return;
        }
        const p = buildDeepSeekPrompt(raw, undefined, {});
        const full = '【系统提示 · 请牢记以下契约】\n\n' + p.system + '\n\n【用户输入 · 请按契约输出 JSON】\n\n' + p.user;
        try {
            if (window.Utils && Utils.clipboard && Utils.clipboard.copy) await Utils.clipboard.copy(full);
            else if (navigator.clipboard) await navigator.clipboard.writeText(full).catch(() => {});
        } catch (e) {}
        if (typeof saveChunkDraft === 'function') saveChunkDraft(raw);
        showResult('✅ 完整提示词已复制（' + full.length + ' 字符）。已打开 DeepSeek，直接 Ctrl+V 粘贴即可。', 'ok');
        openDeepSeek();
    }

    async function doFallbackApply() {
        const ta = document.getElementById('ai-chunk-input');
        const raw = ta ? (ta.value || '').trim() : '';
        if (!raw) {
            showResult('❌ 请先展开「原文分块」并粘贴原文', 'error');
            return;
        }
        if (typeof applyAllChunks !== 'function') {
            showResult('❌ applyAllChunks 未就绪', 'error');
            return;
        }
        if (!confirm('将按分块规则一键生成多页并替换当前画布（可点「撤销应用」回退）。继续？')) return;
        const r = applyAllChunks(raw, { mode: 'replace' });
        if (r.ok) {
            showResult('✅ 已批量生成 ' + r.pagesCount + ' 页', 'ok');
            if (typeof showBgToast === 'function') showBgToast('已生成 ' + r.pagesCount + ' 页');
        } else {
            showResult('❌ ' + (r.reason || '批量应用失败'), 'error');
        }
    }

    function refreshHistorySelect() {
        const sel = document.getElementById('ai-history-select');
        if (!sel) return;
        if (typeof getAiHistory !== 'function') return;
        const list = getAiHistory();
        sel.innerHTML = '<option value="">历史方案（最近 ' + Math.max(list.length, 0) + ' 次，点此载入）</option>';
        list.forEach((h, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            const q = (typeof h.quality === 'number') ? (' · 质量 ' + h.quality) : '';
            opt.textContent = (h.label || '方案') + q + ' · ' + new Date(h.savedAt).toLocaleString();
            sel.appendChild(opt);
        });
    }

    function refreshHistory() {
        try { refreshHistorySelect(); } catch (e) {}
    }

    // ============================================================
    // 合规自检：对当前输入框 spec 做品牌专项检查（背景/颜色/特效/标题）
    // ============================================================
    function runComplianceCheck() {
        const raw = (document.getElementById('ai-spec-input') || {}).value || '';
        if (!raw.trim()) {
            showResult('❌ 输入框为空，请先粘贴 AI 输出的 JSON', 'error');
            return;
        }
        let candidates = [];
        try {
            if (typeof splitRawSpecs === 'function') candidates = splitRawSpecs(raw);
        } catch (e) { candidates = []; }
        if (!candidates.length) {
            const single = parseSpec();
            if (single) candidates = [single];
        }
        if (!candidates.length) {
            showResult('❌ 没解析到合法 spec，请检查 JSON 是否完整', 'error');
            return;
        }

        const BG = window.AI_BRAND_BG_PRESETS || [];
        const COLORS = window.AI_BRAND_COLORS || [];
        const FX = window.AI_BRAND_EFFECTS || [];
        const groups = { bg: [], color: [], effect: [], title: [] };

        candidates.forEach((sp, ci) => {
            const tag = '候选 ' + String.fromCharCode(65 + ci);
            (sp.pages || []).forEach((p, pi) => {
                const pageTag = tag + ' P' + (pi + 1);
                if (!p.bg || !p.bg.presetId || !BG.includes(p.bg.presetId)) {
                    groups.bg.push(pageTag + '：bg.presetId = ' + ((p.bg && p.bg.presetId) || '(空)'));
                }
                (p.layers || []).forEach((l, li) => {
                    if (!l || l.type !== 'text') return;
                    const lt = pageTag + ' L' + (li + 1);
                    if (l.color && !COLORS.includes(String(l.color).toUpperCase())) {
                        groups.color.push(lt + '：color = ' + l.color);
                    }
                    if (l.bgColor && l.bgColor !== 'transparent' && !COLORS.includes(String(l.bgColor).toUpperCase())) {
                        groups.color.push(lt + '：bgColor = ' + l.bgColor);
                    }
                    if (l.effectClass && !FX.includes(l.effectClass)) {
                        groups.effect.push(lt + '：effectClass = ' + l.effectClass);
                    }
                });
            });
            (sp.titleCandidates || []).forEach((t, ti) => {
                const s = String(t || '').trim();
                if (!s) groups.title.push(tag + ' title[' + ti + ']：空');
                else if (s.length > 14) groups.title.push(tag + ' title[' + ti + ']：' + s.length + ' 字（>14）');
            });
        });

        const total = groups.bg.length + groups.color.length + groups.effect.length + groups.title.length;
        const parts = [];
        parts.push('<div style="padding:8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;">');
        parts.push('<div style="font-size:13px;font-weight:700;margin-bottom:6px;color:' + (total ? '#f85149' : '#7ee787') + ';">' +
            (total ? ('🚫 发现 ' + total + ' 处品牌违规') : '✅ 品牌合规检查通过') + '</div>');
        const section = (label, arr, color) => {
            if (!arr.length) return;
            parts.push('<div style="margin-top:6px;"><b style="color:' + color + ';">' + label + '（' + arr.length + '）</b><br>' +
                arr.slice(0, 10).map(x => '· ' + x).join('<br>') +
                (arr.length > 10 ? '<br>…还有 ' + (arr.length - 10) + ' 条' : '') + '</div>');
        };
        section('背景 presetId 越界', groups.bg, '#f85149');
        section('颜色越界', groups.color, '#f85149');
        section('特效越界', groups.effect, '#f85149');
        section('标题候选超限', groups.title, '#f1e05a');
        parts.push('<div style="margin-top:8px;font-size:11px;color:#8b949e;line-height:1.6;">' +
            '允许背景：' + BG.join(' / ') + '<br>' +
            '允许颜色：' + COLORS.join(' ') + '<br>' +
            '允许特效：' + FX.join(' / ') + ' 或 null' +
            '</div>');
        parts.push('</div>');
        showResult(parts.join(''), total ? 'error' : 'ok');
    }
    window.runComplianceCheck = runComplianceCheck;

    function showOnboarding() {
        const old = document.getElementById('ai-onboarding-modal');
        if (old) old.remove();
        const modal = document.createElement('div');
        modal.id = 'ai-onboarding-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:10px;width:520px;max-width:94vw;max-height:85vh;overflow-y:auto;padding:20px;color:#c9d1d9;font-size:13px;line-height:1.6;';
        const steps = [
            { n: '1', title: '粘贴原文', desc: '展开「原文分块」，把原文粘进去。分隔符用 --- 或 ***。' },
            { n: '2', title: '一键生成提示词', desc: '点「一键生成提示词」，会自动把【契约 + 原文】拼好并复制，同时打开 DeepSeek。' },
            { n: '3', title: 'DeepSeek 输出 JSON', desc: '粘到 DeepSeek 对话框，它输出 JSON。复制回来粘到「DeepSeek 输出的 JSON」框。' },
            { n: '4', title: '校验 → 预览 → 应用', desc: '点「校验」看质量分，点「预览」看效果，点「应用」把方案写上画布。' },
            { n: '备', title: 'AI 不可用？', desc: '直接点「离线全自动」，不依赖 AI 也能出可用封面。' }
        ];
        let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><b style="font-size:15px;">🤖 AI 方案导入使用引导</b><button id="ai-onboarding-close" class="btn" style="padding:1px 8px;font-size:11px;">关闭</button></div>';
        steps.forEach(s => {
            html += '<div style="display:flex;gap:10px;padding:8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;margin-bottom:6px;">' +
                '<div style="width:26px;height:26px;border-radius:50%;background:#ff2442;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;flex-shrink:0;font-size:12px;">' + s.n + '</div>' +
                '<div><div style="font-weight:600;">' + s.title + '</div><div style="color:#8b949e;font-size:11px;margin-top:2px;">' + s.desc + '</div></div>' +
                '</div>';
        });
        html += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;"><button id="ai-onboarding-ok" class="btn btn-primary" style="padding:4px 14px;font-size:12px;">知道了，开始使用</button></div>';
        box.innerHTML = html;
        modal.appendChild(box);
        document.body.appendChild(modal);

        const close = () => { modal.remove(); };
        box.querySelector('#ai-onboarding-close').addEventListener('click', close);
        box.querySelector('#ai-onboarding-ok').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    async function aiSelfCheck() {
        const out = [];
        const line = (label, ok, extra) => out.push({ label, ok, extra: extra || '' });

        try {
            const md = (typeof generateAiSpecMarkdown === 'function') ? generateAiSpecMarkdown() : '';
            line('契约 ## 1b 多方案段', md.includes('## 1b. 多方案输出'));
            line('契约「方案 A（主推）」', md.includes('方案 A（主推）'));
            line('契约「方案 C（换视觉语言）」', md.includes('方案 C（换视觉语言）'));
        } catch (e) { line('契约生成', false, e.message); }

        try {
            const chunkRaw = (document.getElementById('ai-chunk-input') || {}).value || '测试原文';
            const p = (typeof buildDeepSeekPrompt === 'function') ? buildDeepSeekPrompt(chunkRaw, undefined, {}) : null;
            const user = p ? p.user : '';
            line('提示词 user 末尾「最终强制命令」', user.includes('最终强制命令'));
            line('提示词 user 明确「3 份独立」', user.includes('3 份独立'));
        } catch (e) { line('提示词拼装', false, e.message); }

        try {
            const raw = (document.getElementById('ai-spec-input') || {}).value || '';
            const m = raw.match(/"format"\s*:\s*"douyin-cover-spec"/g);
            const count = m ? m.length : 0;
            line('当前输入框检测到方案份数', count >= 2, count + ' 份');
            if (count === 1) line('提示：AI 应输出 3 份，但你只贴了 1 份', false, '复制可能不完整');
        } catch (e) { line('输入框检测', false, e.message); }

        line('多套对比浮层 openMultiCandidatePreview', true, '（已注入）');

        const html = '<div style="padding:8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;">' +
            '<div style="font-size:13px;font-weight:700;color:#e1e4e8;margin-bottom:6px;">🔍 一键自检报告</div>' +
            out.map(x => '<div style="font-size:11px;line-height:1.7;color:' + (x.ok ? '#7ee787' : '#f85149') + ';">' + (x.ok ? '✓' : '✗') + ' ' + x.label + (x.extra ? ' <span style="color:#8b949e;">' + x.extra + '</span>' : '') + '</div>').join('') +
            '</div>';
        showResult(html, 'ok');
        const allOk = out.every(x => x.ok);
        if (typeof showBgToast === 'function') {
            showBgToast(allOk ? '✅ 全链路自检通过' : ('⚠️ 有 ' + out.filter(x => !x.ok).length + ' 项未通过，见下方报告'));
        }
        return { ok: allOk, items: out };
    }
    window.aiSelfCheck = aiSelfCheck;

    function refreshReadiness() {
        const el = document.getElementById('ai-readiness-bar');
        if (!el) return;
        const items = [];
        const check = (name, ok) => items.push('<span style="color:' + (ok ? '#7ee787' : '#f85149') + ';">' + (ok ? '✓' : '✗') + ' ' + name + '</span>');
        check('契约', typeof generateAiSpecMarkdown === 'function');
        check('校验', typeof validateSpec === 'function');
        check('特效', (typeof getAllEffectsMaster === 'function') && getAllEffectsMaster().length > 0);
        check('背景', (window.BG_PRESETS || []).length > 0);
        check('兜底', typeof buildFallbackSpec === 'function');
        check('导出', typeof exportElementToPNG === 'function');
        const allOk = items.every(s => s.indexOf('#7ee787') >= 0);
        el.innerHTML = (allOk ? '<span style="color:#7ee787;">🟢 全部就绪</span>' : '<span style="color:#f1e05a;">🟡 部分未就绪</span>') + ' · ' + items.join(' · ');
    }

    function bindPanelEvents() {
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.bound === '1') return;
            el.dataset.bound = '1';
            el.addEventListener('click', fn);
        };

        // ===== Stepper 状态机 =====
        const stepsEl = document.getElementById('ai-stepper');
        const nodes = {
            1: document.getElementById('ai-node-1'),
            2: document.getElementById('ai-node-2'),
            3: document.getElementById('ai-node-3'),
            4: document.getElementById('ai-node-4'),
            5: document.getElementById('ai-node-5')
        };

        function setStepState(step, state) {
            // state: 'done' | 'active' | 'locked'
            const stepEl = stepsEl ? stepsEl.querySelector('.ai-step[data-step="' + step + '"]') : null;
            if (stepEl) {
                const dot = stepEl.querySelector('.ai-step-dot');
                const label = stepEl.querySelector('.ai-step-label');
                if (dot && label) {
                    if (state === 'done') {
                        dot.style.borderColor = '#238636';
                        dot.style.background = '#238636';
                        dot.style.color = '#fff';
                        dot.textContent = '✓';
                        label.style.color = '#7ee787';
                    } else if (state === 'active') {
                        dot.style.borderColor = '#ff2442';
                        dot.style.background = '#ff2442';
                        dot.style.color = '#fff';
                        dot.textContent = String(step);
                        label.style.color = '#ff2442';
                    } else {
                        dot.style.borderColor = '#30363d';
                        dot.style.background = '#0d1117';
                        dot.style.color = '#6e7681';
                        dot.textContent = String(step);
                        label.style.color = '#6e7681';
                    }
                }
            }
            const node = nodes[step];
            if (node) {
                node.style.opacity = (state === 'locked') ? '0.4' : '1';
            }
        }

        function refreshStepper() {
            const chunkTa = document.getElementById('ai-chunk-input');
            const specTa = document.getElementById('ai-spec-input');
            const hasRaw = !!(chunkTa && chunkTa.value.trim());
            const hasSpec = !!(specTa && specTa.value.trim());
            const specValid = hasSpec && (function () {
                try {
                    let specs = [];
                    if (typeof splitRawSpecs === 'function') specs = splitRawSpecs(specTa.value);
                    return specs.length > 0;
                } catch (e) { return false; }
            })();
            const copied = !!window.__aiCopied;
            const applied = !!window.__aiApplied;

            // 线性 Stepper（4 步）：每步的完成条件（严格依赖前置）
            const done1 = hasRaw;
            const done2 = done1 && copied;
            const done3 = done2 && specValid;
            const states = [done1, done2, done3];

            // 找第一个未完成的步作为 active，之前 done，之后 locked
            let activeIdx = states.findIndex(s => !s);
            if (activeIdx === -1) activeIdx = states.length; // 全完成
            for (let i = 0; i < states.length; i++) {
                const step = i + 1;
                if (i < activeIdx) setStepState(step, 'done');
                else if (i === activeIdx) setStepState(step, 'active');
                else setStepState(step, 'locked');
            }

            // 按钮禁用态
            const btn2 = document.getElementById('ai-one-click');
            if (btn2) btn2.disabled = !hasRaw;
            const specTaEl = document.getElementById('ai-spec-input');
            if (specTaEl) specTaEl.disabled = !hasRaw;

            // 提示文字
            const hint2 = document.getElementById('ai-node-2-hint');
            if (hint2) hint2.style.display = hasRaw ? 'none' : 'block';
            const hint3 = document.getElementById('ai-node-3-hint');
            if (hint3) hint3.style.display = copied ? 'none' : 'block';

            // 状态栏
            const statusBar = document.getElementById('ai-status-bar');
            if (statusBar) {
                if (!hasRaw) {
                    statusBar.textContent = '等待在 ① 中粘贴原文…';
                    statusBar.style.color = '#8b949e';
                } else if (!copied) {
                    statusBar.textContent = '✅ 原文已就绪，点 ② 复制提示词并打开 DeepSeek';
                    statusBar.style.color = '#8b949e';
                } else if (!hasSpec) {
                    statusBar.textContent = '✅ 提示词已复制，去 DeepSeek 粘贴后把回复粘到 ③';
                    statusBar.style.color = '#8b949e';
                } else if (!specValid) {
                    statusBar.textContent = '⚠️ ③ 中粘贴的内容还解析不出合法 JSON，请检查是否复制完整';
                    statusBar.style.color = '#f1e05a';
                } else if (applied) {
                    statusBar.textContent = '✅ 方案已应用，如需回退请到「高级选项 → 撤销应用」';
                    statusBar.style.color = '#7ee787';
                } else {
                    statusBar.textContent = '🎉 已检测到合法方案，点 ④ 打开对比，选一套直接应用';
                    statusBar.style.color = '#7ee787';
                }
            }
        }
        window.__aiRefreshStepper = refreshStepper;

        // 输入监听
        const chunkTa = document.getElementById('ai-chunk-input');
        if (chunkTa) {
            let t1 = null;
            chunkTa.addEventListener('input', () => {
                if (t1) clearTimeout(t1);
                t1 = setTimeout(() => {
                    if (typeof saveChunkDraft === 'function') saveChunkDraft(chunkTa.value);
                    refreshStepper();
                }, 300);
            });
        }
        const specTa = document.getElementById('ai-spec-input');
        if (specTa) {
            let t2 = null;
            specTa.addEventListener('input', () => {
                if (t2) clearTimeout(t2);
                t2 = setTimeout(() => {
                    // 用户手动改了 JSON → 之前的选择失效
                    if (_lastSpecInputSnapshot !== specTa.value) {
                        _lastChosenSpec = null;
                        window.__aiChosen = false;
                        window.__aiApplied = false;
                    }
                    refreshStepper();
                }, 300);
            });
            // 粘贴即检测
            specTa.addEventListener('paste', () => {
                setTimeout(() => {
                    _lastChosenSpec = null;
                    window.__aiChosen = false;
                    window.__aiApplied = false;
                    refreshStepper();
                }, 50);
                // ✅ 粘贴 ≥2 份即自动应用三方案（防抖 500ms，等 paste 数据写完）
                setTimeout(() => {
                    try {
                        const v = specTa.value || '';
                        const s = splitRawSpecs(v);
                        if (s.length >= 2) {
                            doPreview();
                        }
                    } catch (e) {
                        if (window.Utils && Utils.log) Utils.log.warn('[AiImportUI] 粘贴自动应用失败', e);
                    }
                }, 500);
            });
        }

        // 清空按钮
        bind('ai-clear-1', () => {
            const ta = document.getElementById('ai-chunk-input');
            if (ta) ta.value = '';
            if (typeof saveChunkDraft === 'function') saveChunkDraft('');
            window.__aiCopied = false;
            window.__aiApplied = false;
            refreshStepper();
        });
        bind('ai-clear-3', () => {
            const ta = document.getElementById('ai-spec-input');
            if (ta) ta.value = '';
            window.__aiApplied = false;
            refreshStepper();
        });

        // 节点 2：复制提示词
        bind('ai-one-click', async () => {
            const chunkTaEl = document.getElementById('ai-chunk-input');
            const raw = chunkTaEl ? (chunkTaEl.value || '').trim() : '';
            if (!raw) {
                showResult('❌ 请先在 ① 中粘贴原文', 'error');
                return;
            }
            if (typeof buildDeepSeekPrompt !== 'function') {
                showResult('❌ buildDeepSeekPrompt 未就绪', 'error');
                return;
            }
            const p = buildDeepSeekPrompt(raw, undefined, {});
            const full = '【系统提示 · 请牢记以下契约】\n\n' + p.system + '\n\n【用户输入 · 请按契约输出 JSON】\n\n' + p.user;
            try {
                if (window.Utils && Utils.clipboard && Utils.clipboard.copy) await Utils.clipboard.copy(full);
                else if (navigator.clipboard) await navigator.clipboard.writeText(full).catch(() => {});
            } catch (e) {}
            if (typeof saveChunkDraft === 'function') saveChunkDraft(raw);
            window.__aiCopied = true;
            // ✅ 语义1：点②代表开始新一轮，清空上一轮的 JSON 与选择状态
            const specTaForReset = document.getElementById('ai-spec-input');
            if (specTaForReset) specTaForReset.value = '';
            _lastChosenSpec = null;
            _lastSpecInputSnapshot = '';
            window.__aiChosen = false;
            window.__aiApplied = false;
            const statusBar = document.getElementById('ai-status-bar');
            if (statusBar) {
                statusBar.textContent = '✅ 提示词已复制（' + full.length + ' 字符）。已打开 DeepSeek，直接 Ctrl+V 粘贴，然后把它的回复粘到 ③';
                statusBar.style.color = '#7ee787';
            }
            openDeepSeek();
            if (typeof window.__aiRefreshStepper === 'function') window.__aiRefreshStepper();
        });

        // 节点 4 已删除：粘贴 ≥2 份 JSON 时自动调用 doPreview 应用三方案

        // 高级选项折叠
        bind('ai-advanced-toggle', () => {
            const body = document.getElementById('ai-advanced-body');
            const trigger = document.getElementById('ai-advanced-toggle');
            if (!body) return;
            const isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : 'block';
            const icon = trigger ? trigger.querySelector('i.fa-chevron-down, i.fa-chevron-up') : null;
            if (icon) {
                icon.className = isOpen ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
                icon.style.fontSize = '9px';
            }
        });

        // 用户级特效偏好：不要描边（提示词 + 粘贴方案都生效）
        const noStrokeCb = document.getElementById('ai-no-stroke');
        if (noStrokeCb) {
            if (window.EffectPrefs) noStrokeCb.checked = EffectPrefs.getNoStroke();
            noStrokeCb.addEventListener('change', () => {
                if (window.EffectPrefs) EffectPrefs.setNoStroke(!!noStrokeCb.checked);
            });
        }

        // 高级选项里的功能
        bind('ai-fallback-apply', doFallbackApply);
        bind('ai-undo-apply', () => {
            if (typeof undoAiSpecApply !== 'function') return;
            if (!window.__aiSpecBackup) {
                showResult('没有可撤销的 AI 应用', 'warn');
                return;
            }
            if (!confirm('确定撤销上次 AI 方案的应用？')) return;
            const r = undoAiSpecApply();
            if (r.ok) {
                showResult('✅ 已撤销，画布已恢复', 'ok');
                if (typeof showBgToast === 'function') showBgToast('已撤销 AI 应用');
            } else {
                showResult('❌ ' + (r.reason || '撤销失败'), 'error');
            }
        });

        // 历史载入
        const historySel = document.getElementById('ai-history-select');
        if (historySel && !historySel.dataset.bound) {
            historySel.dataset.bound = '1';
            historySel.addEventListener('change', () => {
                const v = historySel.value;
                if (v === '') return;
                const idx = parseInt(v, 10);
                const list = (typeof getAiHistory === 'function') ? getAiHistory() : [];
                const h = list[idx];
                if (!h || !h.spec) { showResult('该历史项无 spec 数据', 'warn'); return; }
                const specTaEl = document.getElementById('ai-spec-input');
                if (specTaEl) specTaEl.value = JSON.stringify(h.spec, null, 2);
                showResult('✅ 已载入历史方案：' + (h.label || '') + '（' + new Date(h.savedAt).toLocaleString() + '）', 'ok');
                historySel.value = '';
                refreshStepper();
            });
        }

        // 自动导出设置
        const autoExpSel = document.getElementById('ai-auto-export');
        if (autoExpSel && !autoExpSel.dataset.bound) {
            autoExpSel.dataset.bound = '1';
            try {
                const saved = localStorage.getItem('douyin_ai_auto_export');
                if (saved) autoExpSel.value = saved;
            } catch (e) {}
            autoExpSel.addEventListener('change', () => {
                try { localStorage.setItem('douyin_ai_auto_export', autoExpSel.value); } catch (e) {}
            });
        }

        // 面板折叠
        bind('ai-panel-toggle', () => {
            const body = document.getElementById('ai-panel-body');
            const trigger = document.getElementById('ai-panel-toggle');
            if (!body) return;
            const collapsed = body.style.display === 'none';
            body.style.display = collapsed ? '' : 'none';
            if (trigger) trigger.innerHTML = collapsed ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>';
        });

        // 首次刷新
        setTimeout(refreshStepper, 100);
    }

    function restoreDraft() {
        try {
            const chunk = (typeof loadChunkDraft === 'function') ? loadChunkDraft() : '';
            if (chunk) {
                const chunkTa = document.getElementById('ai-chunk-input');
                if (chunkTa && !chunkTa.value) chunkTa.value = chunk;
            }
            const draft = (typeof loadSpecDraft === 'function') ? loadSpecDraft() : null;
            if (draft && draft.spec) {
                const specTa = document.getElementById('ai-spec-input');
                if (specTa && !specTa.value) specTa.value = JSON.stringify(draft.spec, null, 2);
            }
            if (typeof window.__aiRefreshStepper === 'function') {
                setTimeout(window.__aiRefreshStepper, 50);
            }
        } catch (e) {}
    }

    function init() {
        if (inited) return;
        inited = true;
        const panel = ensurePanel();
        if (panel) {
            restoreDraft();
            try { refreshHistorySelect(); } catch (e) {}
            try { refreshReadiness(); } catch (e) {}
            setTimeout(() => { try { refreshReadiness(); } catch (e) {} }, 800);
            console.log('[AiImportUI] ✅ 面板就位');
        } else {
            console.warn('[AiImportUI] 未找到 .sidebar-left，面板未注入');
        }
    }

    return { init, ensurePanel, openPreviewOverlay, refreshHistory, showOnboarding, openMultiCandidatePreview, openCandidatePicker, doValidate, doPreview, doApply, splitRawSpecs, rankSpecsLocal, parseSpec };
})();

window.AiImportUI = AiImportUI;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try { AiImportUI.init(); } catch (e) { console.warn('[AiImportUI] init 失败', e); }
    }, 600);
});