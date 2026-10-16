// Professional Canva-style Drag + Corner Scale + Edge Width & Height Resize
function initDragModule() {
    const container = document.querySelector('.canvas-container');
    if (!container) return;

    let isDragging = false;
    let isResizing = false;
    let resizeMode = null; // 'corner' | 'edge'
    let resizeDirection = null;
    let dragLayer = null;
    let startX = 0, startY = 0;
    let initX = 0, initY = 0;
    let initWidth = 0, initHeight = 0;
    let initFontSize = 28;
    let pendingDrag = false; 
    let hasMovedOrResized = false;

    container.addEventListener('mousedown', (e) => {
        if (e.target.isContentEditable || e.target.closest('.editing')) {
            return;
        }

        // ========== 四角缩放手柄 ==========
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
            startX = e.clientX;
            startY = e.clientY;
            initWidth = dragLayer.width || 280;
            initHeight = dragLayer.height || 100;
            initX = dragLayer.x;
            initY = dragLayer.y;
            initFontSize = parseFloat(dragLayer.fontSize) || 28;
            hasMovedOrResized = false;
            return;
        }

        // ========== 四边中点调整手柄（支持左右、上下自由推拉） ==========
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
            startX = e.clientX;
            startY = e.clientY;
            initWidth = dragLayer.width || 280;
            initHeight = dragLayer.height || 100;
            initX = dragLayer.x;
            initY = dragLayer.y;
            hasMovedOrResized = false;
            return;
        }

        // ========== 点击空白处 ==========
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
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(null);
            return;
        }

        const layerId = targetLayer.dataset.id;
        
        const pageWrapper = targetLayer.closest('.canvas-page-wrapper');
        if (pageWrapper) {
            const pageId = pageWrapper.dataset.pageId;
            if (pageId && state.currentPageId !== pageId) {
                state.switchPage(pageId);
            }
        }

        const alreadySelected = (state.selectedLayerId === layerId);

        if (!alreadySelected) {
            exitAllEditingMode();
            state.selectedLayerId = layerId;
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
        } else {
            state.selectedLayerId = layerId;
        }

        dragLayer = state.getSelectedLayer();
        if (!dragLayer) return;

        if (e.button === 2) {
            e.preventDefault();
            const menu = document.getElementById('context-menu');
            if (menu) {
                menu.style.display = 'block';
                menu.style.left = e.pageX + 'px';
                menu.style.top = e.pageY + 'px';
            }
            return;
        }

        pendingDrag = true;
        isDragging = false;
        hasMovedOrResized = false;
        startX = e.clientX;
        startY = e.clientY;
        initX = dragLayer.x;
        initY = dragLayer.y;
    });

    document.addEventListener('mousemove', (e) => {
        if (pendingDrag && dragLayer && !isResizing) {
            const dx0 = e.clientX - startX;
            const dy0 = e.clientY - startY;
            if (Math.abs(dx0) > 4 || Math.abs(dy0) > 4) {
                pendingDrag = false;
                isDragging = true;
            }
        }

        if (isResizing && dragLayer) {
            hasMovedOrResized = true;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (resizeMode === 'corner') {
                let scale = 1;
                if (resizeDirection === 'se') {
                    scale = Math.max(0.3, (initWidth + dx) / initWidth);
                } else if (resizeDirection === 'sw') {
                    scale = Math.max(0.3, (initWidth - dx) / initWidth);
                } else if (resizeDirection === 'ne') {
                    scale = Math.max(0.3, (initWidth + dx) / initWidth);
                } else if (resizeDirection === 'nw') {
                    scale = Math.max(0.3, (initWidth - dx) / initWidth);
                }

                const newW = Math.max(60, initWidth * scale);
                const newH = Math.max(30, initHeight * scale);
                const newFont = Math.max(10, Math.round(initFontSize * scale));

                if (resizeDirection.includes('w')) {
                    dragLayer.x = initX + (initWidth - newW);
                }
                if (resizeDirection.includes('n')) {
                    dragLayer.y = initY + (initHeight - newH);
                }

                dragLayer.width = newW;
                dragLayer.height = newH;
                if (dragLayer.type === 'text') {
                    dragLayer.fontSize = newFont + 'px';
                }

            } else if (resizeMode === 'edge') {
                if (resizeDirection === 'right') {
                    dragLayer.width = Math.max(60, initWidth + dx);
                } else if (resizeDirection === 'left') {
                    const newW = Math.max(60, initWidth - dx);
                    dragLayer.x = initX + (initWidth - newW);
                    dragLayer.width = newW;
                } else if (resizeDirection === 'bottom') {
                    dragLayer.height = Math.max(30, initHeight + dy);
                } else if (resizeDirection === 'top') {
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
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            dragLayer.x = initX + dx;
            dragLayer.y = initY + dy;

            const el = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${dragLayer.id}"]`);
            if (el) {
                el.style.left = dragLayer.x + 'px';
                el.style.top = dragLayer.y + 'px';
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging || isResizing || pendingDrag) {
            if ((isDragging || isResizing) && hasMovedOrResized) {
                state.saveState(); // 拖拽或缩放结束后保存历史记录栈
            }
            isDragging = false;
            isResizing = false;
            pendingDrag = false;
            hasMovedOrResized = false;
            resizeMode = null;
            dragLayer = null;
            updateTopToolbarUI(state.getSelectedLayer());
        }
    });

    container.addEventListener('contextmenu', (e) => e.preventDefault());
}

function exitAllEditingMode() {
    if (state.editingLayerId) {
        const editableEl = document.querySelector(`.canvas-layer[data-id="${state.editingLayerId}"] .text-content-editable`);
        if (editableEl) {
            const layer = state.layers.find(l => l.id === state.editingLayerId);
            if (layer) {
                layer.content = editableEl.innerHTML;
            }
        }
        state.editingLayerId = null;
        state.saveState();
    }
}