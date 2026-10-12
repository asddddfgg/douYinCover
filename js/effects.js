// 特效预设：霓虹发光、赛博机甲、双色渐变、3D立体、故障艺术
document.addEventListener('DOMContentLoaded', () => {
    const effectButtons = document.querySelectorAll('.effect-btn');
    const layerMain = document.getElementById('layer-main-title');
    const layerSub = document.getElementById('layer-sub-title');

    effectButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            effectButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const effect = btn.getAttribute('data-effect');
            AppState.currentEffect = effect;
            applyEffectToLayers(effect);
        });
    });

    function applyEffectToLayers(effect) {
        const mainContent = layerMain.querySelector('.layer-content');
        const subContent = layerSub.querySelector('.layer-content');

        // 清除旧效果
        mainContent.style.cssText = `font-size: ${mainContent.style.fontSize}; color: ${mainContent.style.color};`;
        
        switch(effect) {
            case 'neon':
                mainContent.style.textShadow = '0 0 10px #ff00de, 0 0 20px #ff00de, 0 0 40px #ff00de';
                mainContent.style.color = '#fff';
                break;
            case 'cyber':
                mainContent.style.textShadow = '3px 3px 0px #00ffff, -3px -3px 0px #ff0055';
                mainContent.style.color = '#ffff00';
                break;
            case 'gradient':
                mainContent.style.background = 'linear-gradient(45deg, #ff3b5c, #ffeb3b)';
                mainContent.style.webkitBackgroundClip = 'text';
                mainContent.style.webkitTextFillColor = 'transparent';
                break;
            case 'stereo':
                mainContent.style.textShadow = '2px 2px 0px #333, 4px 4px 0px #222, 6px 6px 0px #111, 8px 8px 10px rgba(0,0,0,0.8)';
                break;
            case 'glitch':
                mainContent.style.textShadow = '2px 0 #ff0055, -2px 0 #00ffff';
                break;
            default:
                mainContent.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
                break;
        }
    }
});
