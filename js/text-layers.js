/**
 * js/text-layers.js - 独立文字图层管理
 */
const TextLayersManager = {
    renderList() {
        const container = document.getElementById('text-layers-list');
        if (!container) return;
        container.innerHTML = '';
        state.textLayers.forEach((layer, index) => {
            const div = document.createElement('div');
            div.className = 'layer-item';
            div.innerHTML = `
                <input type="text" value="${layer.text}" data-id="${layer.id}" class="layer-text-input">
                <input type="color" value="${layer.color}" data-id="${layer.id}" class="layer-color-input" title="图层颜色">
                <div class="layer-actions">
                    <button class="btn-delete-layer" data-id="${layer.id}" title="删除图层"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            container.appendChild(div);
        });

        // Bind events
        container.querySelectorAll('.layer-text-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const id = e.target.dataset.id;
                const layer = state.textLayers.find(l => l.id === id);
                if (layer) {
                    layer.text = e.target.value;
                    StateManager.notify();
                }
            });
        });

        container.querySelectorAll('.layer-color-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const id = e.target.dataset.id;
                const layer = state.textLayers.find(l => l.id === id);
                if (layer) {
                    layer.color = e.target.value;
                    StateManager.notify();
                }
            });
        });

        container.querySelectorAll('.btn-delete-layer').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                state.textLayers = state.textLayers.filter(l => l.id !== id);
                StateManager.notify();
            });
        });
    }
};
