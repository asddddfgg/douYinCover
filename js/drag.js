// Professional Canva-style Drag + Rotate + Corner Scale + Edge Resize + Align Guides + Cross-page Drag
// ============================================================
// draw 图层路径命中测试：鼠标离笔迹足够近就算点中
// ============================================================
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        const ex = px - x1, ey = py - y1;
        return Math.sqrt(ex * ex + ey * ey);
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    const ex = px - cx, ey = py - cy;
    return Math.sqrt(ex * ex + ey * ey);
}

function isPointInShapeLayer(pageX, pageY, layer) {
    if (!layer || layer.type !== 'shape') return false;
    // 考虑旋转：把点转到图层内部坐标
    let lx = pageX - layer.x;
    let ly = pageY - layer.y;
    const rot = (layer.rotation || 0) * Math.PI / 180;
    if (rot) {
        const cx = layer.width / 2;
        const cy = layer.height / 2;
        const dx = lx - cx, dy = ly - cy;
        const cos = Math.cos(-rot), sin = Math.sin(-rot);
        lx = cx + dx * cos - dy * sin;
        ly = cy + dx * sin + dy * cos;
    }
    return lx >= 0 && ly >= 0 && lx <= layer.width && ly <= layer.height;
}

function isPointNearDrawLayer(pageX, pageY, layer) {
    if (!layer || layer.type !== 'draw' || !Array.isArray(layer.segments)) return false;
    const tol = Math.max(layer.strokeWidth || 4, 10) + 6; // 容差：至少 16px
    // 先把鼠标点转到图层内部坐标系（考虑旋转）
    let lx = pageX - layer.x;
    let ly = pageY - layer.y;
    const rot = (layer.rotation || 0) * Math.PI / 180;
    if (rot) {
        const cx = layer.width / 2;
        const cy = layer.height / 2;
        const dx = lx - cx, dy = ly - cy;
        const cos = Math.cos(-rot), sin = Math.sin(-rot);
        lx = cx + dx * cos - dy * sin;
        ly = cy + dx * sin + dy * cos;
    }
    // 快速排除：离包围盒太远直接 false
    if (lx < -tol || ly < -tol || lx > layer.width + tol || ly > layer.height + tol) {
        return false;
    }
    // 逐段计算鼠标到笔迹的最短距离
    for (const seg of layer.segments) {
        const pts = seg.points || [];
        if (pts.length === 1) {
            const dx = lx - pts[0].x, dy = ly - pts[0].y;
            if (Math.sqrt(dx * dx + dy * dy) <= tol) return true;
        }
        for (let i = 1; i < pts.length; i++) {
            const d = pointToSegmentDistance(lx, ly, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
            if (d <= tol) return true;
        }
    }
    return false;
}

// + 多选整体拖拽 + 吸附对齐 + 右键菜单智能定位（最小侵入升级）

function initDragModule() {
    const container = document.querySelector('.canvas-container');
    if (!container) return;

    let isDragging = false;
    let isResizing = false;
    let isRotating = false;
    let resizeMode = null;
    let resizeDirection = null;
    let dragLayer = null;
    let startX = 0, startY = 0;
    let initX = 0, initY = 0;
    let initWidth = 0, initHeight = 0;
    let initFontSize = 28;
    let initRotation = 0;
    let rotateCenter = { x: 0, y: 0 };
    let rotateStartAngle = 0;
    let pendingDrag = false;
    let hasMovedOrResized = false;
    let didCrossPage = false;

    // 多选支持
    let dragLayers = [];
// 多选整体缩放状态
let multiResizeBBox = null;    // { minX, minY, maxX, maxY, width, height }
let multiResizeLayers = null;  // 参与缩放的图层数组
let multiResizeInit = null;    // 每个图层的初始几何快照
    let initPositionsMap = new Map();

        container.addEventListener('mousedown', (e) => {
        // ✅ 左键按下时，如果右键菜单正显示，先隐藏它（不 return，继续正常选中流程）
        if (e.button === 0) {
            const _openMenu = document.getElementById('context-menu');
            if (_openMenu && _openMenu.style.display === 'block') {
                _openMenu.style.display = 'none';
            }
        }

        // ✅ 右键 + 正在编辑文字 + 有选区：直接弹菜单，不走后面任何选中/清编辑逻辑
        if (e.button === 2 && state.editingLayerId) {
            const _ctx = (typeof getActiveSelectionRange === 'function') ? getActiveSelectionRange() : null;
            if (_ctx && !_ctx.collapsed) {
                e.preventDefault();
                e.stopPropagation();
                const menu = document.getElementById('context-menu');
                if (menu) {
                    const inlineItem = document.getElementById('ctx-clear-inline-effect');
                    const layerItem = document.getElementById('ctx-clear-layer-effect');
                    if (inlineItem) inlineItem.style.display = '';
                    const curLayer = state.getSelectedLayer();
                    if (layerItem) layerItem.style.display = (curLayer && curLayer.type === 'text') ? '' : 'none';

                    menu.style.display = 'block';
                    menu.style.visibility = 'hidden';
                    menu.style.left = '0px';
                    menu.style.top = '0px';
                    const rect = menu.getBoundingClientRect();
                    const vw = window.innerWidth;
                    const vh = window.innerHeight;
                    let x = e.clientX;
                    let y = e.clientY;
                    if (x + rect.width > vw - 8) x = vw - rect.width - 8;
                    if (y + rect.height > vh - 8) y = vh - rect.height - 8;
                    if (x < 8) x = 8;
                    if (y < 8) y = 8;
                    menu.style.left = x + 'px';
                    menu.style.top = y + 'px';
                    menu.style.visibility = 'visible';
                }
                return;
            }
        }

        // ✅ 编辑态下：点击其它图层 → 先退出当前编辑再切换选中
if (state.editingLayerId) {
    const clickedLayerEl = e.target.closest('.canvas-layer');
    if (clickedLayerEl && clickedLayerEl.dataset.id !== state.editingLayerId) {
        const curEl = document.querySelector(
            `.canvas-layer[data-id="${state.editingLayerId}"] .text-content-editable`
        );
        if (curEl) {
            const curLayer = state.layers.find(l => l.id === state.editingLayerId);
            if (curLayer) curLayer.content = curEl.innerHTML;
            curEl.blur();
        }
        state.editingLayerId = null;
        // 不 return，继续走下方选中切换逻辑
    } else {
        if (e.target.isContentEditable || e.target.closest('.editing')) return;
    }
} else {
    if (e.target.isContentEditable) return;
}

        // ========== 旋转手柄 ==========
        const rotateHandle = e.target.closest('.rotate-handle');
        if (rotateHandle) {
            e.stopPropagation();
            e.preventDefault();
            isRotating = true;
            const targetEl = rotateHandle.closest('.canvas-layer');
            if (!targetEl) return;
            dragLayer = state.layers.find(l => l.id === targetEl.dataset.id);
            if (!dragLayer) return;
            const rect = targetEl.getBoundingClientRect();
            rotateCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            rotateStartAngle = Math.atan2(e.clientY - rotateCenter.y, e.clientX - rotateCenter.x);
            initRotation = dragLayer.rotation || 0;
            hasMovedOrResized = false;
            return;
        }

        // ========== 四角缩放 ==========
const cornerHandle = e.target.closest('.resize-handle');
if (cornerHandle) {
    e.stopPropagation();
    e.preventDefault();
    isResizing = true;
    resizeMode = 'corner';
    resizeDirection = cornerHandle.dataset.direction;
    const targetEl = cornerHandle.closest('.canvas-layer');
    if (!targetEl) return;
    dragLayer = state.layers.find(l => l.id === targetEl.dataset.id);
    if (!dragLayer) return;

    startX = e.clientX; startY = e.clientY;
    initWidth = dragLayer.width || 280;
    initHeight = dragLayer.height || 100;
    initX = dragLayer.x; initY = dragLayer.y;
    initFontSize = parseFloat(dragLayer.fontSize) || 28;
    hasMovedOrResized = false;

    // ===== 多选/组整体缩放：记录所有参与图层的初始几何 =====
    let isMultiResize = false;
    let layersToScale = [];

    // 先看组：只要 dragLayer.groupId 存在，就整组缩放
    if (dragLayer.groupId && typeof state.getGroupMemberIds === 'function') {
        const memberIds = state.getGroupMemberIds(dragLayer.id);
        const groupLayers = state.layers.filter(l => memberIds.includes(l.id));
        // 组里至少有 2 个成员（含自己）才走整组；锁定成员不参与缩放但也不阻止整组
        if (groupLayers.length >= 2) {
            layersToScale = groupLayers.filter(l => !l.locked);
            if (layersToScale.length >= 1) {
                isMultiResize = true;
                if (window.MultiSelect) {
                    state.selectedLayerIds = groupLayers.map(l => l.id);
                    state.selectedLayerId = dragLayer.id;
                }
            }
        }
    }

    // 组没命中时才走多选
    if (!isMultiResize) {
        const selectedIds = (window.MultiSelect && state.selectedLayerIds) || [];
        if (selectedIds.length > 1 && selectedIds.includes(dragLayer.id)) {
            layersToScale = state.layers.filter(l => selectedIds.includes(l.id) && !l.locked);
            if (layersToScale.length > 1) isMultiResize = true;
        }
    }

    if (isMultiResize) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layersToScale.forEach(l => {
            minX = Math.min(minX, l.x);
            minY = Math.min(minY, l.y);
            maxX = Math.max(maxX, l.x + l.width);
            maxY = Math.max(maxY, l.y + l.height);
        });
        multiResizeBBox = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
        multiResizeLayers = layersToScale;
        multiResizeInit = layersToScale.map(l => ({
            id: l.id,
            x: l.x, y: l.y,
            width: l.width, height: l.height,
            fontSize: parseFloat(l.fontSize) || 28
        }));
    } else {
        multiResizeBBox = null;
        multiResizeLayers = null;
        multiResizeInit = null;
    }
    return;
}

        // ========== 四边中点缩放 ==========
        const edgeHandle = e.target.closest('.edge-handle');
        if (edgeHandle) {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            resizeMode = 'edge';
            resizeDirection = edgeHandle.dataset.direction;
            const targetEl = edgeHandle.closest('.canvas-layer');
            if (!targetEl) return;
            dragLayer = state.layers.find(l => l.id === targetEl.dataset.id);
            if (!dragLayer) return;
            startX = e.clientX; startY = e.clientY;
            initWidth = dragLayer.width || 280;
            initHeight = dragLayer.height || 100;
            initX = dragLayer.x; initY = dragLayer.y;
            hasMovedOrResized = false;
            return;
        }

                // ========== draw 图层路径命中：点击线附近也能选中 ==========
        // 优先看鼠标是否落在某条笔迹的容差范围内（从上层到下层）
        let drawHitEl = null;
        {
            const canvasEl = e.target.closest('.cover-canvas');
            if (canvasEl) {
                const pageWrapper = canvasEl.closest('.canvas-page-wrapper');
                const pageId = pageWrapper ? pageWrapper.dataset.pageId : null;
                const page = pageId ? state.pages.find(p => p.id === pageId) : null;
                if (page) {
                    const rect = canvasEl.getBoundingClientRect();
                    const scaleX = rect.width / 360 || 1;
                    const scaleY = rect.height / 640 || 1;
                    const px = (e.clientX - rect.left) / scaleX;
                    const py = (e.clientY - rect.top) / scaleY;
                    // 从上层往下层找（数组末尾 = 上层）
                    for (let i = page.layers.length - 1; i >= 0; i--) {
                        const l = page.layers[i];
                        if (l.type === 'draw') {
                            if (isPointNearDrawLayer(px, py, l)) {
                                drawHitEl = canvasEl.querySelector(`.canvas-layer[data-id="${l.id}"]`);
                                if (drawHitEl) break;
                            }
                        } else if (l.type === 'shape') {
                            if (isPointInShapeLayer(px, py, l)) {
                                drawHitEl = canvasEl.querySelector(`.canvas-layer[data-id="${l.id}"]`);
                                if (drawHitEl) break;
                            }
                        }
                    }
                }
            }
        }

        // ========== 锁定图层：点击后不选中、不拖动 ==========
        // 左键：完全拦截（不选中、不拖动、不提示太多）
        // 右键：放行，继续走下方右键菜单分支，让用户能直接解锁
        {
            let hitLayer = e.target.closest('.canvas-layer');
            if (!hitLayer && drawHitEl) hitLayer = drawHitEl;
            if (hitLayer) {
                const hitId = hitLayer.dataset.id;
                if (state.isLayerLocked && state.isLayerLocked(hitId)) {
                    if (e.button === 2) {
                        // 右键放行，但仍要把"被点击的那一层"设为当前选中目标，
                        // 否则右键菜单会针对旧的选中图层（可能不是这个锁定层）
                        state.selectedLayerId = hitId;
                        if (window.MultiSelect) {
                            state.selectedLayerIds = [hitId];
                        }
                    } else {
                        if (typeof showBgToast === 'function') {
                            showBgToast('🔒 该图层已锁定，右键或图层列表可解锁');
                        }
                        e.stopPropagation();
                        return;
                    }
                }
            }
        }

        // ========== 点击组内任一图层：选中整个组 ==========
        {
            let hitLayer = e.target.closest('.canvas-layer');
            if (!hitLayer && drawHitEl) hitLayer = drawHitEl;
            if (hitLayer && !(e.ctrlKey || e.metaKey)) {
                const hitId = hitLayer.dataset.id;
                const hitData = state.layers.find(l => l.id === hitId);
                if (hitData && hitData.groupId) {
                    const memberIds = state.getGroupMemberIds(hitId);
                    state.selectedLayerId = hitId;
                    if (window.MultiSelect) {
                        state.selectedLayerIds = memberIds.slice();
                    }
                    renderCanvas();
                    renderLayerList();
                    updateTopToolbarUI(state.getSelectedLayer());
                }
            }
        }

        // ========== 点击空白 ==========
        let targetLayer = e.target.closest('.canvas-layer');
        if (!targetLayer && drawHitEl) targetLayer = drawHitEl;
        if (!targetLayer) {
            const pageWrapper = e.target.closest('.canvas-page-wrapper');
            if (pageWrapper) {
                const pageId = pageWrapper.dataset.pageId;
                if (pageId && state.currentPageId !== pageId) {
                    state.switchPage(pageId);
                    renderAll();
                }
            }
            exitAllEditingMode();
            state.selectedLayerId = null;
            if (window.MultiSelect) {
                state.selectedLayerIds = [];
            }
            renderCanvas();
            renderLayerList();
            if (typeof applyBackgroundToCanvases === 'function') {
                applyBackgroundToCanvases(state.background);
            }
            updateTopToolbarUI(null);
            if (typeof showStickerColorBar === 'function') showStickerColorBar(false);
            return;
        }

        const layerId = targetLayer.dataset.id;
        const pageWrapper = targetLayer.closest('.canvas-page-wrapper');
        if (pageWrapper) {
            const pageId = pageWrapper.dataset.pageId;
            if (pageId && state.currentPageId !== pageId) state.switchPage(pageId);
        }

        // ============ 多选：Ctrl/Cmd + 点击切换选中 ============
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl && window.MultiSelect) {
            e.preventDefault();
            e.stopPropagation();
            MultiSelect.toggleSelect(layerId);
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
            // 多选时不显示浮动工具条
            if (window.FloatingToolbar && typeof FloatingToolbar.sync === 'function') {
                try { FloatingToolbar.sync(); } catch (err) {}
            }
            return;
        }

        const alreadySelected = (state.selectedLayerId === layerId);
        const isMulti = window.MultiSelect && (state.selectedLayerIds || []).length > 1;

        if (isMulti && MultiSelect.isSelected(layerId)) {
            // 已在多选集合中：保持多选，只更新 primary
            state.selectedLayerId = layerId;
        } else if (!alreadySelected) {
            exitAllEditingMode();
            state.selectedLayerId = layerId;
            if (window.MultiSelect) {
                state.selectedLayerIds = [layerId];
            }
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
        } else {
            state.selectedLayerId = layerId;
            if (window.MultiSelect && !(state.selectedLayerIds || []).includes(layerId)) {
                state.selectedLayerIds = [layerId];
            }
        }

        dragLayer = state.getSelectedLayer();
        if (!dragLayer) return;

        if (typeof showStickerColorBar === 'function') {
            showStickerColorBar(dragLayer.type === 'sticker' && dragLayer.stickerType === 'svg');
        }

                // ============ 右键菜单：智能定位，永不溢出屏幕 ============
        if (e.button === 2) {
            e.preventDefault();
            const menu = document.getElementById('context-menu');
            if (menu) {
                // ✅ 按语境显隐菜单项
                const inlineItem = document.getElementById('ctx-clear-inline-effect');
                const layerItem = document.getElementById('ctx-clear-layer-effect');
                let hasTextSel = false;
                try {
                    if (state.editingLayerId && typeof getActiveSelectionRange === 'function') {
                        const _ctx = getActiveSelectionRange();
                        hasTextSel = !!(_ctx && !_ctx.collapsed);
                    }
                } catch (_err) { hasTextSel = false; }
                const layerIsText = !!(dragLayer && dragLayer.type === 'text');
                const hasLayerEffect = !!(dragLayer && (
                    dragLayer.effectClass ||
                    (Array.isArray(dragLayer.effectClasses) && dragLayer.effectClasses.length > 0)
                ));
                // 兜底显隐：text-layers.js 的 contextmenu 捕获阶段会再做精确判断
                if (inlineItem) inlineItem.style.display = (hasTextSel || (layerIsText && /<span[^>]*style="/i.test(dragLayer.content || ''))) ? '' : 'none';
                if (layerItem) layerItem.style.display = (layerIsText && hasLayerEffect) ? '' : 'none';

                // ✅ 根据锁定状态互换「锁定 / 解锁」按钮
                const _ctxLockBtn = document.getElementById('ctx-lock');
                const _ctxUnlockBtn = document.getElementById('ctx-unlock');
                const _isLocked = !!(dragLayer && dragLayer.locked);
                if (_ctxLockBtn) _ctxLockBtn.style.display = _isLocked ? 'none' : '';
                if (_ctxUnlockBtn) _ctxUnlockBtn.style.display = _isLocked ? '' : 'none';

                menu.style.display = 'block';
                menu.style.visibility = 'hidden';
                menu.style.left = '0px';
                menu.style.top = '0px';
                const rect = menu.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                let x = e.clientX;
                let y = e.clientY;
                if (x + rect.width > vw - 8) x = vw - rect.width - 8;
                if (y + rect.height > vh - 8) y = vh - rect.height - 8;
                if (x < 8) x = 8;
                if (y < 8) y = 8;
                menu.style.left = x + 'px';
                menu.style.top = y + 'px';
                menu.style.visibility = 'visible';
            }
            return;
        }

        window.__layerDragging = true;
        pendingDrag = true;
        isDragging = false;
        hasMovedOrResized = false;
        didCrossPage = false;
        startX = e.clientX; startY = e.clientY;
        initX = dragLayer.x; initY = dragLayer.y;
        // 拖动时隐藏浮动工具条，避免遮挡
        if (window.FloatingToolbar && typeof FloatingToolbar.hide === 'function') {
            try { FloatingToolbar.hide(); } catch (e) {}
        }

        // 记录多选整体拖拽初始位置
        if (window.MultiSelect) {
            dragLayers = MultiSelect.getDragLayers(dragLayer);
            initPositionsMap = MultiSelect.captureInitialPositions(dragLayers);
        } else {
            dragLayers = [dragLayer];
            initPositionsMap = new Map([[dragLayer.id, { x: dragLayer.x, y: dragLayer.y }]]);
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isRotating && dragLayer) {
            hasMovedOrResized = true;
            const angle = Math.atan2(e.clientY - rotateCenter.y, e.clientX - rotateCenter.x);
            const deltaDeg = (angle - rotateStartAngle) * 180 / Math.PI;
            let newRot = (initRotation + deltaDeg) % 360;
            if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;
            dragLayer.rotation = newRot;
            const el = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${dragLayer.id}"]`);
            if (el) el.style.transform = `rotate(${newRot}deg)`;
            return;
        }

        if (pendingDrag && dragLayer && !isResizing) {
            const dx0 = e.clientX - startX;
            const dy0 = e.clientY - startY;
            if (Math.abs(dx0) > 4 || Math.abs(dy0) > 4) {
                pendingDrag = false;
                isDragging = true;
                const curEl = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${dragLayer.id}"]`);
                if (curEl) curEl.style.pointerEvents = 'none';
            }
        }

        if (isResizing && dragLayer) {
            hasMovedOrResized = true;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

                    if (resizeMode === 'corner') {

        // ✅ 贴纸单图层缩放：仅当非组、非多选时生效
    if (dragLayer.type === 'sticker' && !multiResizeBBox) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // 用对角拖拽距离算比例，取平均让"斜拖"和"平拖"手感一致
        let delta = 0;
        if (resizeDirection === 'se') delta = (dx + dy) / 2;
        else if (resizeDirection === 'sw') delta = (-dx + dy) / 2;
        else if (resizeDirection === 'ne') delta = (dx - dy) / 2;
        else if (resizeDirection === 'nw') delta = (-dx - dy) / 2;

        const baseW = initWidth || 1;
        let scale = 1 + delta / baseW;
        scale = Math.max(0.1, Math.min(8, scale));

        const newW = Math.max(20, initWidth * scale);
        const newH = Math.max(20, initHeight * scale);

        // 中心锚点：中心坐标不变
        const cx = initX + initWidth / 2;
        const cy = initY + initHeight / 2;
        dragLayer.width = newW;
        dragLayer.height = newH;
        dragLayer.x = cx - newW / 2;
        dragLayer.y = cy - newH / 2;

        // ✅ emoji 贴纸：fontSize 跟随盒子等比缩放
        if (dragLayer.stickerType === 'emoji') {
            dragLayer.fontSize = Math.min(newW, newH) + 'px';
        }

        const el = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${dragLayer.id}"]`);
        if (el) {
            el.style.left = dragLayer.x + 'px';
            el.style.top = dragLayer.y + 'px';
            el.style.width = dragLayer.width + 'px';
            el.style.height = dragLayer.height + 'px';

            // ✅ 关键：同步更新内部 img 尺寸（防止 DOM 没跟上）
            const innerImg = el.querySelector('img');
            if (innerImg) {
                innerImg.style.width = '100%';
                innerImg.style.height = '100%';
            }
            // emoji 贴纸（无 img，用 innerText）
            if (!innerImg && dragLayer.stickerType === 'emoji') {
                el.style.fontSize = Math.min(newW, newH) + 'px';
                el.style.lineHeight = newH + 'px';
            }
        }
        return;   // 贴纸走完就退出
    }

    // ===== 多选整体缩放分支 =====
    if (multiResizeBBox && multiResizeLayers && multiResizeInit) {
        // 以包围盒为基准计算比例：拖哪个角就用对应边
        const bbox = multiResizeBBox;
        // 计算基准边：角点方向决定用 bbox 哪一边作为分母
        // 参照原始单图层逻辑：用 initWidth 作分母，相当于「水平方向变化比例」
        // 这里用包围盒宽度作分母，整体同步缩放
        let scale = 1;
        if (resizeDirection === 'se') scale = (bbox.width + dx) / bbox.width;
        else if (resizeDirection === 'sw') scale = (bbox.width - dx) / bbox.width;
        else if (resizeDirection === 'ne') scale = (bbox.width + dx) / bbox.width;
        else if (resizeDirection === 'nw') scale = (bbox.width - dx) / bbox.width;

        scale = Math.max(0.15, Math.min(6, scale)); // 防止过小/过大

        // 缩放锚点：拖哪个角，对角的那个顶点保持不动
        // se → 锚点 (minX, minY)；sw → 锚点 (maxX, minY)；
        // ne → 锚点 (minX, maxY)；nw → 锚点 (maxX, maxY)
        let anchorX, anchorY;
        if (resizeDirection === 'se') { anchorX = bbox.minX; anchorY = bbox.minY; }
        else if (resizeDirection === 'sw') { anchorX = bbox.maxX; anchorY = bbox.minY; }
        else if (resizeDirection === 'ne') { anchorX = bbox.minX; anchorY = bbox.maxY; }
        else { anchorX = bbox.maxX; anchorY = bbox.maxY; }

        const activeSelector = `.canvas-page-wrapper[data-page-id="${state.currentPageId}"]`;
        multiResizeLayers.forEach((layer, i) => {
            const init = multiResizeInit[i];
            const nx = anchorX + (init.x - anchorX) * scale;
            const ny = anchorY + (init.y - anchorY) * scale;
            const nw = Math.max(20, init.width * scale);
            const nh = Math.max(20, init.height * scale);
            layer.x = nx;
            layer.y = ny;
            layer.width = nw;
            layer.height = nh;
            if (layer.type === 'text') {
                layer.fontSize = Math.max(8, Math.round(init.fontSize * scale)) + 'px';
            }
            // ✅ emoji 贴纸：字号随盒子等比缩放
            if (layer.type === 'sticker' && layer.stickerType === 'emoji') {
                layer.fontSize = Math.min(nw, nh) + 'px';
            }
            const el = document.querySelector(`${activeSelector} .canvas-layer[data-id="${layer.id}"]`);
            if (el) {
                el.style.left = layer.x + 'px';
                el.style.top = layer.y + 'px';
                el.style.width = layer.width + 'px';
                el.style.height = layer.height + 'px';
                if (layer.type === 'text') {
                    const textEl = el.querySelector('.text-content-editable');
                    if (textEl) textEl.style.fontSize = layer.fontSize;
                }
                if (layer.type === 'sticker' && layer.stickerType === 'emoji') {
                    el.style.fontSize = layer.fontSize;
                }
            }
        });
        return; // 多选缩放完成，跳过原单图层逻辑
    }

    // ===== 原有单图层缩放逻辑（保持不变） =====
    let scale = 1;
    if (resizeDirection === 'se') scale = Math.max(0.3, (initWidth + dx) / initWidth);
    else if (resizeDirection === 'sw') scale = Math.max(0.3, (initWidth - dx) / initWidth);
    else if (resizeDirection === 'ne') scale = Math.max(0.3, (initWidth + dx) / initWidth);
    else if (resizeDirection === 'nw') scale = Math.max(0.3, (initWidth - dx) / initWidth);

    const newW = Math.max(60, initWidth * scale);
    const newH = Math.max(30, initHeight * scale);
    const newFont = Math.max(10, Math.round(initFontSize * scale));

    if (resizeDirection.includes('w')) dragLayer.x = initX + (initWidth - newW);
    if (resizeDirection.includes('n')) dragLayer.y = initY + (initHeight - newH);

    dragLayer.width = newW;
    dragLayer.height = newH;
    if (dragLayer.type === 'text') dragLayer.fontSize = newFont + 'px';
} else if (resizeMode === 'edge') {
                // ✅ 边中点也支持整组：整组沿同一轴拉伸
                const isGroupEdge = !!(dragLayer.groupId && state.getGroupMemberIds);
                if (isGroupEdge) {
                    const memberIds = state.getGroupMemberIds(dragLayer.id);
                    const groupLayers = state.layers.filter(l => memberIds.includes(l.id) && !l.locked);
                    if (groupLayers.length > 1) {
                        // 组包围盒
                        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
                        groupLayers.forEach(l => {
                            gMinX = Math.min(gMinX, l.x);
                            gMinY = Math.min(gMinY, l.y);
                            gMaxX = Math.max(gMaxX, l.x + l.width);
                            gMaxY = Math.max(gMaxY, l.y + l.height);
                        });
                        const gW = Math.max(1, gMaxX - gMinX);
                        const gH = Math.max(1, gMaxY - gMinY);
                        // 该方向的变化量
                        let scaleX = 1, scaleY = 1;
                        let anchorX = gMinX, anchorY = gMinY;
                        if (resizeDirection === 'right') {
                            scaleX = Math.max(0.05, (gW + dx) / gW);
                            anchorX = gMinX;
                        } else if (resizeDirection === 'left') {
                            scaleX = Math.max(0.05, (gW - dx) / gW);
                            anchorX = gMaxX;
                        } else if (resizeDirection === 'bottom') {
                            scaleY = Math.max(0.05, (gH + dy) / gH);
                            anchorY = gMinY;
                        } else if (resizeDirection === 'top') {
                            scaleY = Math.max(0.05, (gH - dy) / gH);
                            anchorY = gMaxY;
                        }
                        const activeSelector = `.canvas-page-wrapper[data-page-id="${state.currentPageId}"]`;
                        groupLayers.forEach(l => {
                            if (scaleX !== 1) {
                                const initFont = parseFloat(l.fontSize) || 28;
                                l.x = anchorX + (l.x - anchorX) * scaleX;
                                l.width = Math.max(20, l.width * scaleX);
                                if (l.type === 'text') l.fontSize = Math.max(8, Math.round(initFont * scaleX)) + 'px';
                                if (l.type === 'sticker' && l.stickerType === 'emoji') l.fontSize = Math.min(l.width, l.height) + 'px';
                            }
                            if (scaleY !== 1) {
                                l.y = anchorY + (l.y - anchorY) * scaleY;
                                l.height = Math.max(20, l.height * scaleY);
                                if (l.type === 'sticker' && l.stickerType === 'emoji') l.fontSize = Math.min(l.width, l.height) + 'px';
                            }
                            const el = document.querySelector(`${activeSelector} .canvas-layer[data-id="${l.id}"]`);
                            if (el) {
                                el.style.left = l.x + 'px';
                                el.style.top = l.y + 'px';
                                el.style.width = l.width + 'px';
                                el.style.height = l.height + 'px';
                                if (l.type === 'text') {
                                    const t = el.querySelector('.text-content-editable');
                                    if (t) t.style.fontSize = l.fontSize;
                                }
                                if (l.type === 'sticker' && l.stickerType === 'emoji') {
                                    el.style.fontSize = l.fontSize;
                                    el.style.lineHeight = l.height + 'px';
                                }
                            }
                        });
                        return;
                    }
                }

                if (resizeDirection === 'right') dragLayer.width = Math.max(60, initWidth + dx);
                else if (resizeDirection === 'left') {
                    const newW = Math.max(60, initWidth - dx);
                    dragLayer.x = initX + (initWidth - newW);
                    dragLayer.width = newW;
                } else if (resizeDirection === 'bottom') dragLayer.height = Math.max(30, initHeight + dy);
                else if (resizeDirection === 'top') {
                    const newH = Math.max(30, initHeight - dy);
                    dragLayer.y = initY + (initHeight - newH);
                    dragLayer.height = newH;
                }
            }

            const el = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${dragLayer.id}"]`);
            if (el) {
                el.style.left = dragLayer.x + 'px';
                el.style.top = dragLayer.y + 'px';
                el.style.width = dragLayer.width + 'px';
                el.style.height = dragLayer.height + 'px';
                if (dragLayer.type === 'text' && resizeMode === 'corner') {
                    const textEl = el.querySelector('.text-content-editable');
                    if (textEl) textEl.style.fontSize = dragLayer.fontSize;
                }
                if (dragLayer.type === 'shape' && window.Shapes && typeof Shapes.buildShapeDom === 'function') {
                    try {
                        const oldInner = el.querySelector('.shape-layer-inner');
                        if (oldInner) oldInner.remove();
                        el.appendChild(Shapes.buildShapeDom(dragLayer));
                    } catch (e) {}
                }
            }
            return;
        }

        if (isDragging && dragLayer) {
            hasMovedOrResized = true;

            // ============ 多选整体拖拽（跳过跨页，简化逻辑） ============
            const isMultiDrag = dragLayers.length > 1;
            if (isMultiDrag) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                const activeSelector = `.canvas-page-wrapper[data-page-id="${state.currentPageId}"]`;
                MultiSelect.applyMove(dragLayers, initPositionsMap, dx, dy, activeSelector);

                const primaryEl = document.querySelector(`${activeSelector} .canvas-layer[data-id="${dragLayer.id}"]`);
                const canvasEl = primaryEl ? primaryEl.closest('.cover-canvas') : null;
                if (primaryEl && canvasEl && !e.altKey && window.Guides) {
                    const beforeX = dragLayer.x, beforeY = dragLayer.y;
                    Guides.applySnap(dragLayer, primaryEl, canvasEl);
                    const snapDx = dragLayer.x - beforeX;
                    const snapDy = dragLayer.y - beforeY;
                    if (snapDx !== 0 || snapDy !== 0) {
                        dragLayers.forEach(l => {
                            if (l.id === dragLayer.id) return;
                            l.x += snapDx;
                            l.y += snapDy;
                            const el = document.querySelector(`${activeSelector} .canvas-layer[data-id="${l.id}"]`);
                            if (el) {
                                el.style.left = l.x + 'px';
                                el.style.top = l.y + 'px';
                            }
                        });
                    }
                } else if (window.Guides) {
                    Guides.hideSnapLines();
                }
                return;
            }

                        // ===== 跨分页拖拽检测：只在鼠标靠近其它页时才做 elementFromPoint =====
            let hoveredCanvas = null;
            {
                const activePageEl = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .cover-canvas`);
                if (activePageEl) {
                    const r = activePageEl.getBoundingClientRect();
                    const near = e.clientX < r.left - 40 || e.clientX > r.right + 40 ||
                                 e.clientY < r.top - 40 || e.clientY > r.bottom + 40;
                    if (near) {
                        const hoveredEl = document.elementFromPoint(e.clientX, e.clientY);
                        hoveredCanvas = hoveredEl ? hoveredEl.closest('.cover-canvas') : null;
                    }
                }
            }
            if (hoveredCanvas) {
                const hoveredWrapper = hoveredCanvas.closest('.canvas-page-wrapper');
                const targetPageId = hoveredWrapper ? hoveredWrapper.dataset.pageId : null;
                if (targetPageId && targetPageId !== state.currentPageId) {
                    if (moveLayerToPage(dragLayer, state.currentPageId, targetPageId)) {
                        didCrossPage = true;

                        state.currentPageId = targetPageId;
                        state.selectedLayerId = dragLayer.id;
                        if (window.MultiSelect) state.selectedLayerIds = [dragLayer.id];

                        const newWrapper = hoveredCanvas.querySelector('.layers-wrapper');
                        const oldEl = document.querySelector(`.canvas-layer[data-id="${dragLayer.id}"]`);
                        if (oldEl && newWrapper) {
                            oldEl.style.pointerEvents = 'none';
                            newWrapper.appendChild(oldEl);
                        }

                        const canvasRect = hoveredCanvas.getBoundingClientRect();
                        dragLayer.x = e.clientX - canvasRect.left - dragLayer.width / 2;
                        dragLayer.y = e.clientY - canvasRect.top - dragLayer.height / 2;
                        startX = e.clientX;
                        startY = e.clientY;
                        initX = dragLayer.x;
                        initY = dragLayer.y;
                        initPositionsMap = new Map([[dragLayer.id, { x: dragLayer.x, y: dragLayer.y }]]);
                        dragLayers = [dragLayer];

                        document.querySelectorAll('.canvas-page-wrapper').forEach(w => {
                            w.classList.toggle('active-page', w.dataset.pageId === targetPageId);
                        });
                        renderPageList();
                        renderLayerList();

                        const newEl = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${dragLayer.id}"]`);
                        if (newEl) {
                            newEl.style.left = dragLayer.x + 'px';
                            newEl.style.top = dragLayer.y + 'px';
                        }
                        return;
                    }
                }
            }

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            dragLayer.x = initX + dx;
            dragLayer.y = initY + dy;

            const el = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${dragLayer.id}"]`);
            if (el) {
                el.style.left = dragLayer.x + 'px';
                el.style.top = dragLayer.y + 'px';

                // draw 图层：只重绘 canvas 覆盖层，绝不动 DOM
                if (dragLayer.type === 'draw' && window.Doodle) {
                    Doodle.redrawDrawLayers();
                }

                // ===== 吸附对齐（Alt 临时禁用） =====
                if (!e.altKey && window.Guides) {
                    const canvasEl = el.closest('.cover-canvas');
                    if (canvasEl) Guides.applySnap(dragLayer, el, canvasEl);
                } else if (window.Guides) {
                    Guides.hideSnapLines();
                }
            }

                        updateAlignGuides(dragLayer, el);
        }
    });

    document.addEventListener('mouseup', () => {
        if (window.Guides) Guides.hideSnapLines();
        window.__layerDragging = false;

        if (isDragging || isResizing || isRotating || pendingDrag) {
            if ((isDragging || isResizing || isRotating) && hasMovedOrResized) {
                state.saveState();
            }
            clearAlignGuides();

            if (didCrossPage) {
                document.querySelectorAll('.canvas-layer').forEach(el => {
                    el.style.pointerEvents = '';
                });
                renderCanvas();
                renderLayerList();
                updateTopToolbarUI(state.getSelectedLayer());
            }

            isDragging = false;
            isResizing = false;
            isRotating = false;
            pendingDrag = false;
            hasMovedOrResized = false;
            didCrossPage = false;
            resizeMode = null;
            dragLayer = null;
            dragLayers = [];
            initPositionsMap = new Map();

multiResizeBBox = null;    // ← 新增
multiResizeLayers = null;  // ← 新增
multiResizeInit = null;    // ← 新增



            updateTopToolbarUI(state.getSelectedLayer());
        }
        // 无论是否有移动，都尝试恢复浮动工具条（若 renderCanvas 已恢复则为无操作）
        if (window.FloatingToolbar && typeof FloatingToolbar.sync === 'function') {
            try { FloatingToolbar.sync(); } catch (e) {}
        }
    });

    // ✅ 修复：在 document 捕获阶段拦截浏览器默认右键菜单
    // 使用 capture:true 保证比其它任何监听器都先执行，全页面生效
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    }, { capture: true });

    // ============================================================
    // ✅ 建组 / 解组 / 锁定 按钮 & 右键菜单 & 快捷键绑定
    // ============================================================
    (function bindGroupLockUI() {
        const btnGroup = document.getElementById('btn-group-layers');
        const btnUngroup = document.getElementById('btn-ungroup-layers');
        if (btnGroup) {
            btnGroup.addEventListener('click', () => {
                const gid = state.groupSelected();
                if (gid) {
                    renderCanvas();
                    renderLayerList();
                    if (typeof showBgToast === 'function') showBgToast('✅ 已建组');
                }
            });
        }
        if (btnUngroup) {
            btnUngroup.addEventListener('click', () => {
                if (state.ungroupSelected()) {
                    renderCanvas();
                    renderLayerList();
                    if (typeof showBgToast === 'function') showBgToast('✅ 已解组');
                }
            });
        }

        const ctxGroup = document.getElementById('ctx-group');
        const ctxUngroup = document.getElementById('ctx-ungroup');
        const ctxLock = document.getElementById('ctx-lock');
        const ctxUnlock = document.getElementById('ctx-unlock');

        // 关闭菜单的快捷方法（菜单现在容器是 <li>，父级就是 .context-menu）
        const closeCtxMenu = () => {
            const m = document.getElementById('context-menu');
            if (m) m.style.display = 'none';
        };

        if (ctxGroup) {
            ctxGroup.addEventListener('click', (e) => {
                e.stopPropagation();
                const gid = state.groupSelected();
                closeCtxMenu();
                if (gid) {
                    renderCanvas(); renderLayerList();
                    if (typeof showBgToast === 'function') showBgToast('✅ 已建组');
                }
            });
        }
        if (ctxUngroup) {
            ctxUngroup.addEventListener('click', (e) => {
                e.stopPropagation();
                state.ungroupSelected();
                closeCtxMenu();
                renderCanvas(); renderLayerList();
            });
        }
        if (ctxLock) {
            ctxLock.addEventListener('click', (e) => {
                e.stopPropagation();
                const ids = state.selectedLayerIds || (state.selectedLayerId ? [state.selectedLayerId] : []);
                ids.forEach(id => state.setLayerLocked(id, true));
                closeCtxMenu();
                renderCanvas(); renderLayerList();
                if (typeof showBgToast === 'function') showBgToast('🔒 已锁定');
            });
        }
        if (ctxUnlock) {
            ctxUnlock.addEventListener('click', (e) => {
                e.stopPropagation();
                const ids = state.selectedLayerIds || (state.selectedLayerId ? [state.selectedLayerId] : []);
                ids.forEach(id => state.setLayerLocked(id, false));
                closeCtxMenu();
                renderCanvas(); renderLayerList();
                if (typeof showBgToast === 'function') showBgToast('🔓 已解锁');
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.target.isContentEditable) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            const ctrl = e.ctrlKey || e.metaKey;
            if (!ctrl) return;
            const k = e.key.toLowerCase();
            if (k === 'g' && e.shiftKey) {
                e.preventDefault();
                state.ungroupSelected();
                renderCanvas(); renderLayerList();
            } else if (k === 'g') {
                e.preventDefault();
                state.groupSelected();
                renderCanvas(); renderLayerList();
            } else if (k === 'l') {
                e.preventDefault();
                const ids = state.selectedLayerIds || (state.selectedLayerId ? [state.selectedLayerId] : []);
                ids.forEach(id => state.toggleLayerLocked(id));
                renderCanvas(); renderLayerList();
            }
        });
    })();
}

function exitAllEditingMode() {
    if (state.editingLayerId) {
        const editableEl = document.querySelector(`.canvas-layer[data-id="${state.editingLayerId}"] .text-content-editable`);
        if (editableEl) {
            // ✅ 修复：跨页时 state.layers 可能不是该图层所在页，改为在全部页中查找
            let layer = state.layers.find(l => l.id === state.editingLayerId);
            if (!layer) {
                for (const p of state.pages) {
                    const found = p.layers.find(l => l.id === state.editingLayerId);
                    if (found) { layer = found; break; }
                }
            }
            if (layer) layer.content = editableEl.innerHTML;
        }
        state.editingLayerId = null;
        state.saveState();
    }
}

function moveLayerToPage(layer, fromPageId, toPageId) {
    const fromPage = state.pages.find(p => p.id === fromPageId);
    const toPage = state.pages.find(p => p.id === toPageId);
    if (!fromPage || !toPage) return false;
    const idx = fromPage.layers.findIndex(l => l.id === layer.id);
    if (idx === -1) return false;
    fromPage.layers.splice(idx, 1);
    toPage.layers.push(layer);
    return true;
}


let _alignGuidesRaf = null;
let _lastAlignPos = null;


function updateAlignGuides(layer, el) {
    const guides = document.getElementById('align-guides');
    if (!guides || !el) return;

    const canvas = el.closest('.cover-canvas');
    if (!canvas) return;

    const cRect = canvas.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();

    const layerCenterX = layer.x + layer.width / 2;
    const layerCenterY = layer.y + layer.height / 2;
    const canvasCenterX = 180;
    const canvasCenterY = 320;

    const SNAP = 6;
    const lines = [];

    if (Math.abs(layerCenterX - canvasCenterX) < SNAP) {
        layer.x = canvasCenterX - layer.width / 2;
        el.style.left = layer.x + 'px';
        lines.push({ type: 'v', pos: cRect.left + canvasCenterX });
    }
    if (Math.abs(layerCenterY - canvasCenterY) < SNAP) {
        layer.y = canvasCenterY - layer.height / 2;
        el.style.top = layer.y + 'px';
        lines.push({ type: 'h', pos: cRect.top + canvasCenterY });
    }
    if (Math.abs(layer.x) < SNAP) {
        layer.x = 0; el.style.left = '0px';
        lines.push({ type: 'v', pos: cRect.left });
    }
    if (Math.abs((layer.x + layer.width) - 360) < SNAP) {
        layer.x = 360 - layer.width; el.style.left = layer.x + 'px';
        lines.push({ type: 'v', pos: cRect.right });
    }
    if (Math.abs(layer.y) < SNAP) {
        layer.y = 0; el.style.top = '0px';
        lines.push({ type: 'h', pos: cRect.top });
    }
    if (Math.abs((layer.y + layer.height) - 640) < SNAP) {
        layer.y = 640 - layer.height; el.style.top = layer.y + 'px';
        lines.push({ type: 'h', pos: cRect.bottom });
    }

    const otherLayers = state.layers.filter(l => l.id !== layer.id);
    otherLayers.forEach(o => {
        const oCenterX = o.x + o.width / 2;
        const oCenterY = o.y + o.height / 2;
        if (Math.abs(layerCenterX - oCenterX) < SNAP) {
            layer.x = oCenterX - layer.width / 2;
            el.style.left = layer.x + 'px';
            lines.push({ type: 'v', pos: cRect.left + oCenterX });
        }
        if (Math.abs(layerCenterY - oCenterY) < SNAP) {
            layer.y = oCenterY - layer.height / 2;
            el.style.top = layer.y + 'px';
            lines.push({ type: 'h', pos: cRect.top + oCenterY });
        }
    });

    if (lines.length > 0) {
        guides.classList.add('active');
        guides.innerHTML = lines.map(l =>
            `<div class="align-guide-line ${l.type}" style="${l.type === 'v' ? `left:${l.pos}px;top:0;height:100vh;` : `top:${l.pos}px;left:0;width:100vw;`}"></div>`
        ).join('');
    } else {
        clearAlignGuides();
    }
}

function clearAlignGuides() {
    const guides = document.getElementById('align-guides');
    if (guides) {
        guides.classList.remove('active');
        guides.innerHTML = '';
    }
}