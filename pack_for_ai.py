import os
import subprocess

TARGET_FILES = [
    "index.html",
    "style.css",
    "js/app.js",
    "js/db.js",
    "js/drag.js",
    "js/effects.js",
    "js/state.js",
    "js/stickers.js",
    "js/text-layers.js"
]

def copy_to_clipboard(text):
    try:
        process = subprocess.Popen('clip', stdin=subprocess.PIPE, shell=True)
        process.communicate(input=text.encode('utf-8'))
    except Exception as e:
        print(f"写入剪贴板失败: {e}")

def main():
    print("==================================================")
    print("🚀 极速大容量打包助手（最少分段优化版）启动")
    print("==================================================")
    
    file_contents = []
    for filepath in TARGET_FILES:
        if os.path.exists(filepath):
            ext = filepath.split('.')[-1]
            lang = "html" if ext == "html" else "css" if ext == "css" else "javascript"
            content = f"\n--- FILE: {filepath} ---\n```{lang}\n"
            with open(filepath, "r", encoding="utf-8") as f:
                content += f.read()
            content += f"\n```\n"
            file_contents.append(content)
        else:
            print(f"⚠️ 找不到文件: {filepath}")

    full_text = "".join(file_contents)
    
    # 调大到 30000 字符每段，确保安全接收的同时把段数压缩到最少（通常整个项目只需 1~2 段）
    chunk_size = 30000
    chunks = [full_text[i:i+chunk_size] for i in range(0, len(full_text), chunk_size)]
    total_parts = len(chunks)
    
    print(f"\n📦 得益于大模型超大容量支持，整个项目被精简合并为了【仅 {total_parts} 个片段】！")
    print("💡 操作极简：只需按 1~2 次回车，粘贴发送即可。\n")
    
    for idx, chunk in enumerate(chunks):
        part_num = idx + 1
        header = f"========== 【Part {part_num} / {total_parts} 开始】 ==========\n"
        footer = f"\n========== 【Part {part_num} / {total_parts} 结束】 ==========\n"
        payload = header + chunk + footer
        
        input(f"👉 【准备就绪】请按回车键复制第 {part_num}/{total_parts} 部分代码...")
        copy_to_clipboard(payload)
        print(f"✅ 第 {part_num}/{total_parts} 部分已放入剪贴板！快去按 Ctrl + V 粘贴发送吧。")
        print("-" * 50)
        
    print("\n🎉 所有代码片段推送完毕！")
    input("\n按回车键退出窗口...")

if __name__ == "__main__":
    main()