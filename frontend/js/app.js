// 海岛鱼缸 —— 前端主控
//
// 场景：island.js（原样保留的小岛建模）+ creatures.js（环海鱼群 / 鱼食）+ cat.js（岛上的猫）
// 交互：点水面撒一把饲料，鱼会凑上来吃；1 / 2 / 3 / 4 切机位（全岛 / 跟鱼群 / 跟猫 / 俯视）
// 后端：C++ 每 50ms 推一份全量快照，这里只做插值与动画；猫抓到鱼用 catch_fish 交给后端取走
(function () {
    const T = THREE;

    // -----------------------------------------------------------------
    // 与后端通信
    // -----------------------------------------------------------------
    const bridge = window.__tauricpp__;
    const invoke = (cmd, args) => (bridge ? bridge.invoke(cmd, args) : Promise.resolve(null));
    const listen = (ev, cb) => (bridge ? bridge.listen(ev, cb) : () => {});

    function reportError(msg) {
        try { invoke('log_error', { message: String(msg) }).catch(() => {}); } catch (e) { /* 忽略 */ }
    }
    window.addEventListener('error', (e) =>
        reportError((e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0)));
    window.addEventListener('unhandledrejection', (e) =>
        reportError('promise: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));

    const I = window.Island;
    if (!I) {
        reportError('island.js 未就绪：window.Island 不存在');
        document.querySelector('.loading p').textContent = '场景加载失败，按 F12 查看控制台';
        return;
    }

    const C = window.Creatures;
    // 猫叼不动 / 镜头不跟的大块头（现在是鲨鱼）
    const BIG_INDEX = new Set((C.SPECIES || [])
        .map((sp, i) => (sp.shark || sp.big) ? i : -1).filter((i) => i >= 0));

    // 像素比压到 1.4：WebView2 里高 DPI 下最吃帧率的就是这块
    I.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    I.renderer.setSize(window.innerWidth, window.innerHeight);

    // -----------------------------------------------------------------
    // 状态 / 图层
    // -----------------------------------------------------------------
    const state = {
        snap: null,
        ready: false,
        view: 'island',
        fps: 0,
    };

    let toastTimer = 0;
    function toast(text) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = text;
        el.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1900);
    }

    const school = new C.School(I.scene);
    const food = new C.FoodLayer(I.scene);
    const crabs = new C.CrabLayer(I.scene);
    const ripples = new C.Ripples(I.scene);
    const cat = new window.CatLayer(I.scene, I, {
        catchFish: (id) => invoke('catch_fish', { id }),   // 猫抓鱼不弹提示，静默交给后端取走
    });

    // -----------------------------------------------------------------
    // 机位
    //   island / top：固定鸟瞰机位，玩家一拖动 / 滚轮就把控制权交出去（转 'free'）
    //   sea / cat   ：镜头跟着主体平移，只跟不抢视角 —— 高度、远近、方向归玩家的滚轮 / 拖动说了算
    //   free        ：完全交给 OrbitControls
    // -----------------------------------------------------------------
    const VIEWS = {
        island: { pos: [18.5, 15.5, 22.5], target: [0, -0.40, 0] },
        top: { pos: [0.02, 26, 6], target: [0, -0.15, 0] },
    };
    const camGoal = { pos: new T.Vector3().fromArray(VIEWS.island.pos),
                      target: new T.Vector3().fromArray(VIEWS.island.target) };
    const followPt = new T.Vector3();                  // 这一帧要跟到的点
    const followPreset = { pos: new T.Vector3(), target: new T.Vector3() };
    let framed = false;                                // 刚切到跟随机位：先摆一次默认取景
    let frameT = 0;                                    // 摆机位的时间，飞到位之前还是往默认取景靠

    function setView(name) {
        state.view = name;
        framed = false;
        frameT = 0;
        if (name === 'sea') schoolFocus = 0;            // 重新选个鱼群
        if (name === 'sea' || name === 'cat') return;   // 跟随模式每帧重算
        const v = VIEWS[name];
        if (!v) return;
        camGoal.pos.fromArray(v.pos);
        camGoal.target.fromArray(v.target);
    }

    let schoolFocus = 0;                   // 正在盯的那条鱼：黏住，别在两个鱼群之间来回甩

    /// 身边鱼最多的那一条：默认从水面上方斜俯下去
    function focusSchool() {
        const snap = state.snap;
        if (!snap || !snap.fish.length) return false;
        let pick = null, best = -1, cur = null, curN = -1;
        for (const f of snap.fish) {
            if (BIG_INDEX.has(f.s)) continue;
            let n = 0;
            for (const g of snap.fish) {
                if (Math.hypot(g.x - f.x, g.z - f.z) < 1.3) n++;
            }
            if (n > best) { best = n; pick = f; }
            if (f.id === schoolFocus) { cur = f; curN = n; }
        }
        // 原来那条只在自己明显更冷落时才换群，不然镜头会两头甩
        if (cur && curN >= best - 1) pick = cur;
        schoolFocus = pick.id;
        const a = Math.atan2(pick.z, pick.x);
        const tx = -Math.sin(a), tz = Math.cos(a);      // 只沿环切向移动，不会飞到岛上
        // 默认拉高一点、退后一点：一眼能看到整群鱼，又不至于贴到水面上
        followPreset.target.set(pick.x, -0.05, pick.z);
        followPreset.pos.set(pick.x + tx * 1.45, 3.30, pick.z + tz * 1.45);
        followPt.set(pick.x, -0.05, pick.z);
        return true;
    }

    /// 跟着猫：默认机位从海面上方斜俯下去（相机在岸外，不会被岛上的桥 / 廊台挡住）
    function focusCat() {
        const a = Math.atan2(cat.z, cat.x);
        const ox = Math.cos(a), oz = Math.sin(a);       // 径向外侧（海面方向）
        const y = cat.ground(cat.x, cat.z);
        // 同样拉高拉远：猫在画面里占个中等身位，周围的小岛也带得进来
        followPreset.target.set(cat.x, y + 0.18, cat.z);
        followPreset.pos.set(cat.x + ox * 2.35, y + 2.85, cat.z + oz * 2.35);
        const pr = Math.hypot(followPreset.pos.x, followPreset.pos.z);
        if (pr > 9.2) {
            // 别把相机伸到水体外面，退到内一点
            const k = 9.2 / pr;
            followPreset.pos.x *= k;
            followPreset.pos.z *= k;
        }
        followPt.set(cat.x, y + 0.18, cat.z);
        return true;
    }

    /// 跟随：主体动，相机跟着挪同样的量，“相机 - 目标”的偏移（= 玩家定的高度 / 方向 / 远近）原样保留
    function followCamera(dt) {
        const cam = I.camera, C = I.controls;
        const k = 1 - Math.exp(-dt * 5);
        if (frameT < 0.9) {
            // 刚切过来：先把镜头飞到默认取景上，飞到位之后再交给玩家
            frameT += dt;
            cam.position.lerp(followPreset.pos, k);
            C.target.lerp(followPreset.target, k);
            return;
        }
        if (!framed) {
            // 飞位结束：就以当前这个“相机 - 目标”偏移为基准，之后只跟不转
            framed = true;
            return;
        }
        const px = C.target.x, py = C.target.y, pz = C.target.z;
        C.target.lerp(followPt, 1 - Math.exp(-dt * 6));
        cam.position.x += C.target.x - px;
        cam.position.y += C.target.y - py;
        cam.position.z += C.target.z - pz;
        // 玩家把视角压得太低时别钻进沙地里（只往上抬，不动玩家的高度设定）
        const floor = I.height(cam.position.x, cam.position.z) + 0.12;
        if (cam.position.y < floor) cam.position.y = floor;
    }

    function updateCamera(dt) {
        if (state.view === 'sea') {
            if (focusSchool()) followCamera(dt);
            return;
        }
        if (state.view === 'cat') {
            focusCat();
            followCamera(dt);
            return;
        }
        // 玩家一旦自己拖动 / 滚轮，镜头就全交给 OrbitControls，不再每帧往机位上拽
        if (state.view === 'free') return;
        const k = 1 - Math.exp(-dt * 5);
        I.camera.position.lerp(camGoal.pos, k);
        I.controls.target.lerp(camGoal.target, k);
    }

    // 鸟瞰档：玩家一动手就转成自由视角；跟随档：拖动 / 滚轮只改自己的视角，跟随不停
    I.controls.addEventListener('start', () => {
        if (state.view === 'island' || state.view === 'top') state.view = 'free';
    });

    // -----------------------------------------------------------------
    // 投喂
    // -----------------------------------------------------------------
    const raycaster = new T.Raycaster();
    const ndc = new T.Vector2();

    /// 屏幕坐标 → 水面上的世界坐标（水面是 island.js 里那块 y=0.105 的平面）
    function pickWater(clientX, clientY) {
        ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(ndc, I.camera);
        const hits = raycaster.intersectObject(I.sea, false);
        return hits.length ? hits[0].point : null;
    }

    /// 把任意点收到环海里（岸线外一点 · 水面内沿），饲料不会撒到岛上
    function ringPoint(x, z) {
        const a = Math.atan2(z, x);
        const shore = I.coast(a) * 1.02;
        const r = Math.min(Math.max(Math.hypot(x, z), shore + 0.10), 7.9);
        return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }

    function feed(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        ripples.burst(x, z, 3);
        invoke('feed', { x, z, count: 12 })
            .then((res) => { if (res && res.state) applyState(res.state); })
            .catch((e) => reportError('feed 失败: ' + e));
    }

    const canvas = I.renderer.domElement;
    let downAt = null;

    canvas.addEventListener('pointerdown', (e) => {
        downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    });

    canvas.addEventListener('pointerup', (e) => {
        if (!downAt) return;
        const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
        const held = performance.now() - downAt.t;
        downAt = null;
        if (moved > 8 || held > 700) return;            // 拖动环视 / 长按，不算投喂
        const p = pickWater(e.clientX, e.clientY);
        if (!p) { toast('这里没有水，撒不了饲料'); return; }
        const q = ringPoint(p.x, p.z);
        feed(q.x, q.z);
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === '1') setView('island');
        else if (e.key === '2') setView('sea');
        else if (e.key === '3') setView('cat');
        else if (e.key === '4') setView('top');
    });

    // 窗口尺寸是 island.js 自己响应的（它会重算相机 aspect / 雾距 / renderer 尺寸）

    // -----------------------------------------------------------------
    // 每帧
    // -----------------------------------------------------------------
    let fpsAcc = 0, fpsFrames = 0;

    I.hooks.push((t, dt) => {
        school.update(t, dt, state.snap);
        food.update(state.snap && state.snap.food, t);
        crabs.update(state.snap && state.snap.crawlers, t, I);
        cat.update(t, dt, state.snap);
        ripples.update(t, dt);
        updateCamera(dt);

        fpsAcc += dt;
        fpsFrames++;
        if (fpsAcc >= 0.5) {
            state.fps = fpsFrames / fpsAcc;
            fpsAcc = 0;
            fpsFrames = 0;
        }
    });

    function applyState(s) {
        if (!s || !s.stats) return;
        state.snap = s;
        if (!state.ready) {
            state.ready = true;
            document.body.classList.remove('is-loading');
        }
    }

    // -----------------------------------------------------------------
    // 启动
    // -----------------------------------------------------------------
    listen('tick', applyState);
    invoke('get_state')
        .then((s) => { if (s && s.stats) applyState(s); })
        .catch((e) => reportError('get_state 失败: ' + e));

    // 场景本身是即时生成的，2.5 秒后无论如何都把遮罩撤掉
    setTimeout(() => document.body.classList.remove('is-loading'), 2500);

    // 调试 / 自动化验证用
    window.AQ = {
        state: () => state,
        island: I,
        school,
        cat,
        feed,
        setView,
        camGoal,
        pickWater,
        ringPoint,
        fps: () => state.fps,
        cmd: invoke,
        toast,
    };
})();
