// ============================================================
// background-presets.js
// 高质量背景预设库（>= 60 款）+ 智能推荐关键词映射
// ============================================================

const BG_PRESETS = [
    // ---------- 热门爆款 hot (12) ----------
    { id: 'hot-01', cat: 'hot', name: '抖音红蓝', type: 'gradient', color1: '#ff2442', color2: '#2575fc', angle: 135, texture: 'none' },
    { id: 'hot-02', cat: 'hot', name: '爆炸橙黄', type: 'gradient', color1: '#ff4500', color2: '#ffcc00', angle: 120, texture: 'noise' },
    { id: 'hot-03', cat: 'hot', name: '霓虹紫粉', type: 'gradient', color1: '#ff00de', color2: '#7b1fa2', angle: 145, texture: 'none' },
    { id: 'hot-04', cat: 'hot', name: '热血赤金', type: 'gradient', color1: '#b71c1c', color2: '#ffb300', angle: 100, texture: 'noise' },
    { id: 'hot-05', cat: 'hot', name: '赛博蓝紫', type: 'gradient', color1: '#00e5ff', color2: '#7c4dff', angle: 160, texture: 'none' },
    { id: 'hot-06', cat: 'hot', name: '黑金爆款', type: 'gradient', color1: '#0a0a0a', color2: '#c9a227', angle: 130, texture: 'noise' },
    { id: 'hot-07', cat: 'hot', name: '烈焰红黑', type: 'gradient', color1: '#ff1744', color2: '#1a0000', angle: 110, texture: 'vignette' },
    { id: 'hot-08', cat: 'hot', name: '电光青红', type: 'gradient', color1: '#00fff0', color2: '#ff2442', angle: 140, texture: 'none' },
    { id: 'hot-09', cat: 'hot', name: '紫金尊享', type: 'gradient', color1: '#4a148c', color2: '#ffb300', angle: 150, texture: 'noise' },
    { id: 'hot-10', cat: 'hot', name: '粉红冲击', type: 'gradient', color1: '#ff6ec4', color2: '#7873f5', angle: 120, texture: 'none' },
    { id: 'hot-11', cat: 'hot', name: '黄金耀世', type: 'gradient', color1: '#f7971e', color2: '#ffd200', angle: 135, texture: 'noise' },
    { id: 'hot-12', cat: 'hot', name: '暗夜霓虹', type: 'gradient', color1: '#0f0c29', color2: '#ff00de', angle: 155, texture: 'none' },

    // ---------- 清新文艺 fresh (12) ----------
    { id: 'fresh-01', cat: 'fresh', name: '奶油日光', type: 'gradient', color1: '#fdfbfb', color2: '#ebedee', angle: 135, texture: 'none' },
    { id: 'fresh-02', cat: 'fresh', name: '莫兰迪绿', type: 'gradient', color1: '#a8c0b8', color2: '#d9e4dd', angle: 130, texture: 'none' },
    { id: 'fresh-03', cat: 'fresh', name: '晨雾粉紫', type: 'gradient', color1: '#ffdde1', color2: '#ee9ca7', angle: 140, texture: 'none' },
    { id: 'fresh-04', cat: 'fresh', name: '清爽薄荷', type: 'gradient', color1: '#a8e6cf', color2: '#dcedc1', angle: 120, texture: 'none' },
    { id: 'fresh-05', cat: 'fresh', name: '天空淡蓝', type: 'gradient', color1: '#e0f7fa', color2: '#80deea', angle: 135, texture: 'none' },
    { id: 'fresh-06', cat: 'fresh', name: '燕麦奶咖', type: 'gradient', color1: '#f5efe0', color2: '#d2b48c', angle: 125, texture: 'noise' },
    { id: 'fresh-07', cat: 'fresh', name: '樱花微光', type: 'gradient', color1: '#fce4ec', color2: '#f8bbd0', angle: 145, texture: 'dots' },
    { id: 'fresh-08', cat: 'fresh', name: '青柠苏打', type: 'gradient', color1: '#e8f5e9', color2: '#a5d6a7', angle: 130, texture: 'none' },
    { id: 'fresh-09', cat: 'fresh', name: '薄暮灰蓝', type: 'gradient', color1: '#dbe2ef', color2: '#a3b1c6', angle: 135, texture: 'none' },
    { id: 'fresh-10', cat: 'fresh', name: '蜜桃乌龙', type: 'gradient', color1: '#ffe0c7', color2: '#ffb88c', angle: 120, texture: 'none' },
    { id: 'fresh-11', cat: 'fresh', name: '雾霭青灰', type: 'gradient', color1: '#cfd9df', color2: '#e2ebf0', angle: 140, texture: 'noise' },
    { id: 'fresh-12', cat: 'fresh', name: '抹茶拿铁', type: 'gradient', color1: '#d4e0c2', color2: '#a3b18a', angle: 130, texture: 'none' },

    // ---------- 暗黑高级 dark (12) ----------
    { id: 'dark-01', cat: 'dark', name: '纯黑极简', type: 'solid', color1: '#0a0a0a', angle: 135, texture: 'none' },
    { id: 'dark-02', cat: 'dark', name: '深空黑蓝', type: 'gradient', color1: '#000000', color2: '#1a237e', angle: 145, texture: 'vignette' },
    { id: 'dark-03', cat: 'dark', name: '黑金奢华', type: 'gradient', color1: '#0d0d0d', color2: '#8d6e00', angle: 130, texture: 'noise' },
    { id: 'dark-04', cat: 'dark', name: '暗夜紫调', type: 'gradient', color1: '#0f0c29', color2: '#302b63', angle: 150, texture: 'none' },
    { id: 'dark-05', cat: 'dark', name: '午夜墨绿', type: 'gradient', color1: '#001510', color2: '#0b3d2e', angle: 140, texture: 'noise' },
    { id: 'dark-06', cat: 'dark', name: '暗红血夜', type: 'gradient', color1: '#1a0000', color2: '#5c0011', angle: 130, texture: 'vignette' },
    { id: 'dark-07', cat: 'dark', name: '灰阶高级', type: 'gradient', color1: '#1c1c1c', color2: '#4a4a4a', angle: 135, texture: 'noise' },
    { id: 'dark-08', cat: 'dark', name: '深蓝星河', type: 'gradient', color1: '#020111', color2: '#202a5e', angle: 145, texture: 'dots' },
    { id: 'dark-09', cat: 'dark', name: '碳灰金属', type: 'gradient', color1: '#232526', color2: '#414345', angle: 130, texture: 'grid' },
    { id: 'dark-10', cat: 'dark', name: '暗夜霓虹紫', type: 'gradient', color1: '#12002b', color2: '#4a00e0', angle: 155, texture: 'none' },
    { id: 'dark-11', cat: 'dark', name: '墨黑青边', type: 'gradient', color1: '#000000', color2: '#00bcd4', angle: 120, texture: 'vignette' },
    { id: 'dark-12', cat: 'dark', name: '深棕暖黑', type: 'gradient', color1: '#1b0a00', color2: '#3e2723', angle: 135, texture: 'noise' },

    // ---------- 渐变炫彩 neon (12) ----------
    { id: 'neon-01', cat: 'neon', name: '赛博幻彩', type: 'gradient', color1: '#ff00de', color2: '#00e5ff', angle: 130, texture: 'none' },
    { id: 'neon-02', cat: 'neon', name: '彩虹光谱', type: 'gradient', color1: '#ff512f', color2: '#dd2476', angle: 120, texture: 'noise' },
    { id: 'neon-03', cat: 'neon', name: '青紫潮流', type: 'gradient', color1: '#00c6ff', color2: '#0072ff', angle: 140, texture: 'none' },
    { id: 'neon-04', cat: 'neon', name: '橙粉霓虹', type: 'gradient', color1: '#ff9a9e', color2: '#fad0c4', angle: 135, texture: 'dots' },
    { id: 'neon-05', cat: 'neon', name: '紫罗兰电光', type: 'gradient', color1: '#7b1fa2', color2: '#00e5ff', angle: 150, texture: 'none' },
    { id: 'neon-06', cat: 'neon', name: '熔岩流光', type: 'gradient', color1: '#ff4500', color2: '#ff00de', angle: 125, texture: 'noise' },
    { id: 'neon-07', cat: 'neon', name: '极光青绿', type: 'gradient', color1: '#00ff87', color2: '#60efff', angle: 135, texture: 'none' },
    { id: 'neon-08', cat: 'neon', name: '霓虹黄紫', type: 'gradient', color1: '#f9d423', color2: '#ff4e50', angle: 130, texture: 'noise' },
    { id: 'neon-09', cat: 'neon', name: '蓝粉双生', type: 'gradient', color1: '#43cea2', color2: '#185a9d', angle: 145, texture: 'none' },
    { id: 'neon-10', cat: 'neon', name: '彩虹糖', type: 'gradient', color1: '#f857a6', color2: '#ff5858', angle: 120, texture: 'dots' },
    { id: 'neon-11', cat: 'neon', name: '电光蓝紫', type: 'gradient', color1: '#1e3c72', color2: '#2a5298', angle: 140, texture: 'grid' },
    { id: 'neon-12', cat: 'neon', name: '流光青洋红', type: 'gradient', color1: '#ff0844', color2: '#00e5ff', angle: 155, texture: 'none' },

    // ---------- 纯色极简 solid (8) ----------
    { id: 'solid-01', cat: 'solid', name: '纯黑', type: 'solid', color1: '#000000', angle: 135, texture: 'none' },
    { id: 'solid-02', cat: 'solid', name: '纯白', type: 'solid', color1: '#ffffff', angle: 135, texture: 'none' },
    { id: 'solid-03', cat: 'solid', name: '抖音红', type: 'solid', color1: '#ff2442', angle: 135, texture: 'none' },
    { id: 'solid-04', cat: 'solid', name: '天空蓝', type: 'solid', color1: '#2575fc', angle: 135, texture: 'none' },
    { id: 'solid-05', cat: 'solid', name: '活力橙', type: 'solid', color1: '#ff6b00', angle: 135, texture: 'none' },
    { id: 'solid-06', cat: 'solid', name: '薄荷绿', type: 'solid', color1: '#11998e', angle: 135, texture: 'none' },
    { id: 'solid-07', cat: 'solid', name: '奶油杏', type: 'solid', color1: '#f5e6d3', angle: 135, texture: 'none' },
    { id: 'solid-08', cat: 'solid', name: '高级灰', type: 'solid', color1: '#6b7280', angle: 135, texture: 'none' },

    // ---------- 节日/季节 festival (10) ----------
    { id: 'fest-01', cat: 'festival', name: '春节红金', type: 'gradient', color1: '#b71c1c', color2: '#ffd700', angle: 130, texture: 'noise' },
    { id: 'fest-02', cat: 'festival', name: '圣诞红绿', type: 'gradient', color1: '#c62828', color2: '#1b5e20', angle: 140, texture: 'dots' },
    { id: 'fest-03', cat: 'festival', name: '樱花粉春', type: 'gradient', color1: '#ffdde1', color2: '#f8a5c2', angle: 135, texture: 'dots' },
    { id: 'fest-04', cat: 'festival', name: '盛夏橙蓝', type: 'gradient', color1: '#ff9a44', color2: '#00c6ff', angle: 125, texture: 'none' },
    { id: 'fest-05', cat: 'festival', name: '秋叶金黄', type: 'gradient', color1: '#d38312', color2: '#a83279', angle: 130, texture: 'noise' },
    { id: 'fest-06', cat: 'festival', name: '冬日雪蓝', type: 'gradient', color1: '#e0eafc', color2: '#cfdef3', angle: 145, texture: 'none' },
    { id: 'fest-07', cat: 'festival', name: '万圣橙黑', type: 'gradient', color1: '#ff6d00', color2: '#1a1a1a', angle: 135, texture: 'vignette' },
    { id: 'fest-08', cat: 'festival', name: '中秋月金', type: 'gradient', color1: '#0d0d0d', color2: '#e6b800', angle: 140, texture: 'dots' },
    { id: 'fest-09', cat: 'festival', name: '情人节粉', type: 'gradient', color1: '#ff416c', color2: '#ff4b2b', angle: 130, texture: 'dots' },
    { id: 'fest-10', cat: 'festival', name: '国庆红黄', type: 'gradient', color1: '#de0f17', color2: '#ffcc00', angle: 135, texture: 'noise' },

    // ---------- 知识干货 knowledge (10) ----------
    { id: 'know-01', cat: 'knowledge', name: '冷静科技蓝', type: 'gradient', color1: '#0f2027', color2: '#2c5364', angle: 140, texture: 'grid' },
    { id: 'know-02', cat: 'knowledge', name: '理性灰蓝', type: 'gradient', color1: '#232526', color2: '#2b5876', angle: 130, texture: 'none' },
    { id: 'know-03', cat: 'knowledge', name: '学术深蓝', type: 'gradient', color1: '#1a2980', color2: '#26d0ce', angle: 145, texture: 'none' },
    { id: 'know-04', cat: 'knowledge', name: '极简白灰', type: 'gradient', color1: '#f5f7fa', color2: '#c3cfe2', angle: 135, texture: 'none' },
    { id: 'know-05', cat: 'knowledge', name: '墨蓝讲义', type: 'gradient', color1: '#141e30', color2: '#243b55', angle: 130, texture: 'grid' },
    { id: 'know-06', cat: 'knowledge', name: '青灰干货', type: 'gradient', color1: '#3a7bd5', color2: '#3a6073', angle: 140, texture: 'none' },
    { id: 'know-07', cat: 'knowledge', name: '深空知识', type: 'gradient', color1: '#000428', color2: '#004e92', angle: 150, texture: 'dots' },
    { id: 'know-08', cat: 'knowledge', name: '暗青专业', type: 'gradient', color1: '#0b3d4f', color2: '#1e6f5c', angle: 135, texture: 'noise' },
    { id: 'know-09', cat: 'knowledge', name: '灰紫学术', type: 'gradient', color1: '#3c1053', color2: '#ad5389', angle: 130, texture: 'none' },
    { id: 'know-10', cat: 'knowledge', name: '钢蓝理性', type: 'gradient', color1: '#1c92d2', color2: '#f2fcfe', angle: 145, texture: 'none' }
];

const SMART_KEYWORD_MAP = [
    { keys: ['赚钱', '副业', '暴富', '收入', '月入', '财富', '搞钱', '生意', '创业', '投资', '理财'], presets: ['dark-03', 'hot-06', 'hot-11', 'hot-09'] },
    { keys: ['治愈', '温暖', '生活', '日常', '幸福', '慢生活', '温柔', '阳光'], presets: ['fresh-01', 'fresh-06', 'fresh-10', 'fresh-07'] },
    { keys: ['科技', '未来', 'ai', '人工智能', '元宇宙', '数码', '编程', '代码', '芯片'], presets: ['neon-03', 'neon-01', 'dark-02', 'know-01'] },
    { keys: ['知识', '干货', '学习', '教程', '方法', '技巧', '攻略', '指南', '笔记'], presets: ['know-01', 'know-05', 'know-02', 'know-06'] },
    { keys: ['励志', '努力', '坚持', '奋斗', '梦想', '逆袭', '自律', '成长'], presets: ['hot-04', 'hot-07', 'dark-01', 'hot-02'] },
    { keys: ['美食', '吃', '探店', '食谱', '料理', '烹饪', '餐厅'], presets: ['hot-02', 'fest-05', 'fresh-10', 'fresh-01'] },
    { keys: ['旅行', '旅游', '风景', '海边', '山', '户外', '露营'], presets: ['fresh-05', 'neon-09', 'know-10', 'fresh-09'] },
    { keys: ['情感', '爱情', '恋爱', '分手', '婚姻', '心动'], presets: ['fest-09', 'fresh-07', 'neon-04', 'fresh-03'] },
    { keys: ['健身', '运动', '减肥', '瘦', '跑步', '瑜伽', '锻炼'], presets: ['hot-02', 'neon-07', 'hot-01', 'fresh-04'] },
    { keys: ['母婴', '育儿', '宝宝', '孩子', '亲子', '教育'], presets: ['fresh-01', 'fresh-07', 'fresh-03', 'fest-03'] },
    { keys: ['职场', '工作', '面试', '简历', '升职', 'offer'], presets: ['know-05', 'know-08', 'know-01', 'dark-09'] },
    { keys: ['穿搭', '时尚', '美妆', '护肤', '化妆', '变美'], presets: ['fresh-03', 'neon-04', 'neon-10', 'fresh-12'] },
    { keys: ['搞笑', '娱乐', '沙雕', '段子', '幽默', '梗'], presets: ['hot-02', 'neon-08', 'neon-04', 'hot-10'] },
    { keys: ['数码', '手机', '电脑', '测评', '评测', '开箱'], presets: ['know-01', 'dark-09', 'neon-03', 'dark-02'] },
    { keys: ['读书', '书籍', '阅读', '认知', '思维', '笔记'], presets: ['know-04', 'fresh-06', 'know-02', 'know-09'] }
];

const SMART_EFFECT_MAP = {
    'effect-neon':         ['dark-01', 'dark-10', 'neon-01', 'neon-03', 'hot-12'],
    'effect-fire':         ['hot-07', 'hot-02', 'hot-04', 'dark-06', 'hot-08'],
    'effect-ice':          ['fest-06', 'fresh-05', 'neon-03', 'know-10', 'fresh-09'],
    'effect-gold':         ['dark-03', 'dark-12', 'hot-11', 'fest-08', 'hot-04'],
    'effect-metal':        ['dark-09', 'dark-01', 'know-05', 'dark-07'],
    'effect-cyber':        ['neon-01', 'neon-03', 'hot-05', 'dark-10', 'neon-11'],
    'effect-glitch':       ['dark-10', 'neon-01', 'hot-12', 'neon-03'],
    'effect-3d':           ['hot-01', 'hot-02', 'hot-04', 'neon-02'],
    'effect-hk':           ['hot-04', 'dark-06', 'fest-01'],
    'effect-purple-mist':  ['neon-05', 'dark-04', 'neon-12'],
    'effect-black-stroke': ['hot-01', 'dark-01', 'hot-02', 'hot-07', 'neon-08'],
    'effect-viral':        ['hot-01', 'hot-06', 'hot-07', 'hot-11'],
    'effect-lightning':    ['hot-05', 'neon-08', 'neon-11', 'hot-09'],
    'effect-red-stroke':   ['hot-01', 'hot-07', 'hot-12', 'fest-01']
};

const DEFAULT_BACKGROUND = {
    type: 'gradient',
    color1: '#ff2442',
    color2: '#2575fc',
    imageUrl: '',
    angle: 135,
    texture: 'none',
    presetId: null,
    fit: 'cover',
    scale: 1,
    positionX: 50,
    positionY: 50,
    blur: 0,
    overlayColor: '#000000',
    overlayOpacity: 0,
    overlayType: 'solid',
    overlayStops: [
        { pos: 0, color: '#FFF9F0', opacity: 0.12 },
        { pos: 0.40, color: '#FFF9F0', opacity: 0.05 },
        { pos: 1, color: '#F0E6D8', opacity: 0.35 }
    ],
    overlayAngle: 180,
    overlayCenter: { x: 50, y: 40 },
    colorFilter: 'none'
};

window.BG_PRESETS = BG_PRESETS;
window.SMART_KEYWORD_MAP = SMART_KEYWORD_MAP;
window.SMART_EFFECT_MAP = SMART_EFFECT_MAP;
window.DEFAULT_BACKGROUND = DEFAULT_BACKGROUND;