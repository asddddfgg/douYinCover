// ============================================================
// history-panel.js — 设计历史面板
// ============================================================

const HistoryPanel = (function () {
    let inited = false;

    function summarizeSnapshot(snap) {
        if (!snap) return '空快照';
        const pages = snap.pages || [];
        const totalLayers = pages.reduce((acc, p) => acc + ((p.layers && p.layers.length) || 0), 0);
        return pages.length + ' 页 / ' + totalLayers + ' 图层';
    }

    function renderList() {
        const list = document.getElementById('history-list');
        if (!list) return;
        list.innerHTML = '';
        const stack = (window.state && state.history && state.history.stack) || [];
        const pointer = (window.state && state.history) ? state.history.pointer : -1;

        if (!stack.length) {
            list.innerHTML = '<div style="color:#6e7681; font-size:12px; text-align:center; padding:20px;">暂无历史记录</div>';
            return;
        }

        stack.forEach((snap, idx) => {
            const item = document.createElement('div');
            item.className = 'history-item' + (idx === pointer ? ' active' : '');
            item.dataset.idx = idx;
            const label = summarizeSnapshot(snap);
            item.innerHTML = '<div class="history-item-title">#' + (idx + 1) + ' ' + (idx === pointer ? '（当前）' : '') + '</div><div class="history-item-meta">' + label + '</div>';
            item.addEventListener('click', () => jumpTo(idx));
            list.appendChild(item);
        });

        setTimeout(() => {
            const active = list.querySelector('.history-item.active');
            if (active) active.scrollIntoView({ block: 'nearest' });
        }, 30);
    }

    function jumpTo(index) {
        if (!window.state || !state.history) return;
        const stack = state.history.stack;
        if (index < 0 || index >= stack.length) return;
        state.history.pointer = index;
        state.history.restore(stack[index]);
        if (typeof renderAll === 'function') renderAll();
        else {
            if (typeof renderCanvas === 'function') renderCanvas();
            if (typeof renderLayerList === 'function') renderLayerList();
        }
        renderList();
    }

    function open() {
        const panel = document.getElementById('history-panel');
        if (panel) panel.style.display = 'flex';
        renderList();
    }

    function close() {
        const panel = document.getElementById('history-panel');
        if (panel) panel.style.display = 'none';
    }

    function init() {
        if (inited) return;
        inited = true;

        const btn = document.getElementById('btn-history');
        if (btn) btn.addEventListener('click', open);

        const btnClose = document.getElementById('history-panel-close');
        if (btnClose) btnClose.addEventListener('click', close);

        const panel = document.getElementById('history-panel');
        if (panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) close();
            });
        }

        if (window.state && !state.__historyPanelHooked) {
            state.__historyPanelHooked = true;
            const orig = state.saveState.bind(state);
            state.saveState = function () {
                orig();
                if (panel && panel.style.display === 'flex') renderList();
            };
        }

        console.log('[HistoryPanel] 初始化完成');
    }

    return { init, open, close, renderList, jumpTo };
})();

window.HistoryPanel = HistoryPanel;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { HistoryPanel.init(); } catch (e) { console.warn(e); } }, 200);
});