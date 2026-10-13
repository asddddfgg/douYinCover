// Professional Canva-style Drag + Corner Scale + Edge Width Resize
// 修复：已选中图层不再强行重绘，保证双击可进入编辑
function initDragModule() {
    const wrapper = document.getElementById('layers-wrapper');
    if (!wrapper) return;

    let isDragging = false;
    let isResizing = false;
    let resizeMode = null; // 'corner' | 'edge'
    let resizeDirection = null;
    let dragLayer = null;
    let startX = 0, startY = 0;
    let initX = 0, initY = 0;
    let initWidth = 0, initHeight = 0;
    let initFontSize = 28;
    let pendingDrag = false; // 鼠标按下后，移动超过阈值才真正拖动

    wrapper.addEventListener('mousedown', (e) => {
        // 正在编辑文字时，完全不拦截（可点选、输入）
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
            dragLayer = state.layers.find(l => l.id === targetEl.dataset.id);
            startX = e.clientX;
            startY = e.clientY;
            initWidth = dragLayer.width || 280;
            initHeight = dragLayer.height || 100;
            initX = dragLayer.x;
            initY = dragLayer.y;
            initFontSize = parseFloat(dragLayer.fontSize) || 28;
            return;
        }

        // ========== 左右边框中点手柄 ==========
        const edgeHandle = e.target.closest('.edge-handle');
        if (edgeHandle) {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            resizeMode = 'edge';
            resizeDirection = edgeHandle.dataset.direction; // left | right
            const targetEl = edgeHandle.closest('.canvas-layer');
            dragLayer = state.layers.find(l => l.id === targetEl.dataset.id);
            startX = e.clientX;
            startY = e.clientY;
            initWidth = dragLayer.width || 280;
            initHeight = dragLayer.height || 100;
            initX = dragLayer.x;
            initY = dragLayer.y;
            return;
        }

        // ========== 点击空白处 ==========
        const targetLayer = e.target.closest('.canvas-layer');
        if (!targetLayer) {
            exitAllEditingMode();
            state.selectedLayerId = null;
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(null);
            return;
        }

        // ========== 点击某个图层 ==========
        const layerId = targetLayer.dataset.id;
        const alreadySelected = (state.selectedLayerId === layerId);

        // 如果点的是别的图层，才退出编辑并重绘
        // 如果点的是已经选中的图层，不要重绘！否则会打断双击
        if (!alreadySelected) {
            exitAllEditingMode();
            state.selectedLayerId = layerId;
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
        } else {
            // 已选中：只保证状态正确，不重绘
            state.selectedLayerId = layerId;
        }

        dragLayer = state.getSelectedLayer();

        // 右键菜单
        if (e.button === 2) {
            e.preventDefault();
            const menu = document.getElementById('context-menu');
            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
            return;
        }

        // 不立刻拖动，等鼠标移动超过 4px 再拖（避免影响双击）
        pendingDrag = true;
        isDragging = false;
        startX = e.clientX;
        startY = e.clientY;
        initX = dragLayer.x;
        initY = dragLayer.y;
    });

    document.addEventListener('mousemove', (e) => {
        // 按下后移动超过阈值，才开始真正拖动
        if (pendingDrag && dragLayer && !isResizing) {
            const dx0 = e.clientX - startX;
            const dy0 = e.clientY - startY;
            if (Math.abs(dx0) > 4 || Math.abs(dy0) > 4) {
                pendingDrag = false;
                isDragging = true;
            }
        }

        if (isResizing && dragLayer) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (resizeMode === 'corner') {
                // 四角：等比缩放（框 + 字号一起变）
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
                // 左右边：只改宽度，文字自动换行
                if (resizeDirection === 'right') {
                    dragLayer.width = Math.max(60, initWidth + dx);
                } else if (resizeDirection === 'left') {
                    const newW = Math.max(60, initWidth - dx);
                    dragLayer.x = initX + (initWidth - newW);
                    dragLayer.width = newW;
                }
            }

            const el = document.querySelector(`.canvas-layer[data-id="${dragLayer.id}"]`);
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
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            dragLayer.x = initX + dx;
            dragLayer.y = initY + dy;

            const el = document.querySelector(`.canvas-layer[data-id="${dragLayer.id}"]`);
            if (el) {
                el.style.left = dragLayer.x + 'px';
                el.style.top = dragLayer.y + 'px';
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging || isResizing || pendingDrag) {
            isDragging = false;
            isResizing = false;
            pendingDrag = false;
            resizeMode = null;
            dragLayer = null;
            updateTopToolbarUI(state.getSelectedLayer());
        }
    });

    wrapper.addEventListener('contextmenu', (e) => e.preventDefault());
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
    }
}