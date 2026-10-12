const AppState = {
    mainText: "爆款涨粉秘籍",
    mainFontSize: 48,
    mainColor: "#ffffff",
    mainStrokeColor: "#000000",
    
    subText: "3天突破10000粉丝播放",
    subFontSize: 28,
    subColor: "#ffeb3b",
    
    currentEffect: "normal",
    customEffects: [],
    bgImage: "",
    bgColor: "linear-gradient(135deg, #2c3e50, #34495e)",
    
    activeLayerId: "layer-main-title",
    
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
        { id: 1, title: "科技干货风", bg: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)", main: "干货分享", sub: "小白必看教程" },
        { id: 2, title: "情感励志风", bg: "linear-gradient(135deg, #ff4e50, #f9d423)", main: "人间清醒", sub: "改变命运的思维" },
        { id: 3, title: "商业财商风", bg: "linear-gradient(135deg, #134e5e, #71b280)", main: "财富密码", sub: "普通人逆袭指南" }
    ]
};
