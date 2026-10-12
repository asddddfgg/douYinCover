// 拖拽、安全线限制、四边/四角缩放控制
function initDragAndResize(layer) {
    const canvasContainer = document.getElementById('canvas-container');
    const content = layer.querySelector('.layer-content');

    layer.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle') || e.target.classList.contains('layer-content') && document.activeElement === e.target) {
            return; // 点在手柄或正在编辑文本时不触发拖拽面板
        }
        
        document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));
        layer.classList.add('active');
        AppState.activeLayerId = layer.id;

        const startX = e.clientX;
        const startY = e.clientY;
        
        const rect = layer.getBoundingClientRect();
        const containerRect = canvasContainer.getBoundingClientRect();

        let initialLeft = layer.offsetLeft;
        let initialTop = layer.offsetTop;

        function onMouseMove(moveEvent) {
            let dx = moveEvent.clientX - startX;
            let dy = moveEvent.clientY - startY;

            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            // 限制不能超出整个编辑画面 (安全区域边界约束)
            const maxLeft = canvasContainer.clientWidth - layer.offsetWidth;
            const maxTop = canvasContainer.clientHeight - layer.offsetHeight;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            layer.style.left = newLeft + 'px';
            layer.style.top = newTop + 'px';
            layer.style.transform = 'none';
        }

        function onMouseUp() {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // 缩放逻辑 (支持从四个角/右下角拖拽缩放)
    const handles = layer.querySelectorAll('.resize-handle');
    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startFontSize = parseFloat(window.getComputedStyle(content).fontSize);

            function onResizeMove(moveEvent) {
                const dx = moveEvent.clientX - startX;
                // 根据拖拽距离计算字体缩放
                let newSize = startFontSize + (dx * 0.2);
                newSize = Math.max(12, Math.min(newSize, 120));
                content.style.fontSize = newSize + 'px';
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

    // 右键菜单与复制/删除逻辑
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
