# -*- coding: utf-8 -*-
"""
验证镜头控制：

  1 全岛 / 4 俯视：固定机位，但鼠标可以任意拖动转向、滚轮缩放，松手后停在玩家要看的地方
  2 跟鱼群 / 3 跟猫：镜头跟着主体走，拖动只改方向、滚轮只改高度，都不退出跟随

用页面里合成的 pointer / wheel 事件驱动 OrbitControls（先把 setPointerCapture 桩掉，
否则合成事件会被 OrbitControls 丢掉），比从 CDP 灌鼠标输入稳定 —— 真实光标一旦晃过窗口
也会混进同一串拖动增量里，测出来的数没法看。

前提：应用已带 --remote-debugging-port=9222 启动。

用法：
    python tools/cam_probe.py
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shot  # noqa: E402

INSTALL = """
(function () {
    const c = AQ.island.renderer.domElement;
    c.setPointerCapture = function () {};
    c.releasePointerCapture = function () {};
    const rect = () => c.getBoundingClientRect();
    function pev(type, x, y, buttons) {
        c.dispatchEvent(new PointerEvent(type, {
            pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true,
            clientX: x, clientY: y, button: 0, buttons: buttons, buttons: buttons,
        }));
    }
    window.__sim = {
        // 从画面正中拖 dx,dy 像素
        drag(dx, dy, steps) {
            const r = rect(), x0 = r.width / 2, y0 = r.height / 2;
            steps = steps || 10;
            pev('pointerdown', x0, y0, 1);
            for (let i = 1; i <= steps; i++) {
                pev('pointermove', x0 + dx * i / steps, y0 + dy * i / steps, 1);
            }
            pev('pointerup', x0 + dx, y0 + dy, 0);
            return true;
        },
        // 滚轮：负值拉近，正值推远
        wheel(dy, ticks) {
            const r = rect();
            ticks = ticks || 3;
            for (let i = 0; i < ticks; i++) {
                c.dispatchEvent(new WheelEvent('wheel', {
                    deltaY: dy, deltaX: 0, bubbles: true, cancelable: true,
                    clientX: r.width / 2, clientY: r.height / 2,
                }));
            }
            return true;
        },
    };
    return true;
})()
"""

CAM = """
(function () {
    const c = AQ.island.camera, t = AQ.island.controls.target;
    const d = c.position.clone().sub(t);
    const r = d.length();
    const out = {
        view: AQ.state().view,
        dist: +r.toFixed(2),
        offY: +d.y.toFixed(2),                       // 相机比目标高多少 = 玩家定的“高度”
        // 用球坐标判定“镜头到底转向了哪儿”，比直接比 xyz 稳（拖动 + 阻尼只会改角度）
        azim: +Math.atan2(d.x, d.z).toFixed(3),
        polar: +Math.acos(Math.max(-1, Math.min(1, d.y / r))).toFixed(3),
        pos: [+c.position.x.toFixed(2), +c.position.y.toFixed(2), +c.position.z.toFixed(2)],
        tgt: [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)],
    };
    const cat = AQ.cat;
    if (cat) out.catGap = +Math.hypot(t.x - cat.x, t.z - cat.z).toFixed(2);
    const f = AQ.state().snap && AQ.state().snap.fish;
    if (f && f.length) {                             // 跟鱼群时目标点离最近的鱼有多远
        let best = 1e9;
        for (const p of f) best = Math.min(best, Math.hypot(t.x - p.x, t.z - p.z));
        out.fishGap = +best.toFixed(2);
    }
    return out;
})()
"""


def key(s, name, code, ch):
    s.send("Input.dispatchKeyEvent", type="keyDown", key=name, code=code, text=ch)
    s.send("Input.dispatchKeyEvent", type="keyUp", key=name, code=code)


def show(tag, c):
    print("  %-11s %s" % (tag, json.dumps(c, ensure_ascii=False)))


def free_camera(s):
    """1 全岛：自由拖动 + 滚轮缩放 + 按 1 复位"""
    print("[全岛视角]")
    s.eval("AQ.setView('island');")
    time.sleep(1.8)
    home = s.eval(CAM)
    show("机位", home)

    s.eval("__sim.drag(230, 0);")
    time.sleep(3.0)                                  # 等阻尼滑完
    spun = s.eval(CAM)
    s.eval("__sim.drag(0, -120);")
    time.sleep(3.0)
    tilt = s.eval(CAM)
    turned = abs(tilt["azim"] - home["azim"]) > 0.2
    tilted = abs(tilt["polar"] - spun["polar"]) > 0.1
    no_pull = abs(tilt["azim"] - spun["azim"]) < 0.02   # 松手后没人再拽它
    quit_follow = tilt["view"] == "free"
    show("拖动后", spun)
    show("再拉一下", tilt)

    s.eval("__sim.wheel(-170, 4);")
    time.sleep(1.6)
    zin = s.eval(CAM)
    s.eval("__sim.wheel(170, 4);")
    time.sleep(1.6)
    zout = s.eval(CAM)
    zoomed = zin["dist"] < tilt["dist"] - 0.5 and zout["dist"] > zin["dist"] + 0.5
    show("拉近", zin)
    print("  滚轮：拉近 %s → 推远 %s（拖动后 %s）" % (zin["dist"], zout["dist"], tilt["dist"]))

    key(s, "1", "Digit1", "1")
    time.sleep(2.0)
    back = s.eval(CAM)
    show("按 1", back)
    reset = back["view"] == "island" and abs(back["dist"] - home["dist"]) < 1.5 \
        and abs(back["azim"] - home["azim"]) < 0.05

    print("  能转向 %s · 能俯仰 %s · 松手停住 %s · 退出跟随 %s · 能缩放 %s · 能复位 %s"
          % (turned, tilted, no_pull, quit_follow, zoomed, reset))
    return turned and tilted and no_pull and quit_follow and zoomed and reset


def follow_camera(s, view, tag):
    """2 / 3 跟随：拖动只改方向、滚轮只改高度，都不退出跟随，也不把镜头拽回默认取景"""
    print("[%s]" % tag)
    s.eval("AQ.setView('%s');" % view)
    time.sleep(2.8)                                        # 等飞位到位
    base = s.eval(CAM)
    show("默认取景", base)

    s.eval("__sim.drag(200, 0);")
    time.sleep(3.0)
    spun = s.eval(CAM)
    show("拖动后", spun)
    turned = abs(spun["azim"] - base["azim"]) > 0.15
    still = spun["view"] == view                           # 没退出跟随
    keep = abs(spun["dist"] - base["dist"]) < 0.35         # 拖动不该改远近

    s.eval("__sim.wheel(-170, 3);")
    time.sleep(1.4)
    zoom = s.eval(CAM)
    time.sleep(3.5)                                        # 主体继续走，镜头跟着
    held = s.eval(CAM)
    show("滚轮后", zoom)
    show("3.5 秒后", held)
    zoomed = abs(zoom["dist"] - spun["dist"]) > 0.4 or abs(zoom["offY"] - spun["offY"]) > 0.3
    held_ok = abs(held["dist"] - zoom["dist"]) < 0.6 and abs(held["offY"] - zoom["offY"]) < 0.6
    keeps = (held["catGap"] < 1.0) if view == "cat" else (held.get("fishGap", 99) < 1.2)

    print("  能转向 %s · 不退出跟随 %s · 拖动不改远近 %s · 滚轮改高度 %s · 高度保持 %s · %s"
          % (turned, still, keep, zoomed, held_ok, "镜头跟得住主体" if keeps else "镜头跟丢了"))
    return turned and still and keep and zoomed and held_ok and keeps


def main():
    s = shot.Session()
    s.send("Runtime.enable")
    s.eval(INSTALL)
    r1 = free_camera(s)
    r2 = follow_camera(s, "cat", "跟猫视角")
    r3 = follow_camera(s, "sea", "跟鱼群视角")
    key(s, "1", "Digit1", "1")
    ok = r1 and r2 and r3
    print("结论:", "通过 —— 全岛自由移动缩放，跟猫 / 跟鱼边跟边由滚轮定高度" if ok else "未通过")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
