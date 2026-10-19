// ============================================================
// guides.js — 自定义参考线 + Figma 级吸附对齐
// 数据：state.guides = [{id, orientation:'v'|'h', pos:number}]
// 开关：state.snapEnabled = true
// ============================================================
// 参考线交互常量（可调）
const GUIDE_EDGE_THRESHOLD = 20;     // 鼠标距画布边缘多少 px 内 = 从边缘拖出参考线
const GUIDE_SNAP_TO_EXISTING = 6;    // 边缘处距已有参考线多少 px 内 = 拖动这条已有线
const GUIDE_CLEAR_DELAY = 50;        // 松手后延迟清除提示（ms）

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
                line.className = `custom-guide-line ${g.orientation === 'v' ? 'v' : 'h'}${g._dragging ? ' dragging' : ''}`;
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

    // ============ 从画布边缘拖出参考线 / 拖动已有参考线 ============
    // 注意：使用 capture=true，保证不被其它模块的 stopPropagation 拦截
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.isContentEditable) return;
        if (e.target.closest('.canvas-layer')) return;

        const canvas = e.target.closest('.cover-canvas');
        if (!canvas) return;
        const wrapper = canvas.closest('.canvas-page-wrapper');
        if (!wrapper || !isCurrentPage(wrapper.dataset.pageId)) return;
        if (state.editingLayerId) return;

        const canvasRect = canvas.getBoundingClientRect();
        if (canvasRect.width === 0 || canvasRect.height === 0) return;

        const scaleX = canvasRect.width / CANVAS_W || 1;
        const scaleY = canvasRect.height / CANVAS_H || 1;
        const logicalX = (e.clientX - canvasRect.left) / scaleX;
        const logicalY = (e.clientY - canvasRect.top) / scaleY;

        const dxLeft = logicalX;
        const dxRight = CANVAS_W - logicalX;
        const dyTop = logicalY;
        const dyBottom = CANVAS_H - logicalY;

        // 1) 鼠标在边缘 20px 内：先找附近有没有已有线 → 有就拖它，没有才新建
        let orientation = null;
        if (dxLeft <= GUIDE_EDGE_THRESHOLD || dxRight <= GUIDE_EDGE_THRESHOLD) orientation = 'v';
        else if (dyTop <= GUIDE_EDGE_THRESHOLD || dyBottom <= GUIDE_EDGE_THRESHOLD) orientation = 'h';

        if (orientation) {
            e.preventDefault();
            e.stopPropagation();
            ensureState();

            const pos = orientation === 'v'
                ? Math.max(0, Math.min(CANVAS_W, logicalX))
                : Math.max(0, Math.min(CANVAS_H, logicalY));

            let nearest = null;
            let nearestDist = Infinity;
            state.guides.forEach(g => {
                if (g.orientation !== orientation) return;
                const d = Math.abs(g.pos - pos);
                if (d < nearestDist) { nearestDist = d; nearest = g; }
            });

            if (nearest && nearestDist <= GUIDE_SNAP_TO_EXISTING) {
                nearest.pos = pos;
                renderGuides();
                startDragGuide(e, nearest);
            } else {
                const g = {
                    id: 'g-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                    orientation,
                    pos
                };
                state.guides.push(g);
                renderGuides();
                startDragGuide(e, g);
            }
            return;
        }

        // 2) 不在边缘，但点在已有参考线上 → 拖动它
        const guideLine = e.target.closest('.custom-guide-line');
        if (guideLine) {
            const g = state.guides.find(x => x.id === guideLine.dataset.guideId);
            if (g) {
                e.preventDefault();
                e.stopPropagation();
                startDragGuide(e, g);
            }
            return;
        }
    }, true);   // ← 关键：capture=true

    // ============ 拖动参考线 ============
    function startDragGuide(e, guide) {
        e.preventDefault();
        e.stopPropagation();
        draggingGuide = guide;
        dragOrientation = guide.orientation;
        dragStartPos = guide.orientation === 'v' ? e.clientX : e.clientY;
        dragGuideStart = guide.pos;

        // 立即更新 DOM class（不等 renderGuides）
        guide._dragging = true;
        const lineElNow = document.querySelector(`.custom-guide-line[data-guide-id="${guide.id}"]`);
        if (lineElNow) lineElNow.classList.add('dragging');

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
        if (draggingGuide) draggingGuide._dragging = false;
        document.querySelectorAll('.custom-guide-line.dragging').forEach(el => el.classList.remove('dragging'));
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

        candidatesX.push({ pos: CANVAS_W / 2 });
        candidatesY.push({ pos: CANVAS_H / 2 });
        candidatesX.push({ pos: 0 });
        candidatesX.push({ pos: CANVAS_W });
        candidatesY.push({ pos: 0 });
        candidatesY.push({ pos: CANVAS_H });
        state.guides.forEach(g => {
            if (g.orientation === 'v') candidatesX.push({ pos: g.pos });
            else candidatesY.push({ pos: g.pos });
        });
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

        const layerXPoints = [layer.x, layer.x + layer.width / 2, layer.x + layer.width];
        const layerYPoints = [layer.y, layer.y + layer.height / 2, layer.y + layer.height];

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

    // ===== 边缘感应：固定贴边提示 + 双向光标 + rAF 节流 =====
    function initEdgeHints() {
        if (window.__guideEdgeHintsInited) return;
        window.__guideEdgeHintsInited = true;

        let currentHint = null;
        let currentCanvas = null;
        let currentOrientation = null;
        let currentSide = null;
        let rafId = null;
        let lastEvent = null;

        function clearHint() {
            lastEvent = null;
            if (currentHint && currentHint.parentNode) {
                currentHint.parentNode.removeChild(currentHint);
            }
            currentHint = null;
            if (currentCanvas) {
                currentCanvas.classList.remove(
                    'edge-active-v', 'edge-active-h',
                    'edge-active-right', 'edge-active-bottom'
                );
            }
            currentCanvas = null;
            currentOrientation = null;
            currentSide = null;
            document.body.classList.remove('guide-cursor-v', 'guide-cursor-h');
        }

        function showHint(canvas, orientation, side) {
            if (currentHint && currentCanvas === canvas && currentSide === side) return;
            clearHint();

            const hint = document.createElement('div');
            hint.className = 'edge-hint-line ' + orientation;
            if (orientation === 'v') {
                hint.style.left = (side === 'left' ? '0%' : 'calc(100% - 2px)');
            } else {
                hint.style.top = (side === 'top' ? '0%' : 'calc(100% - 2px)');
            }
            canvas.appendChild(hint);

            canvas.classList.add(orientation === 'v' ? 'edge-active-v' : 'edge-active-h');
            if (side === 'right') canvas.classList.add('edge-active-right');
            if (side === 'bottom') canvas.classList.add('edge-active-bottom');

            document.body.classList.add(orientation === 'v' ? 'guide-cursor-v' : 'guide-cursor-h');

            currentHint = hint;
            currentCanvas = canvas;
            currentOrientation = orientation;
            currentSide = side;
        }

        function handleMove(e) {
            if (draggingGuide) { clearHint(); return; }
            if (state.editingLayerId) { clearHint(); return; }

            const canvas = e.target.closest('.cover-canvas');
            if (!canvas) { clearHint(); return; }
            if (e.target.closest('.canvas-layer')) { clearHint(); return; }

            const wrapper = canvas.closest('.canvas-page-wrapper');
            if (!wrapper || !isCurrentPage(wrapper.dataset.pageId)) { clearHint(); return; }

            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) { clearHint(); return; }

            const scaleX = rect.width / CANVAS_W || 1;
            const scaleY = rect.height / CANVAS_H || 1;
            const logicalX = (e.clientX - rect.left) / scaleX;
            const logicalY = (e.clientY - rect.top) / scaleY;

            const dists = [
                { d: logicalX,            o: 'v', side: 'left'   },
                { d: CANVAS_W - logicalX, o: 'v', side: 'right'  },
                { d: logicalY,            o: 'h', side: 'top'    },
                { d: CANVAS_H - logicalY, o: 'h', side: 'bottom' }
            ];
            dists.sort((a, b) => a.d - b.d);
            const nearest = dists[0];

            if (nearest.d <= GUIDE_EDGE_THRESHOLD) {
                showHint(canvas, nearest.o, nearest.side);
            } else {
                clearHint();
            }
        }

        document.addEventListener('mousemove', (e) => {
            lastEvent = e;
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (lastEvent) handleMove(lastEvent);
            });
        });

        const boundContainers = new WeakSet();
        let containerBound = false;
        function bindContainerLeave() {
            const c = document.querySelector('.canvas-container');
            if (c && !boundContainers.has(c)) {
                boundContainers.add(c);
                c.addEventListener('mouseleave', clearHint);
                containerBound = true;
            }
        }
        bindContainerLeave();
        let retry = 0;
        const retryTimer = setInterval(() => {
            bindContainerLeave();
            if (containerBound || ++retry >= 20) clearInterval(retryTimer);
        }, 100);

        window.addEventListener('blur', clearHint);

        document.addEventListener('mouseup', () => {
            setTimeout(clearHint, GUIDE_CLEAR_DELAY);
        });
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
        initEdgeHints();
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