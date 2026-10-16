/* 特效对比实验室 - 第02/03阶段
 * 独立命名空间：ECL_* / ecl-*
 * 不读取或修改主项目 state，不调用主画布渲染，不写入原项目存储。
 */
(function () {
    'use strict';

    const ECL_EFFECTS = [
        { id: 'effect-gradient', name: '双色渐变' },
        { id: 'effect-neon', name: '霓虹发光' },
        { id: 'effect-3d', name: '3D立体' },
        { id: 'effect-cyber', name: '赛博机甲' },
        { id: 'effect-glitch', name: '故障艺术' },
        { id: 'effect-hk', name: '复古港风' },
        { id: 'effect-gold', name: '暗金奢华' },
        { id: 'effect-fire', name: '烈火熔岩' },
        { id: 'effect-ice', name: '寒冰霜冻' },
        { id: 'effect-black-stroke', name: '黑描边粗重' },
        { id: 'effect-purple-mist', name: '紫雾迷幻' },
        { id: 'effect-sunset', name: '日落晚霞' },
        { id: 'effect-deep-sea', name: '深海湛蓝' },
        { id: 'effect-jade', name: '翡翠绿光' },
        { id: 'effect-candy', name: '梦幻糖果' },
        { id: 'effect-metal', name: '重金属风' },
        { id: 'effect-chalk', name: '粉笔手绘' },
        { id: 'effect-lightning', name: '闪电高压' },
        { id: 'effect-red-stroke', name: '红描边爆款' },
        { id: 'effect-viral', name: '王牌爆款' }
    ];

    const ECL_DEFAULT_TEXT = '好大一棵树，绿色的祝福';
    let ECL_TEXT = ECL_DEFAULT_TEXT;
    let ECL_SELECTED_EFFECT = 'effect-gradient';
    let ECL_OPENED = false;

    function eclCreate(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function eclBuildUI() {
        const actions = document.querySelector('.app-header .actions');
        if (actions && !document.getElementById('ecl-open-btn')) {
            const button = eclCreate('button', 'btn', '特效对比实验室');
            button.id = 'ecl-open-btn';
            button.type = 'button';
            button.title = '打开独立的 20 种特效对比面板';
            const icon = eclCreate('i', 'fa-solid fa-flask');
            button.prepend(icon);
            button.addEventListener('click', eclOpen);
            actions.insertBefore(button, actions.firstChild);
        }

        if (document.getElementById('ecl-overlay')) return;
        const overlay = eclCreate('div');
        overlay.id = 'ecl-overlay';
        overlay.setAttribute('aria-hidden', 'true');

        const dialog = eclCreate('section', 'ecl-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'ecl-title');

        const head = eclCreate('div', 'ecl-head');
        const titleWrap = eclCreate('div');
        const title = eclCreate('h2', '', '特效对比实验室 · A 文本');
        title.id = 'ecl-title';
        titleWrap.append(title, eclCreate('div', 'ecl-subtitle', '阶段 02 + 03：独立界面 / 20 种可编辑特效副本'));
        const actionsWrap = eclCreate('div', 'ecl-actions');
        const resetBtn = eclCreate('button', 'ecl-btn', '恢复默认文字');
        resetBtn.type = 'button';
        resetBtn.addEventListener('click', () => {
            ECL_TEXT = ECL_DEFAULT_TEXT;
            const input = document.getElementById('ecl-text-input');
            if (input) input.value = ECL_TEXT;
            eclSyncAll();
        });
        const closeBtn = eclCreate('button', 'ecl-btn', '关闭实验室');
        closeBtn.type = 'button';
        closeBtn.addEventListener('click', eclClose);
        actionsWrap.append(resetBtn, closeBtn);
        head.append(titleWrap, actionsWrap);

        const toolbar = eclCreate('div', 'ecl-toolbar');
        const label = eclCreate('label', '', '统一编辑 A 文本');
        label.htmlFor = 'ecl-text-input';
        const input = eclCreate('input', 'ecl-text-input');
        input.id = 'ecl-text-input';
        input.type = 'text';
        input.value = ECL_TEXT;
        input.maxLength = 300;
        input.placeholder = '输入要对比的文字';
        input.addEventListener('input', () => {
            ECL_TEXT = input.value;
            eclSyncAll();
        });
        const count = eclCreate('span', 'ecl-count', '20 个可操作副本');
        toolbar.append(label, input, count);

        const grid = eclCreate('div', 'ecl-grid');
        grid.id = 'ecl-candidate-grid';
        ECL_EFFECTS.forEach((effect, index) => {
            const card = eclCreate('article', 'ecl-card' + (effect.id === ECL_SELECTED_EFFECT ? ' ecl-selected' : ''));
            card.dataset.effectId = effect.id;
            card.tabIndex = 0;
            card.setAttribute('aria-label', '候选 ' + (index + 1) + '：' + effect.name);

            const cardHead = eclCreate('div', 'ecl-card-head');
            cardHead.append(eclCreate('strong', '', String(index + 1).padStart(2, '0') + ' · ' + effect.name));
            cardHead.append(eclCreate('span', '', effect.id));

            const preview = eclCreate('div', 'ecl-preview');
            const text = eclCreate('div', 'ecl-preview-text ' + effect.id, ECL_TEXT);
            text.contentEditable = 'true';
            text.spellcheck = false;
            text.setAttribute('aria-label', effect.name + '文字编辑区');
            text.addEventListener('input', () => {
                ECL_TEXT = text.innerText;
                const sharedInput = document.getElementById('ecl-text-input');
                if (sharedInput) sharedInput.value = ECL_TEXT;
                eclSyncAll(text);
            });
            text.addEventListener('click', event => event.stopPropagation());
            preview.appendChild(text);

            const foot = eclCreate('div', 'ecl-card-foot');
            foot.append(eclCreate('span', '', '可直接编辑文字'));
            const indicator = eclCreate('span', 'ecl-select-indicator', effect.id === ECL_SELECTED_EFFECT ? '已选中' : '点击选中');
            indicator.dataset.eclIndicator = 'true';
            foot.appendChild(indicator);

            card.append(cardHead, preview, foot);
            card.addEventListener('click', () => eclSelect(effect.id));
            card.addEventListener('keydown', event => {
                if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
                    event.preventDefault();
                    eclSelect(effect.id);
                }
            });
            grid.appendChild(card);
        });

        const note = eclCreate('div', 'ecl-note',
            '本阶段只负责比较和选中特效，不会修改主画布。下一阶段再接入 A/B 文本同步；最终方案应用到主画布将由后续独立步骤实现。');
        dialog.append(head, toolbar, grid, note);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) eclClose();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && ECL_OPENED) eclClose();
        });
        document.body.appendChild(overlay);
        eclSyncAll();
    }

    function eclSyncAll(except) {
        document.querySelectorAll('#ecl-candidate-grid .ecl-preview-text').forEach(text => {
            if (text !== except && text.innerText !== ECL_TEXT) text.innerText = ECL_TEXT;
        });
    }

    function eclSelect(effectId) {
        ECL_SELECTED_EFFECT = effectId;
        document.querySelectorAll('#ecl-candidate-grid .ecl-card').forEach(card => {
            const selected = card.dataset.effectId === effectId;
            card.classList.toggle('ecl-selected', selected);
            const indicator = card.querySelector('[data-ecl-indicator]');
            if (indicator) indicator.textContent = selected ? '已选中' : '点击选中';
        });
    }

    function eclOpen() {
        eclBuildUI();
        const overlay = document.getElementById('ecl-overlay');
        if (!overlay) return;
        overlay.classList.add('ecl-open');
        overlay.setAttribute('aria-hidden', 'false');
        ECL_OPENED = true;
        const input = document.getElementById('ecl-text-input');
        if (input) input.value = ECL_TEXT;
    }

    function eclClose() {
        const overlay = document.getElementById('ecl-overlay');
        if (!overlay) return;
        overlay.classList.remove('ecl-open');
        overlay.setAttribute('aria-hidden', 'true');
        ECL_OPENED = false;
    }

    document.addEventListener('DOMContentLoaded', eclBuildUI);
})();
