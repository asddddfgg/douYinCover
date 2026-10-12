document.addEventListener('DOMContentLoaded', () => {
    const presetsContainer = document.getElementById('effect-presets');
    const mainSelect = document.getElementById('main-layer-effect-select');
    const subSelect = document.getElementById('sub-layer-effect-select');
    const btnAddEffect = document.getElementById('btn-add-custom-effect');
    const effectCountEl = document.getElementById('effect-count');

    function renderEffectsUI() {
        if (!presetsContainer) return;
        presetsContainer.innerHTML = '';
        mainSelect.innerHTML = '';
        subSelect.innerHTML = '';

        const keys = Object.keys(AppState.effectsMap);
        if (effectCountEl) effectCountEl.textContent = keys.length;

        keys.forEach(key => {
            const effect = AppState.effectsMap[key];

            // 1. 渲染全局按钮
            const btn = document.createElement('button');
            btn.className = `effect-btn ${AppState.currentEffect === key ? 'active' : ''}`;
            btn.setAttribute('data-effect', key);
            btn.textContent = effect.name;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                AppState.currentEffect = key;
                // 全局应用
                applyEffectToElement(document.getElementById('main-layer-content'), key);
                applyEffectToElement(document.getElementById('sub-layer-content'), key);
                AppState.mainEffectKey = key;
                AppState.subEffectKey = key;
                mainSelect.value = key;
                subSelect.value = key;
                if (typeof rebalanceTextFlow === 'function') rebalanceTextFlow();
            });
            presetsContainer.appendChild(btn);

            // 2. 渲染主/副图层独立下拉选择框
            const opt1 = new Option(effect.name, key);
            const opt2 = new Option(effect.name, key);
            mainSelect.add(opt1);
            subSelect.add(opt2);
        });

        mainSelect.value = AppState.mainEffectKey || 'normal';
        subSelect.value = AppState.subEffectKey || 'normal';
    }

    function applyEffectToElement(el, effectKey) {
        if (!el) return;
        const preset = AppState.effectsMap[effectKey] || AppState.effectsMap['normal'];
        el.style.background = 'none';
        el.style.webkitBackgroundClip = 'initial';
        el.style.webkitTextFillColor = 'initial';
        el.style.textShadow = 'none';
        el.style.webkitTextStroke = 'initial';
        
        if (preset && preset.css) {
            el.style.cssText += ';' + preset.css;
        }
    }

    window.applyEffectToElement = applyEffectToElement;
    window.renderEffectsUI = renderEffectsUI;

    mainSelect.addEventListener('change', (e) => {
        AppState.mainEffectKey = e.target.value;
        applyEffectToElement(document.getElementById('main-layer-content'), e.target.value);
        if (typeof rebalanceTextFlow === 'function') rebalanceTextFlow();
    });

    subSelect.addEventListener('change', (e) => {
        AppState.subEffectKey = e.target.value;
        applyEffectToElement(document.getElementById('sub-layer-content'), e.target.value);
        if (typeof rebalanceTextFlow === 'function') rebalanceTextFlow();
    });

    if (btnAddEffect) {
        btnAddEffect.addEventListener('click', () => {
            const name = prompt("请输入新特效名称 (例: 炫彩金光):");
            if (!name) return;
            const css = prompt("请输入 CSS 样式 (例: color: #ff00ff; text-shadow: 0 0 5px #00ffff;):");
            if (!css) return;

            const newKey = "custom_" + Date.now();
            AppState.effectsMap[newKey] = { name: name, css: css };
            LocalDB.saveProject(AppState);
            renderEffectsUI();
            alert("自定义特效添加成功！");
        });
    }

    renderEffectsUI();
});
