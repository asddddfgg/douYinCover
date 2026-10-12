document.addEventListener('DOMContentLoaded', () => {
    const btnUploadBg = document.getElementById('btn-upload-bg');
    const bgFileInput = document.getElementById('bg-file-input');
    const coverBg = document.getElementById('cover-bg');
    const canvasContainer = document.getElementById('canvas-container');

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

    const btnExportCurrent = document.getElementById('btn-export-current');
    if (btnExportCurrent) {
        btnExportCurrent.addEventListener('click', () => {
            const safeLine = document.getElementById('safe-bottom-line');
            if (safeLine) safeLine.style.display = 'none';

            html2canvas(canvasContainer, { scale: 2, useCORS: true }).then(canvas => {
                if (safeLine) safeLine.style.display = 'flex';
                const link = document.createElement('a');
                link.download = `Flow_Cover_Page_${AppState.currentPageIndex + 1}_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            });
        });
    }

    const btnExportAllZip = document.getElementById('btn-export-all-zip');
    if (btnExportAllZip) {
        btnExportAllZip.addEventListener('click', async () => {
            const originalIndex = AppState.currentPageIndex;
            const safeLine = document.getElementById('safe-bottom-line');
            if (safeLine) safeLine.style.display = 'none';
            
            const zip = new JSZip();
            const folder = zip.folder("flow_douyin_covers");
            const chunks = AppState.pageChunks || [""];

            const styleMeta = (window.EFFECT_STYLES && window.EFFECT_STYLES[AppState.currentEffect]) || { css: "text-shadow: 2px 2px 4px rgba(0,0,0,0.8);" };
            const bgCss = AppState.bgImage ? `url(${AppState.bgImage})` : (AppState.bgColor || "linear-gradient(135deg, #2c3e50, #34495e)");

            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];
                const tmp = document.createElement('div');
                tmp.style.cssText = `position:fixed; top:-9999px; width:360px; height:640px; background:${bgCss}; background-size:cover; background-position:center; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:30px; text-align:center;`;
                tmp.innerHTML = `
                    <div style="font-size:${AppState.mainFontSize}px; font-weight:800; color:${AppState.mainColor}; ${styleMeta.css}; word-break:break-all; margin-bottom:15px;">${chunkText.replace(/\n/g, '<br>')}</div>
                    <div style="font-size:${AppState.subFontSize}px; color:${AppState.subColor}; text-shadow:1px 1px 2px rgba(0,0,0,0.8);">${AppState.subText} (${i + 1}/${chunks.length})</div>
                `;
                document.body.appendChild(tmp);

                await new Promise(r => setTimeout(r, 100));

                const canvas = await html2canvas(tmp, { scale: 2, useCORS: true });
                const imgData = canvas.toDataURL('image/png').split(',')[1];
                folder.file(`Cover_Page_${i + 1}.png`, imgData, { base64: true });
                document.body.removeChild(tmp);
            }

            if (safeLine) safeLine.style.display = 'flex';
            AppState.currentPageIndex = originalIndex;
            if (typeof rebalanceTextFlow === 'function') rebalanceTextFlow();

            zip.generateAsync({ type: "blob" }).then(content => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = `Flow_Douyin_Covers_Bundle_${Date.now()}.zip`;
                link.click();
            });
        });
    }
});
