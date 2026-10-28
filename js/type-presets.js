// ============================================================
// type-presets.js — 文字排版预设
// ============================================================

const TypePresets = (function () {
    const PRESETS = {
        title:    { fontSize: '48px', bold: true,  italic: false, lineHeight: 1.15, letterSpacing: '-1px' },
        subtitle: { fontSize: '28px', bold: true,  italic: false, lineHeight: 1.25, letterSpacing: '0px' },
        body:     { fontSize: '20px', bold: false, italic: false, lineHeight: 1.5,  letterSpacing: '0px' },
        caption:  { fontSize: '14px', bold: false, italic: false, lineHeight: 1.4,  letterSpacing: '1px' }
    };

    function applyToLayer(layer, presetKey) {
        const preset = PRESETS[presetKey];
        if (!preset || !layer) return;
        layer.fontSize = preset.fontSize;
        layer.bold = preset.bold;
        layer.italic = preset.italic;
        layer.lineHeight = preset.lineHeight;
        layer.letterSpacing = preset.letterSpacing;
    }

    function applyPreset(presetKey) {
        if (!window.state) return;
        const ids = state.selectedLayerIds || [];
        const page = state.getCurrentPage ? state.getCurrentPage() : null;
        if (!page) return;
        const layers = page.layers.filter(l => ids.includes(l.id) && l.type === 'text');
        if (!layers.length) {
            if (typeof showBgToast === 'function') showBgToast('请选中至少一个文字图层');
            return;
        }
        layers.forEach(l => applyToLayer(l, presetKey));
        if (typeof state.saveState === 'function') state.saveState();
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
        if (typeof showBgToast === 'function') showBgToast('已套用排版预设：' + presetKey);
    }

    function init() {
        const sel = document.getElementById('tb-type-preset');
        if (sel && !sel.dataset.bound) {
            sel.dataset.bound = '1';
            sel.addEventListener('change', (e) => {
                const key = e.target.value;
                if (!key) return;
                applyPreset(key);
                e.target.value = '';
                document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            });
            sel.addEventListener('click', (ev) => ev.stopPropagation());
        }
        console.log('[TypePresets] 初始化完成');
    }

    return { init, applyPreset };
})();

window.TypePresets = TypePresets;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { TypePresets.init(); } catch (e) { console.warn(e); } }, 300);
});