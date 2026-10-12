const AppState = {
    currentPageIndex: 0,
    safeAreaEnabled: true,
    fullArticleText: "爆款涨粉核心秘籍：\n三天突破1万粉丝播放量。\n全网都在寻找的超详细实操干货内容来了！\n无论你的文章有多长，粘贴进来系统会自动基于算法分页。\n你可以针对不同图层分配独特的特效，连载图片将自动生成绚丽的特效组合变体！",
    mainFontSize: 36,
    mainColor: "#ffffff",
    mainEffectKey: "normal",
    
    subText: "关注点赞，干货持续更新",
    subFontSize: 24,
    subColor: "#ffeb3b",
    subEffectKey: "normal",

    currentEffect: "normal",
    bgImage: "",
    bgColor: "linear-gradient(135deg, #2c3e50, #34495e)",

    pageChunks: [],

    // 全局特效集合 (20+ 预设，支持自定义添加)
    effectsMap: {
        normal: { name: "默认样式", css: "text-shadow: 2px 2px 4px rgba(0,0,0,0.8);" },
        gradient: { name: "双色渐变", css: "background: linear-gradient(45deg, #ff3b5c, #ffeb3b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;" },
        neon: { name: "霓虹发光", css: "text-shadow: 0 0 10px #ff00de, 0 0 20px #ff00de, 0 0 40px #ff00de; color: #fff;" },
        stereo: { name: "3D立体", css: "text-shadow: 2px 2px 0px #333, 4px 4px 0px #222, 6px 6px 0px #111, 8px 8px 10px rgba(0,0,0,0.8);" },
        cyber: { name: "赛博机甲", css: "text-shadow: 3px 3px 0px #00ffff, -3px -3px 0px #ff0055; color: #ffff00;" },
        glitch: { name: "故障艺术", css: "text-shadow: 2px 0 #ff0055, -2px 0 #00ffff;" },
        retro: { name: "复古港风", css: "text-shadow: 3px 3px 0px #d35400, 6px 6px 0px #c0392b; color: #f1c40f;" },
        gold: { name: "暗金奢华", css: "background: linear-gradient(135deg, #f6d365 0%, #fda085 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 2px 2px 4px rgba(0,0,0,0.6);" },
        fire: { name: "烈火熔岩", css: "text-shadow: 0 0 8px #ff4500, 0 0 20px #ff8c00, 0 0 35px #ff0000; color: #ffe4b5;" },
        ice: { name: "寒冰霜冻", css: "text-shadow: 0 0 8px #00d2ff, 0 0 20px #00d2ff; color: #e0f7fa;" },
        shadow_box: { name: "黑描边粗重", css: "-webkit-text-stroke: 2px #000000; color: #ffffff;" },
        purple_haze: { name: "紫雾迷幻", css: "text-shadow: 0 0 12px #9c27b0, 0 0 24px #e91e63; color: #ffffff;" },
        sunset: { name: "日落晚霞", css: "background: linear-gradient(to right, #ff7e5f, #feb47b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;" },
        ocean: { name: "深海湛蓝", css: "background: linear-gradient(to right, #2b5876, #4e4376); -webkit-background-clip: text; -webkit-text-fill-color: transparent;" },
        emerald: { name: "翡翠绿光", css: "text-shadow: 0 0 10px #2ecc71, 0 0 20px #2ecc71; color: #ffffff;" },
        candy: { name: "梦幻糖果", css: "background: linear-gradient(45deg, #ff9a9e 0%, #fecfef 99%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;" },
        metal: { name: "重金属风", css: "text-shadow: 1px 1px 1px #ccc, 2px 2px 2px #000; color: #dcdde1;" },
        chalk: { name: "粉笔手绘", css: "text-shadow: 1px 1px 2px rgba(255,255,255,0.6); color: #f5f6fa;" },
        electric: { name: "闪电高压", css: "text-shadow: 0 0 5px #fff, 0 0 10px #fff, 0 0 15px #00bcd4, 0 0 20px #00bcd4; color: #fff;" },
        outline_red: { name: "红描边爆款", css: "-webkit-text-stroke: 2px #ff3b5c; color: #ffffff;" }
    },

    stickersData: [
        { id: 1, cat: "badge", symbol: "🔥", name: "爆款" },
        { id: 2, cat: "badge", symbol: "💯", name: "满分" },
        { id: 3, cat: "badge", symbol: "⭐", name: "推荐" },
        { id: 4, cat: "badge", symbol: "👑", name: "王者" },
        { id: 5, cat: "arrow", symbol: "➡️", name: "右箭头" },
        { id: 6, cat: "arrow", symbol: "⬆️", name: "上箭头" },
        { id: 7, cat: "arrow", symbol: "🔥", name: "涨粉" },
        { id: 8, cat: "arrow", symbol: "👉", name: "点击" },
        { id: 9, cat: "emoji", symbol: "😂", name: "笑哭" },
        { id: 10, cat: "emoji", symbol: "😱", name: "震惊" },
        { id: 11, cat: "emoji", symbol: "🤔", name: "思考" },
        { id: 12, cat: "emoji", symbol: "😎", name: "酷" },
        { id: 13, cat: "hot", symbol: "💰", name: "财富" },
        { id: 14, cat: "hot", symbol: "🚀", name: "起飞" },
        { id: 15, cat: "hot", symbol: "🎯", name: "精准" },
        { id: 16, cat: "hot", symbol: "⚡", name: "闪电" }
    ],

    templates: [
        { id: 1, title: "科技干货风", bg: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)", main: "干货分享\n小白必看", sub: "教程合集" },
        { id: 2, title: "情感励志风", bg: "linear-gradient(135deg, #ff4e50, #f9d423)", main: "人间清醒\n认知觉醒", sub: "改变思维" },
        { id: 3, title: "商业财商风", bg: "linear-gradient(135deg, #134e5e, #71b280)", main: "财富密码\n逆袭指南", sub: "搞钱必备" }
    ]
};
