"""从「海风之屿.html」中抽取内嵌的 Three.js r169 + OrbitControls，生成独立脚本。

源文件把 three.js 库和应用场景写在同一个 <script> 里，OrbitControls 位于一个
未闭合的立即执行函数中（应用代码也在其中）。这里截取到 OrbitControls 结束，
并补上导出语句与函数收尾，得到可直接用 <script src> 引入的全局版本。

用法: python tools/extract_three.py <源 html> <输出 js>
"""
import io
import sys

START_MARK = "const THREE=(()=>{"
END_MARK = "function interceptControlUp"
TAIL = """
// 导出到全局，供后续脚本使用（原文件把这些写在同一个 <script> 作用域里）
window.THREE = THREE;
window.OrbitControls = OrbitControls;
})();
"""


def main(src, dst):
    with io.open(src, "r", encoding="utf-8", newline="") as f:
        lines = f.read().splitlines(keepends=True)

    start = next(i for i, ln in enumerate(lines) if ln.startswith(START_MARK))

    # OrbitControls 以 interceptControlUp 收尾，其后是应用场景代码：
    # 从函数声明行往后找第一个顶格的 '}'，把它也包进来（少了它就会
    # 报 ReferenceError: interceptControlUp is not defined）
    fn = next(i for i, ln in enumerate(lines) if END_MARK in ln)
    end = fn
    while end < len(lines) and lines[end].rstrip("\r\n") != "}":
        end += 1
    if end >= len(lines):
        raise SystemExit("未找到 interceptControlUp 的结束位置")

    out = "".join(lines[start : end + 1]) + TAIL
    with io.open(dst, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)

    print(f"extracted lines {start + 1}..{end + 1} -> {dst} ({len(out)} bytes)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
