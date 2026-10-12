document.addEventListener('DOMContentLoaded', () => {
    const layerMain = document.getElementById('layer-main-title');

    const EFFECT_STYLES = {
        normal: { name: "默认样式", css: "text-shadow: 2px 2px 4px rgba(0,0,0,0.8);" },
        gradient: { name: "双色渐变", css: "background: linear-gradient(45deg, #ff3b5c, #ffeb3b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;" },
        neon: { name: "霓虹发光", css: "text-shadow: 0 0 10px #ff00de, 0 0 20px #ff00de, 0 0 40px #ff00de; color: #fff;" },
        stereo: { name: "3D立体", css: "text-shadow: 2px 2px 0px #333, 4px 4px 0px #222, 6px 6px 0px #111, 8px 8px 10px rgba(0,0,0,0.8);" },
        cyber: { name: "赛博机甲", css: "text-shadow: 3px 3px 0px #00ffff, -3px -3px 0px #ff0055; color: #ffff00;" },
        glitch: { name: "故障艺术", css: "text-shadow: 2px 0 #ff0055, -2px 0 #00ffff;" },
        retro: { name: "复古港风", css: "text-shadow: 3px 3px 0px #d35400, 6px 6px 0px #c0392b; color: #f1c40f;" },
        gold: { name: "暗金奢华", css: "background: linear-gradient(135deg, #f6d365 0%, #fda085 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 2px 2px 4px rgba(0,0,0,0.6);" },
        fire: { name: "烈火熔岩", css: "text-shadow: 0 0 8px #ff4500, 0 0 20px #ff8c00, 0 0 35px #ff0000; color: #ffe4b5;" }
    };

    window.EFFECT_STYLES = EFFECT_STYLES;

    document.querySelectorAll('.effect-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const effect = btn.getAttribute('data-effect');
            AppState.currentEffect = effect;

            const mainContent = document.getElementById('main-layer-content');
            if(mainContent) {
                mainContent.style.cssText = `font-size: ${mainContent.style.fontSize}; color: ${mainContent.style.color};`;
                mainContent.style.background = 'none';
                mainContent.style.webkitBackgroundClip = 'initial';
                mainContent.style.webkitTextFillColor = 'initial';

                const preset = EFFECT_STYLES[effect];
                if (preset) {
                    mainContent.style.cssText += ";" + preset.css;
                }
            }
        });
    });
});
