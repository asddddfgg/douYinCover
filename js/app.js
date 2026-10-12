document.addEventListener('DOMContentLoaded', () => {
    const btnUploadBg = document.getElementById('btn-upload-bg');
    const bgFileInput = document.getElementById('bg-file-input');
    const coverBg = document.getElementById('cover-bg');

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

                    if (typeof updateSidebarRight === 'function') {
                        updateSidebarRight();
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 模板库
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
                applyTemplate(tpl);
                templateModal.style.display = 'none';
            });
            templateGrid.appendChild(card);
        });
    }

    function applyTemplate(tpl) {
        const canvasContainer = document.getElementById('canvas-container');
        canvasContainer.style.background = tpl.bg;
        AppState.bgColor = tpl.bg;
        AppState.bgImage = "";
        coverBg.style.backgroundImage = "none";

        document.getElementById('main-title-text').value = tpl.main;
        document.getElementById('sub-title-text').value = tpl.sub;

        document.getElementById('main-title-text').dispatchEvent(new Event('input'));
    }

    // 自定义特效
    const btnCustomStyle = document.getElementById('btn-custom-style');
    const customModal = document.getElementById('custom-style-modal');
    const closeCustomModal = document.getElementById('close-custom-modal');
    const btnSaveCustom = document.getElementById('btn-save-custom-style');

    if (btnCustomStyle && customModal) {
        btnCustomStyle.addEventListener('click', () => customModal.style.display = 'flex');
        closeCustomModal.addEventListener('click', () => customModal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === customModal) customModal.style.display = 'none'; });

        btnSaveCustom.addEventListener('click', () => {
            const name = document.getElementById('custom-style-name').value.trim();
            const shadow = document.getElementById('custom-style-shadow').value.trim();
            const color = document.getElementById('custom-style-color').value.trim();

            if (!name) {
                alert("请输入风格名称");
                return;
            }

            const effectKey = 'custom_' + Date.now();
            const effectPresetsContainer = document.getElementById('effect-presets');
            
            const newBtn = document.createElement('button');
            newBtn.className = 'effect-btn';
            newBtn.setAttribute('data-effect', effectKey);
            newBtn.textContent = name;
            newBtn.dataset.customStyle = JSON.stringify({ shadow, color });

            // 同时注册到全局 EFFECT_STYLES
            if (window.EFFECT_STYLES) {
                window.EFFECT_STYLES[effectKey] = {
                    name: name,
                    css: `${shadow ? 'text-shadow: '+shadow+';' : ''} ${color ? (color.includes('gradient') ? 'background:'+color+'; -webkit-background-clip:text; -webkit-text-fill-color:transparent;' : 'color:'+color+';') : ''}`
                };
            }

            effectPresetsContainer.appendChild(newBtn);
            customModal.style.display = 'none';

            if (typeof window.bindEffectClicks === 'function') {
                window.bindEffectClicks();
            }

            newBtn.click();
        });
    }

    // 导出无虚线框、无安全线文字的高清图片
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const container = document.getElementById('canvas-container');
            // 临时取消所有图层的选中激活状态（去掉红框和控制柄）
            document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));

            html2canvas(container, { scale: 2, useCORS: true }).then(canvas => {
                const link = document.createElement('a');
                link.download = `DouyinCover_Clean_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(err => {
                console.error("导出失败", err);
                alert("导出图片失败，请重试");
            });
        });
    }
});
