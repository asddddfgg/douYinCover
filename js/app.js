document.addEventListener('DOMContentLoaded', () => {
    const btnUploadBg = document.getElementById('btn-upload-bg');
    const bgFileInput = document.getElementById('bg-file-input');
    const coverBg = document.getElementById('cover-bg');
    const canvasContainer = document.getElementById('canvas-container');
    const btnToggleSafe = document.getElementById('btn-toggle-safe');
    const safeBottomLine = document.getElementById('safe-bottom-line');

    // 【修改4】：开关评论区防遮挡安全区
    if (btnToggleSafe && safeBottomLine) {
        btnToggleSafe.addEventListener('click', () => {
            AppState.safeAreaEnabled = !AppState.safeAreaEnabled;
            if (AppState.safeAreaEnabled) {
                safeBottomLine.style.display = 'flex';
                btnToggleSafe.classList.add('active');
                btnToggleSafe.innerHTML = '<i class="fa-solid fa-shield-halved"></i> 安全线: 开启';
            } else {
                safeBottomLine.style.display = 'none';
                btnToggleSafe.classList.remove('active');
                btnToggleSafe.innerHTML = '<i class="fa-solid fa-shield-halved"></i> 安全线: 关闭';
            }
            if (typeof rebalanceTextFlow === 'function') rebalanceTextFlow();
        });
    }

    if (btnUploadBg && bgFileInput) {
        btnUploadBg.addEventListener('click', () => bgFileInput.click());

        bgFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imageUrl = event.target.result;
                    coverBg.style.backgroundImage = `url(${imageUrl})`;
                    coverBg.style.backgroundColor = 'transparent';
                    AppState.bgImage = imageUrl;
                    LocalDB.saveProject(AppState);
                    if (typeof rebalanceTextFlow === 'function') rebalanceTextFlow();
                };
                reader.readAsDataURL(file);
            }
        });
    }

    const btnTemplates = document.getElementById('btn-templates');
    const templateModal = document.getElementById('template-modal');
    const closeTemplateModal = document.getElementById('close-template-modal');
    const templateGrid = document.getElementById('template-grid');

    if (btnTemplates && templateModal) {
        btnTemplates.addEventListener('click', () => {
            templateModal.style.display = 'flex';
            renderTemplates();
        });
        closeTemplateModal.addEventListener('click', () => templateModal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === templateModal) templateModal.style.display = 'none'; });
    }

    function renderTemplates() {
        templateGrid.innerHTML = '';
        AppState.templates.forEach(tpl => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.innerHTML = `
                <div class="template-thumb" style="background: ${tpl.bg};"></div>
                <div class="template-info"><strong>${tpl.title}</strong></div>
            `;
            card.addEventListener('click', () => {
                canvasContainer.style.background = tpl.bg;
                AppState.bgColor = tpl.bg;
                AppState.bgImage = "";
                coverBg.style.backgroundImage = "none";
                AppState.fullArticleText = tpl.main;
                AppState.subText = tpl.sub;
                LocalDB.saveProject(AppState);
                if (typeof rebalanceTextFlow === 'function') rebalanceTextFlow();
                templateModal.style.display = 'none';
            });
            templateGrid.appendChild(card);
        });
    }

    // 【修改2】：导出图片彻底清除虚线框、手柄与安全线
    const btnExportCurrent = document.getElementById('btn-export-current');
    if (btnExportCurrent) {
        btnExportCurrent.addEventListener('click', () => {
            document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));
            canvasContainer.classList.add('exporting');

            html2canvas(canvasContainer, { scale: 2, useCORS: true }).then(canvas => {
                canvasContainer.classList.remove('exporting');
                const link = document.createElement('a');
                link.download = `Cover_Page_${AppState.currentPageIndex + 1}_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            });
        });
    }

    // 【修改2 + 8】：一键打包 ZIP 无虚线完整连载变体导出
    const btnExportAllZip = document.getElementById('btn-export-all-zip');
    if (btnExportAllZip) {
        btnExportAllZip.addEventListener('click', async () => {
            document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));
            canvasContainer.classList.add('exporting');

            const zip = new JSZip();
            const folder = zip.folder("douyin_covers_bundle");
            const chunks = AppState.pageChunks || [""];
            const effectKeys = Object.keys(AppState.effectsMap);
            const bgCss = AppState.bgImage ? `url(${AppState.bgImage})` : (AppState.bgColor || "linear-gradient(135deg, #2c3e50, #34495e)");

            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];

                let mainEffKey = AppState.mainEffectKey || 'normal';
                let subEffKey = AppState.subEffectKey || 'normal';

                if (i > 0 && effectKeys.length > 1) {
                    mainEffKey = effectKeys[(effectKeys.indexOf(mainEffKey) + i * 3) % effectKeys.length];
                    subEffKey = effectKeys[(effectKeys.indexOf(subEffKey) + i * 5) % effectKeys.length];
                }

                const mainPreset = AppState.effectsMap[mainEffKey] || {};
                const subPreset = AppState.effectsMap[subEffKey] || {};

                const tmp = document.createElement('div');
                tmp.style.cssText = `position:fixed; top:-9999px; width:360px; height:640px; background:${bgCss}; background-size:cover; background-position:center; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:30px; text-align:center;`;
                tmp.innerHTML = `
                    <div style="font-size:${AppState.mainFontSize}px; font-weight:800; color:${AppState.mainColor}; ${mainPreset.css || ''}; word-break:break-all; margin-bottom:15px;">${chunkText.replace(/\n/g, '<br>')}</div>
                    <div style="font-size:${AppState.subFontSize}px; color:${AppState.subColor}; ${subPreset.css || ''};">${AppState.subText}</div>
                `;
                document.body.appendChild(tmp);

                await new Promise(r => setTimeout(r, 100));

                const canvas = await html2canvas(tmp, { scale: 2, useCORS: true });
                const imgData = canvas.toDataURL('image/png').split(',')[1];
                folder.file(`Cover_${i === 0 ? 'Jia' : 'Yi_' + i}_Page_${i + 1}.png`, imgData, { base64: true });
                document.body.removeChild(tmp);
            }

            canvasContainer.classList.remove('exporting');

            zip.generateAsync({ type: "blob" }).then(content => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `Douyin_Covers_Full_Bundle_${Date.now()}.zip`;
                link.click();
            });
        });
    }
});
