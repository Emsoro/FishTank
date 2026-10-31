"""
通过 CDP 调试 FishTank 的 WebView2 页面：截图 / 执行 JS / 模拟鼠标点击。

启动应用时带上调试端口:
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
    .\\build\\Release\\FishTank.exe

用法:
    python tools/shot.py shot out.png
    python tools/shot.py eval "document.title"
    python tools/shot.py click 640 300
    python tools/shot.py wait 3
"""
import base64
import json
import sys
import time
import urllib.request

from websockets.sync.client import connect

PORT = 9222


def targets():
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=5) as r:
        return json.load(r)


def page_target():
    for t in targets():
        if t.get("type") == "page":
            return t
    raise SystemExit("找不到 page target，应用是否已启动？")


class Session:
    def __init__(self):
        self.ws = connect(page_target()["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024)
        self.seq = 0

    def send(self, method, **params):
        self.seq += 1
        mid = self.seq
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise SystemExit(f"{method} 失败: {msg['error']}")
                return msg.get("result", {})

    def eval(self, expr):
        r = self.send("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        res = r.get("result", {})
        if r.get("exceptionDetails"):
            return {"EXCEPTION": r["exceptionDetails"].get("text", "?")}
        return res.get("value", res)

    def shot(self, path):
        data = self.send("Page.captureScreenshot", format="png")["data"]
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"saved {path}")

    def click(self, x, y):
        # mouseReleased 必须带 clickCount=1，否则 Chrome 不给页面派发 pointerup，
        # OrbitControls 会卡在拖动状态里（滚轮失灵，鼠标一动镜头还跟着转）
        self.send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y,
                  button="none", buttons=0, clickCount=0)
        self.send("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y,
                  button="left", buttons=1, clickCount=1)
        time.sleep(0.06)
        self.send("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y,
                  button="left", buttons=0, clickCount=1)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]
    s = Session()

    if cmd == "shot":
        s.shot(sys.argv[2] if len(sys.argv) > 2 else "shot.png")
    elif cmd == "eval":
        print(json.dumps(s.eval(sys.argv[2]), ensure_ascii=False, indent=2))
    elif cmd == "click":
        s.click(float(sys.argv[2]), float(sys.argv[3]))
        print(f"clicked ({sys.argv[2]}, {sys.argv[3]})")
    elif cmd == "wait":
        time.sleep(float(sys.argv[2]))
        print("ok")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
