"""从原始小岛 html 抽出整段场景代码，生成 frontend/js/island.js。

源文件把 three.js、OrbitControls 和小岛场景写在同一个 <script> 里；这里只取
场景部分（55684..55884 行），并做几处集成改动：

  1. 去掉原来的 16 条“飘动的小鱼”（改由 creatures.js 的鱼群渲染）
  2. frame() 暴露逐帧钩子 hooks，让 app.js 驱动鱼群与饲料
  3. 导出 window.Island（场景 / 相机 / 地形函数 / 水面材质），并冻结阴影贴图
     （场景是静态的，阴影只需生成一次，能省掉每帧一次全场景深度 pass）
  4. 水面透明度改成随深度变化（.73 → .20+.42*deep）：近岸更通透，
     水下鱼群才看得见，远海依旧是原本的深蓝色
  5. OrbitControls 的最小距离 13 → 1.2：否则永远贴不到水边，看不清鱼

用法: python tools/extract_island.py <源 html> <输出 js>
"""
import io
import sys

# 1-based 行号（与源文件一致）
HEADER_START = 54159   # (()=>{const {   —— OrbitControls 的解构，单独跳过
APP_START = 55684      # // 海风之屿 — a hand-built, self-contained miniature.
APP_END = 55884        # window.__island={renderer,scene,camera,controls,ready:true};

OLD_FISH = "for(let i=0;i<16;i++){"

OLD_FISH_ANIM = ("for(let f of fishes){let d=f.userData;f.position.x=d.x+Math.sin(t*.3+d.phase)*.24;"
                 "f.position.z=d.z+Math.cos(t*.3+d.phase)*.10;"
                 "f.rotation.y=Math.cos(t*.3+d.phase)>.0?0:Math.PI}")

OLD_FRAME = ("function frame(){requestAnimationFrame(frame);if(!active)return;"
             "let t=clock.getElapsedTime();if(!reduced){waterMat.uniforms.time.value=t;")

NEW_FRAME = ("const hooks=[];let lastT=0;\n"
             "function frame(){requestAnimationFrame(frame);if(!active)return;"
             "let t=clock.getElapsedTime();const dt=Math.min(Math.max(t-lastT,0),.05);lastT=t;\n"
             "if(!reduced){waterMat.uniforms.time.value=t;")

OLD_TAIL = ("controls.update();renderer.render(scene,camera)}frame();")

NEW_TAIL = ("for(const h of hooks)h(t,dt);\n"
            "controls.update();renderer.render(scene,camera)}frame();")

OLD_EXPORT = "window.__island={renderer,scene,camera,controls,ready:true};"

# 水面原本是固定 alpha .73，水下什么都看不清；改成按 deep 渐变
OLD_WATER_ALPHA = "gl_FragColor=vec4(c,.73);"
NEW_WATER_ALPHA = "gl_FragColor=vec4(c,.20+.42*deep);"

OLD_MIN_DIST = "controls.minDistance=13;controls.maxDistance=62;"
NEW_MIN_DIST = "controls.minDistance=1.2;controls.maxDistance=62;"

NEW_EXPORT = """window.__island={renderer,scene,camera,controls,ready:true};

// ---------------------------------------------------------------------------
// 集成导出：鱼群 / 饲料从外部挂进来，场景本身保持原样
// ---------------------------------------------------------------------------
renderer.shadowMap.autoUpdate=false;   // 静态场景：阴影只烘一次
renderer.shadowMap.needsUpdate=true;

window.Island={
    renderer, scene, camera, controls, root, animated, sea, waterMat, boat, flag,
    height, coast, radial, streamX,
    seaLevel:.105,
    hooks,
    resetFit:()=>resize(),
};"""


def main(src, dst):
    with io.open(src, "r", encoding="utf-8", newline="") as f:
        lines = f.read().splitlines(keepends=True)

    app = lines[APP_START - 1 : APP_END]
    # 整行去掉原来的 16 条小鱼（它们在同一行里定义、加入和记录相位）
    app = [ln for ln in app if OLD_FISH not in ln]
    text = "".join(app)

    def sub(old, new, what):
        nonlocal text
        if old not in text:
            raise SystemExit(f"没找到要替换的片段: {what}")
        text = text.replace(old, new, 1)

    sub(OLD_FISH_ANIM, "", "旧鱼群动画")
    sub(OLD_WATER_ALPHA, NEW_WATER_ALPHA, "水面透明度")
    sub(OLD_MIN_DIST, NEW_MIN_DIST, "环视最小距离")
    sub(OLD_FRAME, NEW_FRAME, "frame 开头")
    sub(OLD_TAIL, NEW_TAIL, "frame 结尾")
    sub(OLD_EXPORT, NEW_EXPORT, "__island 导出")

    # 场景里原本的标题注释也别再带旧名字了
    text = text.replace("海风之屿", "海岛鱼缸")

    header = """// 小岛场景 —— 手工建模的环海小岛（保留原建模与配色，
// 只做了与桌面壳集成的少量改动，见 tools/extract_island.py）。three.js r169 与
// OrbitControls 由 three.min.js 提供，暴露为全局 THREE / OrbitControls。
(function () {
const OrbitControls = window.OrbitControls;

"""
    out = header + text + "\n})();\n"
    with io.open(dst, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    print(f"island scene written -> {dst} ({len(out)} bytes, {out.count(chr(10))} lines)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
