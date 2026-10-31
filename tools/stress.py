# -*- coding: utf-8 -*-
"""
跑一分钟：轮流切四个机位 + 点水面投喂 + 让猫抓鱼，收集页面上的未捕获异常（带堆栈）。

前提：应用已带 --remote-debugging-port=9222 启动。

用法：
    python tools/stress.py 60
"""
import json
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shot  # noqa: E402

SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 else 60.0

ARM = """
(function () {
    window.__stressErrs = [];
    window.addEventListener('error', function (e) {
        window.__stressErrs.push({
            m: e.message, f: (e.filename || '').split('/').pop(), l: e.lineno, c: e.colno,
            st: e.error && e.error.stack ? String(e.error.stack).slice(0, 700) : null,
        });
    });
    AQ.cat.lastHunt = -1e9;
    return 'armed';
})()
"""

WATER = """
(function () {
    const T = THREE, r = AQ.island.renderer.domElement.getBoundingClientRect();
    const ray = new T.Raycaster();
    const pts = [];
    for (let y = 30; y < r.height - 30; y += 24) {
        for (let x = 30; x < r.width - 30; x += 24) {
            const ndc = new T.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
            ray.setFromCamera(ndc, AQ.island.camera);
            const h = ray.intersectObject(AQ.island.sea, false);
            if (!h.length) continue;
            const p = h[0].point, d = Math.hypot(p.x, p.z);
            if (d > 5.8 && d < 7.6) pts.push([Math.round(x), Math.round(y)]);
        }
    }
    return pts;
})()
"""


def main():
    s = shot.Session()
    s.send("Runtime.enable")
    print("布防:", s.eval(ARM))

    view_seq = ["island", "top", "sea", "cat", "free"]
    waters = s.eval(WATER) or []
    print(f"可点的水面采样点 {len(waters)} 个")

    i = 0
    end = time.time() + SECONDS
    while time.time() < end:
        v = view_seq[i % len(view_seq)]
        s.eval(f"AQ.setView('{v}');")
        i += 1
        if waters and i % 2 == 0:
            s.click(*random.choice(waters))
        time.sleep(2.0)

    st = s.eval("""(function () { const c = AQ.cat, q = AQ.state().snap;
        return { errs: window.__stressErrs, state: c.state, hunts: c.hunts, caught: c.caught,
                 misses: c.misses, carry: !!c.carry, fish: q.fish.length,
                 eaten: q.stats.eaten, fps: +AQ.fps().toFixed(1) }; })()""")
    print(json.dumps(st, ensure_ascii=False, indent=1))
    print("结论:", "无异常" if not st["errs"] else f"{len(st['errs'])} 个异常")
    return 0 if not st["errs"] else 1


if __name__ == "__main__":
    sys.exit(main())
