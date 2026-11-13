// ============================================================
// effect-params-panel.js — 特效参数面板（P3：从 app.js 迁出）
// 职责边界：
//   ✅ 负责：右侧「特效参数」面板的 DOM 注入、参数控件渲染（滑块/颜色/吸管）、
//            参数写回图层（setLayerParam）、实时预览（applyEffectLivePreview）
//   ❌ 不负责：特效定义与 CSS 生成（在 effects.js：getAllEffectsMaster /
//            getEffectParamsDef / renderEffectCss / isParametricEffect）
//   ❌ 不负责：画布渲染（在 app.js 的 renderCanvas，它调 window.refreshEffectParamsPanel）
//   ❌ 不负责：图层选中状态（在 state.js）
// 依赖：state / effects.js 的 4 个全局函数 / renderCanvas / renderEffectsGrid / showBgToast
// 被依赖：app.js 的 renderCanvas 调 window.refreshEffectParamsPanel
// 加载顺序：必须晚于 effects.js 和 app.js（依赖的全局已就位）
// 对外暴露：window.refreshEffectParamsPanel / window.applyEffectLivePreview
// ============================================================

window.__EFFECT_PARAMS_PANEL_READY__ = true;
console.log('[EffectParamsPanel] P3 骨架就位，等待 IIFE 迁移');
/* ============================================================
   P0 特效参数面板（国际做法：选中特效 → 右侧滑块 → 实时预览）
   自动渲染，无参数特效不显示面板
   ============================================================ */
(function initEffectParamsPanel() {
    // 只在页面加载后跑一次
    if (window.__effectParamsPanelInited) return;
    window.__effectParamsPanelInited = true;

    document.addEventListener('DOMContentLoaded', () => {
        ensureParamsPanelDOM();
        // 初次渲染时，如果当前图层已有参数化特效，面板要出来
        setTimeout(refreshEffectParamsPanel, 300);
    });

    // 1) 在右侧 sidebar 顶部注入一个面板容器（隐藏在 .sidebar-right 里）
    function ensureParamsPanelDOM() {
        const sidebarRight = document.querySelector('.sidebar-right');
        if (!sidebarRight) return;
        if (document.getElementById('effect-params-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'effect-params-panel';
        panel.className = 'panel-section';
        panel.style.display = 'none';
        panel.innerHTML = `
            <h3><i class="fa-solid fa-sliders"></i> 特效参数</h3>
            <p class="hint" id="effect-params-hint">拖滑块实时预览</p>
            <div id="effect-params-body"></div>
            <div style="display:flex; gap:6px; margin-top:8px;">
                <button id="btn-effect-params-reset" class="btn" style="flex:1; justify-content:center; font-size:11px;">
                    <i class="fa-solid fa-rotate-left"></i> 重置默认
                </button>
                <button id="btn-effect-params-remove" class="btn" style="flex:1; justify-content:center; font-size:11px;">
                    <i class="fa-solid fa-xmark"></i> 移除特效
                </button>
            </div>
        `;
        // 插到 sidebar 最顶部，保证用户第一眼看到
        sidebarRight.insertBefore(panel, sidebarRight.firstChild);

        document.getElementById('btn-effect-params-reset').addEventListener('click', () => {
            const layer = state.getSelectedLayer();
            if (!layer) return;
            const effectIds = getLayerEffectIds(layer);
            const paramEffectIds = effectIds.filter(id => window.isParametricEffect && window.isParametricEffect(id));
            if (paramEffectIds.length === 0) return;
            if (!layer.effectParams) layer.effectParams = {};
            paramEffectIds.forEach(id => { delete layer.effectParams[id]; });
            state.saveState();
            renderCanvas();
        });

        document.getElementById('btn-effect-params-remove').addEventListener('click', () => {
            const layer = state.getSelectedLayer();
            if (!layer) return;
            const effectIds = getLayerEffectIds(layer);
            const paramEffectIds = effectIds.filter(id => window.isParametricEffect && window.isParametricEffect(id));
            if (paramEffectIds.length === 0) return;
            // 从 effectClasses / effectClass 里移除参数化特效
            if (Array.isArray(layer.effectClasses)) {
                layer.effectClasses = layer.effectClasses.filter(id => !paramEffectIds.includes(id));
                if (layer.effectClasses.length === 0) delete layer.effectClasses;
            }
            if (layer.effectClass && paramEffectIds.includes(layer.effectClass)) {
                delete layer.effectClass;
            }
            if (layer.effectParams) {
                paramEffectIds.forEach(id => { delete layer.effectParams[id]; });
            }
            state.saveState();
            renderCanvas();
            renderEffectsGrid();
        });
    }

    // 2) 兼容取图层所有特效 id
    function getLayerEffectIds(layer) {
        if (!layer) return [];
        if (Array.isArray(layer.effectClasses) && layer.effectClasses.length > 0) return layer.effectClasses;
        return layer.effectClass ? [layer.effectClass] : [];
    }

    // 3) 刷新参数面板（renderCanvas 里会调）
    function refreshEffectParamsPanel() {
        const panel = document.getElementById('effect-params-panel');
        if (!panel) return;
        const body = document.getElementById('effect-params-body');
        const hint = document.getElementById('effect-params-hint');

        const layer = state.getSelectedLayer && state.getSelectedLayer();
        if (!layer || layer.type !== 'text') {
            panel.style.display = 'none';
            return;
        }




        const effectIds = getLayerEffectIds(layer);
        // ✅ 只要特效有 params 就显示面板（老 20 款也全都有 params 了）
        const paramEffectIds = effectIds.filter(id => {
            const def = window.getEffectParamsDef ? window.getEffectParamsDef(id) : null;
            return def && Object.keys(def).length > 0;
        });

        if (paramEffectIds.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        body.innerHTML = '';
        if (hint) hint.textContent = `当前 ${paramEffectIds.length} 个可调特效，拖动滑块实时预览`;





        // 为每个参数化特效渲染一组控件
        paramEffectIds.forEach(effectId => {
            const def = window.getEffectParamsDef(effectId);
            if (!def) return;
            const allFx = window.getAllEffectsMaster ? window.getAllEffectsMaster() : [];
            const effectMeta = allFx.find(e => e.id === effectId);
            if (!effectMeta) return;

            const groupEl = document.createElement('div');
            groupEl.style.cssText = 'margin-bottom:12px; padding:8px; background:#0d1117; border:1px solid #30363d; border-radius:6px;';
            groupEl.innerHTML = `<div style="font-size:11px;color:#58a6ff;font-weight:bold;margin-bottom:6px;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> ${effectMeta.name}
            </div>`;

            const params = layer.effectParams && layer.effectParams[effectId] ? layer.effectParams[effectId] : {};

            Object.entries(def).forEach(([key, meta]) => {
                const currentVal = params[key] !== undefined ? params[key] : meta.default;
                const row = document.createElement('div');
                row.style.cssText = 'margin-bottom:6px;';

                                if (meta.type === 'range') {
                    row.innerHTML = `
                        <div style="display:flex; justify-content:space-between; font-size:10px; color:#8b949e; margin-bottom:2px;">
                            <span>${meta.label || key}</span>
                            <span data-val-for="${key}">${currentVal}</span>
                        </div>
                        <input type="range" min="${meta.min}" max="${meta.max}" step="${meta.step || 1}" value="${currentVal}" style="width:100%;accent-color:#ff2442;" data-param-key="${key}">
                    `;
                    const slider = row.querySelector('input[type="range"]');
                    const valLabel = row.querySelector(`[data-val-for="${key}"]`);
                                        slider.addEventListener('pointerdown', () => {
                        window.__effectParamsDragging = true;
                    });
                    slider.addEventListener('input', (e) => {
                        const v = parseFloat(e.target.value);
                        if (valLabel) valLabel.textContent = v;
                        setLayerParam(layer, effectId, key, v);
                        // ✅ 国际做法：拖动中只更新当前图层 DOM 的样式，不重建画布
                        applyEffectLivePreview(layer, effectId);
                    });
                    slider.addEventListener('change', () => {
                        window.__effectParamsDragging = false;
                        state.saveState();
                    });
                    slider.addEventListener('pointerup', () => {
                        window.__effectParamsDragging = false;
                    });
                                                              } else if (meta.type === 'color') {
                    const _supportsEyeDropper = typeof window.EyeDropper !== 'undefined';
                    // 归一化颜色值：只允许 #rrggbb，其它一律回退到默认色
                    const _safeColor = (function(v, fallback) {
                        let s = String(v == null ? '' : v).trim();
                        if (/^#[0-9a-fA-F]{3}$/.test(s)) {
                            s = '#' + s[1]+s[1]+s[2]+s[2]+s[3]+s[3];
                        }
                        if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
                            s = fallback || '#000000';
                        }
                        return s;
                    })(currentVal, meta.default || '#000000');
                    row.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#8b949e; margin-bottom:2px;">
                            <span>${meta.label || key}</span>
                            <span style="font-family:monospace; display:flex; align-items:center; gap:4px;">
                                <span data-val-for="${key}">${_safeColor}</span>
                                ${_supportsEyeDropper ? `<button class="btn-eye-dropper" title="吸管取色（从屏幕任意位置吸取）" style="background:none;border:1px solid #30363d;border-radius:3px;color:#8b949e;cursor:pointer;padding:0 4px;font-size:11px;line-height:16px;"><i class="fa-solid fa-eye-dropper"></i></button>` : ''}
                            </span>
                        </div>
                        <input type="color" value="${_safeColor}" style="width:100%;height:28px;border:1px solid #30363d;border-radius:4px;background:none;cursor:pointer;" data-param-key="${key}">
                    `;
                    const picker = row.querySelector('input[type="color"]');
                    const hexLabel = row.querySelector('span[style*="monospace"]');
                                        picker.addEventListener('pointerdown', () => {
                        window.__effectParamsDragging = true;
                    });
                    picker.addEventListener('input', (e) => {
                        if (hexLabel) hexLabel.textContent = e.target.value;
                        setLayerParam(layer, effectId, key, e.target.value);
                        // ✅ 同上：只更新当前图层 DOM，不重建画布
                        applyEffectLivePreview(layer, effectId);
                    });
                    picker.addEventListener('change', () => {
                        window.__effectParamsDragging = false;
                        state.saveState();
                    });
                                        picker.addEventListener('pointerup', () => {
                        window.__effectParamsDragging = false;
                    });
                    const eyeBtn = row.querySelector('.btn-eye-dropper');
                    if (eyeBtn) {
                        eyeBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            try {
                                const eyeDropper = new EyeDropper();
                                const result = await eyeDropper.open();
                                const hex = result.sRGBHex;
                                if (hex) {
                                    picker.value = hex;
                                    if (hexLabel) hexLabel.textContent = hex;
                                    setLayerParam(layer, effectId, key, hex);
                                    applyEffectLivePreview(layer, effectId);
                                    state.saveState();
                                }
                            } catch (err) {
                                // eslint-disable-next-line no-empty
                                // 合法降级：用户在吸管取色时按 Esc 取消 / 浏览器拒绝授权，属正常流程，不记录日志
                            }
                        });
                    }
                }

                groupEl.appendChild(row);
            });

            body.appendChild(groupEl);
        });
    }

        // 4) 写参数到图层
    function setLayerParam(layer, effectId, key, value) {
        if (!layer.effectParams) layer.effectParams = {};
        if (!layer.effectParams[effectId]) layer.effectParams[effectId] = {};
        layer.effectParams[effectId][key] = value;
    }

    /* ==========================================================
       ✅ 国际做法：参数实时预览，只更新当前图层 DOM，不重建画布
       适用场景：拖滑块 / 拖颜色选择器
       不适用：切图层、切页、切特效 id（那些场景仍走 renderCanvas）
       ========================================================== */
    function applyEffectLivePreview(layer, changedEffectId) {
        if (!layer) return;
        try {
            // 1. 找到当前图层对应的 DOM 节点
            const layerEl = document.querySelector(
                `.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${layer.id}"]`
            );
            if (!layerEl) return;
            const textInner = layerEl.querySelector('.text-content-editable');
            if (!textInner) return;

            // 2. 拿到当前图层所有特效 + 参数
            const effectList = Array.isArray(layer.effectClasses) && layer.effectClasses.length > 0
                ? layer.effectClasses
                : (layer.effectClass ? [layer.effectClass] : []);
            const effectParams = layer.effectParams || {};

            // 3. 判断是否有背景框类（判定逻辑已收口到 effects.js → isEffectBgBox）
            let bgBoxId = null;
            for (const eid of effectList) {
                if (typeof isEffectBgBox === 'function' && isEffectBgBox(eid, effectParams[eid])) {
                    bgBoxId = eid;
                    break;
                }
            }

            // 4. 清掉旧特效样式（避免叠加时前一次的值残留）
            const prevEffectClasses = Array.from(textInner.classList).filter(cls => cls.startsWith('effect-'));
            prevEffectClasses.forEach(cls => textInner.classList.remove(cls));
            // 清掉上一次通过 setProperty 加的样式（我们只清"可能是特效加的"）
            // 保守做法：把 text-shadow / -webkit-text-fill-color / -webkit-background-clip
            //           / background(当它是渐变文字时) 清掉
            textInner.style.removeProperty('text-shadow');
            textInner.style.removeProperty('-webkit-text-fill-color');
            textInner.style.removeProperty('-webkit-background-clip');
            // background 要小心：用户可能手动设了背景色，但我们这是文字图层，特效渐变文字的 background 应该清
            // 判断：如果某个特效 CSS 里含 background-clip:text，才清 background
            const hasGradientText = effectList.some(eid => {
                const c = (window.renderEffectCss ? window.renderEffectCss(eid, effectParams[eid] || {}) : '').toLowerCase();
                return c.includes('background-clip') && c.includes('text');
            });
            if (hasGradientText) textInner.style.removeProperty('background');

            // 5. 套用所有特效（普通特效 setProperty，背景框类拆 props）
            if (bgBoxId) {
                // 背景框类：只套 bgBoxId 这一个（避免多个 background 冲突）
                const cssText = window.renderEffectCss ? window.renderEffectCss(bgBoxId, effectParams[bgBoxId] || {}) : '';
                Utils.dom.applyCssText(textInner, cssText, [
                    'background', 'background-color', 'padding', 'border-radius',
                    'border', 'color', 'font-weight', 'font-style'
                ]);
            } else {
                // 普通特效叠加
                effectList.forEach(eid => {
                    const cssText = window.renderEffectCss ? window.renderEffectCss(eid, effectParams[eid] || {}) : '';
                    if (!cssText) return;
                    Utils.dom.applyCssText(textInner, cssText);
                });
            }

            // 6. 保留用户局部内联色（如果有）
            if (typeof hasLocalInlineColor === 'function' && hasLocalInlineColor(layer.content)) {
                textInner.classList.add('has-local-color');
            }

            // 7. 触发一次自动高度同步（因为文字样式变了，高度可能变）
            if (layer.heightMode !== 'fixed') {
                const h = textInner.offsetHeight + 4;
                if (Math.abs((layer.height || 0) - h) > 1) {
                    layer.height = h;
                    layerEl.style.height = 'auto';
                }
            }
        } catch (err) {
            console.warn('[LivePreview] 失败，退回整页重绘:', err);
            // 兜底：实在不行才整页重绘
            if (typeof renderCanvas === 'function') renderCanvas();
        }
    }

    // 5) 对外暴露
    window.refreshEffectParamsPanel = refreshEffectParamsPanel;
    window.applyEffectLivePreview = applyEffectLivePreview;
})();