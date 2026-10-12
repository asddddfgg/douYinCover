document.addEventListener('DOMContentLoaded', () => {
    const mainInput = document.getElementById('main-title-text');
    const subInput = document.getElementById('sub-title-text');
    const mainSize = document.getElementById('main-font-size');
    const mainSizeVal = document.getElementById('main-size-val');
    const subSize = document.getElementById('sub-font-size');
    const subSizeVal = document.getElementById('sub-size-val');
    const mainColor = document.getElementById('main-text-color');
    const mainStroke = document.getElementById('main-stroke-color');
    const subColor = document.getElementById('sub-text-color');

    const layerMain = document.getElementById('layer-main-title');
    const layerSub = document.getElementById('layer-sub-title');

    function updateAllSync() {
        const mText = mainInput.value;
        const sText = subInput.value;

        layerMain.querySelector('.layer-content').textContent = mText;
        layerSub.querySelector('.layer-content').textContent = sText;

        layerMain.querySelector('.layer-content').style.fontSize = mainSize.value + 'px';
        layerMain.querySelector('.layer-content').style.color = mainColor.value;
        mainSizeVal.textContent = mainSize.value + 'px';

        layerSub.querySelector('.layer-content').style.fontSize = subSize.value + 'px';
        layerSub.querySelector('.layer-content').style.color = subColor.value;
        subSizeVal.textContent = subSize.value + 'px';

        AppState.mainText = mText;
        AppState.subText = sText;
        LocalDB.saveProject(AppState);

        updateSyncCards();
    }

    // 多卡片实时同步预览：与一键特效风格、文案、背景等完美联动
    function updateSyncCards() {
        const container = document.getElementById('sync-cards-container');
        if (!container) return;

        // 获取当前选中的特效风格名称
        const activeEffectBtn = document.querySelector('.effect-btn.active');
        const effectName = activeEffectBtn ? activeEffectBtn.textContent : '默认样式';
        
        // 获取当前画布背景
        const canvasContainer = document.getElementById('canvas-container');
        const currentBg = canvasContainer.style.background || AppState.bgColor;
        const currentBgImage = AppState.bgImage ? `url(${AppState.bgImage})` : currentBg;

        const mText = mainInput.value;
        const sText = subInput.value;
        const mColor = mainColor.value;
        const sColor = subColor.value;

        // 多卡片样式定义（包含不同特效风格与比例卡片）
        const cards = [
            { id: 1, title: "竖屏封面 (9:16) - " + effectName, ratio: "9:16", width: "90px", height: "160px" },
            { id: 2, title: "横屏封面 (16:9) - " + effectName, ratio: "16:9", width: "160px", height: "90px" },
            { id: 3, title: "正方形封面 (1:1) - " + effectName, ratio: "1:1", width: "120px", height: "120px" }
        ];

        container.innerHTML = '';
        cards.forEach(card => {
            const el = document.createElement('div');
            el.className = 'sync-card';
            el.innerHTML = `
                <div class="sync-card-thumb" style="width: ${card.width}; height: ${card.height}; background: ${currentBgImage}; background-size: cover; background-position: center;">
                    <div class="sync-card-title" style="color: ${mColor};">${mText}</div>
                    <div class="sync-card-sub" style="color: ${sColor};">${sText}</div>
                </div>
                <div class="sync-card-info">
                    <span class="sync-card-tag">${card.ratio}</span>
                    <span class="sync-card-title">${card.title}</span>
                </div>
            `;
            container.appendChild(el);
        });
    }

    window.updateSyncCards = updateSyncCards;

    [mainInput, subInput, mainSize, subSize, mainColor, mainStroke, subColor].forEach(el => {
        if (el) {
            el.addEventListener('input', updateAllSync);
        }
    });

    document.querySelectorAll('.draggable-layer .layer-content').forEach(content => {
        content.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            content.focus();
        });
    });

    updateAllSync();
});
