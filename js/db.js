const LocalDB = {
    saveProject(state) {
        try { localStorage.setItem('douyin_cover_project_v11', JSON.stringify(state)); } catch (e) {}
    },
    loadProject() {
        try {
            const data = localStorage.getItem('douyin_cover_project_v11');
            return data ? JSON.parse(data) : null;
        } catch (e) { return null; }
    }
};
