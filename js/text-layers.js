document.addEventListener('DOMContentLoaded', () => {
    const mainInput = document.getElementById('main-title-text');
    const subInput = document.getElementById('sub-title-text');
    const mainSize = document.getElementById('main-font-size');
    const mainSizeVal = document.getElementById('main-size-val');
    const subSize = document.getElementById('sub-font-size');
    const subSizeVal = document.getElementById('sub-size-val');
    const mainColor = document.getElementById('main-text-color');
    const subColor = document.getElementById('sub-text-color');
    const paginationModeSelect = document.getElementById('pagination-mode');

    const layerMain = document.getElementById('layer-main-title');
    const layerSub = document.getElementById('layer-sub-title');

    const tabEffects = document.getElementById('tab-effects-matrix');
    const tabCards = document.getElementById('tab-paginated-cards');

    if (tabEffects && tabCards) {
        tabEffects.addEventListener('click', () => {
            tabEffects.classList.add('active');
            tabCards.classList.remove('active');
            AppState.activeTab = 'effects';
            updateSidebarRight();
        });
        tabCards.addEventListener('click', () => {
            tabCards.classList.add('active');
            tabEffects.classList.remove('active');
            AppState.activeTab = 'cards';
            updateSidebarRight();
        });
    }

    function getPaginatedPages() {
        const fullText = mainInput.value;
        const mode = paginationModeSelect.value;
        AppState.paginationMode = mode;

        if (mode === 'manual') {
            // 按回车换行符分页
            return fullText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        } else {
            // 自动按字数分页（每页最多12个字）
            const cleanText = fullText.replace(/\n/g, '');
            const pages = [];
            const chunkSize = 12;
            for (let i = 0; i < cleanText.length; i += chunkSize) {
                pages.push(cleanText.substring(i, i + chunkSize));
            }
            return pages.length > 0 ? pages : [fullText];
        }
    }

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

        updateSidebarRight();
    }

    // 核心右侧面板更新逻辑：支持全特效对比矩阵（带固定/取消固定到前排）以及文本分页卡片预览下载
    function updateSidebarRight() {
        const container = document.getElementById('sidebar-right-content');
        if (!container) return;
        container.innerHTML = '';

        const canvasContainer = document.getElementById('canvas-container');
        const currentBg = canvasContainer.style.background || AppState.bgColor;
        const currentBgImage = AppState.bgImage ? `url(${AppState.bgImage})` : currentBg;
        const sText = subInput.value;
        const sColor = subColor.value;
        const activeEffect = AppState.currentEffect;

        if (AppState.activeTab === 'effects') {
            // 模式1：多特效风格对比矩阵预览
            // 获取所有特效：包括当前选中的主选效果、被固定的效果、以及其它所有效果
            const allEffects = Object.keys(window.EFFECT_STYLES || {});
            
            // 排序：先展示已固定的，再展示当前主选的，最后展示其余未选的
            let sortedEffects = [];
            AppState.pinnedEffects.forEach(eff => { if(!sortedEffects.includes(eff)) sortedEffects.push(eff); });
            if (activeEffect && !sortedEffects.includes(activeEffect)) sortedEffects.push(activeEffect);
            allEffects.forEach(eff => { if(!sortedEffects.includes(eff)) sortedEffects.push(eff); });

            sortedEffects.forEach(effKey => {
                const styleMeta = window.EFFECT_STYLES[effKey];
                if (!styleMeta) return;

                const isPinned = AppState.pinnedEffects.includes(effKey);
                const isMainSelected = effKey === activeEffect;

                const cardEl = document.createElement('div');
                cardEl.className = 'matrix-card';
                if (isMainSelected) cardEl.style.borderColor = '#ff3b5c';

                cardEl.innerHTML = `
                    <div class="matrix-card-header">
                        <span>${styleMeta.name} ${isMainSelected ? '(当前主选)' : ''}</span>
                        <div class="matrix-actions">
                            <button class="btn-pin ${isPinned ? 'pinned' : ''}" data-eff="${effKey}">${isPinned ? '已固定置顶' : '固定效果'}</button>
                            <button class="btn-download-thumb" data-eff="${effKey}"><i class="fa-solid fa-download"></i> 下载卡片</button>
                        </div>
                    </div>
                    <div class="matrix-thumb" style="background: ${currentBgImage};">
                        <div style="font-size: 16px; font-weight: 800; ${styleMeta.css}; word-break: break-all; padding: 10px;">${mainInput.value}</div>
                        <div style="font-size: 11px; color: ${sColor}; margin-top: 6px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">${sText}</div>
                    </div>
                `;

                // 绑定固定按钮事件
                cardEl.querySelector('.btn-pin').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (isPinned) {
                        AppState.pinnedEffects = AppState.pinnedEffects.filter(k => k !== effKey);
                    } else {
                        AppState.pinnedEffects.push(effKey);
                    }
                    updateSidebarRight();
                });

                // 绑定单卡片点击下载事件
                cardEl.querySelector('.btn-download-thumb').addEventListener('click', (e) => {
                    e.stopPropagation();
                    downloadThumbCard(styleMeta, mainInput.value, sText, currentBgImage);
                });

                container.appendChild(cardEl);
            });

        } else {
            // 模式2：文本分页卡片预览
            const pages = getPaginatedPages();
            pages.forEach((pageText, idx) => {
                const cardEl = document.createElement('div');
                cardEl.className = 'matrix-card';
                cardEl.innerHTML = `
                    <div class="matrix-card-header">
                        <span>分页卡片 #${idx + 1}</span>
                        <div class="matrix-actions">
                            <button class="btn-download-thumb" data-page="${idx}"><i class="fa-solid fa-download"></i> 下载此页</button>
                        </div>
                    </div>
                    <div class="matrix-thumb" style="background: ${currentBgImage};">
                        <div style="font-size: 18px; font-weight: 800; color: #fff; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); word-break: break-all; padding: 10px;">${pageText}</div>
                        <div style="font-size: 11px; color: ${sColor}; margin-top: 6px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">${sText}</div>
                    </div>
                `;

                cardEl.querySelector('.btn-download-thumb').addEventListener('click', () => {
                    downloadPageCard(pageText, sText, currentBgImage, idx + 1);
                });

                container.appendChild(cardEl);
            });
        }
    }

    window.updateSidebarRight = updateSidebarRight;

    function downloadThumbCard(styleMeta, mainTxt, subTxt, bgImg) {
        // 创建临时隐藏画布导出单张卡片
        const tmp = document.createElement('div');
        tmp.style.cssText = `position:fixed; top:-9999px; width:360px; height:640px; background:${bgImg}; background-size:cover; background-position:center; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:30px; text-align:center;`;
        tmp.innerHTML = `
            <div style="font-size:28px; font-weight:800; ${styleMeta.css}; word-break:break-all; margin-bottom:15px;">${mainTxt}</div>
            <div style="font-size:16px; color:#ffeb3b; text-shadow:1px 1px 2px rgba(0,0,0,0.8);">${subTxt}</div>
        `;
        document.body.appendChild(tmp);
        html2canvas(tmp, { scale: 2, useCORS: true }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Cover_${styleMeta.name}_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            document.body.removeChild(tmp);
        });
    }

    function downloadPageCard(pageTxt, subTxt, bgImg, pageNum) {
        const tmp = document.createElement('div');
        tmp.style.cssText = `position:fixed; top:-9999px; width:360px; height:640px; background:${bgImg}; background-size:cover; background-position:center; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:30px; text-align:center;`;
        tmp.innerHTML = `
            <div style="font-size:32px; font-weight:800; color:#fff; text-shadow:2px 2px 6px rgba(0,0,0,0.9); word-break:break-all; margin-bottom:15px;">${pageTxt}</div>
            <div style="font-size:16px; color:#ffeb3b; text-shadow:1px 1px 2px rgba(0,0,0,0.8);">${subTxt}</div>
        `;
        document.body.appendChild(tmp);
        html2canvas(tmp, { scale: 2, useCORS: true }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Page_${pageNum}_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            document.body.removeChild(tmp);
        });
    }

    [mainInput, subInput, mainSize, subSize, mainColor, subColor, paginationModeSelect].forEach(el => {
        if (el) {
            el.addEventListener('input', updateAllSync);
            el.addEventListener('change', updateAllSync);
        }
    });

    updateAllSync();
});
