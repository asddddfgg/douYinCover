/* ============================================================
 * auto-design-ui.js — 一键成图面板（浏览器层）
 * ------------------------------------------------------------
 * 职责边界：
 *   ✅ 读品牌（BrandManager）/ 读当前画布背景 / 调用 AutoDesignCore
 *   ✅ 实时预览（自己画缩略图，不依赖 app.js，不污染项目状态）
 *   ✅ 应用前做一次真实 DOM 复核（字体真渲染后若超高，自动降字号）
 *   ✅ 3× PNG 导出（复用 exporter.js 的 exportElementToPNG）
 *   ❌ 不定义任何版式规则（全部在 auto-design-core.js）
 *   ❌ 不直接改 state.pages 以外的东西；不写 renderCanvas/renderAll
 *
 * 依赖：auto-design-core.js（必须在前）/ brand-manager.js / app.js / exporter.js
 * ============================================================ */
(function (w) {
    'use strict';

    if (!w.AutoDesignCore) {
        console.warn('[AutoDesign] 缺少 auto-design-core.js，面板不启动');
        return;
    }
    var C = w.AutoDesignCore;

    var DRAFT_KEY = 'douyin_autodesign_draft_v1';
    var state = {
        result: null,
        activePlan: 'A',
        inited: false,
        busy: false,
        appliedCache: {},       // ✅ 方案 ID → 修改后的 pages 快照
        currentPlanId: null     // ✅ 记录当前画布正在展示哪个方案
    };

    // ✅ 新增：随时把画布当前状态存入“当前正处于激活状态”的方案缓存中
    function saveCurrentCanvasToCache() {
        if (state.currentPlanId && window.state && window.state.pages) {
            state.appliedCache[state.currentPlanId] = JSON.parse(JSON.stringify(window.state.pages));
        }
    }

    /* ============================================================
       1. 真实文本测量（canvas measureText，和浏览器渲染同口径）
       ============================================================ */
    var mctx = null;
    function getMctx() {
        if (mctx) return mctx;
        try {
            var cv = document.createElement('canvas');
            mctx = cv.getContext('2d');
        } catch (e) { mctx = null; }
        return mctx;
    }

    function measureFactory(fontSize, o) {
        var ctx2d = getMctx();
        var family = o.fontFamily || 'sans-serif';
        var weight = o.bold ? '700' : '400';
        var ls = o.letterSpacing || 0;
        var safe = (typeof w._safeFontFamily === 'function')
            ? w._safeFontFamily(family)
            : ('"' + family + '"');
        if (!ctx2d) return null;
        ctx2d.font = weight + ' ' + fontSize + 'px ' + safe;
        return function (str) {
            var text = String(str == null ? '' : str);
            if (!text) return 0;
            return ctx2d.measureText(text).width + ls * Array.from(text).length;
        };
    }

    /* ============================================================
       2. 读取品牌与背景上下文
       ============================================================ */
    function getBrandPayload(paletteId) {
        var out = { colors: [], bgPresets: [], brandName: '', fonts: [] };
        var bm = w.BrandManager;
        if (!bm || !bm.data) return out;
        try {
            if (paletteId && bm.data.palettes) {
                var p = bm.data.palettes.find(function (x) { return x.id === paletteId; });
                if (p) {
                    out.colors = (p.colors || []).map(function (c) {
                        return typeof c === 'string' ? c : (c && c.hex);
                    }).filter(Boolean);
                    out.bgPresets = (p.bgPresets || []).slice();
                    out.brandName = p.name || '';
                }
            }
            if (!out.colors.length && bm.getActiveColors) out.colors = bm.getActiveColors();
            if (!out.bgPresets.length && bm.getActiveBgPresets) out.bgPresets = bm.getActiveBgPresets();
            if (!out.brandName && bm.getActivePalette) {
                var ap = bm.getActivePalette();
                out.brandName = (ap && ap.name) || '';
            }
            out.fonts = (bm.data.fonts || []).map(function (f) {
                return f && f.name;
            }).filter(Boolean);
        } catch (e) {
            console.warn('[AutoDesign] 读取品牌失败', e);
        }
        return out;
    }

    function listPalettes() {
        var bm = w.BrandManager;
        if (!bm || !bm.data || !Array.isArray(bm.data.palettes)) return [];
        return bm.data.palettes.map(function (p) {
            return { id: p.id, name: p.name || p.id };
        });
    }

    function activePaletteId() {
        var bm = w.BrandManager;
        return (bm && bm.data && bm.data.activePaletteId) || '';
    }

    function switchPalette(id) {
        var bm = w.BrandManager;
        if (!bm || !bm.data) return;
        bm.data.activePaletteId = id;
        try { if (bm.save) bm.save(); } catch (e) { }
        try { if (bm.render) bm.render(); } catch (e) { }
        try { if (bm.injectBrandColorsToControls) bm.injectBrandColorsToControls(); } catch (e) { }
        try { if (bm.refreshBrandDownstream) bm.refreshBrandDownstream(); } catch (e) { }
    }

    /* ============================================================
       2b. 特效池：从项目的真实特效库里取「只作用于字形」的
       ============================================================ */
    function getEffectPool() {
        var out = [];
        try {
            var snap = (w.VisualRegistry && w.VisualRegistry.getSnapshot)
                ? w.VisualRegistry.getSnapshot() : null;
            (snap && snap.presets ? snap.presets : []).forEach(function (p) {
                if (!p || !p.id) return;
                if (p.renderable === false) return;
                // 背景框类特效会给文字加底块，压在标题上会盖住字，排除
                try {
                    if (typeof w.isEffectBgBox === 'function' && w.isEffectBgBox(p.id, {})) return;
                } catch (e) { }
                out.push({
                    id: p.id,
                    family: p.family || 'shadow',
                    preset: p.preset || p.id,
                    category: p.category || 'glyph',
                    status: p.status || 'renderable',
                    semanticTags: p.semanticTags || [],
                    renderCost: p.renderCost || 1
                });
            });
        } catch (e) {
            console.warn('[AutoDesign] 读取特效库失败', e);
        }
        return out;
    }

    /* ============================================================
       3. 样式（自包含，只加 ad-* 前缀，不改 style.css）
       ============================================================ */
    var CSS = [
        '.ad-rail-btn{position:relative;background:linear-gradient(135deg,#ff2442,#ff6b3d)!important;',
        'color:#fff!important;box-shadow:0 3px 12px rgba(255,36,66,.4);}',
        '.ad-rail-btn:hover{filter:brightness(1.08);}',
        '.ad-fab{position:fixed;right:24px;bottom:104px;z-index:9000;display:flex;align-items:center;gap:8px;',
        'padding:11px 18px;border:none;border-radius:999px;cursor:pointer;font-size:13px;font-weight:700;',
        'color:#fff;background:linear-gradient(135deg,#ff2442,#ff6b3d);box-shadow:0 6px 20px rgba(255,36,66,.35);',
        'transition:transform .15s ease, box-shadow .15s ease;}',
        '.ad-fab:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(255,36,66,.45);}',
        '.ad-overlay{position:fixed;inset:0;z-index:10000;background:rgba(6,8,12,.72);backdrop-filter:blur(3px);',
        'display:flex;align-items:center;justify-content:center;padding:24px;}',
        '.ad-panel{width:min(1180px,96vw);height:min(780px,92vh);background:#131720;border:1px solid #2b3340;',
        'border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.6);',
        'color:#e1e4e8;font-size:13px;}',
        '.ad-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;',
        'border-bottom:1px solid #232b36;background:#171c26;flex-shrink:0;}',
        '.ad-head h2{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;}',
        '.ad-head small{opacity:.5;font-weight:400;font-size:11px;margin-left:6px;}',
        '.ad-close{background:none;border:none;color:#8b949e;font-size:20px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px;}',
        '.ad-close:hover{background:#232b36;color:#fff;}',
        '.ad-body{display:grid;grid-template-columns:400px 1fr;gap:0;flex:1;min-height:0;}',
        '.ad-left{padding:16px;overflow-y:auto;border-right:1px solid #232b36;display:flex;flex-direction:column;gap:12px;}',
        '.ad-right{padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;min-width:0;}',
        '.ad-label{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8b949e;margin-bottom:6px;}',
        '.ad-textarea{width:100%;height:196px;resize:vertical;background:#0d1117;border:1px solid #2b3340;border-radius:8px;',
        'color:#e6edf3;padding:10px 12px;font-size:13px;line-height:1.65;font-family:inherit;outline:none;}',
        '.ad-textarea:focus{border-color:#ff2442;}',
        '.ad-input,.ad-select{width:100%;background:#0d1117;border:1px solid #2b3340;border-radius:8px;color:#e6edf3;',
        'padding:8px 10px;font-size:12.5px;outline:none;font-family:inherit;}',
        '.ad-input:focus,.ad-select:focus{border-color:#ff2442;}',
        '.ad-row{display:flex;gap:8px;}',
        '.ad-row>*{flex:1;min-width:0;}',
        '.ad-check{display:flex;align-items:center;gap:7px;font-size:12px;color:#c9d1d9;cursor:pointer;}',
        '.ad-check input{accent-color:#ff2442;width:14px;height:14px;}',
        '.ad-actions{display:flex;gap:8px;flex-wrap:wrap;}',
        '.ad-btn{flex:1;min-width:110px;padding:9px 12px;border-radius:8px;border:1px solid #2b3340;background:#1b2130;',
        'color:#e6edf3;font-size:12.5px;font-weight:600;cursor:pointer;transition:.12s;font-family:inherit;}',
        '.ad-btn:hover:not(:disabled){background:#242c3d;border-color:#3b4657;}',
        '.ad-btn:disabled{opacity:.45;cursor:not-allowed;}',
        '.ad-btn.primary{background:linear-gradient(135deg,#ff2442,#ff6b3d);border:none;color:#fff;}',
        '.ad-btn.primary:hover:not(:disabled){filter:brightness(1.08);}',
        '.ad-status{font-size:12px;color:#8b949e;line-height:1.7;min-height:18px;}',
        '.ad-status b{color:#e6edf3;}',
        '.ad-status .err{color:#ff7b72;}',
        '.ad-status .warn{color:#e3b341;}',
        '.ad-status .ok{color:#3fb950;}',
        '.ad-tabs{display:flex;gap:8px;flex-shrink:0;}',
        '.ad-tab{flex:1;padding:9px 10px;border-radius:9px;border:1px solid #2b3340;background:#171c26;cursor:pointer;',
        'color:#c9d1d9;text-align:left;font-family:inherit;transition:.12s;}',
        '.ad-tab b{display:block;font-size:12.5px;color:#e6edf3;margin-bottom:2px;}',
        '.ad-tab span{font-size:10.5px;opacity:.62;line-height:1.4;display:block;}',
        '.ad-tab:hover{border-color:#3b4657;}',
        '.ad-tab.on{border-color:#ff2442;background:#241a22;box-shadow:0 0 0 1px rgba(255,36,66,.35) inset;}',
        '.ad-thumbs{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;}',
        '.ad-thumb{position:relative;border-radius:10px;overflow:hidden;border:1px solid #2b3340;',
        'box-shadow:0 6px 18px rgba(0,0,0,.4);flex-shrink:0;}',
        '.ad-thumb .ad-tnum{position:absolute;top:6px;left:6px;z-index:9;background:rgba(0,0,0,.55);color:#fff;',
        'font-size:9px;padding:2px 6px;border-radius:99px;letter-spacing:.06em;}',
        '.ad-meta{font-size:11.5px;color:#8b949e;line-height:1.8;border-top:1px dashed #232b36;padding-top:10px;}',
        '.ad-meta code{background:#0d1117;border:1px solid #232b36;border-radius:4px;padding:1px 5px;font-size:10.5px;color:#7ee787;}',
        '.ad-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;',
        'border-top:1px solid #232b36;background:#171c26;flex-shrink:0;}',
        '.ad-foot .ad-hint{font-size:11.5px;color:#6e7681;}',
        '.ad-foot .ad-actions{flex:0 0 auto;}',
        '@media (max-width:900px){.ad-body{grid-template-columns:1fr;}.ad-left{border-right:none;border-bottom:1px solid #232b36;}}'
    ].join('');

    function injectStyle() {
        if (document.getElementById('ad-style')) return;
        var st = document.createElement('style');
        st.id = 'ad-style';
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    /* ============================================================
       4. 面板 DOM
       ============================================================ */
    var dom = {};

    function ensurePanel() {
        if (dom.overlay) return dom.overlay;
        injectStyle();

        var overlay = document.createElement('div');
        overlay.id = 'ad-overlay';
        overlay.className = 'ad-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = [
            '<div class="ad-panel" role="dialog" aria-label="一键成图">',
            '  <div class="ad-head">',
            '    <h2>✨ 一键成图<small>本地设计引擎 · 纯前端 · 无需联网</small></h2>',
            '    <button class="ad-close" id="ad-close" title="关闭（Esc）">×</button>',
            '  </div>',
            '  <div class="ad-body">',
            '    <div class="ad-left">',
            '      <div><span class="ad-label">① 粘贴文案（Ctrl/⌘ + Enter 生成）</span>',
            '        <textarea class="ad-textarea" id="ad-text" placeholder="把整段文案粘进来即可，短句、长文都行。&#10;系统会自动提炼标题、判断长度、必要时自动分页。"></textarea>',
            '      </div>',
            '      <div><span class="ad-label">② 标题（留空 = 自动提炼）</span>',
            '        <input class="ad-input" id="ad-title" maxlength="40" placeholder="可选：我想自己定标题">',
            '      </div>',
            '      <div>',
            '        <span class="ad-label">③ 品牌色板 / 背景来源</span>',
            '        <div class="ad-row">',
            '          <select class="ad-select" id="ad-brand"></select>',
            '          <select class="ad-select" id="ad-bg" title="背景来源">',
            '            <option value="brand">品牌背景</option>',
            '            <option value="canvas">当前画布（含自定义上传）</option>',
            '            <option value="palette">品牌纯色</option>',
            '          </select>',
            '        </div>',
            '      </div>',
            '      <label class="ad-check"><input type="checkbox" id="ad-effects" checked> 给标题加品牌特效（A/B 不同风格）</label>',
            '      <label class="ad-check"><input type="checkbox" id="ad-no-stroke"> 不要描边类特效（自动换成品牌渐变）</label>',
            '      <div><span class="ad-label">④ 视觉丰富度</span>',
            '        <select class="ad-select" id="ad-richness">',
            '          <option value="clean">克制 · 只用排版和颜色</option>',
            '          <option value="subtle" selected>标准 · 特效 + 三色用法（推荐）</option>',
            '          <option value="bold">强烈 · 特效 + 品牌色渐变底</option>',
            '        </select>',
            '      </div>',
            '      <div class="ad-actions">',
            '        <button class="ad-btn primary" id="ad-generate">生成三套方案</button>',
            '      </div>',
            '      <div class="ad-status" id="ad-status">等待文案…</div>',
            '    </div>',
            '    <div class="ad-right">',
            '      <div class="ad-tabs" id="ad-tabs"></div>',
            '      <div class="ad-thumbs" id="ad-thumbs"></div>',
            '      <div class="ad-meta" id="ad-meta"></div>',
            '    </div>',
            '  </div>',
            '  <div class="ad-foot">',
            '    <span class="ad-hint">应用后仍可拖动、改字、换色；导出为 1080×1920 PNG。</span>',
            '    <div class="ad-actions">',
            '      <button class="ad-btn" id="ad-apply">应用到画布</button>',
            '      <button class="ad-btn primary" id="ad-export">应用并导出 PNG</button>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);

        dom.overlay = overlay;
        dom.text = overlay.querySelector('#ad-text');
        dom.title = overlay.querySelector('#ad-title');
        dom.brand = overlay.querySelector('#ad-brand');
        dom.bg = overlay.querySelector('#ad-bg');
        dom.effects = overlay.querySelector('#ad-effects');
        dom.noStroke = overlay.querySelector('#ad-no-stroke');
        dom.richness = overlay.querySelector('#ad-richness');
        if (dom.noStroke && w.EffectPrefs) dom.noStroke.checked = w.EffectPrefs.getNoStroke();
        if (dom.noStroke) dom.noStroke.addEventListener('change', function () {
            if (w.EffectPrefs) w.EffectPrefs.setNoStroke(!!dom.noStroke.checked);
        });
        dom.status = overlay.querySelector('#ad-status');
        dom.tabs = overlay.querySelector('#ad-tabs');
        dom.thumbs = overlay.querySelector('#ad-thumbs');
        dom.meta = overlay.querySelector('#ad-meta');
        dom.generate = overlay.querySelector('#ad-generate');
        dom.apply = overlay.querySelector('#ad-apply');
        dom.export = overlay.querySelector('#ad-export');

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        overlay.querySelector('#ad-close').addEventListener('click', close);
        dom.generate.addEventListener('click', function () { generate(); });
        dom.apply.addEventListener('click', function () { apply(); });
        dom.export.addEventListener('click', async function () {
            var ok = await apply();
            if (ok) await exportPNG();
        });
        dom.text.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                generate();
            }
        });
        dom.text.addEventListener('input', saveDraft);
        dom.title.addEventListener('input', function () { generate(); });
        dom.brand.addEventListener('change', function () {
            switchPalette(dom.brand.value);
            generate();
        });
        dom.bg.addEventListener('change', function () { generate(); });
        dom.effects.addEventListener('change', function () { generate(); });
        if (dom.richness) dom.richness.addEventListener('change', function () { generate(); });

        return overlay;
    }

    /* ============================================================
       5. 缩略图（自己画，所见即所得，不改项目状态）
       ============================================================ */
    function bgCssOf(page) {
        try {
            if (typeof w.backgroundToCss === 'function') {
                var css = w.backgroundToCss(page.bg);
                if (css) return css;
            }
        } catch (e) { }
        var bg = page.bg || {};
        return bg.type === 'solid'
            ? (bg.color1 || '#F5F1E8')
            : 'linear-gradient(' + (bg.angle || 135) + 'deg,' + bg.color1 + ',' + (bg.color2 || bg.color1) + ')';
    }

    function renderThumb(page, scale) {
        var box = document.createElement('div');
        box.className = 'ad-thumb';
        box.style.width = (C.CANVAS.W * scale) + 'px';
        box.style.height = (C.CANVAS.H * scale) + 'px';

        var bg = document.createElement('div');
        bg.style.cssText = 'position:absolute;inset:0;';
        bg.style.background = bgCssOf(page);
        box.appendChild(bg);

        (page.layers || []).forEach(function (l) {
            var el = document.createElement('div');
            el.style.position = 'absolute';
            el.style.left = (l.x * scale) + 'px';
            el.style.top = (l.y * scale) + 'px';
            el.style.width = (l.width * scale) + 'px';
            el.style.height = (l.height * scale) + 'px';
            el.style.opacity = (l.opacity == null ? 1 : l.opacity);

            if (l.type === 'shape') {
                el.style.background = l.fill || 'transparent';
                el.style.borderRadius = ((l.cornerRadius || 0) * scale) + 'px';
                if (l.strokeWidth) {
                    el.style.border = (l.strokeWidth * scale) + 'px solid ' + (l.stroke || 'transparent');
                }
                box.appendChild(el);
                return;
            }

            el.style.color = l.color;
            el.style.fontSize = (parseFloat(l.fontSize) * scale) + 'px';
            el.style.fontWeight = l.bold ? '700' : '400';
            el.style.fontStyle = l.italic ? 'italic' : 'normal';
            el.style.lineHeight = l.lineHeight || 1.2;
            el.style.textAlign = l.align || 'left';
            el.style.whiteSpace = 'pre-wrap';
            el.style.wordBreak = 'break-word';
            el.style.letterSpacing = l.letterSpacing
                ? (parseFloat(l.letterSpacing) * scale) + 'px'
                : 'normal';
            el.style.fontFamily = (typeof w._safeFontFamily === 'function')
                ? w._safeFontFamily(l.fontFamily)
                : (l.fontFamily || 'sans-serif');
            if (l.bgColor && l.bgColor !== 'transparent') {
                el.style.background = l.bgColor;
                el.style.borderRadius = ((l.bgRadius || 6) * scale) + 'px';
                el.style.padding = ((l.bgPadding || 6) * scale) + 'px';
                el.style.boxSizing = 'border-box';
            }
            var span = document.createElement('span');
            // 核心层已对用户原文做过 HTML 转义，这里用 innerHTML 才能
            // 同时显示「关键词品牌色 span」和正确的 & < > 字符（与画布一致）
            span.innerHTML = l.content || '';
            if (l.effectClass && typeof w.renderEffectCss === 'function') {
                try {
                    var css = w.renderEffectCss(l.effectClass, {});
                    if (css) {
                        if (w.Utils && w.Utils.dom && w.Utils.dom.applyCssText) {
                            w.Utils.dom.applyCssText(span, css);
                        } else {
                            span.style.cssText = css;
                        }
                    }
                } catch (e) { }
            }
            el.appendChild(span);
            box.appendChild(el);
        });

        var num = document.createElement('div');
        num.className = 'ad-tnum';
        num.textContent = 'P' + page._planPageNo;
        box.appendChild(num);
        return box;
    }

    /* ============================================================
       6. 生成 / 预览
       ============================================================ */
    function setStatus(html, cls) {
        if (!dom.status) return;
        dom.status.innerHTML = cls ? '<span class="' + cls + '">' + html + '</span>' : html;
    }

    function applyBgSource(res) {
        var src = dom.bg ? dom.bg.value : 'brand';
        if (src === 'brand') return;
        var theme = res.theme;
        var lightest = theme.colors.slice().sort(function (a, b) {
            return C.luminance(b) - C.luminance(a);
        })[0];
        ['A', 'B', 'C'].forEach(function (id) {
            (res.plans[id].pages || []).forEach(function (pg) {
                if (src === 'palette') {
                    if (C.luminance(lightest) >= 0.5) {
                        pg.bg = Object.assign({}, pg.bg, {
                            type: 'solid', color1: lightest, color2: lightest, presetId: null
                        });
                    }
                } else if (src === 'canvas' && w.state && w.state.background) {
                    var clone;
                    try { clone = JSON.parse(JSON.stringify(w.state.background)); }
                    catch (e) { clone = null; }
                    if (!clone) return;
                    // 不清 presetId 的话，预设色会覆盖用户上传的图片
                    clone.presetId = null;
                    // 白色薄纱：保证深色正文在任何自定义背景上仍然可读
                    clone.overlayColor = '#FFFFFF';
                    clone.overlayOpacity = 0.5;
                    clone.overlayType = 'solid';
                    pg.bg = clone;
                }
            });
        });
    }

    function generate() {
        if (!dom.text) return;
        var text = dom.text.value;
        if (!text.trim()) {
            state.result = null;
            dom.tabs.innerHTML = '';
            dom.thumbs.innerHTML = '';
            dom.meta.textContent = '';
            setStatus('请先粘贴文案。', 'warn');
            return;
        }
        var brand = getBrandPayload(dom.brand && dom.brand.value);
        var richness = (dom.richness && dom.richness.value) ? dom.richness.value : 'subtle';
        // 标题特效开关（独立于丰富度档位）：关掉只去特效，不动 bold 的渐变背景
        var noEffects = !!(dom.effects && !dom.effects.checked);
        // 与 AI 导入面板共用持久化偏好：以 EffectPrefs 为准同步勾选状态
        if (dom.noStroke && w.EffectPrefs) dom.noStroke.checked = w.EffectPrefs.getNoStroke();
        var noStroke = !!(dom.noStroke && dom.noStroke.checked);
        var effectPool = (richness === 'clean' || noEffects) ? [] : getEffectPool();
        if (noStroke) effectPool = effectPool.filter(function (p) { return p.family !== 'stroke'; });
        var localAnalysis = null, selection = null;
        if (w.AiV2Analyzer && typeof w.AiV2Analyzer.analyze === 'function') {
            try { localAnalysis = w.AiV2Analyzer.analyze(text, { title: dom.title ? dom.title.value : '' }); }
            catch (e) { localAnalysis = null; }
        }
        if (localAnalysis && w.AiV2Selector && typeof w.AiV2Selector.selectPlans === 'function' && effectPool.length) {
            try {
                selection = w.AiV2Selector.selectPlans({
                    analysis: localAnalysis, presets: effectPool, richness: richness,
                    avoidFamilies: noStroke ? ['stroke'] : []
                });
            } catch (e) { selection = null; }
        }
        var res;
        try {
            res = C.buildAll(text, {
                title: dom.title ? dom.title.value : '',
                brand: brand,
                fontFamily: brand.fonts[0] || undefined,
                measureFactory: measureFactory,
                richness: richness,
                effectPool: effectPool,
                effectPlan: selection ? selection.effectPlan : null
            });
        } catch (e) {
            console.error('[AutoDesign] 生成失败', e);
            setStatus('生成失败：' + (e && e.message ? e.message : e), 'err');
            return;
        }
        state.localAnalysis = localAnalysis;
        state.selection = selection;
        applyBgSource(res);
        state.result = res;
        renderTabs();
        renderThumbs();
        renderMeta();
        reportStatus(res);
        saveDraft();
    }

    function renderTabs() {
        dom.tabs.innerHTML = '';
        if (!state.result) return;
        ['A', 'B', 'C'].forEach(function (id) {
            var plan = state.result.plans[id];
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ad-tab' + (state.activePlan === id ? ' on' : '');
            btn.innerHTML = '<b>' + id + ' · ' + plan.name + '</b><span>' +
                plan._stats.pageCount + ' 页 · ' + plan._stats.layerCount + ' 个图层</span>';
            btn.addEventListener('click', function () {
                if (state.activePlan === id) return;

                // 1. 【核心修复】切走前，先无条件把当前画布上被用户改动过的内容存进缓存！
                saveCurrentCanvasToCache();

                // 2. 更新当前激活的方案标示
                state.activePlan = id;
                renderTabs();
                renderThumbs();
                renderMeta();

                // 3. 切回时：检查该方案是否有历史修改存档
                if (state.appliedCache[state.activePlan]) {
                    // 有存档，直接恢复用户之前修改过的内容
                    window.state.pages = JSON.parse(JSON.stringify(state.appliedCache[state.activePlan]));
                } else {
                    // 无存档，从原始模板生成
                    var plan = state.result.plans[state.activePlan];
                    var pages = JSON.parse(JSON.stringify(plan.pages));
                    var stamp = Date.now().toString(36);
                    pages.forEach(function (pg, i) {
                        pg.id = 'ad-' + state.activePlan.toLowerCase() + '-' + stamp + '-' + (i + 1);
                        pg.title = '第 ' + (i + 1) + ' 页';
                        (pg.layers || []).forEach(function (l) {
                            l.id = l.id + '-' + stamp;
                        });
                    });
                    window.state.pages = pages;
                }

                // 4. 更新记录并刷新
                state.currentPlanId = state.activePlan;
                if (window.state.currentPageId && !window.state.pages.some(function(p){ return p.id === window.state.currentPageId; })) {
                    window.state.currentPageId = window.state.pages[0].id;
                }
                if (typeof window.renderAll === 'function') window.renderAll();
                if (typeof window.state.saveState === 'function') window.state.saveState();
            });
            dom.tabs.appendChild(btn);
        });
    }

    function renderThumbs() {
        dom.thumbs.innerHTML = '';
        if (!state.result) return;
        var plan = state.result.plans[state.activePlan];
        var pages = plan.pages.slice(0, 4);
        var scale = pages.length <= 2 ? 0.52 : 0.4;
        pages.forEach(function (pg) {
            dom.thumbs.appendChild(renderThumb(pg, scale));
        });
    }

    function escHtml(s) {
        return (w.DesignConstants && w.DesignConstants.escapeHtml)
            ? w.DesignConstants.escapeHtml(s)
            : String(s == null ? '' : s);
    }

    function renderMeta() {
        var res = state.result;
        if (!res) return;
        var a = res.analysis;
        var t = res.theme;
        var plan = res.plans[state.activePlan];
        var bg = plan.pages[0].bg;
        var effective = C.mixHex(bg.color1, bg.overlayColor, bg.overlayOpacity);

        // 统计这个方案实际用了几种品牌色 / 几种特效（让你一眼看到"丰富度"）
        var usedColors = {}, usedFx = {};
        plan.pages.forEach(function (pg) {
            (pg.layers || []).forEach(function (l) {
                if (l.type === 'shape') {
                    if (l.fill && l.fill !== 'transparent') usedColors[C.normHex(l.fill)] = 1;
                    return;
                }
                if (l.type !== 'text') return;
                if (l.color && l.color !== 'transparent') usedColors[C.normHex(l.color)] = 1;
                if (l.bgColor && l.bgColor !== 'transparent') usedColors[C.normHex(l.bgColor)] = 1;
                (String(l.content).match(/#[0-9A-Fa-f]{6}/g) || []).forEach(function (c) {
                    usedColors[C.normHex(c)] = 1;
                });
                if (l.effectClass) usedFx[l.effectClass] = 1;
            });
        });
        var colorCount = Object.keys(usedColors).length;
        var fxList = Object.keys(usedFx);
        var semanticLine = '';
        if (state.localAnalysis) {
            var la = state.localAnalysis;
            var selText = '未启用';
            if (state.selection && state.selection.effectPlan) {
                var ep = state.selection.effectPlan;
                selText = 'A <code>' + (ep.A ? escHtml(ep.A) : '—') + '</code>' +
                    ' · B <code>' + (ep.B ? escHtml(ep.B) : '—') + '</code> · C 无';
            }
            semanticLine = '语义：强度 <b>' + la.intensity + '/5</b> · ' +
                escHtml((la.tone || []).join(' / ')) + ' · ' +
                escHtml(la.contentStructure || '') + ' · 选特效 ' + selText;
        }

        dom.meta.innerHTML = [
            '标题：<code>' + escHtml(a.title) + '</code>',
            '字数：' + a.charCount + '（' + ({ short: '短文案', medium: '中等', long: '长文' }[a.contentLength]) + '）',
            '关键词：' + (escHtml(a.keywords.join(' / ')) || '—'),
            semanticLine,
            '用色：<b>' + colorCount + ' / ' + t.colors.length + ' 种品牌色</b>' +
            '（文字 <code>' + t.text + '</code> · 强调 <code>' + t.accent + '</code>' +
            (t.secondary && t.secondary !== t.accent ? ' · 次强调 <code>' + t.secondary + '</code>' : '') + '）',
            '特效：<b>' + (fxList.length ? fxList.join(' / ') : '未使用') + '</b>' +
            (plan.pages.length > 1 ? ' · 背景按页轮换' : ''),
            '对比度 ' + C.contrast(t.text, effective).toFixed(2) + ':1' +
            (t.scrim ? '（已加 ' + Math.round(t.scrim.opacity * 100) + '% 遮罩）' : '') +
            ' · 背景 <code>' + bg.color1 + '</code>'
        ].join('<br>');
    }

    function reportStatus(res) {
        var v = res.validation;
        var pages = res.plans[state.activePlan].pages.length;
        var cls = v.ok ? 'ok' : 'err';
        var txt = v.ok
            ? '✓ 自校验通过：安全区 / 品牌色 / 内容保真 / 三方案差异'
            : '✗ 发现 ' + v.errors.length + ' 个问题';
        var extra = [];
        v.warnings.slice(0, 2).forEach(function (w) { extra.push('<span class="warn">⚠ ' + w.message + '</span>'); });
        v.errors.slice(0, 3).forEach(function (e) { extra.push('<span class="err">✗ ' + e.message + '</span>'); });
        setStatus(txt + '（' + pages + ' 页）' + (extra.length ? '<br>' + extra.join('<br>') : ''), cls);
    }

    /* ============================================================
       7. 应用 / 复核 / 导出
       ============================================================ */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    function nextFrame() {
        return new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
    }

    /**
     * 真实 DOM 复核：字体真渲染后如果比预估高（自定义字体常见），
     * 逐级降字号直到回到计划高度且不越过底部安全区。
     * 这是「估算排版」和「真排版」之间的最后一道保险。
     */
    async function verifyAndFix() {
        var st = w.state;
        if (!st || !Array.isArray(st.pages)) return false;
        await nextFrame();
        try {
            if (document.fonts && document.fonts.ready) {
                await Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1800); })]);
            }
        } catch (e) { }
        await nextFrame();

        var fixed = false;
        var maxBottom = C.CANVAS.H - C.SAFE.b;
        st.pages.forEach(function (pg) {
            var wrap = document.querySelector('.canvas-page-wrapper[data-page-id="' + pg.id + '"]');
            if (!wrap) return;
            (pg.layers || []).forEach(function (l) {
                if (l.type !== 'text') return;
                var el = wrap.querySelector('.canvas-layer[data-id="' + l.id + '"]');
                var inner = el && el.querySelector('.text-content-editable');
                if (!inner) return;
                var planned = l.height || 0;
                var guard = 0;
                while (guard++ < 12) {
                    var h = inner.offsetHeight + 4;
                    if (h <= planned + 1.5 && (l.y + h) <= maxBottom + 0.5) break;
                    var fs = parseFloat(l.fontSize) || 20;
                    if (fs <= 10) break;
                    l.fontSize = (fs - 1) + 'px';
                    inner.style.fontSize = l.fontSize;
                    fixed = true;
                }
                var finalH = inner.offsetHeight + 4;
                if (Math.abs(finalH - (l.height || 0)) > 1) {
                    l.height = Math.ceil(finalH);
                    fixed = true;
                }
            });
        });
        if (fixed) {
            if (st.saveState) st.saveState();
            if (typeof w.renderAll === 'function') w.renderAll();
            else if (typeof w.renderCanvas === 'function') w.renderCanvas();
            await nextFrame();
        }
        return fixed;
    }

    async function apply() {
        if (state.busy) return false;
        if (!state.result) {
            setStatus('请先生成方案。', 'warn');
            return false;
        }
        var st = w.state;
        if (!st || !Array.isArray(st.pages)) {
            setStatus('编辑器状态未就绪，请刷新后重试。', 'err');
            return false;
        }

        // 如果在点击应用前，画布上有其他方案的未保存修改，先存一下
        saveCurrentCanvasToCache();

        var plan = state.result.plans[state.activePlan];
        var pages;
        
        // ✅ 核心：优先读取该方案的专属修改缓存
        if (state.appliedCache[state.activePlan]) {
            pages = JSON.parse(JSON.stringify(state.appliedCache[state.activePlan]));
        } else {
            // 首次应用，从模板生成
            try {
                pages = JSON.parse(JSON.stringify(plan.pages));
            } catch (e) {
                setStatus('方案数据异常：' + e.message, 'err');
                return false;
            }
            var stamp = Date.now().toString(36);
            pages.forEach(function (pg, i) {
                pg.id = 'ad-' + state.activePlan.toLowerCase() + '-' + stamp + '-' + (i + 1);
                pg.title = '第 ' + (i + 1) + ' 页';
                (pg.layers || []).forEach(function (l) {
                    l.id = l.id + '-' + stamp;
                });
            });
        }

        state.busy = true;
        try {
            st.pages = pages;
            if (pages.length > 0) {
                st.currentPageId = pages[0].id;
            }
            // 应用后不预选图层：让画布呈现干净的成品视图，点击即可编辑
            st.selectedLayerId = null;
            st.selectedLayerIds = [];
            st.editingLayerId = null;
            if (st.saveState) st.saveState();
            
            // 记录当前生效的方案 ID，并立刻初始化一份缓存
            state.currentPlanId = state.activePlan;
            state.appliedCache[state.activePlan] = JSON.parse(JSON.stringify(st.pages));
            
            if (typeof w.renderAll === 'function') w.renderAll();
            else if (typeof w.renderCanvas === 'function') w.renderCanvas();

            await verifyAndFix();
            close();
            if (typeof w.showBgToast === 'function') {
                w.showBgToast('已应用方案 ' + state.activePlan + '，可直接拖动微调', 2200);
            }
            return true;
        } catch (e) {
            console.error('[AutoDesign] 应用失败', e);
            setStatus('应用失败：' + (e && e.message ? e.message : e), 'err');
            return false;
        } finally {
            state.busy = false;
        }
    }

    async function exportPNG() {
        var st = w.state;
        var pages = (st && st.pages) || [];
        if (!pages.length) return;
        var fn = (w.EXPORT && w.EXPORT.exportElementToPNG) || w.exportElementToPNG;
        if (typeof fn !== 'function') {
            if (typeof w.openExportPanel === 'function') { w.openExportPanel(); return; }
            setStatus('导出模块未就绪。', 'err');
            return;
        }
        var okCount = 0;
        for (var i = 0; i < pages.length; i++) {
            var canvasEl = document.querySelector(
                '.canvas-page-wrapper[data-page-id="' + pages[i].id + '"] .cover-canvas'
            );
            if (!canvasEl) continue;
            try {
                var ok = await fn(canvasEl, '封面-' + state.activePlan + '-' + pad2(i + 1) + '.png', 3);
                if (ok) okCount++;
            } catch (e) {
                console.warn('[AutoDesign] 导出失败', e);
            }
            await new Promise(function (r) { setTimeout(r, 420); });
        }
        if (typeof w.showBgToast === 'function') {
            w.showBgToast('已导出 ' + okCount + ' 页 PNG（1080×1920）', 2600);
        }
    }

    /* ============================================================
       8. 打开 / 关闭 / 草稿 / 启动
       ============================================================ */
    function saveDraft() {
        if (!dom.text) return;
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                text: dom.text.value,
                title: dom.title.value,
                bg: dom.bg.value,
                effects: !!dom.effects.checked,
                richness: dom.richness ? dom.richness.value : 'subtle',
                palette: dom.brand.value
            }));
        } catch (e) { }
    }

    function loadDraft() {
        var raw = null;
        try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { }
        if (!raw) return;
        var d;
        try { d = JSON.parse(raw); } catch (e) { return; }
        if (!d) return;
        if (d.text) dom.text.value = d.text;
        if (d.title) dom.title.value = d.title;
        if (d.bg) dom.bg.value = d.bg;
        dom.effects.checked = d.effects !== false;
        if (d.richness && dom.richness) {
            var okRich = Array.prototype.some.call(dom.richness.options, function (o) {
                return o.value === d.richness;
            });
            if (okRich) dom.richness.value = d.richness;
        }
        if (d.palette) {
            var exists = Array.prototype.some.call(dom.brand.options, function (o) {
                return o.value === d.palette;
            });
            if (exists) dom.brand.value = d.palette;
        }
    }

    function fillBrands() {
        var list = listPalettes();
        var cur = activePaletteId();
        dom.brand.innerHTML = '';
        if (!list.length) {
            var o = document.createElement('option');
            o.value = '';
            o.textContent = '（未设置品牌，使用默认色）';
            dom.brand.appendChild(o);
            return;
        }
        list.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            if (p.id === cur) opt.selected = true;
            dom.brand.appendChild(opt);
        });
    }

    function open() {
        ensurePanel();
        fillBrands();
        loadDraft();
        if (dom.noStroke && w.EffectPrefs) dom.noStroke.checked = w.EffectPrefs.getNoStroke();
        dom.overlay.style.display = 'flex';
        setTimeout(function () { try { dom.text.focus(); } catch (e) { } }, 60);
        if (dom.text.value.trim()) generate();
        else setStatus('粘贴文案后按 Ctrl/⌘ + Enter，或点「生成三套方案」。', null);
    }

    function close() {
        if (dom.overlay) dom.overlay.style.display = 'none';
    }

    function boot() {
        if (state.inited) return;
        state.inited = true;
        injectStyle();

        // 主入口：挂到左侧工具条（与项目原有交互一致，不遮挡右侧面板）
        var rail = document.getElementById('left-rail');
        var railBtn = document.getElementById('ad-rail-btn');
        if (rail && !railBtn) {
            railBtn = document.createElement('button');
            railBtn.id = 'ad-rail-btn';
            railBtn.type = 'button';
            railBtn.className = 'rail-btn ad-rail-btn';
            railBtn.dataset.tool = 'autodesign';
            railBtn.title = '一键成图（粘贴文案 → 三套封面）';
            railBtn.setAttribute('data-tooltip', '一键成图');
            railBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" data-icon="wand-magic-sparkles"></i>';
            railBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                open();
            });
            rail.insertBefore(railBtn, rail.firstChild);
            if (window.Icons && typeof Icons.apply === 'function') {
                try { Icons.apply(railBtn); } catch (e) { }
            }
        }

        // 兜底入口：万一工具条结构变了，右下角仍有一个按钮（避开右侧面板）
        if (!rail && !document.getElementById('ad-fab')) {
            var fab = document.createElement('button');
            fab.id = 'ad-fab';
            fab.type = 'button';
            fab.className = 'ad-fab';
            fab.title = '粘贴文案 → 三套专业封面 → 导出 PNG';
            fab.innerHTML = '<span style="font-size:15px;line-height:1">✨</span><span>一键成图</span>';
            fab.addEventListener('click', open);
            document.body.appendChild(fab);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && dom.overlay && dom.overlay.style.display !== 'none') {
                close();
            }
        });
        console.log('[AutoDesign] ✅ 一键成图已就位（左栏 ✨ / AutoDesignUI.open()）');
    }

    function selectPlan(id) {
        if (!state.result || !state.result.plans[id]) return false;
        state.activePlan = id;
        if (dom.tabs) { renderTabs(); renderThumbs(); renderMeta(); }
        return true;
    }

    w.AutoDesignUI = {
        open: open,
        close: close,
        generate: generate,
        apply: apply,
        export: exportPNG,
        selectPlan: selectPlan,
        getResult: function () { return state.result; },
        _core: C
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);
