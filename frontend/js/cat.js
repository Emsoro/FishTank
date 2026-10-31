// 岛上的一只猫
//
// 行为环：屋边趴着休息 → 走到岸边蹲守（肚皮贴地瞄一会儿，尾巴先摇）
//         → 扑上去按住鱼搏斗（时间不定）→ 叼到屋子附近随便一块地吃完
//         → 出来舔毛 → 趴着歇 1~2 分钟 → 在岛上四处走走跑跑 → 隔两三分钟才再抓一次
//
// 猫完全由前端驱动：
//   * 地形与岸线用 island.js 导出的 height() / coast()，所以四脚永远踩在沙上
//   * 抓到的鱼通过 catch_fish 交给后端取走（几秒后补一条同种的，鱼群数量不变）
//   * 只有一只，不做实例化；骨骼就是几个 Group 套起来，逐帧摆姿势
(function () {
    const T = THREE;
    const grad = window.Creatures.gradient;
    const SPECIES = window.Creatures.SPECIES;
    const SHARK = SPECIES.findIndex((s) => s.shark);

    // 展缸比例：屋子宽 3.05 单位 ≈ 现实 4 米，所以 1 单位 ≈ 1.3 米
    // 一只猫的肩高 0.186、体长 0.45 刚好落在“看着像一只猫”的范围里
    const FUR = '#e8a75f';
    const FUR_DARK = '#c8813f';
    const CREAM = '#fff3df';
    const PAD = '#e08f7a';
    const EYE = '#2b2822';

    // 屋子（含门廊）/ 灯塔 / 潟湖 / 木栈道码头 / 电话亭：猫不踩进去
    // rot 是道具自己在 island.js 里的 rotation.y，斜着摆的东西要转到自己坐标系里算
    const BLOCKS = [
        { box: true, x: -1.65, z: -0.60, hw: 1.95, hd: 2.15 },
        { box: false, x: 4.04, z: -2.43, r: 1.25 },
        { box: false, x: 0.75, z: 5.16, r: 1.20 },
        { box: true, x: -3.70, z: 6.16, hw: 0.72, hd: 1.86, rot: -0.10 },
        { box: true, x: -4.10, z: 0.55, hw: 0.56, hd: 0.56, rot: 0.24 },
    ];
    const DOOR = { x: -1.65, z: 2.02 };   // 门前廊下的一块地（找不到院子时的兜底点）
    const HOME = { x: -3.30, z: 2.30 };   // 屋侧休息点（同上，兜底用）
    const HOUSE = { x: -1.65, z: -0.60 }; // 屋子中心：吃饭的地点在它靠海那一侧随机挑

    const fur = (color) => new T.MeshToonMaterial({ color, gradientMap: grad });

    function ellip(rx, ry, rz, seg = 9) {
        const g = new T.SphereGeometry(1, seg, Math.max(5, seg - 3));
        g.scale(rx, ry, rz);
        return g;
    }

    function wrapPi(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    // -----------------------------------------------------------------
    // 低模猫：root（落地）→ body（俯仰）→ 头 / 四条腿 / 尾巴
    // -----------------------------------------------------------------
    function buildRig() {
        const root = new T.Group();
        const body = new T.Group();
        body.position.y = 0.186;
        root.add(body);
        
        // 身子：一根“前窄后宽”的椭圆 + 一块白肚皮，不堆一堆球（否则会糊成一团）
        const torso = new T.Mesh(ellip(0.098, 0.094, 0.176), fur(FUR));
        torso.rotation.x = -0.05;                 // 屁股抬高一档，更像猫
        body.add(torso);
        const belly = new T.Mesh(ellip(0.080, 0.062, 0.150), fur(CREAM));
        belly.position.set(0, -0.048, 0.010);
        body.add(belly);
        const ruff = new T.Mesh(ellip(0.088, 0.084, 0.056), fur(CREAM));
        ruff.position.set(0, 0.012, 0.128);
        body.add(ruff);
        
        // 虎斑：三道绕着身子一圈的深色环带。用“薄片浮在背上”会露出边缘，看着像长了鳍，
        // 环带跟着背的弧度走，只比身子大 1%，从哪儿看都是长在毛上的花纹
        for (let i = 0; i < 3; i++) {
            const z = 0.062 - i * 0.072;
            const k = Math.sqrt(Math.max(0.08, 1 - (z / 0.176) * (z / 0.176)));
            const g = new T.CylinderGeometry(1, 1, 0.024, 10, 1, true);
            g.rotateX(Math.PI / 2);
            const s = new T.Mesh(g, fur(FUR_DARK));
            s.scale.set(0.099 * k, 0.095 * k, 1);
            s.position.z = z;
            torso.add(s);
        }
        
        // 脖子：头和身子之间接一段，不让它“漂”在空中
        const neck = new T.Mesh(new T.CylinderGeometry(0.048, 0.062, 0.075, 7), fur(FUR));
        neck.position.set(0, 0.058, 0.158);
        neck.rotation.x = 0.55;
        body.add(neck);
        
        // 头（比真猫略大，标本场景里读得清）
        const head = new T.Group();
        head.position.set(0, 0.112, 0.200);
        body.add(head);
        head.add(new T.Mesh(ellip(0.090, 0.084, 0.082), fur(FUR)));
        const cheek = new T.Mesh(ellip(0.074, 0.050, 0.052), fur(CREAM));
        cheek.position.set(0, -0.036, 0.048);
        head.add(cheek);
        const nose = new T.Mesh(ellip(0.018, 0.014, 0.016, 6), fur(PAD));
        nose.position.set(0, -0.010, 0.080);
        head.add(nose);
        
        for (const s of [-1, 1]) {
            const ear = new T.Mesh(new T.ConeGeometry(0.050, 0.098, 4), fur(FUR));
            ear.position.set(0.056 * s, 0.082, -0.006);
            ear.rotation.set(-0.16, 0.78, -0.34 * s);
            head.add(ear);
            const inner = new T.Mesh(new T.ConeGeometry(0.030, 0.068, 4), fur(PAD));
            inner.position.set(0.054 * s, 0.078, 0.004);
            inner.rotation.set(-0.16, 0.78, -0.34 * s);
            head.add(inner);
            const eye = new T.Mesh(ellip(0.017, 0.020, 0.012, 6), fur(EYE));
            eye.position.set(0.040 * s, 0.010, 0.070);
            head.add(eye);
        }
        
        // 四条腿：pivot 在髖部，绕 X 前后摆，绕 Z 外八（趴下时）
        const HIP = [
            [0.058, 0.012, 0.112],    // 右前
            [-0.058, 0.012, 0.112],   // 左前
            [0.064, 0.010, -0.116],   // 右后
            [-0.064, 0.010, -0.116],  // 左后
        ];
        const legs = [];
        for (let i = 0; i < 4; i++) {
            const pivot = new T.Group();
            pivot.position.fromArray(HIP[i]);
            body.add(pivot);
            const bone = new T.Mesh(
                new T.CylinderGeometry(0.024, 0.019, 0.168, 6),
                fur(i < 2 ? FUR : FUR_DARK));
            bone.position.y = -0.082;
            pivot.add(bone);
            const paw = new T.Mesh(ellip(0.030, 0.024, 0.042, 6), fur(CREAM));
            paw.position.set(0, -0.168, 0.012);
            pivot.add(paw);
            legs.push(pivot);
        }
        
        // 尾巴：5 节链，高高翘起并弯向背（猫的标志性轮廓）
        const tailRoot = new T.Group();
        tailRoot.position.set(0, 0.058, -0.196);
        tailRoot.rotation.x = 0.95;
        body.add(tailRoot);
        const tail = [];
        const SEG = 0.056;
        let node = tailRoot;
        for (let i = 0; i < 5; i++) {
            const j = new T.Group();
            j.position.z = i === 0 ? 0 : -SEG;
            const g = new T.CylinderGeometry(0.027 - i * 0.0035, 0.027 - (i + 1) * 0.0035, SEG, 5);
            g.rotateX(Math.PI / 2);
            const m = new T.Mesh(g, fur(i === 4 ? CREAM : (i % 2 ? FUR : FUR_DARK)));
            m.position.z = -SEG / 2;
            j.add(m);
            node.add(j);
            tail.push(j);
            node = j;
        }

        // 嘴里叼的鱼（抓到之后才显形，颜色和大小跟着抓到的那条走）
        const prey = new T.Group();
        prey.position.set(0, -0.062, 0.082);
        prey.rotation.x = 1.95;
        prey.visible = false;
        head.add(prey);
        const pbody = new T.Mesh(ellip(0.020, 0.026, 0.072, 7), fur('#e07a52'));
        prey.add(pbody);
        const ptail = new T.Mesh(new T.ConeGeometry(0.030, 0.046, 4), fur('#f0a074'));
        ptail.rotation.x = Math.PI / 2;
        ptail.position.z = -0.088;
        ptail.scale.set(1, 0.35, 1);
        prey.add(ptail);
        const phead = new T.Mesh(ellip(0.017, 0.016, 0.024, 6), fur('#f4c9a8'));
        phead.position.z = 0.068;
        prey.add(phead);

        for (const o of root.children) o.castShadow = false;
        return { root, body, head, neck, legs, tail, tailRoot, prey, pbody, ptail };
    }

    // -----------------------------------------------------------------
    // 猫
    // -----------------------------------------------------------------
    class Cat {
        constructor(parent, island, api) {
            this.I = island;
            this.api = api || {};
            const rig = buildRig();
            this.rig = rig;
            this.root = rig.root;
            this.root.rotation.order = 'YXZ';
            parent.add(this.root);

            // 脚下的一片假接触阴影：岛上的阴影贴图是烘死一次的，会动的东西得自己带
            this.shadow = new T.Mesh(
                new T.CircleGeometry(0.15, 18),
                new T.MeshBasicMaterial({
                    color: '#1d2b21', transparent: true, opacity: 0.22, depthWrite: false,
                }));
            this.shadow.rotation.x = -Math.PI / 2;
            this.shadow.renderOrder = 2;
            parent.add(this.shadow);

            this.x = HOME.x;
            this.z = HOME.z;
            this.yaw = 1.1;
            this.slope = 0;
            this.gait = 0;
            this.movespeed = 0;
            this.snap = null;      // 最新快照（选蹲点、盯鱼都用它）
            this.tNow = 0;

            this.state = 'rest';
            this.timer = 1.6;
            this.after = 'roam';
            this.goal = null;
            this.tries = 0;
            this.stall = 0;
            this.lastDist = 1e9;
            this.hunts = 0;
            this.caught = 0;
            this.misses = 0;
            this.lastHunt = 0;          // 开场先玩一会儿，别一上来就抓鱼
            this.huntGap = 75;          // 距下次捕鱼的间隔，每捕完重新抽（2~4 分钟）
            this.trot = false;          // 这一趟是小跑还是散步
            this.wig = 0;               // 出手前“屁股先抖”的强度
            this.fightRes = null;       // 搏斗期间后端回的信
            this.fightPending = false;  // 后端还在处理这条鱼
            this.fightExtra = 0;        // 等回信多拖了几次
            this.focus = null;      // 蹲守时盯住的那条鱼
            this.lunge = null;

            // 平滑后的姿态参数
            this.p = {
                drop: 0, pitch: 0, headP: 0, headY: 0, headR: 0,
                swing: 0, foldF: 0, foldH: 0, splay: 0,
                tailLift: 0.5, tailW: 0.30, tailF: 3.0,
                squash: 0, scF: 1, scH: 1,
                sit: 0, lie: 0, hop: 0, prey: 0, fight: 0, wig: 0,
            };
        }

        // ---- 地形 ----
        ground(x, z) { return this.I.height(x, z); }

        shoreR(a) { return this.I.coast(a) * 1.02; }

        shorePoint(a) {
            const r = this.shoreR(a) - 0.10;
            return this.constrain(Math.cos(a) * r, Math.sin(a) * r);
        }

        /// 把点挤回岸内，并绕开屋子 / 灯塔 / 潟湖 / 码头
        constrain(x, z) {
            const a = Math.atan2(z, x);
            const r0 = Math.hypot(x, z);
            const lim = this.shoreR(a) - 0.07;
            if (r0 > lim && r0 > 1e-4) {
                x = x / r0 * lim;
                z = z / r0 * lim;
            }
            for (const b of BLOCKS) {
                const ex = x - b.x, ez = z - b.z;
                if (b.box) {
                    const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
                    let lx = c * ex - s * ez;
                    let lz = s * ex + c * ez;
                    if (Math.abs(lx) < b.hw && Math.abs(lz) < b.hd) {
                        const ox = b.hw - Math.abs(lx), oz = b.hd - Math.abs(lz);
                        if (ox < oz) lx = lx >= 0 ? b.hw : -b.hw;
                        else lz = lz >= 0 ? b.hd : -b.hd;
                        x = b.x + c * lx + s * lz;
                        z = b.z - s * lx + c * lz;
                    }
                } else {
                    const d = Math.hypot(ex, ez);
                    if (d < b.r) {
                        if (d > 1e-4) { x = b.x + ex / d * b.r; z = b.z + ez / d * b.r; }
                        else { x = b.x + b.r; }
                    }
                }
            }
            return { x, z };
        }

        /// 屋子靠海那一侧随便找一块地吃饭 / 歇着（前院 / 侧院 / 屋边小径），不固定在楼梯底下
        yardSpot() {
            for (let i = 0; i < 24; i++) {
                const a = (0.10 + Math.random() * 0.80) * Math.PI;
                const r = 2.55 + Math.random() * 1.55;
                const raw = { x: HOUSE.x + Math.cos(a) * r, z: HOUSE.z + Math.sin(a) * r };
                if (this.blockedAt(raw.x, raw.z)) continue;
                const p = this.constrain(raw.x, raw.z);
                if (Math.hypot(p.x, p.z) > this.shoreR(Math.atan2(p.z, p.x)) - 0.35) continue;
                if (this.blockedAt(p.x, p.z) || !this.pathClear(p.x, p.z)) continue;
                const d = Math.hypot(p.x - this.x, p.z - this.z);
                if (d > 0.8 && d < 6.5) return p;
            }
            return { x: DOOR.x, z: DOOR.z };
        }

        /// 岛上随便一个落脚点（只要直着走得通的，不然会挂在墙上）
        randomLand() {
            for (let i = 0; i < 16; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = 1.6 + Math.random() * (this.shoreR(a) - 2.0);
                const raw = { x: Math.cos(a) * r, z: Math.sin(a) * r };
                if (this.blockedAt(raw.x, raw.z)) continue;
                if (!this.pathClear(raw.x, raw.z)) continue;
                const p = this.constrain(raw.x, raw.z);
                const d = Math.hypot(p.x - this.x, p.z - this.z);
                if (d > 0.7 && d < 5.5) return p;
            }
            return { x: HOME.x, z: HOME.z };
        }

        turnTo(want, k) {
            this.yaw += wrapPi(want - this.yaw) * Math.min(1, k);
        }

        to(state, time) {
            this.state = state;
            this.timer = time;
            this.stall = 0;                 // 换了一段路，重新算“有没有在前进”
            this.lastDist = 1e9;
        }

        // ---- 主循环 ----
        update(t, dt, snap) {
            this.snap = snap || this.snap;
            this.tNow = t;
            const fish = (this.snap && this.snap.fish) ? this.snap.fish : [];
            this.timer -= dt;
            if (this.state !== 'pounce' && this.state !== 'play') {
                this.p.hop *= 1 - Math.min(1, dt * 7);
            }

            switch (this.state) {
                case 'rest':
                    this.movespeed = 0;
                    if (this.timer <= 0) this.decide(t);
                    break;

                case 'walk':
                    if (!this.goal) { this.decide(t); break; }
                    this.moveTo(dt, this.carry ? 0.62 : (this.trot ? 0.88 : 0.52));
                    if (this.distTo(this.goal) < 0.06) this.onArrive(t);
                    break;

                case 'crouch': {
                    // 蹲着瞄：盯着最近的那条鱼，够不着就肚皮贴地往前蹭，蹭到身位内才出手
                    this.movespeed = 0;
                    const p = this.pickPrey(fish);
                    this.focus = p ? p.f : null;
                    if (p && p.d < 0.55) this.startPounce(p.f);
                    else if (p && p.d < 1.30 && this.timer > 1.0) this.creep(p.f, dt);
                    if (this.timer <= 0) this.afterCrouch(t);
                    break;
                }

                case 'fight': {
                    // 按住了但鱼还在扑腾，搏斗时间不定
                    this.movespeed = 0;
                    if (this.timer <= 0) {
                        if (this.fightPending && this.fightExtra < 4) {
                            this.fightExtra++;            // 后端回信慢一点，多按一会儿（最多再拖 1 秒）
                            this.timer = 0.3;
                        } else {
                            this.endFight(t);
                        }
                    }
                    break;
                }

                case 'pounce': {
                    const L = this.lunge;
                    if (L) {
                        const k = 1 - Math.max(0, this.timer) / L.dur;
                        this.movespeed = 0.9 * (1 - k);
                        const c = this.constrain(L.sx + L.dx * k * 0.20, L.sz + L.dz * k * 0.20);
                        this.x = c.x; this.z = c.z;
                        this.p.hop = Math.sin(Math.min(k, 1) * Math.PI) * 0.055;
                    }
                    if (this.timer <= 0) this.resolveCatch();
                    break;
                }

                case 'swipe':
                    this.movespeed = 0;
                    if (this.timer <= 0) this.afterCrouch(t);   // 等不到回信就当没抓到
                    break;

                case 'eat': {
                    this.movespeed = 0;
                    const k = 1 - Math.max(0, this.timer) / 2.6;
                    this.p.prey = Math.max(0, 1 - k);          // 鱼越吃越小
                    if (this.timer <= 0) {
                        this.carry = null;
                        this.p.prey = 0;
                        this.after = 'nap';                    // 舔完毛先趴着歇 1~2 分钟
                        this.to('groom', 3.5 + Math.random() * 3);
                    }
                    break;
                }

                case 'groom':
                    this.movespeed = 0;
                    if (this.timer <= 0) this.decide(t);
                    break;

                case 'play':
                    this.movespeed = 0.22;
                    this.gait += dt * 5.5;
                    this.p.hop = Math.abs(Math.sin(t * 5.2)) * 0.045;
                    if (Math.random() < dt * 0.9) this.turnTo(Math.random() * Math.PI * 2, 1);
                    if (this.timer <= 0) { this.p.hop = 0; this.decide(t); }
                    break;

                default:
                    this.decide(t);
                    break;
            }

            this.place();
            this.animate(t, dt);
        }

        distTo(p) { return Math.hypot(p.x - this.x, p.z - this.z); }

        // ---- 决策 ----
        decide(t) {
            if (this.after === 'nap') {          // 刚吃完饭：先趴着歇 1~2 分钟再出来玩
                this.after = '';
                this.goal = null;
                this.to('rest', 60 + Math.random() * 60);
                return;
            }
            const r = Math.random();
            if (t - this.lastHunt > this.huntGap && r < 0.45) { this.startHunt(t); return; }
            if (r < 0.68) this.roam();
            else if (r < 0.86) this.to('groom', 3 + Math.random() * 3);
            else this.to('play', 2.5 + Math.random() * 3);
        }

        /// 四处走走跑跑：三成概率这一趟是小跑
        roam() {
            this.tries = 0;
            this.trot = Math.random() < 0.34;
            let g = Math.random() < 0.34 ? this.yardSpot() : this.randomLand();
            if (this.blockedAt(g.x, g.z) || !this.pathClear(g.x, g.z)) g = this.randomLand();
            this.goal = g;
            this.after = 'rest';
            this.to('walk', 99);
        }

        startHunt(t) {
            const spot = this.bestShoreSpot();
            if (!spot) { this.roam(); return; }
            this.hunts++;
            this.lastHunt = t;
            this.huntGap = 130 + Math.random() * 110;      // 下一轮至少两分钟以后
            this.tries = 0;
            this.trot = false;
            this.focus = null;
            this.goal = spot;
            this.after = 'crouch';
            this.to('walk', 99);
        }

        /// 挑一个“离自己最近、又离鱼群最近、而且直着走得通”的岸边蹲点
        bestShoreSpot() {
            const list = this.snap && this.snap.fish;
            if (!list || !list.length) return null;
            let best = null, bs = 1e9;
            for (const f of list) {
                if (f.s === SHARK) continue;
                const a = Math.atan2(f.z, f.x);
                const p = this.shorePoint(a);
                let s = this.distTo(p) + Math.hypot(p.x - f.x, p.z - f.z) * 1.5;
                if (this.blockedAt(p.x, p.z) || !this.pathClear(p.x, p.z)) s += 6.0;   // 要绕屋子的点往后排
                if (s < bs) { bs = s; best = p; }
            }
            return best;
        }

        pickPrey(fish) {
            let best = null, bd = 1e9;
            for (const f of fish) {
                if (f.s === SHARK) continue;
                const d = Math.hypot(f.x - this.x, f.z - this.z);
                if (d < bd) { bd = d; best = f; }
            }
            return best ? { f: best, d: bd } : null;
        }

        onArrive(t) {
            this.goal = null;
            if (this.after === 'crouch') {
                this.to('crouch', 6 + Math.random() * 6);        // 蹲着瞄一会儿，不马上出手
            } else if (this.after === 'eat') {
                this.to('eat', 2.6);
            } else if (this.after === 'rest') {
                this.to('rest', 8 + Math.random() * 14);
            } else {
                this.decide(t);
            }
        }

        startPounce(f) {
            const dx = f.x - this.x, dz = f.z - this.z;
            const l = Math.hypot(dx, dz) || 1;
            this.prey = { id: f.id, s: f.s, sz: f.sz };
            this.lunge = { sx: this.x, sz: this.z, dx: dx / l, dz: dz / l, dur: 0.30 };
            this.to('pounce', 0.30);
        }

        /// 蹲着往前蹭：肚皮贴地、脚步极小，只朝目标鱼靠（前面堵住了就停下接着瞄）
        creep(f, dt) {
            const dx = f.x - this.x, dz = f.z - this.z;
            const d = Math.hypot(dx, dz);
            if (d < 1e-4) return;
            const ux = dx / d, uz = dz / d;
            if (this.aheadBlocked(ux, uz)) { this.movespeed = 0; return; }
            const step = Math.min(d, 0.14 * dt);
            const c = this.constrain(this.x + ux * step, this.z + uz * step);
            this.movespeed = Math.hypot(c.x - this.x, c.z - this.z) / Math.max(dt, 1e-3);
            this.x = c.x; this.z = c.z;
            this.gait += this.movespeed * dt * 11.0;      // 慢动作的小碎步
            this.turnTo(Math.atan2(ux, uz), dt * 2.0);
        }

        /// 扑完了：咬住就进入搏斗（时间不定），没咬住就挠一下水
        resolveCatch() {
            this.lunge = null;
            this.wig = 0;
            const f = this.prey;
            const hit = f && Math.random() < 0.72;
            if (!hit) {
                this.prey = null;
                this.to('swipe', 0.45 + Math.random() * 0.55);
                return;
            }
            // 鱼在爪子底下扑腾，同时把这条鱼交给后端取走（回信在搏斗结束时才用）
            this.showPrey(f.s, f.sz);
            this.fightRes = null;
            this.fightExtra = 0;
            this.fightPending = !!this.api.catchFish;
            this.to('fight', 0.9 + Math.random() * 2.6);
            if (this.api.catchFish) {
                const p = this.api.catchFish(f.id);
                const set = (r) => { this.fightRes = r || null; this.fightPending = false; };
                if (p && p.then) p.then(set).catch(() => set(null));
                else set(p);
            } else {
                this.fightRes = { ok: true, s: f.s, sz: f.sz };
            }
        }

        /// 搏斗结束：鱼归我了就叼到屋子附近吃掉，否则算没抓着
        endFight(t) {
            const r = this.fightRes;
            this.fightRes = null;
            this.fightPending = false;
            this.prey = null;
            if (r && r.ok) {
                this.caught++;
                this.carry = { s: r.s, sz: r.sz };
                this.showPrey(r.s, r.sz);
                this.tries = 0;
                this.trot = false;
                this.goal = this.yardSpot();          // 就在屋子附近找块地方吃，不固定在楼梯底下
                this.after = 'eat';
                this.to('walk', 99);
            } else {
                this.p.prey = 0;
                this.afterCrouch(t);
            }
        }

        /// 这一轮没抓到：换个岸边位置再蹲，或者干脆去玩
        afterCrouch(t) {
            this.prey = null;
            this.p.prey = 0;
            this.misses++;
            this.tries++;
            if (this.tries <= 2) {
                const spot = this.bestShoreSpot() || this.randomLand();
                this.goal = spot;
                this.after = 'crouch';
                this.to('walk', 99);
            } else {
                this.tries = 0;
                if (Math.random() < 0.5) this.roam();
                else { this.goal = this.yardSpot(); this.after = 'rest'; this.to('walk', 99); }
            }
        }

        showPrey(species, sz) {
            const sp = SPECIES[species] || SPECIES[0];
            this.rig.pbody.material.color.set(sp.tail);
            const k = 0.60 + 0.34 * (sz || 1);
            this.rig.prey.scale.setScalar(k);
            this.rig.prey.visible = true;
            this.p.prey = 1;
        }

        /// 调试用：把猫钉在某个姿态上不动（tools/cat_shots.py 逐个造型截图）
        pose(name) {
            this.timer = 999;
            this.lunge = null;
            this.focus = null;
            this.carry = null;
            this.wig = 0;
            this.goal = null;
            this.p.prey = 0;
            this.state = name;
            if (name === 'walk') {
                this.goal = { x: this.x + 2, z: this.z + 2 };
                this.after = 'rest';
            } else if (name === 'carry') {
                this.carry = { s: 0, sz: 1 };
                this.showPrey(0, 1);
                this.goal = { x: this.x + 2, z: this.z + 2 };
                this.after = 'eat';
                this.state = 'walk';
            } else if (name === 'eat') {
                this.carry = { s: 0, sz: 1 };
                this.showPrey(0, 1);
                this.timer = 1.2;            // 别真吃完，吃完就跳 groom 了
            } else if (name === 'fight' || name === 'swipe') {
                this.showPrey(0, 1);         // 爪子底下按一条鱼
            } else if (name === 'crouch') {
                this.wig = 1;                // 出手前的屁股抖
            }
        }

        // ---- 走路 ----
        /// 这个点是不是落在某个实心道具里
        blockedAt(x, z) {
            for (const b of BLOCKS) {
                if (b.box) {
                    const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
                    const ex = x - b.x, ez = z - b.z;
                    if (Math.abs(c * ex - s * ez) < b.hw && Math.abs(s * ex + c * ez) < b.hd) return true;
                } else if (Math.hypot(x - b.x, z - b.z) < b.r) {
                    return true;
                }
            }
            return false;
        }

        /// 顺着这个方向往前探一小段，会不会撞上道具
        aheadBlocked(dx, dz) {
            for (let s = 0.14; s <= 0.40; s += 0.13) {
                if (this.blockedAt(this.x + dx * s, this.z + dz * s)) return true;
            }
            return false;
        }

        /// 从当前位置直着走到 (x,z) 通不通（每隔 0.2 探一下）
        pathClear(x, z) {
            const dx = x - this.x, dz = z - this.z;
            const d = Math.hypot(dx, dz);
            const n = Math.ceil(d / 0.20);
            for (let i = 1; i <= n; i++) {
                if (this.blockedAt(this.x + dx * i / n, this.z + dz * i / n)) return false;
            }
            return true;
        }

        moveTo(dt, speed) {
            const g = this.goal;
            if (!g) return;
            let dx = g.x - this.x, dz = g.z - this.z;
            const d = Math.hypot(dx, dz);
            if (d < 1e-4) { this.movespeed = 0; return; }
            dx /= d; dz /= d;

            // 屋子 / 码头是实心的，直愣愣走过去会被挤在墙上原地打转：绕不开就贴着边走
            if (this.aheadBlocked(dx, dz)) {
                let turned = false;
                for (const ang of [0.55, -0.55, 1.15, -1.15, 1.80, -1.80]) {
                    const c = Math.cos(ang), s = Math.sin(ang);
                    const nx = dx * c - dz * s, nz = dx * s + dz * c;
                    if (!this.aheadBlocked(nx, nz)) { dx = nx; dz = nz; turned = true; break; }
                }
                if (!turned) { this.movespeed = 0; return; }      // 真被围死了，等下一帧
            }

            const step = Math.min(d, speed * dt);
            const px = this.x, pz = this.z;
            const c = this.constrain(px + dx * step, pz + dz * step);
            this.x = c.x; this.z = c.z;
            const mvx = this.x - px, mvz = this.z - pz;
            const ml = Math.hypot(mvx, mvz);
            this.movespeed = ml / Math.max(dt, 1e-3);
            if (ml > 1e-5) this.turnTo(Math.atan2(mvx, mvz), dt * 8);
            this.gait += ml * 21.0;

            // 走了 4 秒还没真正走近过就换个目标（卡在墙角兼容用）。阀值按这一帧本应该走多远算，
            // 不能拿一个定值比：不然正常走路每帧只前进 0.01，反而会被当成原地打转。
            if (d < this.lastDist - speed * dt * 0.35) { this.lastDist = d; this.stall = 0; }
            else this.stall += dt;
            if (this.stall > 4) {
                this.stall = 0;
                this.lastDist = 1e9;
                if (this.carry) {                     // 叼着鱼走不动：就地吃掉，别把鱼叼丢了
                    this.goal = null;
                    this.to('eat', 2.6);
                    return;
                }
                const spot = this.after === 'crouch' ? this.bestShoreSpot() : null;
                if (spot) { this.goal = spot; return; }
                this.goal = null;
                this.roam();
            }
        }

        // ---- 落地：贴地形 + 顺坡俯仰 ----
        place() {
            const y = this.ground(this.x, this.z);
            const fwd = 0.16;
            const fx = this.x + Math.sin(this.yaw) * fwd, fz = this.z + Math.cos(this.yaw) * fwd;
            const bx = this.x - Math.sin(this.yaw) * fwd, bz = this.z - Math.cos(this.yaw) * fwd;
            const want = -Math.atan2(this.ground(fx, fz) - this.ground(bx, bz), fwd * 2);
            this.slope += (want - this.slope) * 0.18;
            this.root.position.set(this.x, y + this.p.hop, this.z);
            this.root.rotation.set(this.slope, this.yaw, 0);
            this.shadow.position.set(this.x, y + 0.026, this.z);
            this.shadow.scale.setScalar(1 + this.p.hop * 1.4);
            this.shadow.material.opacity = 0.22 * Math.max(0, 1 - this.p.hop * 2.2);
        }

        // ---- 姿态 ----
        animate(t, dt) {
            const p = this.p;
            const st = this.state;
            const walk = st === 'walk' && this.movespeed > 0.05;
            const k = Math.min(1, dt * 9);

            let drop = 0, pitch = 0, headP = 0.05, headY = 0, headR = 0;
            let swing = 0, foldF = 0, foldH = 0, splay = 0;
            let squash = 0, scF = 1, scH = 1;                 // 身子压扁 / 腿缩进身子
            let tailLift = 0.55, tailW = 0.26, tailF = 2.6;
            let sit = 0, lie = 0;

            // 腿长 0.168、髖部高 ≈ 0.20，所以身子每往下沉一点，腿就得往后（正）或往前（负）斜一点，
            // 不然脚掌会插进沙里。下面每个姿态的 drop / fold / 腿长是一起算过的。
            if (walk) {
                swing = 0.52;
                tailW = 0.34; tailF = 5.0;
                drop = -0.006;
            }
            if (st === 'crouch' || st === 'pounce' || st === 'swipe' || st === 'fight') {
                drop = -0.050; pitch = 0.04;
                foldF = 0.42; foldH = 0.62; scF = 0.92; scH = 0.88;
                squash = 0.20; headP = -0.10;
                tailLift = 0.18; tailW = 0.42; tailF = 8.0;
                if (st === 'swipe') { swing = 0.7; headP = 0.26; foldF = 0.12; }
                if (st === 'fight') {                    // 上身前倾、屁股抬高，前爪轮流拍
                    pitch = 0.12; headP = 0.26; foldF = 0.24; foldH = 0.50;
                    tailLift = 0.05; tailW = 0.55; tailF = 11.0;
                }
            }
            if (st === 'rest') {
                lie = 1; drop = -0.112; headP = -0.06; squash = 1.0;
                foldF = -0.52; foldH = 0.70; scF = 0.52; scH = 0.46; splay = 0.40;
                tailLift = 0.05; tailW = 0.12; tailF = 1.1;
            }
            if (st === 'groom' || st === 'eat') {
                sit = 1; drop = -0.018; pitch = -0.46;
                foldH = -0.95; scH = 0.50; squash = 0.10;
                tailLift = 0.28; tailW = 0.16; tailF = 1.6;
            }
            if (st === 'play') {
                swing = 0.30; foldF = 0.25; foldH = 0.40; scH = 0.90;
                headP = 0.18; tailLift = 1.05; tailW = 0.60; tailF = 9.0;
            }
            if (this.carry) {
                headP += 0.30; drop += 0.004;
                tailLift = 0.85; tailW = 0.20; tailF = 3.4;
            }

            // 蹲守 / 吃食 / 洗脸时的小动作
            if (st === 'crouch') {
                // 眼睛跟着目标鱼，越接近出手尾巴摇得越快、屁股先抖
                const d = this.focus ? Math.hypot(this.focus.x - this.x, this.focus.z - this.z) : 9;
                this.wig = Math.max(0, Math.min(1, this.wig + (d < 1.25 ? dt * 1.1 : -dt * 1.8)));
                if (this.focus) {
                    const a = Math.atan2(this.focus.x - this.x, this.focus.z - this.z);
                    headY = Math.max(-0.6, Math.min(0.6, wrapPi(a - this.yaw)));
                }
                tailF = 8.0 + this.wig * 4.5;
                headP = -0.10 + Math.sin(t * 20) * 0.05 * this.wig;
                if (this.movespeed > 0.01) {            // 蹭步：腿小小地交替往前扒
                    swing = 0.16; foldF = 0.34; foldH = 0.52;
                }
            } else {
                this.wig = Math.max(0, this.wig - dt * 1.8);
            }
            if (st === 'fight') {
                headP = 0.26 + Math.sin(t * 7.5) * 0.10;
                headR = Math.sin(t * 6.2) * 0.16;
                this.gait += dt * 2.2;                  // 身子跟着扭
            }
            if (st === 'groom') {
                const c = Math.sin(t * 6.2);
                headP = 0.42 + c * 0.16; headR = 0.30 * Math.sin(t * 3.1);
                headY = 0.55 * Math.sin(t * 1.5);
            }
            if (st === 'eat') {
                headP = 0.55 + Math.sin(t * 11.0) * 0.16;
            }
            if (st === 'rest') {
                drop += Math.sin(t * 1.6) * 0.004;                 // 呼吸
                if (Math.random() < dt * 0.12) headP = 0.12;       // 偶尔抬头
            }
            if (st === 'play') {
                headY = Math.sin(t * 7.0) * 0.4;
            }

            p.drop += (drop - p.drop) * k;
            p.pitch += (pitch - p.pitch) * k;
            p.headP += (headP - p.headP) * k;
            p.headY += (headY - p.headY) * k;
            p.headR += (headR - p.headR) * k;
            p.swing += (swing - p.swing) * k;
            p.foldF += (foldF - p.foldF) * k;
            p.foldH += (foldH - p.foldH) * k;
            p.splay += (splay - p.splay) * k;
            p.squash += (squash - p.squash) * k;
            p.scF += (scF - p.scF) * k;
            p.scH += (scH - p.scH) * k;
            p.tailLift += (tailLift - p.tailLift) * k;
            p.tailW += (tailW - p.tailW) * k;
            p.tailF += (tailF - p.tailF) * 0.08;
            p.sit += (sit - p.sit) * Math.min(1, dt * 6);
            p.lie += (lie - p.lie) * Math.min(1, dt * 5);
            p.fight += ((st === 'fight' ? 1 : 0) - p.fight) * k;
            p.wig += (this.wig - p.wig) * k;

            const rig = this.rig;
            // 基准值和 buildRig 保持一致，这里只叠加姿态偏移
            const sq = 1 - p.squash * 0.26;
            rig.body.position.y = 0.186 + p.drop + p.sit * 0.014;
            rig.body.position.z = -p.sit * 0.022;            // 坐下去时屁股往后坐、上身往前挺
            rig.body.rotation.x = p.pitch;
            rig.body.rotation.z = p.lie * 0.10 + Math.sin(t * 22) * 0.035 * p.wig;
            rig.body.scale.set(1 + p.squash * 0.10, sq, 1 + p.squash * 0.14);
            rig.head.position.y = 0.112 - p.lie * 0.030;
            rig.head.position.z = 0.200 + p.lie * 0.018;
            rig.head.rotation.set(p.headP - p.lie * 0.10, p.headY, p.headR);
            rig.head.rotation.order = 'YXZ';

            // 对角步：右前 + 左后同相
            const PH = [0, Math.PI, Math.PI, 0];
            for (let i = 0; i < 4; i++) {
                const front = i < 2;
                const fold = front ? p.foldF : p.foldH;
                const len = front ? p.scF : p.scH;
                const sw = Math.sin(this.gait + PH[i]) * p.swing;
                // 搏斗时两只前爪轮流往前拍（rotation.x 负值 = 往前）
                const kick = i < 2
                    ? p.fight * Math.max(0, Math.sin(t * 13 + (i === 0 ? 0 : Math.PI))) * 0.55 : 0;
                rig.legs[i].rotation.set(
                    sw + fold - kick,
                    0,
                    p.splay * (i % 2 === 0 ? 0.5 : -0.5) + p.lie * (i % 2 === 0 ? 0.26 : -0.26));
                rig.legs[i].scale.y = len;
            }

            const tw = p.tailW;
            for (let i = 0; i < rig.tail.length; i++) {
                const w = this.gait * 0.35 + t * p.tailF + i * 0.55;
                rig.tail[i].rotation.x = p.tailLift * 0.34 + Math.sin(w) * tw * 0.35 - p.lie * 0.06;
                rig.tail[i].rotation.y = Math.sin(w + 0.6) * tw + p.lie * 0.30;
            }
            rig.tailRoot.rotation.x = 0.18 + p.tailLift * 0.95 - p.lie * 0.55;

            // 叼着的鱼：搏斗时拼命挣，吃的时候越来越小
            if (this.carry || this.p.prey > 0.02) {
                const s = (0.60 + 0.34 * ((this.carry && this.carry.sz) || 1)) * Math.max(0.02, p.prey);
                rig.prey.scale.setScalar(s);
                rig.prey.visible = p.prey > 0.03;
                rig.prey.rotation.z = Math.sin(t * (3.2 + p.fight * 11)) * (0.12 + p.fight * 0.42);
            } else {
                rig.prey.visible = false;
            }
        }
    }

    window.CatLayer = Cat;
})();
