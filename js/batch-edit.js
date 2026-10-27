// ============================================================
// batch-edit.js — 多选批量编辑样式
// ============================================================

const BatchEdit = (function () {
    let installed = false;

    function getSelectedTextLayers() {
        if (!window.state) return [];
        const ids = state.selectedLayerIds || [];
        if (!ids.length) return [];
        const page = state.getCurrentPage ? state.getCurrentPage() : null;
        if (!page) return [];
        return page.layers.filter(l => ids.includes(l.id) && l.type === 'text');
    }

    function updateBadge() {
        const badge = document.getElementById('multi-edit-badge');
        const countEl = document.getElementById('multi-edit-count');
        if (!badge) return;
        const ids = (window.state && state.selectedLayerIds) || [];
        const layers = getSelectedTextLayers();
        if (ids.length > 1 && layers.length > 0) {
            badge.style.display = 'inline-flex';
            badge.style.alignItems = 'center';
            badge.style.gap = '4px';
            if (countEl) countEl.textContent = String(layers.length);
        } else {
            badge.style.display = 'none';
        }
    }

    function applyToAllSelected(mutator) {
        const layers = getSelectedTextLayers();
        if (layers.length <= 1) return false;
        layers.forEach(mutator);
        if (typeof state.saveState === 'function') state.saveState();
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
        return true;
    }

    function interceptControls() {
        const colorInput = document.getElementById('tb-color');
        if (colorInput) {
            colorInput.addEventListener('input', (e) => {
                const val = e.target.value;
                applyToAllSelected(l => { l.color = val; });
            });
        }

        const bgColorInput = document.getElementById('tb-bgcolor');
        if (bgColorInput) {
            bgColorInput.addEventListener('input', (e) => {
                const val = e.target.value;
                applyToAllSelected(l => { l.bgColor = val; });
            });
        }

        const fontSize = document.getElementById('tb-fontsize');
        if (fontSize) {
            fontSize.addEventListener('change', (e) => {
                const val = e.target.value;
                applyToAllSelected(l => { l.fontSize = val; });
            });
        }

        const fontSelect = document.getElementById('tb-font');
        if (fontSelect) {
            fontSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                applyToAllSelected(l => { l.fontFamily = val; });
            });
        }

        const bold = document.getElementById('tb-bold');
        if (bold) {
            bold.addEventListener('click', () => {
                const layers = getSelectedTextLayers();
                if (layers.length > 1) {
                    const target = !layers[0].bold;
                    applyToAllSelected(l => { l.bold = target; });
                }
            }, true);
        }

        const italic = document.getElementById('tb-italic');
        if (italic) {
            italic.addEventListener('click', () => {
                const layers = getSelectedTextLayers();
                if (layers.length > 1) {
                    const target = !layers[0].italic;
                    applyToAllSelected(l => { l.italic = target; });
                }
            }, true);
        }

        const underline = document.getElementById('tb-underline');
        if (underline) {
            underline.addEventListener('click', () => {
                const layers = getSelectedTextLayers();
                if (layers.length > 1) {
                    const target = !layers[0].underline;
                    applyToAllSelected(l => { l.underline = target; });
                }
            }, true);
        }

        const strike = document.getElementById('tb-strike');
        if (strike) {
            strike.addEventListener('click', () => {
                const layers = getSelectedTextLayers();
                if (layers.length > 1) {
                    const target = !layers[0].strike;
                    applyToAllSelected(l => { l.strike = target; });
                }
            }, true);
        }

        ['left', 'center', 'right'].forEach(align => {
            const btn = document.getElementById('tb-align-' + align);
            if (btn) {
                btn.addEventListener('click', () => {
                    applyToAllSelected(l => { l.align = align; });
                }, true);
            }
        });

        const letterSpacing = document.getElementById('tb-letter-spacing');
        if (letterSpacing) {
            letterSpacing.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value) || 0;
                const val = (v === 0) ? 0 : (v + 'px');
                applyToAllSelected(l => { l.letterSpacing = val; });
            });
        }

        const lineHeight = document.getElementById('tb-line-height');
        if (lineHeight) {
            lineHeight.addEventListener('input', (e) => {
                const val = e.target.value;
                applyToAllSelected(l => { l.lineHeight = val; });
            });
        }

        const opacity = document.getElementById('tb-opacity');
        if (opacity) {
            opacity.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                applyToAllSelected(l => { l.opacity = val; });
            });
        }
    }

    function init() {
        if (installed) return;
        installed = true;
        interceptControls();
        setTimeout(updateBadge, 300);
        console.log('[BatchEdit] 初始化完成');
    }

    return { init, getSelectedTextLayers, applyToAllSelected, updateBadge };
})();

window.BatchEdit = BatchEdit;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { BatchEdit.init(); } catch (e) { console.warn(e); } }, 200);
});