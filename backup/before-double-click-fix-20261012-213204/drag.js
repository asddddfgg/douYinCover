// Professional Canva Drag, Resize & Double-Click Inline ContentEditable Interaction
function initDragModule() {
    const wrapper = document.getElementById('layers-wrapper');
    if (!wrapper) return;

    let isDragging = false;
    let isResizing = false;
    let resizeDirection = null;
    let dragLayer = null;
    let startX = 0, startY = 0;
    let initX = 0, initY = 0;
    let initWidth = 0, initHeight = 0;

    wrapper.addEventListener('mousedown', (e) => {
        // If clicking inside an element currently in inline editing mode, allow text selection and cursor movement
        if (e.target.isContentEditable || e.target.closest('.editing')) {
            return;
        }

        // Check if clicking a 4-corner resize handle
        const handle = e.target.closest('.resize-handle');
        if (handle) {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            resizeDirection = handle.dataset.direction;
            const targetEl = handle.closest('.canvas-layer');
            dragLayer = state.layers.find(l => l.id === targetEl.dataset.id);
            startX = e.clientX;
            startY = e.clientY;
            initWidth = dragLayer.width || 280;
            initHeight = dragLayer.height || 100;
            initX = dragLayer.x;
            initY = dragLayer.y;
            return;
        }

        const targetLayer = e.target.closest('.canvas-layer');
        if (!targetLayer) {
            // Clicked canvas blank area -> exit editing, deselect, hide toolbar
            exitAllEditingMode();
            state.selectedLayerId = null;
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(null);
            return;
        }

        // Single click layer selection
        exitAllEditingMode();
        const layerId = targetLayer.dataset.id;
        state.selectedLayerId = layerId;
        dragLayer = state.getSelectedLayer();

        renderCanvas();
        renderLayerList();
        updateTopToolbarUI(dragLayer);

        if (e.button === 2) {
            // Right click context menu
            e.preventDefault();
            const menu = document.getElementById('context-menu');
            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
            return;
        }

        // Init smooth dragging with exact offset delta
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initX = dragLayer.x;
        initY = dragLayer.y;
    });

    document.addEventListener('mousemove', (e) => {
        if (isResizing && dragLayer) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (resizeDirection.includes('e')) dragLayer.width = Math.max(80, initWidth + dx);
            if (resizeDirection.includes('s')) dragLayer.height = Math.max(40, initHeight + dy);
            
            const el = document.querySelector(`.canvas-layer[data-id="${dragLayer.id}"]`);
            if (el) {
                el.style.width = dragLayer.width + 'px';
                el.style.height = dragLayer.height + 'px';
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
        if (isDragging || isResizing) {
            isDragging = false;
            isResizing = false;
            dragLayer = null;
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
