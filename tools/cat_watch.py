# -*- coding: utf-8 -*-
"""
盯一段时间岛上的猫，把状态机的跳转打出来，验证「蹲守瞄一会儿 → 扑上去搏斗 → 叼到屋子附近吃掉
→ 舔毛 → 趴着歇 1~2 分钟 → 四处走走跑跑」这条环，以及抓鱼的频率低不低。

前提：应用已带 --remote-debugging-port=9222 启动。

用法：
    python tools/cat_watch.py 90        # 默认盯 90 秒；--fast 把捕鱼间隔压短，好看完整个循环
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shot  # noqa: E402

SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 else 90.0
FAST = "--fast" in sys.argv          # 把捕鱼间隔压短，方便几十秒内看完一整环

PROBE = """
(function () {
    const c = AQ.cat, st = AQ.state().snap;
    return {
        t: +(performance.now() / 1000).toFixed(1),
        state: c.state,
        goal: c.goal ? [+c.goal.x.toFixed(2), +c.goal.z.toFixed(2)] : null,
        at: [+c.x.toFixed(2), +c.z.toFixed(2)],
        stall: +c.stall.toFixed(1),
        wig: +c.wig.toFixed(2),
        nextHuntIn: +Math.max(0, c.huntGap - (performance.now() / 1000 - c.lastHunt)).toFixed(0),
        hunts: c.hunts, caught: c.caught, misses: c.misses,
        carry: !!c.carry,
        fish: st.fish.length,
        stats: { eaten: st.stats.eaten, caught: st.stats.caught },
        fps: +AQ.fps().toFixed(1),
    };
})()
"""


def main():
    s = shot.Session()
    s.send("Runtime.enable")
    # 正常情况猫两三分钟才肯去抓一次鱼；--fast 把间隔压短，好让整条环在几十秒内跑完
    s.eval("AQ.cat.lastHunt = -1e9;" + (" AQ.cat.huntGap = 20;" if FAST else ""))

    prev = None
    same = 0
    end = time.time() + SECONDS
    while time.time() < end:
        r = s.eval(PROBE)
        if FAST:
            s.eval("AQ.cat.huntGap = 20;")     # startHunt 会把间隔改回去，盯着时一直压住
        key = (r["state"], r["carry"])
        if key != prev:
            print(f"[{r['t']:6.1f}s] " + json.dumps(r, ensure_ascii=False))
            prev = key
            same = 0
        else:
            same += 1
            if same % 4 == 0:               # 状态没变就每 12 秒打一行心跳
                print(f"    {r['t']:7.1f}  {r['state']:7s} at={r['at']} goal={r['goal']} "
                      f"stall={r['stall']} wig={r['wig']} nextHunt={r['nextHuntIn']}s "
                      f"caught={r['caught']} misses={r['misses']} fps={r['fps']}")
        time.sleep(3.0)

    print("\n最后一帧:", json.dumps(s.eval(PROBE), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
