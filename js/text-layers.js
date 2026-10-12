// 文本图层、双击编辑、副标题及多卡片同步
document.addEventListener('DOMContentLoaded', () => {
    const mainInput = document.getElementById('main-title-text');
    const subInput = document.getElementById('sub-title-text');
    const mainSize = document.getElementById('main-font-size');
    const mainSizeVal = document.getElementById('main-size-val');
    const subSize = document.getElementById('sub-font-size');
    const subSizeVal = document.getElementById('sub-size-val');
    const mainColor = document.getElementById('main-text-color');
    const mainStroke = document.getElementById('main-stroke-color');
    const subColor = document.getElementById('sub-text-color');

    const layerMain = document.getElementById('layer-main-title');
    const layerSub = document.getElementById('layer-sub-title');

    const thumb1Title = document.querySelector('#thumb-1 .thumb-title');
    const thumb1Sub = document.querySelector('#thumb-1 .thumb-sub');
    const thumb2Title = document.querySelector('#thumb-2 .thumb-title');
    const thumb3Title = document.querySelector('#thumb-3 .thumb-title');

    function updateAllSync() {
        // 同步文本
        const mText = mainInput.value;
        const sText = subInput.value;

        layerMain.querySelector('.layer-content').textContent = mText;
        layerSub.querySelector('.layer-content').textContent = sText;

        if (thumb1Title) thumb1Title.textContent = mText;
        if (thumb1Sub) thumb1Sub.textContent = sText;
        if (thumb2Title) thumb2Title.textContent = mText;
        if (thumb3Title) thumb3Title.textContent = mText;

        // 样式同步
        layerMain.querySelector('.layer-content').style.fontSize = mainSize.value + 'px';
        layerMain.querySelector('.layer-content').style.color = mainColor.value;
        mainSizeVal.textContent = mainSize.value + 'px';

        layerSub.querySelector('.layer-content').style.fontSize = subSize.value + 'px';
        layerSub.querySelector('.layer-content').style.color = subColor.value;
        subSizeVal.textContent = subSize.value + 'px';

        AppState.mainText = mText;
        AppState.subText = sText;
        LocalDB.saveProject(AppState);
    }

    [mainInput, subInput, mainSize, subSize, mainColor, mainStroke, subColor].forEach(el => {
        if (el) {
            el.addEventListener('input', updateAllSync);
        }
    });

    // 双击进入可编辑状态
    document.querySelectorAll('.draggable-layer .layer-content').forEach(content => {
        content.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            content.focus();
        });
    });

    updateAllSync();
});
