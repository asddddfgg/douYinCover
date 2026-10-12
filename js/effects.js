// 20 Art Effects Library
const ART_EFFECTS = [
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

function initEffectsLibrary() {
    const grid = document.getElementById('effects-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    ART_EFFECTS.forEach(eff => {
        const card = document.createElement('div');
        card.className = `effect-card ${eff.id}`;
        card.innerText = eff.name;
        card.dataset.effectId = eff.id;
        
        card.addEventListener('click', () => {
            const layer = state.getSelectedLayer();
            if (!layer || layer.type !== 'text') {
                alert('请先在画布中点击选中一个【文本图层】！');
                return;
            }
            layer.effectClass = eff.id;
            
            document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            renderCanvas();
            renderLayerList();
        });
        
        grid.appendChild(card);
    });
}
