function initDragAndResize(layer) {
    const canvasContainer = document.getElementById('canvas-container');
    const content = layer.querySelector('.layer-content');

    // 拖拽移动（固定左顶点定位计算）
    layer.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle') || (e.target.classList.contains('layer-content') && document.activeElement === e.target)) {
            return;
        }
        
        document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));
        layer.classList.add('active');
        AppState.activeLayerId = layer.id;

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
            const maxTop = canvasContainer.clientHeight - layer.offsetHeight;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            layer.style.left = newLeft + 'px';
            layer.style.top = newTop + 'px';
        }

        function onMouseUp() {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // 四角缩放字号大小
    const handles = layer.querySelectorAll('.resize-handle:not(.right-edge)');
    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startFontSize = parseFloat(window.getComputedStyle(content).fontSize);

            function onResizeMove(moveEvent) {
                const dx = moveEvent.clientX - startX;
                let newSize = startFontSize + (dx * 0.2);
                newSize = Math.max(12, Math.min(newSize, 120));
                content.style.fontSize = newSize + 'px';
                
                // 同步更新左侧滑动条
                if(layer.id === 'layer-main-title') {
                    const range = document.getElementById('main-font-size');
                    const val = document.getElementById('main-size-val');
                    if(range) range.value = Math.round(newSize);
                    if(val) val.textContent = Math.round(newSize) + 'px';
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

    // 右侧边缘手柄拖拽：仅改变文本框容器的宽度（宽、高变化），而内里字号大小绝对不变
    const rightEdgeHandle = layer.querySelector('.resize-handle.right-edge');
    if(rightEdgeHandle) {
        rightEdgeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startWidth = layer.offsetWidth;

            function onWidthMove(moveEvent) {
                const dx = moveEvent.clientX - startX;
                let newWidth = startWidth + dx;
                newWidth = Math.max(80, Math.min(newWidth, canvasContainer.clientWidth - layer.offsetLeft));
                layer.style.width = newWidth + 'px';
            }

            function onWidthUp() {
                window.removeEventListener('mousemove', onWidthMove);
                window.removeEventListener('mouseup', onWidthUp);
            }

            window.addEventListener('mousemove', onWidthMove);
            window.addEventListener('mouseup', onWidthUp);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.draggable-layer').forEach(layer => {
        initDragAndResize(layer);
    });

    const contextMenu = document.getElementById('context-menu');
    const menuDelete = document.getElementById('menu-delete');
    const menuCopy = document.getElementById('menu-copy');
    let targetLayer = null;

    document.addEventListener('contextmenu', (e) => {
        const layer = e.target.closest('.draggable-layer');
        if (layer) {
            e.preventDefault();
            targetLayer = layer;
            contextMenu.style.display = 'block';
            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.top = e.clientY + 'px';
        } else {
            contextMenu.style.display = 'none';
        }
    });

    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    if (menuDelete) {
        menuDelete.addEventListener('click', () => {
            if (targetLayer && targetLayer.id !== 'layer-main-title') {
                targetLayer.remove();
            } else {
                alert('主标题为核心图层，不能删除！');
            }
        });
    }

    if (menuCopy) {
        menuCopy.addEventListener('click', () => {
            if (targetLayer) {
                const clone = targetLayer.cloneNode(true);
                clone.id = 'layer-' + Date.now();
                clone.style.top = (targetLayer.offsetTop + 20) + 'px';
                clone.style.left = (targetLayer.offsetLeft + 20) + 'px';
                document.getElementById('canvas-container').appendChild(clone);
                initDragAndResize(clone);
            }
        });
    }
});
