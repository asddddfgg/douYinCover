// ============================================================
// guides.js — 自定义参考线 + Figma 级吸附对齐
// 数据：state.guides = [{id, orientation:'v'|'h', pos:number}]
// 开关：state.snapEnabled = true
// ============================================================

const Guides = (function () {
    const SNAP_THRESHOLD = 6;
    const CANVAS_W = 360;
    const CANVAS_H = 640;
    let draggingGuide = null;
    let dragStartPos = 0;
    let dragGuideStart = 0;
    let dragOrientation = null;
    let snapLinesEl = null;

    function ensureState() {
        if (!Array.isArray(state.guides)) state.guides = [];
        if (typeof state.snapEnabled === 'undefined') state.snapEnabled = true;
    }

    function isCurrentPage(pageId) {
        return pageId === state.currentPageId;
    }

    // ============ 渲染参考线 ============
    function renderGuides() {
        ensureState();
        document.querySelectorAll('.canvas-page-wrapper').forEach(wrapper => {
            const pageId = wrapper.dataset.pageId;
            const canvasEl = wrapper.querySelector('.cover-canvas');
            if (!canvasEl) return;
            let layer = canvasEl.querySelector('.custom-guides-layer');
            if (!layer) {
                layer = document.createElement('div');
                layer.className = 'custom-guides-layer';
                canvasEl.appendChild(layer);
            }
            layer.innerHTML = '';
            if (!isCurrentPage(pageId)) return;

            state.guides.forEach(g => {
                const line = document.createElement('div');
                line.className = `custom-guide-line ${g.orientation === 'v' ? 'v' : 'h'}`;
                line.dataset.guideId = g.id;
                line.dataset.orientation = g.orientation;
                if (g.orientation === 'v') {
                    line.style.left = g.pos + 'px';
                } else {
                    line.style.top = g.pos + 'px';
                }
                line.addEventListener('mousedown', (e) => startDragGuide(e, g));
                layer.appendChild(line);
            });
        });
    }

    // ============ 从画布边缘拖出参考线 ============
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.canvas-layer')) return;
        if (e.target.closest('.custom-guide-line')) return;
        if (e.target.closest('.custom-guides-layer .custom-guide-line')) return;
        if (e.target.isContentEditable) return;

        const canvas = e.target.closest('.cover-canvas');
        if (!canvas) return;
        const wrapper = canvas.closest('.canvas-page-wrapper');
        if (!wrapper || !isCurrentPage(wrapper.dataset.pageId)) return;
        if (state.editingLayerId) return;

        const canvasRect = canvas.getBoundingClientRect();
        const THRESHOLD = 8;

        const dxLeft = e.clientX - canvasRect.left;
        const dxRight = canvasRect.right - e.clientX;
        const dyTop = e.clientY - canvasRect.top;
        const dyBottom = canvasRect.bottom - e.clientY;

        let orientation = null;
        if (dxLeft <= THRESHOLD) orientation = 'v';
        else if (dxRight <= THRESHOLD) orientation = 'v';
        else if (dyTop <= THRESHOLD) orientation = 'h';
        else if (dyBottom <= THRESHOLD) orientation = 'h';
        if (!orientation) return;

        e.preventDefault();
        ensureState();

        const localX = e.clientX - canvasRect.left;
        const localY = e.clientY - canvasRect.top;
        const pos = orientation === 'v'
            ? Math.max(0, Math.min(CANVAS_W, localX))
            : Math.max(0, Math.min(CANVAS_H, localY));
        const g = {
            id: 'g-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            orientation,
            pos
        };
        state.guides.push(g);
        renderGuides();
        startDragGuide(e, g);
    });

    // ============ 拖动参考线 ============
    function startDragGuide(e, guide) {
        e.preventDefault();
        e.stopPropagation();
        draggingGuide = guide;
        dragOrientation = guide.orientation;
        dragStartPos = guide.orientation === 'v' ? e.clientX : e.clientY;
        dragGuideStart = guide.pos;

        document.addEventListener('mousemove', onDragGuideMove);
        document.addEventListener('mouseup', onDragGuideEnd);
    }

    function onDragGuideMove(e) {
        if (!draggingGuide) return;
        const cur = dragOrientation === 'v' ? e.clientX : e.clientY;
        let newPos = dragGuideStart + (cur - dragStartPos);
        if (dragOrientation === 'v') newPos = Math.max(0, Math.min(CANVAS_W, newPos));
        else newPos = Math.max(0, Math.min(CANVAS_H, newPos));
        draggingGuide.pos = newPos;
        renderGuides();
    }

    function onDragGuideEnd(e) {
        if (!draggingGuide) return;
        document.removeEventListener('mousemove', onDragGuideMove);
        document.removeEventListener('mouseup', onDragGuideEnd);

        const canvas = document.querySelector(
            `.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .cover-canvas`
        );
        if (canvas) {
            const r = canvas.getBoundingClientRect();
            const outX = e.clientX < r.left - 20 || e.clientX > r.right + 20;
            const outY = e.clientY < r.top - 20 || e.clientY > r.bottom + 20;
            if (outX || outY) {
                state.guides = state.guides.filter(g => g.id !== draggingGuide.id);
            }
        }
        draggingGuide = null;
        dragOrientation = null;
        renderGuides();
        if (typeof state.saveState === 'function') state.saveState();
    }

    // ============ 吸附引擎 ============
    function applySnap(layer, el, canvasEl) {
        ensureState();
        if (!state.snapEnabled) return;
        if (!canvasEl) canvasEl = el.closest('.cover-canvas');
        if (!canvasEl) return;

        const canvasRect = canvasEl.getBoundingClientRect();

        const candidatesX = [];
        const candidatesY = [];

        // 画布中心
        candidatesX.push({ pos: CANVAS_W / 2 });
        candidatesY.push({ pos: CANVAS_H / 2 });
        // 画布边缘
        candidatesX.push({ pos: 0 });
        candidatesX.push({ pos: CANVAS_W });
        candidatesY.push({ pos: 0 });
        candidatesY.push({ pos: CANVAS_H });
        // 自定义参考线
        state.guides.forEach(g => {
            if (g.orientation === 'v') candidatesX.push({ pos: g.pos });
            else candidatesY.push({ pos: g.pos });
        });
        // 其它图层
        const selectedIds = new Set(state.selectedLayerIds || []);
        state.layers.forEach(other => {
            if (other.id === layer.id) return;
            if (selectedIds.has(other.id)) return;
            candidatesX.push({ pos: other.x });
            candidatesX.push({ pos: other.x + other.width });
            candidatesX.push({ pos: other.x + other.width / 2 });
            candidatesY.push({ pos: other.y });
            candidatesY.push({ pos: other.y + other.height });
            candidatesY.push({ pos: other.y + other.height / 2 });
        });

        const layerXPoints = [
            layer.x,
            layer.x + layer.width / 2,
            layer.x + layer.width
        ];
        const layerYPoints = [
            layer.y,
            layer.y + layer.height / 2,
            layer.y + layer.height
        ];

        let bestX = null;
        layerXPoints.forEach(p => {
            candidatesX.forEach(c => {
                const diff = Math.abs(p - c.pos);
                if (diff <= SNAP_THRESHOLD) {
                    if (!bestX || diff < bestX.diff) {
                        bestX = { diff, newX: layer.x + (c.pos - p), linePos: c.pos };
                    }
                }
            });
        });
        let bestY = null;
        layerYPoints.forEach(p => {
            candidatesY.forEach(c => {
                const diff = Math.abs(p - c.pos);
                if (diff <= SNAP_THRESHOLD) {
                    if (!bestY || diff < bestY.diff) {
                        bestY = { diff, newY: layer.y + (c.pos - p), linePos: c.pos };
                    }
                }
            });
        });

        const activeLines = [];
        if (bestX) {
            layer.x = bestX.newX;
            el.style.left = layer.x + 'px';
            activeLines.push({ orientation: 'v', pos: bestX.linePos });
        }
        if (bestY) {
            layer.y = bestY.newY;
            el.style.top = layer.y + 'px';
            activeLines.push({ orientation: 'h', pos: bestY.linePos });
        }

        showSnapLines(activeLines, canvasRect);
    }

    function showSnapLines(lines, canvasRect) {
        if (!snapLinesEl) {
            snapLinesEl = document.createElement('div');
            snapLinesEl.className = 'snap-lines-layer';
            document.body.appendChild(snapLinesEl);
        }
        snapLinesEl.innerHTML = '';
        if (!lines || lines.length === 0) {
            snapLinesEl.style.display = 'none';
            return;
        }
        snapLinesEl.style.display = 'block';
        lines.forEach(l => {
            const div = document.createElement('div');
            div.className = `snap-line ${l.orientation}`;
            if (l.orientation === 'v') {
                div.style.left = (canvasRect.left + l.pos) + 'px';
                div.style.top = canvasRect.top + 'px';
                div.style.height = canvasRect.height + 'px';
            } else {
                div.style.top = (canvasRect.top + l.pos) + 'px';
                div.style.left = canvasRect.left + 'px';
                div.style.width = canvasRect.width + 'px';
            }
            snapLinesEl.appendChild(div);
        });
    }

    function hideSnapLines() {
        if (snapLinesEl) {
            snapLinesEl.style.display = 'none';
            snapLinesEl.innerHTML = '';
        }
    }

    // ============ 开关与按钮 ============
    function toggleSnap() {
        ensureState();
        state.snapEnabled = !state.snapEnabled;
        updateSnapButtonUI();
    }

    function updateSnapButtonUI() {
        const btn = document.getElementById('btn-toggle-snap');
        if (btn) {
            btn.classList.toggle('active', state.snapEnabled);
            btn.title = state.snapEnabled ? '吸附开启（点按关闭）' : '吸附关闭（点按开启）';
        }
    }

    function initSnapButton() {
        const btn = document.getElementById('btn-toggle-snap');
        if (btn) btn.addEventListener('click', toggleSnap);
        const btnClear = document.getElementById('btn-clear-guides');
        if (btnClear) btnClear.addEventListener('click', () => {
            state.guides = [];
            renderGuides();
            state.saveState();
        });
        updateSnapButtonUI();
    }

    function init() {
        ensureState();
        initSnapButton();
        const observer = new MutationObserver(() => {
            if (!draggingGuide) renderGuides();
        });
        const container = document.querySelector('.canvas-container');
        if (container) {
            observer.observe(container, { childList: true, subtree: false });
        }
        renderGuides();
    }

    return {
        init,
        renderGuides,
        applySnap,
        hideSnapLines,
        toggleSnap
    };
})();

window.Guides = Guides;