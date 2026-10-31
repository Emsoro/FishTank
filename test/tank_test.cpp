// 鱼群模拟的单元测试（不依赖窗口 / 渲染）
//
// 覆盖：环海边界、鱼群密度、投喂吸引、鱼上浮摄食、饲料生命周期、
//       确定性、快照字段、鲨鱼/红色鱼、猫抓鱼，以及 coast() 与前端 island.js 是否一致。
#include <Windows.h>

#include <cmath>
#include <cstdio>
#include <string>

#include "tank.hpp"

namespace {

int g_checks = 0;
int g_failures = 0;

void Check(bool ok, const std::string& what) {
    ++g_checks;
    if (!ok) {
        ++g_failures;
        std::printf("  [FAIL] %s\n", what.c_str());
    }
}

std::string Fmt(const char* fmt, double a, double b = 0.0, double c = 0.0) {
    char buf[256];
    std::snprintf(buf, sizeof(buf), fmt, a, b, c);
    return buf;
}

/// 鱼是否在环海内（岸线外 · 水面内沿 · 水层内）
bool InsideRing(const tank::Fish& f, float slack = 0.02f) {
    const float a = std::atan2(f.z, f.x);
    const float r = std::sqrt(f.x * f.x + f.z * f.z);
    const bool radial = r >= tank::Coast(a) + tank::kShorePad - slack && r <= tank::kBaseR + slack;
    const bool depth = f.y >= tank::kSwimLow - 1e-3f && f.y <= tank::kSwimHigh + 1e-3f;
    return radial && depth;
}

void TestCoastMatchesFrontend() {
    // island.js: 6.45 + .35 sin(3a+.4) + .27 cos(5a-1) + .18 sin(7a)
    const float expect0 = 6.45f + 0.35f * std::sin(0.4f) + 0.27f * std::cos(-1.0f);
    Check(std::fabs(tank::Coast(0.0f) - expect0) < 1e-4f,
          Fmt("Coast(0) 应与前端一致，期望 %.4f 实际 %.4f", expect0, tank::Coast(0.0f)));

    float lo = 1e9f, hi = -1e9f;
    for (int i = 0; i < 720; ++i) {
        const float v = tank::Coast(static_cast<float>(i) * 0.00873f);
        lo = std::fmin(lo, v);
        hi = std::fmax(hi, v);
    }
    Check(lo > 5.5f && hi < 7.6f, Fmt("岸线应在 5.5~7.6 之间，实际 %.3f~%.3f", lo, hi));
    Check(tank::ShoreRadius(6.0f, 0.0f) == tank::Coast(0.0f), "ShoreRadius 与 Coast 一致");
}

void TestPopulateInsideRing() {
    for (int stock = 0; stock <= 2; ++stock) {
        tank::Tank t;
        t.SetStock(stock);
        t.Reset(7u + static_cast<uint32_t>(stock));

        Check(!t.fishes().empty(), "每个密度都要有鱼");
        for (const auto& f : t.fishes()) {
            Check(InsideRing(f), Fmt("放鱼位置应在环海内 (%.2f, %.2f, %.2f)", f.x, f.y, f.z));
            Check(f.species >= 0 && f.species < tank::kSpeciesCount, "鱼种下标合法");
            Check(f.size > 0.8f && f.size < 1.2f, "个体大小在 0.8~1.2 之间");
            Check(std::fabs(std::sqrt(f.dx * f.dx + f.dy * f.dy + f.dz * f.dz) - 1.0f) < 1e-3f,
                  "初始朝向是单位向量");
        }
        for (const auto& c : t.crawlers()) {
            const float a = std::atan2(c.z, c.x);
            const float r = std::sqrt(c.x * c.x + c.z * c.z);
            Check(r < tank::Coast(a) * 1.02f && r > tank::Coast(a) * 1.02f - 0.35f,
                  Fmt("寄居蟹应趴在岸线湿沙上，r=%.3f", r));
        }
    }
}

void TestStockDensity() {
    int counts[3] = {0, 0, 0};
    for (int stock = 0; stock <= 2; ++stock) {
        tank::Tank t;
        t.SetStock(stock);
        t.Reset(99u);
        counts[stock] = static_cast<int>(t.fishes().size());
        Check(t.stock() == stock, "stock 记录正确");
    }
    Check(counts[0] < counts[1], Fmt("稀疏<%d> 应少于 正常<%d>", counts[0], counts[1]));
    Check(counts[1] < counts[2], Fmt("正常<%d> 应少于 密集<%d>", counts[1], counts[2]));

    // 换密度会重新放鱼，不残留旧鱼
    tank::Tank t;
    t.Reset(5u);
    const int before = static_cast<int>(t.fishes().size());
    t.SetStock(0);
    Check(static_cast<int>(t.fishes().size()) < before, "切到稀疏后鱼变少");
}

void TestBoundsHoldOverTime() {
    tank::Tank t;
    t.Reset(31u);
    t.Feed(7.0f, 1.2f, 20);

    int worst = 0;
    for (int step = 0; step < 600; ++step) {   // 30 秒
        t.Step(0.05f);
        for (const auto& f : t.fishes()) {
            if (!InsideRing(f, 0.05f)) ++worst;
        }
    }
    Check(worst == 0, Fmt("30 秒内始终不出环海，越界次数=%d", worst));
}

void TestFeedPoursPellets() {
    tank::Tank t;
    t.Reset(11u);
    Check(t.pellets().empty(), "初始没有饲料");
    Check(t.fed() == 0, "初始没投喂过");

    t.Feed(7.0f, 0.0f, 12);
    Check(static_cast<int>(t.pellets().size()) == 12, "投喂 12 粒就有 12 粒");
    Check(t.fed() == 12, "投喂计数");
    for (const auto& p : t.pellets()) {
        Check(p.y <= tank::kSeaLevel && p.y > tank::kSeaLevel - 0.05f, "饲料从水面落下");
        const float a = std::atan2(p.z, p.x);
        const float r = std::sqrt(p.x * p.x + p.z * p.z);
        Check(r > tank::Coast(a), Fmt("饲料不会落到岛上，r=%.3f", r));
    }

    // 撒到岛上会被推回环海
    tank::Tank u;
    u.Reset(12u);
    u.Feed(0.5f, 0.5f, 4);   // 岛心
    for (const auto& p : u.pellets()) {
        const float a = std::atan2(p.z, p.x);
        const float r = std::sqrt(p.x * p.x + p.z * p.z);
        Check(r > tank::Coast(a), Fmt("岛心的落点被推到环海，r=%.3f", r));
    }
}

void TestFeedAttractsFish() {
    tank::Tank t;
    t.Reset(2024u);

    // 在第一条鱼旁边（环海内）撒食，鱼应该游过来而不是原地吃到
    const tank::Fish first = t.fishes()[0];
    float x0 = first.x + 1.0f;
    float z0 = first.z + 0.4f;
    {
        const float a = std::atan2(z0, x0);
        const float shore = tank::Coast(a);
        const float r = std::fmin(std::fmax(std::sqrt(x0 * x0 + z0 * z0), shore + 0.6f), 7.9f);
        x0 = std::cos(a) * r;
        z0 = std::sin(a) * r;
    }

    auto nearest = [&]() {
        float best = 1e9f;
        for (const auto& f : t.fishes()) {
            const float d = std::sqrt((f.x - x0) * (f.x - x0) + (f.z - z0) * (f.z - z0));
            best = std::fmin(best, d);
        }
        return best;
    };

    const float before = nearest();
    t.Feed(x0, z0, 14);

    float closest = before;
    float topY = -9.0f;
    for (int step = 0; step < 200; ++step) {   // 10 秒
        t.Step(0.05f);
        closest = std::fmin(closest, nearest());
        for (const auto& f : t.fishes()) topY = std::fmax(topY, f.y);
    }

    Check(closest < 0.32f, Fmt("鱼群应游到饲料处，最近距离 %.3f → %.3f", before, closest));
    Check(t.eaten() > 0, Fmt("应该吃到饲料，eaten=%d", t.eaten()));
    Check(t.eaten() <= t.fed(), "吃掉的不会超过投喂的");
    Check(topY > tank::kSwimLow + 0.06f, Fmt("上浮摄食时应离开贴底水层，最高 y=%.3f", topY));
}

void TestPelletLifecycle() {
    tank::Tank t;
    t.SetStock(0);
    t.Reset(3u);
    t.Feed(7.2f, 0.0f, 10);

    // 没鱼在附近时（把鱼都拿走不现实）—— 只看饲料会持续下沉
    const float y0 = t.pellets().empty() ? 0.0f : t.pellets()[0].y;
    for (int i = 0; i < 40; ++i) t.Step(0.05f);
    const float y1 = t.pellets().empty() ? y0 : t.pellets()[0].y;
    Check(!t.pellets().empty(), "饲料不会凭空消失");
    Check(y1 < y0, Fmt("饲料持续下沉 %.4f → %.4f", y0, y1));
    for (const auto& p : t.pellets()) {
        Check(p.y >= tank::kPelletFloor - 1e-3f, "不会穿过海底");
    }
}

void TestDeterministic() {
    tank::Tank a, b;
    a.Reset(4242u);
    b.Reset(4242u);
    a.Feed(7.0f, 0.5f, 10);
    b.Feed(7.0f, 0.5f, 10);
    for (int i = 0; i < 120; ++i) {
        a.Step(0.05f);
        b.Step(0.05f);
    }
    Check(a.Snapshot().dump() == b.Snapshot().dump(), "同种子同输入 → 完全相同的演化");

    tank::Tank c;
    c.Reset(4243u);
    Check(c.Snapshot().dump() != a.Snapshot().dump(), "不同种子 → 不同的初始分布");
}

void TestSnapshotShape() {
    tank::Tank t;
    t.Reset(8u);
    t.Feed(7.1f, -0.6f, 6);
    t.Step(0.05f);
    const auto s = t.Snapshot();

    Check(s.contains("fish") && s["fish"].is_array(), "快照含 fish 数组");
    Check(s.contains("food") && s["food"].is_array(), "快照含 food 数组");
    Check(s.contains("crawlers"), "快照含 crawlers");
    Check(s.contains("stats"), "快照含 stats");
    Check(s["fish"].size() == t.fishes().size(), "fish 数量一致");
    Check(s["stats"]["fish"] == static_cast<int>(t.fishes().size()), "stats.fish 一致");

    const auto& f = s["fish"][0];
    for (const char* key : {"id", "s", "x", "y", "z", "hdg", "pit", "spd", "sz", "hungry"}) {
        Check(f.contains(key), std::string("fish 字段 ") + key);
    }
    Check(f["hdg"].is_number() && f["pit"].is_number(), "朝向是数字");
    Check(std::fabs(f["hdg"].get<float>()) <= 3.142f, "hdg 在 [-π, π]");
    Check(std::fabs(f["pit"].get<float>()) < 1.6f, "pit 在俯仰范围内");

    const auto& st = s["stats"];
    Check(st["fed"] == 6, "stats.fed");
    Check(st["eaten"] >= 0, "stats.eaten");
    Check(st["caught"] == 0, "stats.caught");
    Check(s["time"].is_string(), "time 是 HH:MM 字符串");
}

void TestPauseIsHandledByHost() {
    // 宿主暂停时只是不调用 Step，这里验证 Step(0) 不推进
    tank::Tank t;
    t.Reset(77u);
    const auto before = t.Snapshot().dump();
    t.Step(0.0f);
    t.Step(-1.0f);
    Check(t.Snapshot().dump() == before, "dt<=0 不推进模拟");
}

void TestSharkAndRedFish() {
    tank::Tank t;
    t.Reset(1234u);

    int sharks = 0, reds = 0;
    for (const auto& f : t.fishes()) {
        if (f.species == tank::kShark) ++sharks;
        if (f.species == tank::kFlame) ++reds;
    }
    Check(sharks == 1, Fmt("环海里应只有一条鲨鱼，实际 %d", sharks));
    Check(reds > 0, Fmt("环海里应有红色的鱼（火焰鱼），实际 %d", reds));
    Check(tank::Traits(tank::kShark).predator == 1, "鲨鱼的 predator 标记");
    Check(tank::Traits(tank::kFlame).predator == 0, "火焰鱼不是掠食者");

    // 鲨鱼只绕外圈：喂食、绕一圈后仍然离岸线较远，也不靠近饲料
    t.Feed(7.0f, 0.5f, 24);
    float minR = 1e9f, maxR = -1e9f, minFood = 1e9f;
    for (int step = 0; step < 400; ++step) {   // 20 秒
        t.Step(0.05f);
        for (const auto& f : t.fishes()) {
            if (f.species != tank::kShark) continue;
            const float r = std::sqrt(f.x * f.x + f.z * f.z);
            minR = std::fmin(minR, r);
            maxR = std::fmax(maxR, r);
            minFood = std::fmin(minFood, std::hypot(f.x - 7.0f, f.z - 0.5f));
            Check(InsideRing(f), Fmt("鲨鱼在环海内 (%.2f, %.2f, %.2f)", f.x, f.y, f.z));
        }
    }
    Check(minR > 6.6f && maxR < tank::kBaseR,
          Fmt("鲨鱼沿外圈巡游，r=%.2f~%.2f", minR, maxR));
    Check(minFood > 0.7f, Fmt("鲨鱼不凑向饲料，最近 %.2f", minFood));

    // 鲨鱼始终是唯一一条，换密度也不会凭空多出来
    for (int stock = 0; stock <= 2; ++stock) {
        tank::Tank u;
        u.SetStock(stock);
        u.Reset(9u);
        int n = 0;
        for (const auto& f : u.fishes()) n += (f.species == tank::kShark) ? 1 : 0;
        Check(n == 1, Fmt("密度 %d 下仍只有一条鲨鱼", stock));
    }
}

void TestCatCatchFish() {
    tank::Tank t;
    t.Reset(555u);
    const int before = static_cast<int>(t.fishes().size());

    // 挑一条普通鱼（不是鲨鱼）
    int preyId = 0;
    for (const auto& f : t.fishes()) {
        if (f.species != tank::kShark) { preyId = f.id; break; }
    }
    Check(preyId != 0, "能找到一条可抓的鱼");

    const auto r = t.CatchFish(preyId);
    Check(r["ok"].get<bool>(), "猫抓鱼成功");
    Check(static_cast<int>(t.fishes().size()) == before - 1, "被叼走的鱼从鱼群里消失");
    Check(t.caught() == 1, "caught 计数");

    bool stillThere = false;
    for (const auto& f : t.fishes()) stillThere = stillThere || (f.id == preyId);
    Check(!stillThere, "那条鱼确实没了");
    Check(!t.CatchFish(preyId)["ok"].get<bool>(), "重复抓同一条鱼会失败");

    // 捕到的鱼是它原来的种：前端据此选鱼模型
    Check(r["s"].get<int>() >= 0 && r["s"].get<int>() < tank::kSpeciesCount, "返回鱼种下标");
    Check(r["sz"].get<float>() > 0.5f, "返回个体大小");

    // 鲨鱼捞不动
    int sharkId = 0;
    for (const auto& f : t.fishes()) {
        if (f.species == tank::kShark) sharkId = f.id;
    }
    Check(sharkId != 0 && !t.CatchFish(sharkId)["ok"].get<bool>(), "鲨鱼不会被猫抓走");

    // 过一会儿补回同种的一条：种群数量回到原值
    for (int i = 0; i < 200; ++i) t.Step(0.05f);   // 10 秒 > 6 秒补鱼时间
    Check(static_cast<int>(t.fishes().size()) == before, "几秒后补回一条，种群数量不变");
    Check(t.caught() == 1, "补鱼不影响 caught 计数");
}

}  // namespace

int main() {
    SetConsoleOutputCP(CP_UTF8);

    std::printf("== 鱼群模拟单元测试 ==\n");
    TestCoastMatchesFrontend();
    TestPopulateInsideRing();
    TestStockDensity();
    TestBoundsHoldOverTime();
    TestFeedPoursPellets();
    TestFeedAttractsFish();
    TestPelletLifecycle();
    TestDeterministic();
    TestSnapshotShape();
    TestPauseIsHandledByHost();
    TestSharkAndRedFish();
    TestCatCatchFish();

    std::printf("== %d 项检查，%d 项失败 ==\n", g_checks, g_failures);
    return g_failures == 0 ? 0 : 1;
}
