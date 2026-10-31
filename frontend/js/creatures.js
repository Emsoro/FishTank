// 环海鱼群 —— 与 island.js 同一套 toon 低模风格
//
// 设计要点：
//   * 每种鱼只有 3 个 InstancedMesh（鱼身 / 定鳍 / 尾鳍），60 条鱼也不到 20 个 draw call
//   * 鱼身的花纹画在 128×64 的小画布贴图上（条纹、眼点），顶点数很少
//   * 摆尾用顶点着色器做（沿体轴的低频行波），尾鳍跟着摆动，CPU 只需要写实例矩阵
//   * 朝向用 'YXZ' 欧拉顺序：先偏航再俯仰，鱼鼻才会真的朝游动方向低头 / 抬头
//     （'XYZ' 下俯仰是绕世界 X 轴的，鱼会“用背去咬食”）
(function () {
    const T = THREE;

    // -----------------------------------------------------------------
    // 公用：toon 渐变（与 island.js 的四段一致）
    // -----------------------------------------------------------------
    const grad = new T.DataTexture(
        new Uint8Array([96, 96, 96, 255, 168, 168, 168, 255, 226, 226, 226, 255, 255, 255, 255]),
        4, 1, T.RGBAFormat);
    grad.minFilter = grad.magFilter = T.NearestFilter;
    grad.needsUpdate = true;

    const uTime = { value: 0 };

    // 鱼种（下标与 src/tank.hpp 的 Species 一致）
    // L 体长、H 体高、W 体厚系数、spread/len 尾鳍半高与长度（都是“体长 = 1”的局部单位）
    const SPECIES = [
        {
            key: 'neon', name: '霓虹灯鱼', L: 0.72, H: 0.235, W: 1.00,
            fin: '#a9d8ea', tail: '#cfe7f2', spread: 0.44, len: 0.34,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#2f86b4');
                grd.addColorStop(0.34, '#8ed6ec');
                grd.addColorStop(0.62, '#e8f7fc');
                grd.addColorStop(1.00, '#f7fdfe');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                g.fillStyle = '#63e2f8'; g.fillRect(W * 0.10, H * 0.33, W * 0.82, H * 0.15);
                g.fillStyle = '#e4554a'; g.fillRect(0, H * 0.58, W * 0.54, H * 0.28);
                g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, H * 0.52, W * 0.5, H * 0.035);
            },
        },
        {
            key: 'guppy', name: '孔雀鱼', L: 0.80, H: 0.245, W: 0.95,
            fin: '#f4c48a', tail: '#f4914e', spread: 0.64, len: 0.46,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#6f93c8');
                grd.addColorStop(0.30, '#a9c3e6');
                grd.addColorStop(0.60, '#dfe9f6');
                grd.addColorStop(1.00, '#fbf6f2');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                for (let i = 0; i < 26; i++) {
                    const x = ((i * 37) % 100) / 100, y = ((i * 53) % 100) / 100;
                    g.fillStyle = i % 2 ? 'rgba(84,70,150,.35)' : 'rgba(255,190,120,.45)';
                    g.beginPath(); g.arc(W * x, H * y, H * 0.045, 0, 7); g.fill();
                }
                g.fillStyle = 'rgba(120,90,180,.42)'; g.fillRect(W * 0.02, H * 0.10, W * 0.24, H * 0.5);
            },
        },
        {
            key: 'cory', name: '鼠鱼', L: 0.74, H: 0.235, W: 0.92,
            fin: '#c3b294', tail: '#b6a482', spread: 0.42, len: 0.32,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#6f6047');
                grd.addColorStop(0.42, '#a08f70');
                grd.addColorStop(0.68, '#e6dcc0');
                grd.addColorStop(1.00, '#f7f0dc');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                g.fillStyle = '#5c4f3b'; g.fillRect(W * 0.28, 0, W * 0.34, H * 0.34);
                for (let i = 0; i < 22; i++) {
                    g.fillStyle = 'rgba(92,79,59,.28)';
                    g.beginPath();
                    g.arc(W * (((i * 41) % 97) / 100), H * (((i * 29) % 90) / 100), H * 0.05, 0, 7);
                    g.fill();
                }
            },
        },
        {
            key: 'angel', name: '神仙鱼', L: 0.90, H: 0.40, W: 0.65,
            fin: '#c9d9e2', tail: '#dbe7ee', spread: 0.50, len: 0.34,
            paint(g, W, H) {
                g.fillStyle = '#dfeaf0'; g.fillRect(0, 0, W, H);
                g.fillStyle = '#33454e';
                g.fillRect(W * 0.16, 0, W * 0.14, H);
                g.fillRect(W * 0.46, 0, W * 0.13, H);
                g.fillRect(W * 0.76, 0, W * 0.12, H);
                g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, H * 0.45, W, H * 0.07);
            },
        },
        {
            key: 'clown', name: '小丑鱼', L: 0.82, H: 0.26, W: 1.02,
            fin: '#f4a05a', tail: '#f8b070', spread: 0.48, len: 0.34,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#dd6a1f');
                grd.addColorStop(0.50, '#f8913a');
                grd.addColorStop(1.00, '#ffc184');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                for (const u of [0.24, 0.56, 0.86]) {
                    g.fillStyle = '#22302c'; g.fillRect(W * u - H * 0.075, 0, H * 0.15, H);
                    g.fillStyle = '#fffdf4'; g.fillRect(W * u - H * 0.05, 0, H * 0.10, H);
                }
            },
        },
        {
            key: 'chromis', name: '蓝绿光鳃', L: 0.70, H: 0.245, W: 0.95,
            fin: '#7fe0d2', tail: '#9cebdd', spread: 0.50, len: 0.36,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#178f9c');
                grd.addColorStop(0.34, '#2ec2bc');
                grd.addColorStop(0.62, '#7fe4d6');
                grd.addColorStop(1.00, '#d7faf2');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                g.fillStyle = 'rgba(255,255,255,.36)'; g.fillRect(0, H * 0.46, W, H * 0.06);
                g.fillStyle = 'rgba(20,120,130,.35)'; g.fillRect(W * 0.30, 0, W * 0.05, H);
            },
        },
        {
            key: 'goby', name: '虾虎鱼', L: 0.76, H: 0.22, W: 0.92,
            fin: '#e0d4b6', tail: '#d6c8a8', spread: 0.40, len: 0.30,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#a39170');
                grd.addColorStop(0.50, '#d9ccae');
                grd.addColorStop(1.00, '#f6efdc');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                for (let i = 0; i < 16; i++) {
                    g.fillStyle = 'rgba(96,78,52,.42)';
                    g.beginPath();
                    g.ellipse(W * (((i * 47) % 94) / 100), H * (0.2 + ((i * 31) % 60) / 100),
                        H * 0.09, H * 0.055, i, 0, 7);
                    g.fill();
                }
                g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, H * 0.62, W, H * 0.06);
            },
        },
        {
            key: 'flame', name: '火焰鱼', L: 0.78, H: 0.255, W: 0.98,
            fin: '#f0603c', tail: '#ff8358', spread: 0.52, len: 0.38,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#9c1b15');
                grd.addColorStop(0.28, '#d92d22');
                grd.addColorStop(0.56, '#f4543a');
                grd.addColorStop(1.00, '#ffd8bd');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                g.fillStyle = 'rgba(255,241,224,.92)'; g.fillRect(0, H * 0.70, W * 0.30, H * 0.18);
                g.fillStyle = 'rgba(110,10,10,.30)'; g.fillRect(0, H * 0.44, W, H * 0.045);
            },
        },
        {
            key: 'shark', name: '礁鲨', L: 1.00, H: 0.175, W: 0.86, S: 2.9, shark: true,
            fin: '#587d8b', tail: '#63899a', spread: 0.62, len: 0.30,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#33545f');
                grd.addColorStop(0.34, '#537b87');
                grd.addColorStop(0.60, '#8fb0b6');
                grd.addColorStop(1.00, '#f2f6ef');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                for (let i = 0; i < 4; i++) {           // 鳃裂
                    g.fillStyle = 'rgba(40,66,74,.45)';
                    g.fillRect(W * (0.62 + i * 0.035), H * 0.22, W * 0.012, H * 0.34);
                }
                g.fillStyle = 'rgba(255,255,255,.18)';
                g.fillRect(0, H * 0.44, W, H * 0.05);
            },
        },
        {
            key: 'grouper', name: '石斑', L: 0.80, H: 0.30, W: 1.05, S: 1.9,
            fin: '#8a7f5c', tail: '#9c8f66', spread: 0.50, len: 0.34, grouper: true,
            paint(g, W, H) {
                const grd = g.createLinearGradient(0, 0, 0, H);
                grd.addColorStop(0.00, '#4a4a2e');
                grd.addColorStop(0.40, '#7a7448');
                grd.addColorStop(0.72, '#b3a678');
                grd.addColorStop(1.00, '#e2d6ae');
                g.fillStyle = grd; g.fillRect(0, 0, W, H);
                for (let i = 0; i < 30; i++) {          // 石斑的深浅斑点
                    const x = ((i * 43) % 100) / 100, y = ((i * 29) % 92) / 100;
                    g.fillStyle = i % 3 ? 'rgba(46,44,26,.42)' : 'rgba(240,236,214,.45)';
                    g.beginPath();
                    g.ellipse(W * x, H * y, H * (0.05 + (i % 4) * 0.018), H * (0.04 + (i % 3) * 0.014), i, 0, 7);
                    g.fill();
                }
                g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, H * 0.60, W, H * 0.05);
            },
        },
    ];

    // 眼睛（贴在身体贴图的两侧：v=0.25 与 0.75 才是左右侧面）
    function paintEyes(g, W, H, at) {
        // at 由每种鱼的 eye 字段给（海豚眼睛靠后，魔鬼鱼贴着前缘）
        for (const v of [0.25, 0.75]) {
            const x = W * at, y = H * v, r = H * 0.085;
            g.fillStyle = '#101d1c';
            g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
            g.fillStyle = 'rgba(255,255,255,.92)';
            g.beginPath(); g.arc(x - r * 0.32, y - r * 0.34, r * 0.34, 0, 7); g.fill();
        }
    }

    function texture(sp) {
        const W = 128, H = 64;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d');
        sp.paint(g, W, H);
        paintEyes(g, W, H, sp.eye || 0.86);
        const tex = new T.CanvasTexture(cv);
        tex.colorSpace = T.SRGBColorSpace;
        tex.flipY = false;          // canvas 顶 = 鱼背
        tex.magFilter = T.LinearFilter;
        tex.minFilter = T.LinearMipmapLinearFilter;
        tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        return tex;
    }

    // -----------------------------------------------------------------
    // 鱼体：截面沿 +Z（头朝 +Z），局部长度 1、高度 1、宽度 0.60
    // 局部单位下：z ∈ [-0.5, 0.5]，y ∈ [-0.5, 0.5]，x ∈ [-0.30, 0.30]
    // -----------------------------------------------------------------
    const FISH_PROFILE = [
        [0.00, 0.075], [0.05, 0.120], [0.12, 0.185], [0.22, 0.270],
        [0.32, 0.345], [0.42, 0.398], [0.52, 0.420], [0.62, 0.415],
        [0.71, 0.385], [0.79, 0.335], [0.86, 0.272], [0.92, 0.196],
        [0.97, 0.108], [1.00, 0.030],
    ];

    // 鲨鱼：尖吻、肩部最粗、尾柄很细（数值同样是“体长 = 1”）
    const SHARK_PROFILE = [
        [0.00, 0.040], [0.06, 0.075], [0.14, 0.108], [0.24, 0.130],
        [0.36, 0.142], [0.48, 0.145], [0.60, 0.140], [0.72, 0.125],
        [0.82, 0.102], [0.90, 0.074], [0.96, 0.042], [1.00, 0.012],
    ];

    // 石斑：头大身沉，越往尾巴越细
    const GROUPER_PROFILE = [
        [0.00, 0.055], [0.08, 0.098], [0.18, 0.150], [0.30, 0.205],
        [0.44, 0.248], [0.58, 0.272], [0.70, 0.268], [0.82, 0.240],
        [0.92, 0.185], [0.97, 0.120], [1.00, 0.055],
    ];

    function catmull(p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * ((2 * p1) + (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }

    /// 把“半径表”变成归一化的截面函数：t=0 尾柄 … t=1 吻尖，返回 0..1
    function makeProfile(table) {
        let peak = 0;
        for (const p of table) peak = Math.max(peak, p[1]);
        return function (t) {
            const n = table.length - 1;
            let i = 0;
            while (i < n - 1 && t > table[i + 1][0]) i++;
            const t0 = table[i][0], t1 = table[i + 1][0];
            const u = (t - t0) / Math.max(1e-6, t1 - t0);
            const r0 = table[Math.max(0, i - 1)][1];
            const r1 = table[i][1];
            const r2 = table[i + 1][1];
            const r3 = table[Math.min(n, i + 2)][1];
            return Math.max(0.0, catmull(r0, r1, r2, r3, u)) / peak;
        };
    }

    const fishProfile = makeProfile(FISH_PROFILE);
    const sharkProfile = makeProfile(SHARK_PROFILE);
    const grouperProfile = makeProfile(GROUPER_PROFILE);

    /// 每种鱼用自己的截面表 / 截面宽度（宽度系数越大身体越“横”）
    function profileOf(sp) {
        if (sp.grouper) return grouperProfile;
        return sp.shark ? sharkProfile : fishProfile;
    }
    function widthOf(sp) { return sp.shark ? 0.72 : 0.60; }

    function buildBody(prof, widthK = 0.60) {
        const SEG = 22, RING = 12, R1 = RING + 1;
        const pos = [], uv = [], idx = [];
        for (let i = 0; i <= SEG; i++) {
            const t = i / SEG;
            const z = t - 0.5;
            const r = prof(t) * 0.5;
            for (let j = 0; j <= RING; j++) {
                const v = j / RING;
                const a = v * Math.PI * 2;
                // 背脊略窄、腹部略鼓，侧扁（配合 H 缩放后约 5:1）
                const squash = 1 - 0.10 * Math.max(0, Math.cos(a));
                pos.push(Math.sin(a) * r * widthK, Math.cos(a) * r * squash, z);
                uv.push(t, v);
            }
        }
        for (let i = 0; i < SEG; i++) {
            for (let j = 0; j < RING; j++) {
                const a = i * R1 + j, b = a + 1, c = a + R1, d = c + 1;
                idx.push(a, c, b, c, d, b);
            }
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return geo;
    }

    // 定鳍：背鳍 + 臀鳍 + 腹鳍 + 两侧胸鳍（局部空间，跟着鱼身一起缩放）
    // 背/臀鳍的根部压在鱼体表面以下一点，才能“长”在背上而不是浮在空中
    function buildFins() {
        const pos = [];
        const tri = (a, b, c) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };

        // 背鳍：从 z=0.24 的肩部一直连到尾柄，最高处在体背中部
        const db = [[0, 0.40, 0.25], [0, 0.45, 0.10], [0, 0.45, -0.06], [0, 0.40, -0.24]];
        const dt = [[0, 0.56, 0.20], [0, 0.71, 0.03], [0, 0.66, -0.12], [0, 0.47, -0.26]];
        for (let i = 0; i < db.length - 1; i++) {
            tri(db[i], dt[i], db[i + 1]);
            tri(db[i + 1], dt[i], dt[i + 1]);
        }

        // 臀鳍：腹面后段，向后下方张开
        const ab = [[0, -0.38, 0.08], [0, -0.36, -0.22]];
        const at = [[0, -0.54, -0.02], [0, -0.44, -0.28]];
        tri(ab[0], at[0], ab[1]);
        tri(ab[1], at[0], at[1]);
        for (const s of [-1, 1]) {
            // 胸鳍：从体侧靠前的位置向外后方扇开
            const p0 = [s * 0.22, -0.04, 0.16];
            const p1 = [s * 0.42, -0.20, 0.03];
            const p2 = [s * 0.30, -0.10, -0.06];
            if (s > 0) tri(p0, p1, p2); else tri(p0, p2, p1);
            // 腹鳍：腹部下方的一小片
            const v0 = [s * 0.04, -0.42, 0.12];
            const v1 = [s * 0.13, -0.58, 0.02];
            const v2 = [s * 0.02, -0.44, 0.00];
            if (s > 0) tri(v0, v1, v2); else tri(v0, v2, v1);
        }

        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        return geo;
    }

    // 鲨鱼鳍：硬质三角面 —— 大背鳍 + 扇开的胸鳍 + 小背鳍 / 臀鳍 / 腹鳍
    function buildSharkFins() {
        const pos = [];
        const tri = (a, b, c) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };

        // 背鳍：宽三角，后缘里凹
        tri([0, 0.40, 0.22], [0, 0.98, -0.10], [0, 0.38, -0.10]);
        tri([0, 0.98, -0.10], [0, 0.24, -0.26], [0, 0.38, -0.10]);
        // 第二背鳍、臀鳍
        tri([0, 0.30, -0.30], [0, 0.44, -0.40], [0, 0.24, -0.40]);
        tri([0, -0.28, -0.30], [0, -0.42, -0.40], [0, -0.22, -0.40]);

        for (const s of [-1, 1]) {
            // 胸鳍：从鳃后向两侧后方张开
            const p0 = [s * 0.08, -0.08, 0.18];
            const p1 = [s * 0.56, -0.30, 0.04];
            const p2 = [s * 0.14, -0.16, -0.08];
            tri(p0, p1, p2);
            // 腹鳍
            const v0 = [s * 0.04, -0.22, -0.18];
            const v1 = [s * 0.24, -0.38, -0.28];
            const v2 = [s * 0.01, -0.22, -0.30];
            tri(v0, v1, v2);
        }

        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        return geo;
    }

    // 尾鳍：支点在尾柄（局部原点），向 -Z 展开；spread = 半高，len = 长度
    // shape='crescent' 是鲨鱼的新月尾（上叶长、下叶短）
    function buildTail(spread, len, shape) {
        const rim = shape === 'crescent'
            ? [[0, spread * 1.12, -len * 1.02], [0, spread * 0.36, -len * 0.46],
               [0, spread * 0.08, -len * 0.30], [0, -spread * 0.16, -len * 0.34],
               [0, -spread * 0.56, -len * 0.60], [0, -spread * 0.98, -len * 0.98]]
            : [[0, spread * 0.94, -len * 0.94], [0, spread * 0.34, -len * 0.44],
               [0, 0.00, -len * 0.66], [0, -spread * 0.34, -len * 0.44],
               [0, -spread * 0.94, -len * 0.94]];
        const pos = [];
        const tri = (a, b, c) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
        for (let i = 0; i < rim.length - 1; i++) tri([0, 0, 0], rim[i], rim[i + 1]);
        tri([0, 0, 0], rim[rim.length - 1], [0, 0.035, -0.01]);
        tri([0, 0, 0], [0, -0.035, -0.01], rim[0]);
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        return geo;
    }

    // 摆尾：顶点沿体轴做低频行波（uv.x 0=尾 1=头）
    function addWiggle(mat, amp = 0.115) {
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = uTime;
            shader.vertexShader = 'uniform float uTime;\nattribute float aPhase;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                [
                    '#include <begin_vertex>',
                    'float fw = smoothstep(0.50, 0.0, uv.x);',
                    'transformed.x += sin(uv.x * 11.0 - uTime * 8.0 + aPhase) * ' + amp.toFixed(3) + ' * fw * fw;',
                ].join('\n'));
        };
        mat.customProgramCacheKey = () => 'fish-wiggle-' + amp.toFixed(3);
    }

    function finMat(color) {
        // 不透明：鱼鳍和鱼身一起走不透明队列，水面才会盖在它们上面
        return new T.MeshToonMaterial({ color, gradientMap: grad, side: T.DoubleSide });
    }

    // -----------------------------------------------------------------
    // 每种鱼的实例化网格
    // -----------------------------------------------------------------
    const CAP = 96;
    // 展缸里鱼的真实尺寸：全长 ≈（1 + 尾鳍长度）× L × SC，约 0.26~0.32
    // 鲨鱼用物种自己的 S 再放大（约 1.1 单位长）
    const SC = 0.30;
    const dummy = new T.Object3D();
    dummy.rotation.order = 'YXZ';
    const _pivot = new T.Matrix4();
    const _rot = new T.Matrix4();
    const _tail = new T.Matrix4();

    class SpeciesMeshes {
        constructor(sp, parent) {
            this.sp = sp;
            this.list = [];
            this.phase = new Float32Array(CAP);

            const bodyGeo = buildBody(profileOf(sp), widthOf(sp));
            bodyGeo.setAttribute('aPhase', new T.InstancedBufferAttribute(this.phase, 1));

            const bodyMat = new T.MeshToonMaterial({ map: texture(sp), gradientMap: grad });
            addWiggle(bodyMat, sp.shark ? 0.045 : 0.115);

            this.body = new T.InstancedMesh(bodyGeo, bodyMat, CAP);
            this.fins = new T.InstancedMesh(sp.shark ? buildSharkFins() : buildFins(), finMat(sp.fin), CAP);
            this.tail = new T.InstancedMesh(
                buildTail(sp.spread, sp.len, sp.shark ? 'crescent' : 'fan'),
                finMat(sp.tail), CAP);
            this.parts = [this.body, this.fins, this.tail];
            for (const m of this.parts) {
                m.instanceMatrix.setUsage(T.DynamicDrawUsage);
                m.frustumCulled = false;
                m.count = 0;
                m.castShadow = false;
                m.receiveShadow = false;
                parent.add(m);
            }
            this.mat = bodyMat;
        }

        flush(t) {
            const n = Math.min(this.list.length, CAP);
            for (let i = 0; i < n; i++) {
                const s = this.list[i];
                const sp = this.sp;
                const k = SC * (sp.S || 1) * s.sz;
                dummy.position.set(s.x, s.y, s.z);
                dummy.rotation.set(s.pitch, s.yaw, s.roll);
                // 局部几何是“高 1”的，横向 0.60 → 宽度 = H*W*0.60
                dummy.scale.set(sp.W * sp.H * k, sp.H * k, sp.L * k);
                dummy.updateMatrix();

                this.body.setMatrixAt(i, dummy.matrix);
                this.fins.setMatrixAt(i, dummy.matrix);

                // 尾柄同步摆动（鲨鱼摆得慢、幅度小）
                const w = s.phase - t * (sp.shark ? 2.2 : 8.0);
                const swing = sp.shark ? 0.16 : 0.55;
                _pivot.makeTranslation((sp.shark ? 0.04 : 0.115) * Math.sin(w), 0, -0.5);
                _pivot.multiply(_rot.makeRotationY(swing * Math.cos(w)));
                _tail.multiplyMatrices(dummy.matrix, _pivot);
                this.tail.setMatrixAt(i, _tail);

                this.phase[i] = s.phase;
            }
            if (n !== this.body.count) {
                for (const m of this.parts) m.count = n;
            }
            if (n > 0) {
                this.body.instanceMatrix.needsUpdate = true;
                this.fins.instanceMatrix.needsUpdate = true;
                this.tail.instanceMatrix.needsUpdate = true;
                this.body.geometry.attributes.aPhase.needsUpdate = true;
            }
            this.list.length = 0;
        }
    }

    function wrapPi(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    // -----------------------------------------------------------------
    // 整个鱼群：把后端快照平滑成每帧姿态
    // -----------------------------------------------------------------
    class School {
        constructor(parent) {
            this.groups = SPECIES.map(sp => new SpeciesMeshes(sp, parent));
            this.known = new Map();
        }

        update(t, dt, snap) {
            uTime.value = t;
            const list = (snap && snap.fish) ? snap.fish : [];
            const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
            const alive = new Set();

            for (const f of list) {
                alive.add(f.id);
                let s = this.known.get(f.id);
                if (!s) {
                    s = {
                        x: f.x, y: f.y, z: f.z, yaw: f.hdg, pitch: f.pit, roll: 0,
                        sz: f.sz, phase: (f.id * 2.399) % 6.283,
                    };
                    this.known.set(f.id, s);
                }
                s.x += (f.x - s.x) * k;
                s.y += (f.y - s.y) * k;
                s.z += (f.z - s.z) * k;
                const dYaw = wrapPi(f.hdg - s.yaw);
                s.yaw += dYaw * k;
                s.pitch += (Math.max(-0.5, Math.min(0.5, f.pit)) - s.pitch) * k;
                const bank = Math.max(-0.45, Math.min(0.45, -dYaw / Math.max(dt, 0.016) * 0.16));
                s.roll += (bank - s.roll) * Math.min(1, dt * 6);
                s.sz = f.sz;
                const g = this.groups[f.s];
                if (g) g.list.push(s);
            }
            for (const id of this.known.keys()) if (!alive.has(id)) this.known.delete(id);

            for (const g of this.groups) g.flush(t);
        }

        get count() {
            let n = 0;
            for (const g of this.groups) n += g.body.count;
            return n;
        }
    }

    // -----------------------------------------------------------------
    // 饲料
    // -----------------------------------------------------------------
    class FoodLayer {
        constructor(parent, cap = 240) {
            this.cap = cap;
            // 鱼食比鱼小得多：直径约 0.017，相当于体长 0.25 的鱼的五分之一
            const geo = new T.IcosahedronGeometry(0.0085, 0);
            const mat = new T.MeshToonMaterial({ color: '#c98f4e', gradientMap: grad });
            this.mesh = new T.InstancedMesh(geo, mat, cap);
            this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
            this.mesh.frustumCulled = false;
            this.mesh.renderOrder = 1;
            this.mesh.count = 0;
            parent.add(this.mesh);
            this.hide = new T.Matrix4().makeScale(0, 0, 0);
            this.dummy = new T.Object3D();
            this.prev = -1;
        }

        update(food, t) {
            const n = Math.min(food ? food.length : 0, this.cap);
            for (let i = 0; i < n; i++) {
                const f = food[i];
                this.dummy.position.set(f.x, f.y, f.z);
                this.dummy.rotation.set(0, i * 1.7, 0);
                this.dummy.scale.setScalar(f.s ? 0.75 : 1);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
            }
            if (n !== this.prev) {
                this.mesh.count = n;
                this.prev = n;
            }
            this.mesh.instanceMatrix.needsUpdate = n > 0;
        }
    }

    // -----------------------------------------------------------------
    // 岸边小生物（寄居蟹）：合并成单个实例化网格
    // -----------------------------------------------------------------
    function mergeParts(parts) {
        const geos = [];
        for (const p of parts) {
            const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
            if (p.rot) {
                if (p.rot[0]) g.rotateX(p.rot[0]);
                if (p.rot[1]) g.rotateY(p.rot[1]);
                if (p.rot[2]) g.rotateZ(p.rot[2]);
            }
            if (p.pos) g.translate(p.pos[0], p.pos[1], p.pos[2]);
            if (p.scale) g.scale(p.scale[0], p.scale[1], p.scale[2]);
            const c = new T.Color(p.color);
            const n = g.attributes.position.count;
            const col = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
            g.setAttribute('color', new T.BufferAttribute(col, 3));
            geos.push(g);
        }
        const total = geos.reduce((n, g) => n + g.attributes.position.array.length, 0);
        const pos = new Float32Array(total);
        const nor = new Float32Array(total);
        const col = new Float32Array(total);
        let off = 0;
        for (const g of geos) {
            pos.set(g.attributes.position.array, off);
            nor.set(g.attributes.normal.array, off);
            col.set(g.attributes.color.array, off);
            off += g.attributes.position.array.length;
            g.dispose();
        }
        const out = new T.BufferGeometry();
        out.setAttribute('position', new T.BufferAttribute(pos, 3));
        out.setAttribute('normal', new T.BufferAttribute(nor, 3));
        out.setAttribute('color', new T.BufferAttribute(col, 3));
        out.computeBoundingSphere();
        return out;
    }

    class CrabLayer {
        constructor(parent, cap = 8) {
            this.cap = cap;
            const shell = mergeParts([
                { geo: new T.ConeGeometry(0.085, 0.22, 8, 1), color: '#cbb08a', rot: [-1.35, 0, 0], pos: [0, 0.075, -0.04] },
                { geo: new T.SphereGeometry(0.055, 7, 5), color: '#dcc4a0', pos: [0, 0.05, 0.07] },
                { geo: new T.BoxGeometry(0.075, 0.035, 0.05), color: '#e8a37e', pos: [0, 0.035, 0.12] },
                { geo: new T.BoxGeometry(0.03, 0.028, 0.09), color: '#c9714f', rot: [0, 0.6, 0], pos: [0.055, 0.03, 0.10] },
                { geo: new T.BoxGeometry(0.03, 0.028, 0.09), color: '#c9714f', rot: [0, -0.6, 0], pos: [-0.055, 0.03, 0.10] },
                { geo: new T.BoxGeometry(0.014, 0.014, 0.11), color: '#b8825f', rot: [0, 0.8, 0], pos: [0.075, 0.018, 0.0] },
                { geo: new T.BoxGeometry(0.014, 0.014, 0.11), color: '#b8825f', rot: [0, -0.8, 0], pos: [-0.075, 0.018, 0.0] },
            ]);
            const mat = new T.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
            this.mesh = new T.InstancedMesh(shell, mat, cap);
            this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
            this.mesh.frustumCulled = false;
            this.mesh.count = 0;
            parent.add(this.mesh);
            this.dummy = new T.Object3D();
            this.prev = -1;
        }

        update(list, t, island) {
            const n = Math.min(list ? list.length : 0, this.cap);
            for (let i = 0; i < n; i++) {
                const c = list[i];
                const y = island && island.height ? island.height(c.x, c.z) : 0.24;
                this.dummy.position.set(c.x, y - 0.004 + Math.sin(t * 2 + c.id) * 0.004, c.z);
                this.dummy.rotation.set(0, c.dir, 0);
                this.dummy.scale.setScalar(c.sz);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
            }
            if (n !== this.prev) { this.mesh.count = n; this.prev = n; }
            this.mesh.instanceMatrix.needsUpdate = n > 0;
        }
    }

    // -----------------------------------------------------------------
    // 投喂时的涟漪
    // -----------------------------------------------------------------
    class Ripples {
        constructor(parent) {
            this.parent = parent;
            this.geo = new T.RingGeometry(0.82, 1.0, 48);
            this.list = [];
        }

        burst(x, z, n = 3) {
            for (let i = 0; i < n; i++) {
                const mat = new T.MeshBasicMaterial({
                    color: '#f2fffd', transparent: true, opacity: 0.0,
                    side: T.DoubleSide, depthWrite: false,
                });
                const m = new T.Mesh(this.geo, mat);
                m.rotation.x = -Math.PI / 2;
                m.position.set(x, 0.113, z);
                m.renderOrder = 6;
                this.parent.add(m);
                this.list.push({ m, life: -i * 0.17, dur: 1.5, size: 0.35 + i * 0.14 });
            }
        }

        update(t, dt) {
            for (let i = this.list.length - 1; i >= 0; i--) {
                const r = this.list[i];
                r.life += dt;
                if (r.life < 0) { r.m.visible = false; continue; }
                r.m.visible = true;
                const p = r.life / r.dur;
                if (p >= 1) {
                    r.m.removeFromParent();
                    r.m.material.dispose();
                    this.list.splice(i, 1);
                    continue;
                }
                const s = r.size + p * 1.35;
                r.m.scale.set(s, s, s);
                r.m.material.opacity = 0.45 * (1 - p) * (1 - p);
            }
        }
    }

    window.Creatures = { SPECIES, School, FoodLayer, CrabLayer, Ripples, gradient: grad };
})();
