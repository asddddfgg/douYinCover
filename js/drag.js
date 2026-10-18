// Professional Canva-style Drag + Rotate + Corner Scale + Edge Resize + Align Guides + Cross-page Drag
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
    let initPositionsMap = new Map();

    container.addEventListener('mousedown', (e) => {
        if (e.target.isContentEditable || e.target.closest('.editing')) return;

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

        // ========== 点击空白 ==========
        const targetLayer = e.target.closest('.canvas-layer');
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

        pendingDrag = true;
        isDragging = false;
        hasMovedOrResized = false;
        didCrossPage = false;
        startX = e.clientX; startY = e.clientY;
        initX = dragLayer.x; initY = dragLayer.y;

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

            // ===== 跨分页拖拽检测（保持原有逻辑） =====
            const hoveredEl = document.elementFromPoint(e.clientX, e.clientY);
            const hoveredCanvas = hoveredEl ? hoveredEl.closest('.cover-canvas') : null;
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
            updateTopToolbarUI(state.getSelectedLayer());
        }
    });

    // ✅ 修复：在 document 捕获阶段拦截浏览器默认右键菜单
    // 使用 capture:true 保证比其它任何监听器都先执行，全页面生效
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    }, { capture: true });
}

function exitAllEditingMode() {
    if (state.editingLayerId) {
        const editableEl = document.querySelector(`.canvas-layer[data-id="${state.editingLayerId}"] .text-content-editable`);
        if (editableEl) {
            const layer = state.layers.find(l => l.id === state.editingLayerId);
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