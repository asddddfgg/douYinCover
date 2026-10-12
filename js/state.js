const AppState = {
    currentPageIndex: 0,
    fullArticleText: "爆款涨粉核心秘籍：\n三天突破1万粉丝播放量。\n全网都在寻找的超详细实操干货内容来了！\n在这里，我们引入了顶级专家级的【动态文本流引擎】。\n无论你如何拖拽改变中间正文框的高度、宽度，或者调整字号，文字都会在毫秒级内根据框体高度与底部防遮挡安全线进行精确计算。\n超出的文本会自动顺延推挤到下一页；当你拉大文本框时，下一页的文本又会自动无缝吸回！\n全过程无需手动切断，全自动保持绝对完美的排版疏密与艺术风格，一键打包导出 ZIP！",
    mainFontSize: 36,
    mainColor: "#ffffff",
    subText: "关注点赞，干货持续更新",
    subFontSize: 24,
    subColor: "#ffeb3b",
    currentEffect: "normal",
    bgImage: "",
    bgColor: "linear-gradient(135deg, #2c3e50, #34495e)",

    // 各页独立保存的文本块（由 Flow Engine 动态重排生成）
    pageChunks: [],

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
