document.addEventListener('DOMContentLoaded', () => {
    const mainInput = document.getElementById('main-title-text');
    const subInput = document.getElementById('sub-title-text');
    const mainSize = document.getElementById('main-font-size');
    const mainSizeVal = document.getElementById('main-size-val');
    const subSize = document.getElementById('sub-font-size');
    const subSizeVal = document.getElementById('sub-size-val');
    const mainColor = document.getElementById('main-text-color');
    const subColor = document.getElementById('sub-text-color');

    const layerMain = document.getElementById('layer-main-title');
    const layerSub = document.getElementById('layer-sub-title');
    const mainContent = document.getElementById('main-layer-content');
    const subContent = document.getElementById('sub-layer-content');
    const coverBg = document.getElementById('cover-bg');
    const canvasContainer = document.getElementById('canvas-container');
    const safeBottomLine = document.getElementById('safe-bottom-line');

    // 精确二分 DOM 排版测量引擎
    function rebalanceTextFlow() {
        const fullArticle = AppState.fullArticleText || "";
        if (!fullArticle) {
            AppState.pageChunks = [""];
            renderCurrentPage();
            return;
        }

        const layerMainTop = layerMain.offsetTop;
        const layerMainWidth = layerMain.clientWidth;
        const layerMainHeight = layerMain.clientHeight;

        let maxAllowedBottomPx = layerMainTop + layerMainHeight;
        if (AppState.safeAreaEnabled) {
            const safeLineRect = safeBottomLine.getBoundingClientRect();
            const canvasRect = canvasContainer.getBoundingClientRect();
            maxAllowedBottomPx = Math.min(maxAllowedBottomPx, safeLineRect.top - canvasRect.top);
        }

        const testContainer = document.createElement('div');
        testContainer.style.cssText = `
            position: absolute;
            visibility: hidden;
            left: ${layerMain.offsetLeft}px;
            top: ${layerMainTop}px;
            width: ${layerMainWidth}px;
            font-size: ${AppState.mainFontSize}px;
            font-weight: 800;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-all;
            padding: 6px;
            box-sizing: border-box;
        `;
        canvasContainer.appendChild(testContainer);

        const chunks = [];
        let remainingText = fullArticle;

        while (remainingText.length > 0) {
            testContainer.textContent = remainingText;

            if (testContainer.clientHeight <= (maxAllowedBottomPx - layerMainTop)) {
                chunks.push(remainingText);
                break;
            }

            let low = 0;
            let high = remainingText.length;
            let bestCutIndex = 1;

            while (low <= high) {
                let mid = Math.floor((low + high) / 2);
                testContainer.textContent = remainingText.substring(0, mid);

                if (testContainer.clientHeight <= (maxAllowedBottomPx - layerMainTop)) {
                    bestCutIndex = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            let textToCut = remainingText.substring(0, bestCutIndex);
            let naturalBreak = textToCut.lastIndexOf('\n');
            if (naturalBreak > bestCutIndex * 0.6) {
                bestCutIndex = naturalBreak + 1;
            }

            chunks.push(remainingText.substring(0, bestCutIndex));
            remainingText = remainingText.substring(bestCutIndex);
        }

        canvasContainer.removeChild(testContainer);
        AppState.pageChunks = chunks;

        if (AppState.currentPageIndex >= chunks.length) {
            AppState.currentPageIndex = Math.max(0, chunks.length - 1);
        }

        renderCurrentPage();
    }

    window.rebalanceTextFlow = rebalanceTextFlow;

    function renderCurrentPage() {
        const chunks = AppState.pageChunks || [""];
        const curText = chunks[AppState.currentPageIndex] || "";

        mainInput.value = AppState.fullArticleText;
        subInput.value = AppState.subText;
        mainSize.value = AppState.mainFontSize;
        mainSizeVal.textContent = AppState.mainFontSize + 'px';
        subSize.value = AppState.subFontSize;
        subSizeVal.textContent = AppState.subFontSize + 'px';
        mainColor.value = AppState.mainColor;
        subColor.value = AppState.subColor;

        mainContent.textContent = curText;
        mainContent.style.fontSize = AppState.mainFontSize + 'px';
        mainContent.style.color = AppState.mainColor;

        // 【修改3】：彻底移除 (1/2), (2/2) 页码后缀，保持纯净副标题！
        subContent.textContent = AppState.subText;
        subContent.style.fontSize = AppState.subFontSize + 'px';
        subContent.style.color = AppState.subColor;

        // 应用图层特效
        if (typeof applyEffectToElement === 'function') {
            applyEffectToElement(mainContent, AppState.mainEffectKey || AppState.currentEffect);
            applyEffectToElement(subContent, AppState.subEffectKey || AppState.currentEffect);
        }

        if (AppState.bgImage) {
            coverBg.style.backgroundImage = `url(${AppState.bgImage})`;
            coverBg.style.backgroundColor = 'transparent';
        } else if (AppState.bgColor) {
            canvasContainer.style.background = AppState.bgColor;
            coverBg.style.backgroundImage = 'none';
        }

        updateSidebarRight(chunks);
    }

    // 【修改8】：图层特效变体组合算法（生成甲图主特效，乙/丙图自动多组特效变体）
    function updateSidebarRight(chunks) {
        const container = document.getElementById('sidebar-right-content');
        if (!container) return;
        container.innerHTML = '';

        const effectKeys = Object.keys(AppState.effectsMap);
        const bgCss = AppState.bgImage ? `url(${AppState.bgImage})` : (AppState.bgColor || "linear-gradient(135deg, #2c3e50, #34495e)");

        chunks.forEach((chunkText, idx) => {
            const isCurrent = idx === AppState.currentPageIndex;

            // 主图甲保留用户设定的特效A/B/C，后续连载图自动分配特效组合变体（A2B3C1等）
            let mainEffKey = AppState.mainEffectKey || 'normal';
            let subEffKey = AppState.subEffectKey || 'normal';

            if (idx > 0 && effectKeys.length > 1) {
                mainEffKey = effectKeys[(effectKeys.indexOf(mainEffKey) + idx * 3) % effectKeys.length];
                subEffKey = effectKeys[(effectKeys.indexOf(subEffKey) + idx * 5) % effectKeys.length];
            }

            const mainPreset = AppState.effectsMap[mainEffKey] || {};
            const subPreset = AppState.effectsMap[subEffKey] || {};

            const cardEl = document.createElement('div');
            cardEl.className = `matrix-card ${isCurrent ? 'active-page-card' : ''}`;

            cardEl.innerHTML = `
                <div class="matrix-thumb" style="background: ${bgCss}; background-size: cover; background-position: center;">
                    <div style="font-size: 11px; font-weight: 800; ${mainPreset.css || ''}; word-break: break-all; padding: 4px; overflow:hidden; max-height:130px;">${chunkText}</div>
                    <div style="font-size: 8px; color: ${AppState.subColor}; ${subPreset.css || ''}; margin-top: 2px;">${AppState.subText}</div>
                </div>
                <div class="matrix-card-info">
                    <div class="matrix-card-header">${idx === 0 ? '甲图 (主风格)' : '乙/丙连载图 #' + (idx + 1)}</div>
                    <div class="matrix-card-sub">正文特效: ${mainPreset.name || '默认'}<br>副标特效: ${subPreset.name || '默认'}</div>
                    <button class="btn-select-page ${isCurrent ? 'active' : ''}" data-idx="${idx}">${isCurrent ? '编辑中' : '切换预览'}</button>
                </div>
            `;

            cardEl.querySelector('.matrix-thumb').addEventListener('click', () => {
                AppState.currentPageIndex = idx;
                renderCurrentPage();
            });

            cardEl.querySelector('.btn-select-page').addEventListener('click', () => {
                AppState.currentPageIndex = idx;
                renderCurrentPage();
            });

            container.appendChild(cardEl);
        });
    }

    [mainInput, subInput, mainSize, subSize, mainColor, subColor].forEach(el => {
        if (el) {
            el.addEventListener('input', () => {
                AppState.fullArticleText = mainInput.value;
                AppState.subText = subInput.value;
                AppState.mainFontSize = parseInt(mainSize.value);
                AppState.mainColor = mainColor.value;
                AppState.subFontSize = parseInt(subSize.value);
                AppState.subColor = subColor.value;
                LocalDB.saveProject(AppState);
                rebalanceTextFlow();
            });
        }
    });

    setTimeout(rebalanceTextFlow, 150);
});
