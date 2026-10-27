// ============================================================
// align-distribute.js — 多图层对齐与分布
// ============================================================

const AlignDistribute = (function () {
    let installed = false;

    function getSelectedLayers() {
        if (!window.state) return [];
        const ids = state.selectedLayerIds || [];
        if (!ids.length) return [];
        const page = state.getCurrentPage ? state.getCurrentPage() : null;
        if (!page) return [];
        return page.layers.filter(l => ids.includes(l.id) && !l.locked);
    }

    function applyAndRender(mutator) {
        const layers = getSelectedLayers();
        if (layers.length < 2) {
            if (typeof showBgToast === 'function') showBgToast('请至少选中 2 个图层');
            return;
        }
        mutator(layers);
        if (typeof state.saveState === 'function') state.saveState();
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
    }

    function alignLeft() {
        applyAndRender(layers => {
            const minX = Math.min(...layers.map(l => l.x));
            layers.forEach(l => { l.x = minX; });
        });
    }

    function alignCenter() {
        applyAndRender(layers => {
            const centers = layers.map(l => l.x + l.width / 2);
            const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
            layers.forEach(l => { l.x = avg - l.width / 2; });
        });
    }

    function alignRight() {
        applyAndRender(layers => {
            const maxRight = Math.max(...layers.map(l => l.x + l.width));
            layers.forEach(l => { l.x = maxRight - l.width; });
        });
    }

    function alignTop() {
        applyAndRender(layers => {
            const minY = Math.min(...layers.map(l => l.y));
            layers.forEach(l => { l.y = minY; });
        });
    }

    function alignMiddle() {
        applyAndRender(layers => {
            const centers = layers.map(l => l.y + l.height / 2);
            const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
            layers.forEach(l => { l.y = avg - l.height / 2; });
        });
    }

    function alignBottom() {
        applyAndRender(layers => {
            const maxBottom = Math.max(...layers.map(l => l.y + l.height));
            layers.forEach(l => { l.y = maxBottom - l.height; });
        });
    }

    function distributeHorizontal() {
        applyAndRender(layers => {
            if (layers.length < 3) {
                if (typeof showBgToast === 'function') showBgToast('至少选中 3 个图层才能等间距分布');
                return;
            }
            const sorted = layers.slice().sort((a, b) => a.x - b.x);
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const totalWidth = sorted.reduce((sum, l) => sum + l.width, 0);
            const gap = (last.x + last.width - first.x - totalWidth) / (sorted.length - 1);
            let cursor = first.x + first.width + gap;
            for (let i = 1; i < sorted.length - 1; i++) {
                sorted[i].x = cursor;
                cursor += sorted[i].width + gap;
            }
        });
    }

    function distributeVertical() {
        applyAndRender(layers => {
            if (layers.length < 3) {
                if (typeof showBgToast === 'function') showBgToast('至少选中 3 个图层才能等间距分布');
                return;
            }
            const sorted = layers.slice().sort((a, b) => a.y - b.y);
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const totalHeight = sorted.reduce((sum, l) => sum + l.height, 0);
            const gap = (last.y + last.height - first.y - totalHeight) / (sorted.length - 1);
            let cursor = first.y + first.height + gap;
            for (let i = 1; i < sorted.length - 1; i++) {
                sorted[i].y = cursor;
                cursor += sorted[i].height + gap;
            }
        });
    }

    function bindButtons() {
        const map = {
            'btn-align-left-multi': alignLeft,
            'btn-align-center-multi': alignCenter,
            'btn-align-right-multi': alignRight,
            'btn-align-top-multi': alignTop,
            'btn-align-middle-multi': alignMiddle,
            'btn-align-bottom-multi': alignBottom,
            'btn-distribute-h': distributeHorizontal,
            'btn-distribute-v': distributeVertical
        };
        Object.keys(map).forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', map[id]);
        });
    }

    function bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.isContentEditable) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (!e.altKey || e.ctrlKey || e.metaKey) return;
            const k = e.key.toLowerCase();
            if (k === 'a') { e.preventDefault(); alignLeft(); }
            else if (k === 'h') { e.preventDefault(); alignCenter(); }
            else if (k === 'd') { e.preventDefault(); alignRight(); }
            else if (k === 'w') { e.preventDefault(); alignTop(); }
            else if (k === 'v') { e.preventDefault(); alignMiddle(); }
            else if (k === 's') { e.preventDefault(); alignBottom(); }
        });
    }

    function init() {
        if (installed) return;
        installed = true;
        bindButtons();
        bindShortcuts();
        console.log('[AlignDistribute] 初始化完成');
    }

    return { init, alignLeft, alignCenter, alignRight, alignTop, alignMiddle, alignBottom, distributeHorizontal, distributeVertical };
})();

window.AlignDistribute = AlignDistribute;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { AlignDistribute.init(); } catch (e) { console.warn(e); } }, 200);
});