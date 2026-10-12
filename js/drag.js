function initDragAndResize(layer) {
    const canvasContainer = document.getElementById('canvas-container');
    const safeBottomLine = document.getElementById('safe-bottom-line');

    layer.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle')) return;
        
        document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));
        layer.classList.add('active');

        const startX = e.clientX;
        const startY = e.clientY;
        const initialLeft = layer.offsetLeft;
        const initialTop = layer.offsetTop;

        function onMouseMove(moveEvent) {
            let dx = moveEvent.clientX - startX;
            let dy = moveEvent.clientY - startY;

            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            const maxLeft = canvasContainer.clientWidth - layer.offsetWidth;
            let maxAllowedTop = canvasContainer.clientHeight - layer.offsetHeight;

            if (AppState.safeAreaEnabled) {
                const safeLineRect = safeBottomLine.getBoundingClientRect();
                const canvasRect = canvasContainer.getBoundingClientRect();
                maxAllowedTop = safeLineRect.top - canvasRect.top - layer.offsetHeight;
            }

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxAllowedTop));

            layer.style.left = newLeft + 'px';
            layer.style.top = newTop + 'px';

            if (typeof rebalanceTextFlow === 'function') {
                rebalanceTextFlow();
            }
        }

        function onMouseUp() {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // 【修改5】：图层右键上下文菜单事件监听
    layer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));
        layer.classList.add('active');

        const contextMenu = document.getElementById('context-menu');
        if (contextMenu) {
            contextMenu.style.top = e.clientY + 'px';
            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.display = 'flex';
            window.currentRightClickedLayer = layer;
        }
    });

    const handles = layer.querySelectorAll('.resize-handle');
    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const hType = handle.dataset.handle;
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = layer.clientWidth;
            const startHeight = layer.clientHeight;

            function onResizeMove(moveEvent) {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;

                if (hType === 'r' || hType === 'br' || hType === 'tr') {
                    let newWidth = Math.max(100, Math.min(startWidth + dx, canvasContainer.clientWidth - layer.offsetLeft));
                    layer.style.width = newWidth + 'px';
                }

                if (hType === 'b' || hType === 'br' || hType === 'bl') {
                    let maxPossibleHeight = canvasContainer.clientHeight - layer.offsetTop;
                    if (AppState.safeAreaEnabled) {
                        const safeLineRect = safeBottomLine.getBoundingClientRect();
                        const canvasRect = canvasContainer.getBoundingClientRect();
                        maxPossibleHeight = safeLineRect.top - canvasRect.top - layer.offsetTop;
                    }
                    
                    let newHeight = Math.max(60, Math.min(startHeight + dy, maxPossibleHeight));
                    layer.style.height = newHeight + 'px';
                }

                if (typeof rebalanceTextFlow === 'function') {
                    rebalanceTextFlow();
                }
            }

            function onResizeUp() {
                window.removeEventListener('mousemove', onResizeMove);
                window.removeEventListener('mouseup', onResizeUp);
            }

            window.addEventListener('mousemove', onResizeMove);
            window.addEventListener('mouseup', onResizeUp);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.draggable-layer').forEach(layer => {
        initDragAndResize(layer);
    });

    // 右键上下文菜单全局点击消失与功能绑定
    const contextMenu = document.getElementById('context-menu');
    document.addEventListener('click', () => {
        if (contextMenu) contextMenu.style.display = 'none';
    });

    document.getElementById('menu-bring-front')?.addEventListener('click', () => {
        if (window.currentRightClickedLayer) {
            window.currentRightClickedLayer.style.zIndex = 100;
        }
    });

    document.getElementById('menu-send-back')?.addEventListener('click', () => {
        if (window.currentRightClickedLayer) {
            window.currentRightClickedLayer.style.zIndex = 2;
        }
    });

    document.getElementById('menu-duplicate')?.addEventListener('click', () => {
        if (window.currentRightClickedLayer) {
            const clone = window.currentRightClickedLayer.cloneNode(true);
            clone.style.top = (window.currentRightClickedLayer.offsetTop + 20) + 'px';
            clone.style.left = (window.currentRightClickedLayer.offsetLeft + 20) + 'px';
            document.getElementById('canvas-container').appendChild(clone);
            initDragAndResize(clone);
        }
    });

    document.getElementById('menu-delete')?.addEventListener('click', () => {
        if (window.currentRightClickedLayer) {
            // 不允许直接删除主/副标题，仅删除副本或贴纸
            if (window.currentRightClickedLayer.id === 'layer-main-title' || window.currentRightClickedLayer.id === 'layer-sub-title') {
                alert("文本主图层不可删除！");
            } else {
                window.currentRightClickedLayer.remove();
            }
        }
    });
});
