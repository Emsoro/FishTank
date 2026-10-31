# -*- coding: utf-8 -*-
"""
逐个姿态给岛上的猫拍定妆照，用来看造型和动作读不读得清。

前提：应用已带 --remote-debugging-port=9222 启动。

用法：
    python tools/cat_shots.py            # 全部姿态，输出到 shots/cat_<姿态>.png
    python tools/cat_shots.py rest groom
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shot  # noqa: E402

POSES = sys.argv[1:] or ["walk", "crouch", "pounce", "swipe", "fight", "carry", "eat", "groom", "rest", "play"]

# 机位：从海面上方斜俯下去（和 app.js 的跟猫机位同一个思路），再往猫的右手边偏一点拿正侧面
CAM = """
(function () {
    const c = AQ.cat;
    AQ.setView('island');                     // 借固定机位的插值把镜头推过去（'free' 是不再插值）
    c.x = 3.35; c.z = 5.05; c.yaw = 2.2;      // 搬到南边一片干净沙滩上，免得道具挡镜头
    c.pose('%s');
    const yaw = c.yaw;
    const a = Math.atan2(c.z, c.x);
    const ox = Math.cos(a), oz = Math.sin(a);              // 径向朝海
    let tx = -Math.sin(a), tz = Math.cos(a);               // 切向
    if (tx * Math.cos(yaw) - tz * Math.sin(yaw) < 0) { tx = -tx; tz = -tz; }   // 挑右手边
    const y = c.ground(c.x, c.z);
    const px = c.x + ox * 1.55 + tx * 0.95;
    const pz = c.z + oz * 1.55 + tz * 0.95;
    AQ.camGoal.pos.set(px, y + 0.82, pz);
    AQ.camGoal.target.set(c.x, y + 0.16, c.z);
    return { state: c.state, carry: !!c.carry,
             x: +c.x.toFixed(2), z: +c.z.toFixed(2), camY: +(y + 0.82).toFixed(2) };
})()
"""


def main():
    s = shot.Session()
    s.send("Runtime.enable")
    os.makedirs("shots", exist_ok=True)
    for name in POSES:
        info = s.eval(CAM % name)
        time.sleep(1.4)                      # 姿态和机位都是插值过去的，等一下再拍
        out = f"shots/cat_{name}.png"
        s.shot(out)
        print(f"  {name:8s} -> {out}   {info}")
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
