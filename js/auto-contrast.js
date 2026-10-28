// ============================================================
// auto-contrast.js — 自动对比色（WCAG）
// ============================================================

const AutoContrast = (function () {
    function getBackgroundMainColor() {
        if (!window.state || !state.background) return { r: 0, g: 0, b: 0 };
        const bg = state.background;
        let hex = '#000000';
        if (bg.type === 'solid' && bg.color1) hex = bg.color1;
        else if (bg.type === 'gradient' && bg.color1) hex = bg.color1;
        else if (bg.type === 'image') hex = '#333333';
        return hexToRgb(hex);
    }

    function hexToRgb(hex) {
        if (!hex) return { r: 0, g: 0, b: 0 };
        let h = String(hex).replace('#', '').trim();
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const r = parseInt(h.slice(0, 2), 16) || 0;
        const g = parseInt(h.slice(2, 4), 16) || 0;
        const b = parseInt(h.slice(4, 6), 16) || 0;
        return { r, g, b };
    }

    function relLuminance(rgb) {
        const toLinear = (c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
    }

    function contrastRatio(rgbA, rgbB) {
        const lA = relLuminance(rgbA);
        const lB = relLuminance(rgbB);
        const lighter = Math.max(lA, lB);
        const darker = Math.min(lA, lB);
        return (lighter + 0.05) / (darker + 0.05);
    }

    function pickContrastTextColor(bgRgb) {
        const white = { r: 255, g: 255, b: 255 };
        const black = { r: 0, g: 0, b: 0 };
        const cWhite = contrastRatio(bgRgb, white);
        const cBlack = contrastRatio(bgRgb, black);
        return cWhite >= cBlack ? '#FFFFFF' : '#000000';
    }

    function applyToSelected() {
        if (!window.state) return;
        const page = state.getCurrentPage ? state.getCurrentPage() : null;
        if (!page) return;
        const ids = state.selectedLayerIds || [];
        const layers = page.layers.filter(l => ids.includes(l.id) && l.type === 'text');
        if (!layers.length) {
            if (typeof showBgToast === 'function') showBgToast('请先选中至少一个文字图层');
            return;
        }
        const bg = getBackgroundMainColor();
        const color = pickContrastTextColor(bg);
        layers.forEach(l => { l.color = color; });
        if (typeof state.saveState === 'function') state.saveState();
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
        if (typeof showBgToast === 'function') showBgToast('自动对比色：' + color);
    }

    function init() {
        const btn = document.getElementById('btn-auto-contrast');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                applyToSelected();
                document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            });
        }
        console.log('[AutoContrast] 初始化完成');
    }

    return { init, applyToSelected };
})();

window.AutoContrast = AutoContrast;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { AutoContrast.init(); } catch (e) { console.warn(e); } }, 300);
});