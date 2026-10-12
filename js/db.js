// 模拟数据库 / 本地缓存管理
const LocalDB = {
    saveProject(state) {
        try {
            localStorage.setItem('douyin_cover_project', JSON.stringify(state));
            console.log("项目已自动保存到本地");
        } catch (e) {
            console.error("保存失败", e);
        }
    },
    loadProject() {
        try {
            const data = localStorage.getItem('douyin_cover_project');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error("读取失败", e);
            return null;
        }
    }
};
