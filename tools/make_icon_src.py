"""
生成应用图标源图（PNG），再由 TauriCPP/tools/make_icon.py 转成多分辨率 app.ico。

图标：圆角方形底 + 海岛（沙滩 / 草地 / 椰子树 / 小屋 / 灯塔）+ 海面 + 一条小鱼
纯几何绘制，不需要外部素材，重复运行结果一致。

同时导出一张 frontend/img/logo.png 给页面左上角的标题栏用（同一套画，缩到 128）。

用法:
    python tools/make_icon_src.py            # 输出 src/icon.png (512x512) + frontend/img/logo.png
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

S = 1024  # 画布尺寸，最后缩到 512 交给 make_icon.py

# 配色（和 island.js 的建模同一系：青绿的水、奶黄的沙、橙红的屋顶）
SKY_TOP = (150, 222, 232)
SKY_BOT = (16, 92, 116)
SEA = (30, 132, 158)
SEA_DEEP = (16, 88, 112)
SHALLOW = (96, 196, 210)
SAND = (244, 228, 190)
SAND_DARK = (222, 200, 158)
GRASS = (104, 194, 118)
GRASS_LIT = (140, 216, 146)
TRUNK = (158, 108, 66)
LEAF = (52, 152, 96)
LEAF_LIT = (92, 190, 122)
WALL = (250, 248, 240)
ROOF = (38, 140, 138)
RED = (232, 110, 84)
WOOD = (158, 116, 76)
ROCK = (176, 182, 178)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def qbez(p0, p1, p2, t):
    """二次贝塞尔上的一个点"""
    u = 1 - t
    return (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])


def ribbon(d, p0, p1, p2, w0, w1, color, steps=22):
    """沿二次贝塞尔画一条从 w0 渐变到 w1 宽的带子（树干、叶脉都用它）"""
    left, right = [], []
    for i in range(steps + 1):
        t = i / steps
        x, y = qbez(p0, p1, p2, t)
        nx, ny = qbez(p0, p1, p2, min(1.0, t + 0.02))
        px, py = qbez(p0, p1, p2, max(0.0, t - 0.02))
        dx, dy = nx - px, ny - py
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln                      # 法线
        w = w0 + (w1 - w0) * t
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    d.polygon(left + right[::-1], fill=color)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "src", "icon.png")
    logo = os.path.join(root, "frontend", "img", "logo.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    os.makedirs(os.path.dirname(logo), exist_ok=True)

    X = lambda f: int(S * f)

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # ---- 背景：天空到深海的竖向渐变圆角方块 ----
    bg = Image.new("RGB", (S, S), SKY_BOT)
    bd = ImageDraw.Draw(bg)
    for y in range(S):
        bd.line([(0, y), (S, y)], fill=lerp(SKY_TOP, SKY_BOT, (y / (S - 1)) ** 0.82))
    img.paste(bg, (0, 0), rounded_mask(S, int(S * 0.22)))
    d = ImageDraw.Draw(img)

    # ---- 太阳 ----
    sun = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sun)
    sd.ellipse([X(0.700), X(0.050), X(0.920), X(0.270)], fill=(255, 236, 178, 70))
    sd.ellipse([X(0.748), X(0.098), X(0.872), X(0.222)], fill=(255, 248, 222, 255))
    img.alpha_composite(sun.filter(ImageFilter.GaussianBlur(3)))
    d = ImageDraw.Draw(img)

    # ---- 海：地平线以下压一层更实的水色（只填圆角方框以内）----
    horizon = X(0.545)
    sea = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sea)
    for y in range(horizon, S):
        t = (y - horizon) / max(1, S - 1 - horizon)
        sd.line([(0, y), (S, y)], fill=lerp(SEA, SEA_DEEP, t ** 0.9) + (255,))
    frame = rounded_mask(S, int(S * 0.22))
    sea.putalpha(Image.composite(sea.split()[3], Image.new("L", (S, S), 0), frame))
    img.alpha_composite(sea)
    d = ImageDraw.Draw(img)

    # ---- 岛周围的浅水 ----
    d.ellipse([X(0.5) - X(0.365), X(0.665) - X(0.142),
               X(0.5) + X(0.365), X(0.665) + X(0.142)], fill=SHALLOW)
    d.ellipse([X(0.5) - X(0.330), X(0.658) - X(0.122),
               X(0.5) + X(0.330), X(0.658) + X(0.122)], fill=lerp(SHALLOW, SAND, 0.45))

    # ---- 沙滩 ----
    d.ellipse([X(0.5) - X(0.300), X(0.645) - X(0.110),
               X(0.5) + X(0.300), X(0.645) + X(0.110)], fill=SAND)
    d.ellipse([X(0.5) - X(0.286), X(0.652) - X(0.092),
               X(0.5) + X(0.286), X(0.652) + X(0.092)], fill=SAND_DARK)
    d.ellipse([X(0.5) - X(0.286), X(0.646) - X(0.096),
               X(0.5) + X(0.286), X(0.646) + X(0.096)], fill=SAND)

    # ---- 草地 ----
    d.ellipse([X(0.5) - X(0.248), X(0.604) - X(0.088),
               X(0.5) + X(0.248), X(0.604) + X(0.088)], fill=GRASS)
    d.ellipse([X(0.5) - X(0.186), X(0.583) - X(0.058),
               X(0.5) + X(0.186), X(0.583) + X(0.058)], fill=GRASS_LIT)

    # ---- 小屋（草地左边）----
    d.rectangle([X(0.318), X(0.508), X(0.408), X(0.588)], fill=WALL)
    d.polygon([(X(0.302), X(0.514)), (X(0.424), X(0.514)), (X(0.363), X(0.452))], fill=ROOF)
    d.polygon([(X(0.302), X(0.514)), (X(0.424), X(0.514)), (X(0.424), X(0.524)),
               (X(0.302), X(0.524))], fill=lerp(ROOF, (0, 0, 0), 0.18))
    d.rectangle([X(0.330), X(0.530), X(0.352), X(0.552)], fill=(126, 206, 220))
    d.rectangle([X(0.370), X(0.536), X(0.394), X(0.588)], fill=WOOD)

    # ---- 灯塔（草地右边）----
    d.polygon([(X(0.612), X(0.590)), (X(0.662), X(0.590)),
               (X(0.652), X(0.436)), (X(0.622), X(0.436))], fill=WALL)
    d.polygon([(X(0.6175), X(0.520)), (X(0.6575), X(0.520)),
               (X(0.6545), X(0.486)), (X(0.6205), X(0.486))], fill=RED)
    d.polygon([(X(0.612), X(0.438)), (X(0.662), X(0.438)), (X(0.637), X(0.400))], fill=RED)
    d.ellipse([X(0.628), X(0.440), X(0.646), X(0.458)], fill=(255, 228, 140))

    # ---- 椰子树（中间偏前，最抢眼）----
    crown = (X(0.517), X(0.450))
    ribbon(d, (X(0.487), X(0.606)), (X(0.480), X(0.526)), crown, 16, 9, TRUNK)
    # 叶子从树顶向外垂：中间拱起、尖端下垂，才是棕榈
    for (ex, ey, w, lit) in [
        (X(0.362), X(0.512), 26, LEAF),       # 左下垂
        (X(0.398), X(0.398), 24, LEAF_LIT),   # 左上
        (X(0.512), X(0.352), 24, LEAF_LIT),   # 正上
        (X(0.628), X(0.394), 24, LEAF),       # 右上
        (X(0.668), X(0.516), 26, LEAF),       # 右下垂
        (X(0.436), X(0.536), 20, LEAF),       # 左前垂
        (X(0.600), X(0.540), 20, LEAF),       # 右前垂
    ]:
        mx, my = (crown[0] + ex) / 2, (crown[1] + ey) / 2 - 52
        ribbon(d, crown, (mx, my), (ex, ey), 8, w, lit)
    d.ellipse([X(0.496), X(0.458), X(0.522), X(0.484)], fill=(126, 88, 54))   # 椰果
    for (nx, ny) in [(0.470, 0.470), (0.548, 0.466)]:
        d.ellipse([X(nx) - 13, X(ny) - 13, X(nx) + 13, X(ny) + 13], fill=(146, 104, 62))

    # ---- 礁石 ----
    for (cx, cy, rx, ry) in [(0.700, 0.632, 0.036, 0.024), (0.742, 0.646, 0.024, 0.016),
                             (0.286, 0.650, 0.030, 0.020)]:
        d.ellipse([X(cx) - X(rx), X(cy) - X(ry), X(cx) + X(rx), X(cy) + X(ry)], fill=ROCK)

    # ---- 水面的波纹 ----
    for (cx, cy, rx, a0, a1) in [(0.20, 0.760, 0.075, 200, 340), (0.80, 0.745, 0.080, 20, 160),
                                 (0.50, 0.815, 0.120, 210, 330), (0.30, 0.870, 0.070, 200, 340),
                                 (0.72, 0.880, 0.085, 30, 150)]:
        d.arc([X(cx) - X(rx), X(cy) - int(X(rx) * 0.42),
               X(cx) + X(rx), X(cy) + int(X(rx) * 0.42)],
              start=a0, end=a1, fill=(236, 252, 255, 150), width=7)

    # ---- 一条小鱼（提示这是个鱼缸，不是张风景画）----
    fx, fy = X(0.215), X(0.815)
    d.ellipse([fx - X(0.048), fy - X(0.026), fx + X(0.048), fy + X(0.026)],
              fill=(255, 176, 96))
    d.polygon([(fx - X(0.044), fy), (fx - X(0.084), fy - X(0.030)),
               (fx - X(0.084), fy + X(0.030))], fill=(240, 146, 70))
    d.ellipse([fx + X(0.020), fy - X(0.012), fx + X(0.036), fy + X(0.004)],
              fill=(255, 226, 186))

    # ---- 玻璃感高光 + 外发光描边 ----
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(24):
        r = int(S * (0.70 - i * 0.024))
        gd.ellipse([S * 0.5 - r, -int(S * 0.44) - int(r * 0.35),
                    S * 0.5 + r, -int(S * 0.44) + int(r * 0.75)],
                   fill=(180, 244, 255, 6 + i))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18)))

    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.rounded_rectangle([3, 3, S - 4, S - 4], radius=int(S * 0.22),
                         outline=(150, 236, 246, 120), width=8)
    img.alpha_composite(ring)

    final = img.resize((512, 512), Image.LANCZOS)
    final.save(out)
    print(f"Generated {out} ({os.path.getsize(out) / 1024:.1f} KB)")
    final.resize((128, 128), Image.LANCZOS).save(logo)
    print(f"Generated {logo} ({os.path.getsize(logo) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
