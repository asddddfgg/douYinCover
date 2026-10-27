// ============================================================
// preview-mode.js — 设计预览模式
// ============================================================

const PreviewMode = (function () {
    let active = false;
    let currentIndex = 0;
    let inited = false;

    function renderStage() {
        const stage = document.getElementById('preview-stage');
        if (!stage) return;
        if (!window.state || !state.pages) return;
        const pages = state.pages;
        if (!pages.length) return;
        if (currentIndex < 0) currentIndex = 0;
        if (currentIndex >= pages.length) currentIndex = pages.length - 1;
        const page = pages[currentIndex];
        stage.innerHTML = '';

        const wrapper = document.querySelector('.canvas-page-wrapper[data-page-id="' + page.id + '"]');
        if (wrapper) {
            const clone = wrapper.querySelector('.cover-canvas').cloneNode(true);
            clone.querySelectorAll('.resize-handle, .edge-handle, .rotate-handle, .selection-box, .custom-guides-layer, .snap-lines-layer, .edge-hint-line').forEach(el => el.remove());
            clone.querySelectorAll('.canvas-layer.selected, .canvas-layer.editing').forEach(el => {
                el.classList.remove('selected');
                el.classList.remove('editing');
            });
            clone.style.transform = 'scale(1.4)';
            clone.style.transformOrigin = 'center center';
            clone.style.margin = '20px auto';
            clone.style.boxShadow = '0 30px 60px rgba(0,0,0,0.6)';
            stage.appendChild(clone);
        }

        const indicator = document.getElementById('preview-page-indicator');
        if (indicator) indicator.textContent = (currentIndex + 1) + ' / ' + pages.length;
    }

    function open() {
        if (!window.state || !state.pages) return;
        const idx = state.pages.findIndex(p => p.id === state.currentPageId);
        currentIndex = idx >= 0 ? idx : 0;
        const overlay = document.getElementById('preview-overlay');
        if (overlay) overlay.style.display = 'flex';
        active = true;
        renderStage();
    }

    function close() {
        const overlay = document.getElementById('preview-overlay');
        if (overlay) overlay.style.display = 'none';
        active = false;
    }

    function next() {
        if (!window.state || !state.pages) return;
        if (currentIndex < state.pages.length - 1) {
            currentIndex++;
            renderStage();
        }
    }

    function prev() {
        if (currentIndex > 0) {
            currentIndex--;
            renderStage();
        }
    }

    function init() {
        if (inited) return;
        inited = true;

        const btnClose = document.getElementById('preview-close');
        if (btnClose) btnClose.addEventListener('click', close);
        const btnPrev = document.getElementById('preview-prev');
        if (btnPrev) btnPrev.addEventListener('click', prev);
        const btnNext = document.getElementById('preview-next');
        if (btnNext) btnNext.addEventListener('click', next);

        document.addEventListener('keydown', (e) => {
            if (!active) return;
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        });

        console.log('[PreviewMode] 初始化完成');
    }

    return { init, open, close, next, prev, isActive: () => active };
})();

window.PreviewMode = PreviewMode;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { PreviewMode.init(); } catch (e) { console.warn(e); } }, 300);
});