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

    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    const pageIndicator = document.getElementById('page-indicator');
    const btnRebalance = document.getElementById('btn-rebalance');

    // 核心：基于实际 DOM 测量与物理碰撞算法的动态文本流引擎 (Dynamic Flow Reflow Engine)
    function rebalanceTextFlow() {
        const fullArticle = AppState.fullArticleText || "";
        if (!fullArticle) {
            AppState.pageChunks = [""];
            renderCurrentPage();
            return;
        }

        const safeLineRect = safeBottomLine.getBoundingClientRect();
        const layerMainTop = layerMain.offsetTop;
        const layerMainWidth = layerMain.clientWidth;
        const layerMainHeight = layerMain.clientHeight;

        // 警戒底部：文本框底边与安全线 top 的最小值，确保文字绝对不穿透安全线！
        const canvasRect = canvasContainer.getBoundingClientRect();
        const maxAllowedBottomPx = Math.min(layerMainTop + layerMainHeight, safeLineRect.top - canvasRect.top);

        // 创建隐藏测量容器进行精确字符二分测量
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
            padding: 8px;
            box-sizing: border-box;
        `;
        canvasContainer.appendChild(testContainer);

        const chunks = [];
        let remainingText = fullArticle;

        while (remainingText.length > 0) {
            testContainer.textContent = remainingText;

            // 如果全部文字放入后依然不超过警戒线，直接作为最后一页
            if (testContainer.clientHeight <= (maxAllowedBottomPx - layerMainTop)) {
                chunks.push(remainingText);
                break;
            }

            // 二分搜索找寻刚好填满该页的最大字符切割点
            let low = 0;
            let high = remainingText.length;
            let bestCutIndex = 1;

            while (low <= high) {
                let mid = Math.floor((low + high) / 2);
                testContainer.textContent = remainingText.substring(0, mid);

                if (testContainer.clientHeight <= (maxAllowedBottomPx - layerMainTop)) {
                    bestCutIndex = mid;
                    low = mid + 1; // 尝试放入更多字符
                } else {
                    high = mid - 1; // 溢出了，缩小字符
                }
            }

            // 优先在换行符或自然标点处切断，保证阅读体验
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

        subContent.textContent = AppState.subText + (chunks.length > 1 ? ` (${AppState.currentPageIndex + 1}/${chunks.length})` : '');
        subContent.style.fontSize = AppState.subFontSize + 'px';
        subContent.style.color = AppState.subColor;

        if (AppState.bgImage) {
            coverBg.style.backgroundImage = `url(${AppState.bgImage})`;
            coverBg.style.backgroundColor = 'transparent';
        } else if (AppState.bgColor) {
            canvasContainer.style.background = AppState.bgColor;
            coverBg.style.backgroundImage = 'none';
        }

        document.querySelectorAll('.effect-btn').forEach(b => {
            if (b.getAttribute('data-effect') === (AppState.currentEffect || 'normal')) {
                b.click();
            }
        });

        pageIndicator.textContent = `第 ${AppState.currentPageIndex + 1} / ${chunks.length} 页 (自动流排版)`;
        updateSidebarRight(chunks);
    }

    function updateSidebarRight(chunks) {
        const container = document.getElementById('sidebar-right-content');
        if (!container) return;
        container.innerHTML = '';

        const styleMeta = (window.EFFECT_STYLES && window.EFFECT_STYLES[AppState.currentEffect]) || { css: "text-shadow: 2px 2px 4px rgba(0,0,0,0.8);" };
        const bgCss = AppState.bgImage ? `url(${AppState.bgImage})` : (AppState.bgColor || "linear-gradient(135deg, #2c3e50, #34495e)");

        chunks.forEach((chunkText, idx) => {
            const isCurrent = idx === AppState.currentPageIndex;
            const cardEl = document.createElement('div');
            cardEl.className = `matrix-card ${isCurrent ? 'active-page-card' : ''}`;

            cardEl.innerHTML = `
                <div class="matrix-thumb" style="background: ${bgCss}; background-size: cover; background-position: center;">
                    <div style="font-size: 11px; font-weight: 800; ${styleMeta.css}; word-break: break-all; padding: 4px; overflow:hidden; max-height:140px;">${chunkText}</div>
                    <div style="font-size: 8px; color: ${AppState.subColor}; margin-top: 2px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">${AppState.subText} (${idx + 1}/${chunks.length})</div>
                </div>
                <div class="matrix-card-info">
                    <div class="matrix-card-header">
                        <span>动态流封面 #${idx + 1} ${isCurrent ? '(当前)' : ''}</span>
                    </div>
                    <div class="matrix-actions">
                        <button class="btn-select-page ${isCurrent ? 'active' : ''}" data-idx="${idx}">${isCurrent ? '编辑中' : '切到此页'}</button>
                    </div>
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

    btnPrevPage.addEventListener('click', () => {
        if (AppState.currentPageIndex > 0) {
            AppState.currentPageIndex--;
            renderCurrentPage();
        }
    });

    btnNextPage.addEventListener('click', () => {
        if (AppState.currentPageIndex < (AppState.pageChunks.length - 1)) {
            AppState.currentPageIndex++;
            renderCurrentPage();
        }
    });

    if (btnRebalance) {
        btnRebalance.addEventListener('click', () => {
            rebalanceTextFlow();
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
