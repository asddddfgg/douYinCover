// 主应用控制逻辑：背景上传、模板库、导出图片
document.addEventListener('DOMContentLoaded', () => {
    // 1. 本地背景图上传生效
    const btnUploadBg = document.getElementById('btn-upload-bg');
    const bgFileInput = document.getElementById('bg-file-input');
    const coverBg = document.getElementById('cover-bg');
    const thumb1 = document.getElementById('thumb-1');
    const thumb2 = document.getElementById('thumb-2');
    const thumb3 = document.getElementById('thumb-3');

    if (btnUploadBg && bgFileInput) {
        btnUploadBg.addEventListener('click', () => {
            bgFileInput.click();
        });

        bgFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imageUrl = event.target.result;
                    coverBg.style.backgroundImage = `url(${imageUrl})`;
                    coverBg.style.backgroundColor = 'transparent';
                    
                    if (thumb1) thumb1.style.backgroundImage = `url(${imageUrl})`;
                    if (thumb2) thumb2.style.backgroundImage = `url(${imageUrl})`;
                    if (thumb3) thumb3.style.backgroundImage = `url(${imageUrl})`;

                    AppState.bgImage = imageUrl;
                    LocalDB.saveProject(AppState);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 2. 模板库弹窗逻辑
    const btnTemplates = document.getElementById('btn-templates');
    const templateModal = document.getElementById('template-modal');
    const closeTemplateModal = document.getElementById('close-template-modal');
    const templateGrid = document.getElementById('template-grid');

    if (btnTemplates && templateModal) {
        btnTemplates.addEventListener('click', () => {
            templateModal.style.display = 'flex';
            renderTemplates();
        });

        closeTemplateModal.addEventListener('click', () => {
            templateModal.style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target === templateModal) {
                templateModal.style.display = 'none';
            }
        });
    }

    function renderTemplates() {
        templateGrid.innerHTML = '';
        AppState.templates.forEach(tpl => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.innerHTML = `
                <div class="template-thumb" style="background: ${tpl.bg};"></div>
                <div class="template-info">
                    <strong>${tpl.title}</strong>
                </div>
            `;
            card.addEventListener('click', () => {
                applyTemplate(tpl);
                templateModal.style.display = 'none';
            });
            templateGrid.appendChild(card);
        });
    }

    function applyTemplate(tpl) {
        const canvasContainer = document.getElementById('canvas-container');
        canvasContainer.style.background = tpl.bg;
        
        document.getElementById('main-title-text').value = tpl.main;
        document.getElementById('sub-title-text').value = tpl.sub;

        // 触发更新
        document.getElementById('main-title-text').dispatchEvent(new Event('input'));
        document.getElementById('sub-title-text').dispatchEvent(new Event('input'));
    }

    // 3. 导出图片功能
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const container = document.getElementById('canvas-container');
            // 临时隐藏选中框和手柄以便导出高清干净图片
            document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));
            
            html2canvas(container, { scale: 2, useCORS: true }).then(canvas => {
                const link = document.createElement('a');
                link.download = `DouyinCover_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(err => {
                console.error("导出失败", err);
                alert("导出图片失败，请重试");
            });
        });
    }
});
