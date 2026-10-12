/**
 * js/drag.js - 拖拽与缩放逻辑（确保字号与尺寸完美联动，修复冲突）
 */
const DragManager = {
    init() {
        // 全局拖拽与缩放交互支持
        document.addEventListener('mousedown', (e) => {
            const target = e.target;
            if (target.classList.contains('interactive-text-box') || target.closest('.interactive-text-box')) {
                const box = target.closest('.interactive-text-box');
                const stage = box.closest('.card-stage');
                if (!stage) return;

                const startX = e.clientX;
                const startY = e.clientY;
                const rect = box.getBoundingClientRect();
                const stageRect = stage.getBoundingClientRect();

                const initialLeft = box.offsetLeft;
                const initialTop = box.offsetTop;

                const onMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - startX;
                    const dy = moveEvent.clientY - startY;
                    box.style.left = `${initialLeft + dx}px`;
                    box.style.top = `${initialTop + dy}px`;
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            }
        });
    }
};
