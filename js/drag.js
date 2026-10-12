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
            const safeLineRect = safeBottomLine.getBoundingClientRect();
            const canvasRect = canvasContainer.getBoundingClientRect();
            const maxAllowedTop = safeLineRect.top - canvasRect.top - layer.offsetHeight;

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

    // 处理右边缘 (宽度) 和底边缘 (高度) 的手感拖拽，实现实时文本流推挤/拉吸
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
                    let newWidth = Math.max(120, Math.min(startWidth + dx, canvasContainer.clientWidth - layer.offsetLeft));
                    layer.style.width = newWidth + 'px';
                }

                if (hType === 'b' || hType === 'br' || hType === 'bl') {
                    const safeLineRect = safeBottomLine.getBoundingClientRect();
                    const canvasRect = canvasContainer.getBoundingClientRect();
                    const maxPossibleHeight = safeLineRect.top - canvasRect.top - layer.offsetTop;
                    
                    let newHeight = Math.max(80, Math.min(startHeight + dy, maxPossibleHeight));
                    layer.style.height = newHeight + 'px';
                }

                // 在拖拽手感改变框体尺寸时，实时重新重排文本流！
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
});
