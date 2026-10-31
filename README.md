# 海岛鱼缸

桌面上的一座微缩海岛标本：环岛浅水里养着一小群热带鱼（外加一条礁鲨、几条石斑），
岛上有屋子、灯塔、码头、一座会随风飘的小旗子，还有一只会自己抓鱼的猫。

后端是 C++ 的生态模拟，前端是 Three.js 手工建模的低多边形小岛，两者通过 WebView2 命令桥通信。

## 玩法

| 操作 | 效果 |
| --- | --- |
| 点水面 | 撒一把饲料，附近的鱼会凑上来抢 |
| 拖鼠标 / 滚轮 | 环视 / 缩放（鸟瞰档下会接管镜头） |
| `1` | 全岛机位 |
| `2` | 跟鱼群（镜头盯住身边鱼最多的那条） |
| `3` | 跟猫 |
| `4` | 俯视 |
| `F12` | 打开 DevTools |

## 目录

```
src/
  main.cpp        窗口 / 命令桥接 / 50ms 的模拟主循环
  tank.hpp/.cpp   鱼群模拟（纯逻辑，不依赖窗口与渲染）
test/
  tank_test.cpp   生态模拟单元测试
frontend/
  island.js       小岛场景：地形、屋子、灯塔、码头……
  creatures.js    鱼群 / 鱼食 / 寄居蟹 / 涟漪
  cat.js          岛上的猫（骨骼摆姿势 + 抓鱼）
  app.js          前端主控：机位、插值、投喂
TauriCPP/         内置副本：Win32 + WebView2 的桌面壳
tools/            自动化验证 / 截图脚本（走 CDP）
```

## 构建

依赖：

* Visual Studio 2022（C++ 桌面开发 workloads）
* CMake ≥ 3.15
* vcpkg：`vcpkg install webview2:x64-windows-static --classic`

```powershell
.\build.ps1                      # Release，前端资源嵌入 exe
.\build.ps1 -DevMode             # 不嵌资源，改 frontend/ 后刷新即可见
.\build.ps1 -Clean               # 从头重新配一次
```

产物：`build\Release\FishTank.exe`（单文件，无额外 DLL 依赖）。

单元测试：

```powershell
cmake --build build --config Release --target tank_test
.\build\Release\tank_test.exe
```

## 架构

```
┌── C++ 后端 ────────────┐   tick    ┌── 前端 ─────────────────┐
│ Tank::Step(dt)         │  ──────►  │ Three.js 渲染           │
│   群游 / 惊慌 / 觅食   │   50ms    │ 位置与朝向做插值        │
│   摄食 / 补鱼 / 昼夜   │           │ 摆尾交给顶点着色器      │
└────────────────────────┘           └─────────────────────────┘
        ▲                                        │
        │             invoke 命令                 │
        └────────────────────────────────────────┘
```

* 后端每 50 ms 推一份全量快照（`tick` 事件），前端只做插值与动画，不跑逻辑。
* 前端 → 后端的命令：`new_tank` / `set_stock` / `feed` / `catch_fish` / `set_paused` / `get_state`。
* 猫完全由前端驱动：落脚高度取自 `island.js` 导出的 `height()`，抓到鱼才通过 `catch_fish`
  交给后端取走（几秒后补回同种的一条，鱼群数量恒定）。

### 鱼群模拟的几个约束

活动域不是盒子，而是「海岸线 + 0.20 ~ 展缸内沿 8.42」之间的**环**，所以边界用极坐标处理。
水只有 0.3 深：鱼心被限制在 `-0.140 ~ 0.045`（水面 y = 0.105），鱼背不会露出水面，也不会有鱼跳出水面。

### 鱼种

`tank.hpp` 的 `Species` 下标必须与 `frontend/js/creatures.js` 的 `SPECIES` 数组一一对应。

| # | key | 名字 | 习性 |
| --- | --- | --- | --- |
| 0 | neon | 霓虹灯鱼 | 小群，上层 |
| 1 | guppy | 孔雀鱼 | 偏上层散游 |
| 2 | cory | 鼠鱼 | 贴沙面 |
| 3 | angel | 神仙鱼 | 本场景未使用 |
| 4 | clown | 小丑鱼 | 中层 |
| 5 | chromis | 蓝绿光鳃 | 成群 |
| 6 | goby | 虾虎鱼 | 贴底 |
| 7 | flame | 火焰鱼 | 通体橙红 |
| 8 | shark | 礁鲨 | 不群游、不吃饲料，只沿外圈巡游；猫捞不动 |
| 9 | grouper | 石斑 | 贴底独居的大块头 |

每种鱼只有 3 个 `InstancedMesh`（鱼身 / 定鳍 / 尾鳍），60 条鱼也不到 20 个 draw call。
鱼身花纹画在 128×64 的 canvas 贴图上；摆尾由顶点着色器做（沿体轴的行波），CPU 只写实例矩阵。

### 屋子前的木楼梯

屋子坐在坡上，西侧地势比屋基低一米多，所以这部分是按地形算出来的：

* 屋下垫了两层石砌台基，补掉高低差；
* 缘侧支柱按 `height()` 一直插进沙里；
* 木楼梯的台阶数由地形落差算出，最后一级坐进坡里，两侧再封一道斜梁——不会出现悬空。

## 自动化验证

`tools/*.py` 通过 CDP 连接 WebView2 页面，用来截图或执行 JS（需要先带调试端口启动应用）：

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
.\build\Release\FishTank.exe

python tools/shot.py shot out.png          # 截图
python tools/shot.py eval "AQ.fps()"       # 在页面里跑一段 JS
python tools/shot.py click 640 300         # 模拟点水面投喂
```

`tools/verify_feed.py`、`tools/stress.py`、`tools/cat_shots.py` 等在其基础上做流程验证。
截图（`shots/`、`shot*.png`、`verify_*.png`）不入版本库。
