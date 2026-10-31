# -*- coding: utf-8 -*-
"""
确认「空格撒一把」已经彻底去掉：按空格不产生饲料，点水面照样能喂。

前提：应用已带 --remote-debugging-port=9222 启动。

用法：
    python tools/verify_no_space.py [点击的 x y]
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shot  # noqa: E402

STAT = "(function(){const st=AQ.state().snap;return {fed:st.stats.fed, food:st.food.length};})()"


def main():
    s = shot.Session()
    s.send("Runtime.enable")
    time.sleep(3.0)                                   # 等首帧快照到位
    x, y = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) >= 3 else (772, 308)

    # 先把提示文字读出来（纯只读，不动鼠标）
    hint = s.eval("document.querySelector('.brand-text p').textContent")
    print("提示文字：", hint)
    text_ok = "空格" not in hint and "调高度" not in hint

    base = s.eval(STAT)
    s.send("Input.dispatchKeyEvent", type="keyDown", key=" ", code="Space", text=" ")
    s.send("Input.dispatchKeyEvent", type="keyUp", key=" ", code="Space")
    time.sleep(1.2)
    after_key = s.eval(STAT)
    print("按下空格：%s → %s" % (base, after_key))

    s.click(x, y)
    time.sleep(1.2)
    after_click = s.eval(STAT)
    print("点水面   ：%s → %s" % (after_key, after_click))

    key_ok = after_key["fed"] == base["fed"]
    click_ok = after_click["fed"] > base["fed"]
    print("结论:", "通过 —— 空格已经不管喂食，提示里也没有了，点水面仍能喂"
          if key_ok and click_ok and text_ok else "未通过")
    return 0 if (key_ok and click_ok and text_ok) else 1


if __name__ == "__main__":
    sys.exit(main())
