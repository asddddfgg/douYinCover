document.addEventListener('DOMContentLoaded', () => {
    const effectButtons = document.querySelectorAll('.effect-btn');
    const layerMain = document.getElementById('layer-main-title');
    const layerSub = document.getElementById('layer-sub-title');

    // 绑定内置与动态特效按钮点击
    function bindEffectClicks() {
        document.querySelectorAll('.effect-btn').forEach(btn => {
            // 避免重复绑定
            if (btn.dataset.bound) return;
            btn.dataset.bound = "true";

            btn.addEventListener('click', () => {
                document.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const effect = btn.getAttribute('data-effect');
                AppState.currentEffect = effect;
                applyEffectToLayers(effect, btn.dataset.customStyle);
                
                // 触发右侧卡片实时同步预览更新
                if (typeof updateSyncCards === 'function') {
                    updateSyncCards();
                }
            });
        });
    }

    bindEffectClicks();
    window.bindEffectClicks = bindEffectClicks;

    function applyEffectToLayers(effect, customStyleObj = null) {
        const mainContent = layerMain.querySelector('.layer-content');
        
        // 重置基础样式
        mainContent.style.cssText = `font-size: ${mainContent.style.fontSize}; color: ${mainContent.style.color};`;
        mainContent.style.background = 'none';
        mainContent.style.webkitBackgroundClip = 'initial';
        mainContent.style.webkitTextFillColor = 'initial';

        if (customStyleObj) {
            if (customStyleObj.shadow) mainContent.style.textShadow = customStyleObj.shadow;
            if (customStyleObj.color) {
                if (customStyleObj.color.includes('gradient')) {
                    mainContent.style.background = customStyleObj.color;
                    mainContent.style.webkitBackgroundClip = 'text';
                    mainContent.style.webkitTextFillColor = 'transparent';
                } else {
                    mainContent.style.color = customStyleObj.color;
                }
            }
            return;
        }

        switch(effect) {
            case 'gradient':
                mainContent.style.background = 'linear-gradient(45deg, #ff3b5c, #ffeb3b)';
                mainContent.style.webkitBackgroundClip = 'text';
                mainContent.style.webkitTextFillColor = 'transparent';
                break;
            case 'neon':
                mainContent.style.textShadow = '0 0 10px #ff00de, 0 0 20px #ff00de, 0 0 40px #ff00de';
                mainContent.style.color = '#fff';
                break;
            case 'stereo':
                mainContent.style.textShadow = '2px 2px 0px #333, 4px 4px 0px #222, 6px 6px 0px #111, 8px 8px 10px rgba(0,0,0,0.8)';
                break;
            case 'cyber':
                mainContent.style.textShadow = '3px 3px 0px #00ffff, -3px -3px 0px #ff0055';
                mainContent.style.color = '#ffff00';
                break;
            case 'glitch':
                mainContent.style.textShadow = '2px 0 #ff0055, -2px 0 #00ffff';
                break;
            case 'retro':
                mainContent.style.textShadow = '3px 3px 0px #d35400, 6px 6px 0px #c0392b';
                mainContent.style.color = '#f1c40f';
                break;
            case 'gold':
                mainContent.style.background = 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)';
                mainContent.style.webkitBackgroundClip = 'text';
                mainContent.style.webkitTextFillColor = 'transparent';
                mainContent.style.textShadow = '2px 2px 4px rgba(0,0,0,0.6)';
                break;
            case 'fire':
                mainContent.style.textShadow = '0 0 8px #ff4500, 0 0 20px #ff8c00, 0 0 35px #ff0000';
                mainContent.style.color = '#ffe4b5';
                break;
            default:
                mainContent.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
                break;
        }
    }

    window.applyEffectToLayers = applyEffectToLayers;
});
