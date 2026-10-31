"""
验证「鼠标点击水面投喂 → 鱼嘴凑上来吃食」。

前提：应用已带 --remote-debugging-port=9222 启动。

流程：
  1. 用 CDP 在屏幕某点按一下鼠标（走 app.js 的 pointerup → 水面 raycast → feed）
  2. 每隔 0.8s 采样：鱼群到投喂点的平均距离 / 2 单位内的鱼数 / 饲料 / 已吃
  3. 打印表格并截图 before/after
"""
import json
import sys
import time

import shot

CLICK = (int(sys.argv[1]) if len(sys.argv) > 1 else 640,
         int(sys.argv[2]) if len(sys.argv) > 2 else 700)

PROBE = """
(function () {
    const T = THREE;
    const rect = AQ.island.renderer.domElement.getBoundingClientRect();
    const px = %d, py = %d;
    const ndc = new T.Vector2(
        ((px - rect.left) / rect.width) * 2 - 1,
        -((py - rect.top) / rect.height) * 2 + 1);
    const ray = new T.Raycaster();
    ray.setFromCamera(ndc, AQ.island.camera);
    const hits = ray.intersectObject(AQ.island.sea, false);
    const st = AQ.state();
    if (!st || !st.snap) return { error: 'no state' };
    if (!hits.length) return { error: 'no hit' };

    // 与 app.js 的 ringPoint 同一套算法：把落点收进环海。
    // 目标点缓存一次，验证过程中镜头可能在动，目标点不应跟着变。
    let c = window.__feedTarget;
    if (!c) {
        const a = Math.atan2(hits[0].point.z, hits[0].point.x);
        const shore = AQ.island.coast(a) * 1.02;
        const r0 = Math.hypot(hits[0].point.x, hits[0].point.z);
        const r = Math.min(Math.max(r0, shore + 0.45), 7.9);
        c = window.__feedTarget = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }
    const tx = c.x, tz = c.z;

    const fish = st.snap.fish;
    let sum = 0, near = 0, maxY = -99;
    const ds = [];
    for (const f of fish) {
        const d = Math.hypot(f.x - tx, f.z - tz);
        ds.push(+d.toFixed(2));
        sum += d;
        if (d < 2.0) near++;
        if (f.y > maxY) maxY = f.y;
    }
    ds.sort((x, y) => x - y);
    return {
        clickAt: [+hits[0].point.x.toFixed(2), +hits[0].point.z.toFixed(2)],
        target: [+tx.toFixed(2), +tz.toFixed(2)],
        meanDist: +(sum / fish.length).toFixed(2),
        near: near,
        nearest: ds.slice(0, 3),
        food: st.snap.food.length,
        eaten: st.snap.stats.eaten,
        maxY: +maxY.toFixed(3),
    };
})()
"""


def main():
    s = shot.Session()
    s.send("Runtime.enable")
    s.eval("window.__aqErrors = []; window.addEventListener('error', e => __aqErrors.push(e.message));")
    s.eval("window.__feedTarget = null;")

    before = s.eval(PROBE % CLICK)
    print("投喂前:", json.dumps(before, ensure_ascii=False))
    if before.get("error"):
        raise SystemExit(f"取不到场景状态: {before['error']}")

    s.shot("verify_before.png")

    x, y = CLICK
    s.click(x, y)
    print(f"点击 ({x}, {y}) → 投喂点 {before['target']}")

    print(f"{'t(s)':>5} {'均距':>6} {'2内':>4} {'最近3条':>18} {'饲料':>4} {'已吃':>4} {'最高y':>7}")
    peak_near, min_near, eaten = 0, 99.0, before["eaten"]
    for i in range(12):
        time.sleep(0.8)
        r = s.eval(PROBE % CLICK)
        if r.get("error"):
            print("  ", r)
            continue
        peak_near = max(peak_near, r["near"])
        min_near = min(min_near, r["nearest"][0])
        eaten = r["eaten"]
        print(f"{0.8 * (i + 1):5.1f} {r['meanDist']:6.2f} {r['near']:4d} "
              f"{str(r['nearest']):>18} {r['food']:4d} {r['eaten']:4d} {r['maxY']:7.3f}")
        if i == 2:
            s.shot("verify_after.png")

    after = s.eval(PROBE % CLICK)
    s.shot("verify_end.png")

    errs = s.eval("window.__aqErrors")
    print("页面错误:", errs)
    print("投喂后:", json.dumps(after, ensure_ascii=False))
    print(f"峰值：投喂点 2 单位内 {peak_near} 条，最近一条 {min_near:.2f}，共吃掉 {eaten - before['eaten']} 粒")
    ok = eaten > before["eaten"] and peak_near >= before["near"] and min_near < 1.0
    print("结论:", "通过 —— 鱼群向投喂点靠拢并吃到了饲料" if ok else "未通过")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
