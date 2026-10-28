// ============================================================
// background-layers-ui.js — 背景叠加层 UI（v2 引擎配套）
// 职责边界：
//   ✅ 负责：叠加层列表渲染、添加/删除/调透明度/换混合模式、实时预览
//   ❌ 不负责：渲染逻辑（在 background-engine.js）、资产存储（AssetRegistry）
// 依赖：BackgroundEngine / state / applyBackgroundToCanvases / state.saveState
// 加载顺序：必须晚于 background-core.js
// ============================================================

window.__BG_LAYERS_UI_READY__ = true;

const BackgroundLayersUI = (function () {
    const TEXTURE_OPTIONS = [
        { v: 'noise', label: '细颗粒噪点' },
        { v: 'grid', label: '网格线' },
        { v: 'dots', label: '波点' },
        { v: 'vignette', label: '暗角' }
    ];
    const BLEND_OPTIONS = [
        { v: 'normal', label: '正常' },
        { v: 'overlay', label: '叠加 overlay' },
        { v: 'multiply', label: '正片叠底 multiply' },
        { v: 'screen', label: '滤色 screen' },
        { v: 'soft-light', label: '柔光 soft-light' },
        { v: 'hard-light', label: '强光 hard-light' }
    ];

        function getStack() {
        if (!window.state || !state.background) return null;
        // ✅ 优先用已存在的 __v2（commit 写回的结构），不要重新 migrate
        //    否则 overlay 层会被 migrateLegacy 的旧扁平分支丢掉
        if (state.background.__v2 && state.background.__v2.version === 2) {
            return state.background.__v2;
        }
        if (window.BackgroundEngine && BackgroundEngine.migrateLegacy) {
            const migrated = BackgroundEngine.migrateLegacy(state.background);
            // 顺手挂回去，后续读同一份
            state.background.__v2 = migrated;
            return migrated;
        }
        return null;
    }

        function commit(stack) {
        if (!stack) return;
        // 写回 state.background（保留老字段平铺，供面板同步）
        const flat = Object.assign({}, stack.base);
        flat.type = stack.base.kind === 'image' ? 'image'
                 : (stack.base.kind === 'solid' ? 'solid' : 'gradient');
        const texLayer = (stack.layers || []).find(l => l.kind === 'texture');
        flat.texture = texLayer ? texLayer.texture : 'none';
        // ✅ 双保险：让 migrateLegacy 走 v2 分支而不是旧扁平分支
        flat.version = 2;
        flat.base = stack.base;
        flat.layers = stack.layers;
        flat.__v2 = stack;
        state.background = flat;
        if (typeof applyBackgroundToCanvases === 'function') {
            applyBackgroundToCanvases(state.background);
        }
        if (typeof state.saveState === 'function') state.saveState();
        render();
    }

    function ensureContainer() {
        let box = document.getElementById('bg-layers-section');
        if (box) return box;
        // 注入到 bg-advanced-body 里 bg-texture 下拉所在 control-group 之后
        const advBody = document.getElementById('bg-advanced-body');
        if (!advBody) return null;
        const texSelect = document.getElementById('bg-texture');
        const anchor = texSelect ? texSelect.closest('.control-group') : advBody.lastElementChild;
        box = document.createElement('div');
        box.id = 'bg-layers-section';
        box.className = 'control-group';
        box.style.cssText = 'margin-top:10px;border-top:1px dashed #30363d;padding-top:10px;';
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(box, anchor.nextSibling);
        } else {
            advBody.appendChild(box);
        }
        return box;
    }

    function render() {
        const box = ensureContainer();
        if (!box) return;
        const stack = getStack();
        if (!stack) return;
        const layers = stack.layers || [];

        let html = '<label style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span><i class="fa-solid fa-layer-group"></i> 叠加层（' + layers.length + '）</span>' +
            '<span style="display:flex;gap:4px;">' +
            '<button class="btn" data-add="texture" style="padding:1px 6px;font-size:10px;" title="添加纹理"><i class="fa-solid fa-plus"></i> 纹理</button>' +
            '<button class="btn" data-add="overlay" style="padding:1px 6px;font-size:10px;" title="添加纯色遮罩"><i class="fa-solid fa-plus"></i> 遮罩</button>' +
            '</span></label>';

        if (!layers.length) {
            html += '<div style="font-size:11px;color:#6e7681;padding:6px 0;">暂无叠加层，点右上「+」添加</div>';
        } else {
            // 从上到下展示（最上层在前）
            for (let i = layers.length - 1; i >= 0; i--) {
                const l = layers[i];
                const idx = i;
                let kindLabel = '纹理';
                if (l.kind === 'overlay') kindLabel = '遮罩';
                else if (l.kind === 'image') kindLabel = '图片';

                html += '<div class="bg-layer-row" data-idx="' + idx + '" style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:6px 8px;margin-top:6px;">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
                html += '<span style="font-size:11px;color:#c9d1d9;font-weight:600;">' + kindLabel + ' #' + (idx + 1) + '</span>';
                html += '<button class="btn" data-del="' + idx + '" style="padding:0 5px;font-size:10px;background:#f85149;border-color:#f85149;color:#fff;" title="删除"><i class="fa-solid fa-xmark"></i></button>';
                html += '</div>';

                if (l.kind === 'texture') {
                    html += '<select data-prop="texture" data-idx="' + idx + '" style="width:100%;background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:2px 6px;border-radius:4px;font-size:11px;margin-bottom:4px;">';
                    TEXTURE_OPTIONS.forEach(o => {
                        html += '<option value="' + o.v + '"' + (l.texture === o.v ? ' selected' : '') + '>' + o.label + '</option>';
                    });
                    html += '</select>';
                } else if (l.kind === 'overlay') {
                    html += '<div style="display:flex;gap:4px;margin-bottom:4px;align-items:center;">';
                    html += '<input type="color" data-prop="color" data-idx="' + idx + '" value="' + (l.color || '#000000') + '" style="width:32px;height:24px;border:1px solid #30363d;border-radius:4px;background:none;cursor:pointer;">';
                    html += '<input type="range" data-prop="angle" data-idx="' + idx + '" min="0" max="360" value="' + (l.angle || 180) + '" style="flex:1;accent-color:#ff2442;">';
                    html += '<span style="font-size:10px;color:#8b949e;min-width:32px;text-align:right;" data-angle-val="' + idx + '">' + (l.angle || 180) + '°</span>';
                    html += '</div>';
                }

                html += '<div style="display:flex;gap:4px;align-items:center;">';
                html += '<input type="range" data-prop="opacity" data-idx="' + idx + '" min="0" max="100" value="' + Math.round(l.opacity * 100) + '" style="flex:1;accent-color:#ff2442;">';
                html += '<span style="font-size:10px;color:#8b949e;min-width:30px;text-align:right;" data-opacity-val="' + idx + '">' + Math.round(l.opacity * 100) + '%</span>';
                html += '</div>';

                html += '<select data-prop="blendMode" data-idx="' + idx + '" style="width:100%;background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:2px 6px;border-radius:4px;font-size:10px;margin-top:4px;">';
                BLEND_OPTIONS.forEach(o => {
                    html += '<option value="' + o.v + '"' + (l.blendMode === o.v ? ' selected' : '') + '>' + o.label + '</option>';
                });
                html += '</select>';

                html += '</div>';
            }
        }

        box.innerHTML = html;
        bindEvents(box);
    }

    function bindEvents(box) {
        // 添加
                box.querySelectorAll('[data-add]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const kind = btn.dataset.add;
                const stack = getStack();
                if (!stack) return;
                                stack.layers.push({
                    id: 'layer-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                    kind: kind,
                    texture: kind === 'texture' ? 'noise' : 'none',
                    // ✅ 遮罩默认黑色 60%，深色/浅色 base 上都明显可见，用户可改色
                    color: '#000000',
                    angle: 180,
                    opacity: kind === 'texture' ? 1 : 0.6,
                    blendMode: 'normal'
                });
                commit(stack);
                // 清掉按钮的 focus/hover 残留，避免“两个按钮都点亮”的错觉
                btn.blur();
            });
        });

        // 删除
        box.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.del, 10);
                const stack = getStack();
                if (!stack || isNaN(idx)) return;
                stack.layers.splice(idx, 1);
                commit(stack);
            });
        });

        // 属性变更（texture / color / angle / opacity / blendMode）
        box.querySelectorAll('[data-prop]').forEach(el => {
            const evt = (el.tagName === 'SELECT' || el.type === 'color') ? 'change' : 'input';
            el.addEventListener(evt, () => {
                const prop = el.dataset.prop;
                const idx = parseInt(el.dataset.idx, 10);
                const stack = getStack();
                if (!stack || isNaN(idx) || !stack.layers[idx]) return;
                const l = stack.layers[idx];
                if (prop === 'opacity') {
                    l.opacity = Math.max(0, Math.min(1, parseFloat(el.value) / 100));
                    const lbl = box.querySelector('[data-opacity-val="' + idx + '"]');
                    if (lbl) lbl.textContent = Math.round(l.opacity * 100) + '%';
                } else if (prop === 'angle') {
                    l.angle = parseInt(el.value, 10) || 0;
                    const lbl = box.querySelector('[data-angle-val="' + idx + '"]');
                    if (lbl) lbl.textContent = l.angle + '°';
                } else if (prop === 'texture') {
                    l.texture = el.value;
                } else if (prop === 'color') {
                    l.color = el.value;
                } else if (prop === 'blendMode') {
                    l.blendMode = el.value;
                }
                                // 实时预览：只更新 state + 应用，不重建 UI（避免滑块丢焦点）
                const flat = Object.assign({}, stack.base);
                flat.type = stack.base.kind === 'image' ? 'image'
                         : (stack.base.kind === 'solid' ? 'solid' : 'gradient');
                const texLayer = (stack.layers || []).find(x => x.kind === 'texture');
                flat.texture = texLayer ? texLayer.texture : 'none';
                // ✅ 双保险：保留 v2 结构
                flat.version = 2;
                flat.base = stack.base;
                flat.layers = stack.layers;
                flat.__v2 = stack;
                state.background = flat;
                if (typeof applyBackgroundToCanvases === 'function') {
                    applyBackgroundToCanvases(state.background);
                }
            });
            // change 时存档
            if (evt === 'input') {
                el.addEventListener('change', () => {
                    if (typeof state.saveState === 'function') state.saveState();
                });
            }
        });
    }

    function init() {
        if (window.__bgLayersUIInited) return;
        window.__bgLayersUIInited = true;
        render();
        // 面板初始化完成后，如果 state 有变，rerender
        document.addEventListener('click', (e) => {
            if (e.target.closest('#bg-category-tabs, #bg-preset-grid')) {
                setTimeout(render, 50);
            }
        });
        console.log('[BackgroundLayersUI] 初始化完成');
    }

    return { init, render };
})();

window.BackgroundLayersUI = BackgroundLayersUI;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try { BackgroundLayersUI.init(); } catch (e) { console.warn('[BackgroundLayersUI] 初始化失败:', e); }
    }, 500);
});