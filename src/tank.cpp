// 鱼群模拟实现：环形浅水里的一小群热带小鱼
//
// 关键点：
//   * 活动域不是一个盒子，而是「海岸线 + margin ~ 展缸内沿」之间的环，
//     所以边界处理用极坐标（离岸距离 / 到展缸边缘的距离）
//   * 水只有 0.3 深，鱼几乎是贴着水面游，投喂后要“往上凑”
//   * 所有数值都是微缩标本尺度（体长 0.15~0.21）
#include "tank.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace tank {
namespace {

struct Vec3 {
    float x = 0, y = 0, z = 0;
};

inline Vec3 operator+(const Vec3& a, const Vec3& b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
inline Vec3 operator-(const Vec3& a, const Vec3& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
inline Vec3 operator*(const Vec3& a, float s) { return {a.x * s, a.y * s, a.z * s}; }
inline Vec3& operator+=(Vec3& a, const Vec3& b) { a.x += b.x; a.y += b.y; a.z += b.z; return a; }
inline float Length(const Vec3& a) { return std::sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
inline float Length2(const Vec3& a) { return a.x * a.x + a.y * a.y + a.z * a.z; }

inline Vec3 Normalize(const Vec3& a) {
    const float l = Length(a);
    return l > 1e-5f ? a * (1.0f / l) : Vec3{0, 0, 1};
}

inline float Clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

inline float Round3(float v) { return std::round(v * 1000.0f) / 1000.0f; }

// 与 island.js 中的鱼种顺序一致（体长按展缸比例缩到 0.20~0.28；最后一列是“是否鲨鱼”）
const SpeciesTraits kTraits[kSpeciesCount] = {
    {"neon",    "霓虹灯鱼", 0.55f, 0.23f, 1.00f, -0.045f, 0.20f, 0},
    {"guppy",   "孔雀鱼",   0.46f, 0.25f, 0.30f, -0.020f, 0.20f, 0},
    {"cory",    "鼠鱼",     0.34f, 0.22f, 0.55f, -0.110f, 0.20f, 0},
    {"angel",   "神仙鱼",   0.38f, 0.28f, 0.15f, -0.060f, 0.26f, 0},
    {"clown",   "小丑鱼",   0.44f, 0.24f, 0.45f, -0.060f, 0.20f, 0},
    {"chromis", "蓝绿光鳃", 0.62f, 0.21f, 1.00f, -0.035f, 0.18f, 0},
    {"goby",    "虾虎鱼",   0.30f, 0.21f, 0.20f, -0.115f, 0.20f, 0},
    {"flame",   "火焰鱼",   0.50f, 0.26f, 0.40f, -0.030f, 0.20f, 0},
    {"shark",   "礁鲨",     0.42f, 1.05f, 0.00f, -0.055f, 0.42f, 1},
};

/// 鱼嘴到鱼心的距离（用于判定“吃到”）
inline float MouthOffset(const Fish& f) { return Traits(f.species).size * f.size * 0.42f; }

/// 鱼嘴半径
inline float MouthRadius(const Fish& f) { return 0.020f + Traits(f.species).size * f.size * 0.18f; }

}  // namespace

float Coast(float a) {
    return 6.45f + 0.35f * std::sin(a * 3.0f + 0.4f) +
           0.27f * std::cos(a * 5.0f - 1.0f) + 0.18f * std::sin(a * 7.0f);
}

float ShoreRadius(float x, float z) { return Coast(std::atan2(z, x)); }

const SpeciesTraits& Traits(int species) {
    return kTraits[(species >= 0 && species < kSpeciesCount) ? species : 0];
}

Tank::Tank() : rng_(std::random_device{}()) {}

float Tank::Rand(float a, float b) {
    std::uniform_real_distribution<float> dist(a, b);
    return dist(rng_);
}

int Tank::bottomFood() const {
    int n = 0;
    for (const auto& p : pellets_) {
        if (p.on_sand) ++n;
    }
    return n;
}

// ---------------------------------------------------------------------------
// 放鱼
// ---------------------------------------------------------------------------
void Tank::Reset(uint32_t seed) {
    rng_.seed(seed ? seed : 1u);
    clock_ = 8.4f;
    light_ = 1.0f;
    elapsed_ = 0.0f;
    fed_ = eaten_ = caught_ = 0;
    next_id_ = 1;
    fish_.clear();
    crawlers_.clear();
    pellets_.clear();
    respawn_.clear();
    Populate();
}

void Tank::SetStock(int level) {
    level = static_cast<int>(Clampf(static_cast<float>(level), 0.0f, 2.0f));
    if (level == stock_ && !fish_.empty()) return;
    stock_ = level;
    fish_.clear();
    respawn_.clear();
    Populate();
}

void Tank::SpawnFish(int species, int count, float radiusOffset, float spread) {
    const SpeciesTraits& tr = Traits(species);
    for (int i = 0; i < count; ++i) {
        Fish f;
        f.id = next_id_++;
        f.species = species;

        const float a = Rand(0.0f, 6.2831853f);
        const float shore = Coast(a);
        const float outer = kBaseR - tr.margin - 0.02f;
        const float lane = std::max(0.06f, outer - (shore + tr.margin));
        float r = shore + tr.margin + lane * Clampf(0.35f + radiusOffset * 0.25f + Rand(-spread, spread) * 0.6f, 0.0f, 1.0f);
        r = Clampf(r, shore + tr.margin, outer);

        f.x = std::cos(a) * r;
        f.z = std::sin(a) * r;
        f.y = Clampf(tr.prefY + Rand(-0.025f, 0.025f), kSwimLow, kSwimHigh);

        // 初始朝向前进方向：沿环切线，一半顺时针一半逆时针
        const float dir = (i % 2 == 0) ? 1.0f : -1.0f;
        const Vec3 tangent{-std::sin(a) * dir, 0.0f, std::cos(a) * dir};
        f.vx = tangent.x * tr.speed * 0.6f;
        f.vz = tangent.z * tr.speed * 0.6f;
        f.dx = tangent.x;
        f.dz = tangent.z;

        f.size = Rand(0.88f, 1.12f);
        f.hunger = Rand(0.35f, 0.85f);
        f.phase = Rand(0.0f, 6.2831853f);
        f.speed = tr.speed * 0.6f;
        fish_.push_back(f);
    }
}

void Tank::SpawnCrawler(int kind, int count) {
    for (int i = 0; i < count; ++i) {
        Crawler c;
        c.id = next_id_++;
        c.kind = kind;
        const float a = Rand(0.0f, 6.2831853f);
        // 湿沙那一圈（island.js 的岸线在 coast*1.02，往内一点才在沙上）
        const float r = Coast(a) * 1.02f - Rand(0.04f, 0.26f);
        c.x = std::cos(a) * r;
        c.z = std::sin(a) * r;
        c.dir = Rand(0.0f, 6.2831853f);
        c.size = Rand(0.85f, 1.15f);
        c.rest = Rand(0.0f, 2.0f);
        crawlers_.push_back(c);
    }
}

void Tank::Populate() {
    // 越靠水面越热闹：光鳃鱼 / 霓虹灯在上层成群，小丑鱼与虾虎鱼在下面
    switch (stock_) {
        case 0:
            SpawnFish(kChromis, 8, 0.55f, 0.5f);
            SpawnFish(kNeon, 8, 0.70f, 0.6f);
            SpawnFish(kFlame, 2, 0.65f, 0.5f);
            SpawnFish(kClown, 2, 0.45f, 0.4f);
            SpawnFish(kGoby, 2, 0.50f, 0.4f);
            break;
        case 2:
            SpawnFish(kChromis, 22, 0.55f, 0.8f);
            SpawnFish(kNeon, 20, 0.75f, 0.9f);
            SpawnFish(kGuppy, 6, 0.60f, 0.7f);
            SpawnFish(kFlame, 5, 0.65f, 0.6f);
            SpawnFish(kClown, 6, 0.45f, 0.5f);
            SpawnFish(kGoby, 5, 0.50f, 0.5f);
            SpawnFish(kCory, 3, 0.55f, 0.5f);
            break;
        default:
            SpawnFish(kChromis, 14, 0.55f, 0.7f);
            SpawnFish(kNeon, 14, 0.75f, 0.8f);
            SpawnFish(kGuppy, 4, 0.60f, 0.6f);
            SpawnFish(kFlame, 3, 0.65f, 0.5f);
            SpawnFish(kClown, 4, 0.45f, 0.5f);
            SpawnFish(kGoby, 3, 0.50f, 0.4f);
            SpawnFish(kCory, 2, 0.55f, 0.4f);
            break;
    }

    // 一条礁鲨：无论密度都只有它一个，绕在最外面一圈
    SpawnFish(kShark, 1, 0.85f, 0.0f);

    SpawnCrawler(kHermitCrab, stock_ == 0 ? 2 : (stock_ == 2 ? 5 : 3));
}

// ---------------------------------------------------------------------------
// 猫抓鱼
// ---------------------------------------------------------------------------
nlohmann::json Tank::CatchFish(int id) {
    for (int i = 0; i < static_cast<int>(fish_.size()); ++i) {
        const Fish& f = fish_[i];
        if (f.id != id) continue;
        if (Traits(f.species).predator) return nlohmann::json{{"ok", false}};  // 鲨鱼捞不动

        const int species = f.species;
        const float size = f.size;
        fish_.erase(fish_.begin() + i);
        respawn_.push_back({species, 6.0f});
        ++caught_;
        return nlohmann::json{{"ok", true}, {"s", species}, {"sz", size}};
    }
    return nlohmann::json{{"ok", false}};   // 这条鱼已经没了
}

void Tank::StepRespawn(float dt) {
    for (int i = static_cast<int>(respawn_.size()) - 1; i >= 0; --i) {
        respawn_[i].timer -= dt;
        if (respawn_[i].timer <= 0.0f) {
            SpawnFish(respawn_[i].species, 1, 0.70f, 0.85f);
            respawn_.erase(respawn_.begin() + i);
        }
    }
}

// ---------------------------------------------------------------------------
// 投喂
// ---------------------------------------------------------------------------
void Tank::Feed(float x, float z, int pellets) {
    pellets = std::max(1, std::min(pellets, 120));

    // 落点校正到环海内，避免把饲料撒到岛上或缸外
    const float a = std::atan2(z, x);
    const float shore = Coast(a);
    float r = std::sqrt(x * x + z * z);
    r = Clampf(r, shore + kShorePad, kBaseR - 0.30f);
    x = std::cos(a) * r;
    z = std::sin(a) * r;

    for (int i = 0; i < pellets; ++i) {
        Pellet p;
        p.x = x + Rand(-0.20f, 0.20f);
        p.z = z + Rand(-0.20f, 0.20f);
        p.y = kSeaLevel - Rand(0.004f, 0.026f);
        p.vy = -Rand(0.020f, 0.038f);
        p.drift = Rand(0.0f, 6.2831853f);

        const float pa = std::atan2(p.z, p.x);
        const float pr = std::sqrt(p.x * p.x + p.z * p.z);
        const float lim = Coast(pa) + 0.16f;
        if (pr < lim) {
            p.x = std::cos(pa) * lim;
            p.z = std::sin(pa) * lim;
        }
        pellets_.push_back(p);
    }
    fed_ += pellets;

    // 撒饲料会惊动附近的鱼（它们随即被饲料吸引过来）
    for (auto& f : fish_) {
        const float d2 = (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z);
        if (d2 < 9.0f) f.panic = std::max(f.panic, 0.5f);
    }
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
void Tank::Step(float dt) {
    if (dt <= 0.0f) return;
    if (dt > 0.2f) dt = 0.2f;
    elapsed_ += dt;

    StepClock(dt);
    StepFish(dt);
    StepPellets(dt);
    StepCrawlers(dt);
    StepRespawn(dt);
}

void Tank::StepClock(float dt) {
    // 20 分钟走完一天，纯展示用
    clock_ += dt * (24.0f / (20.0f * 60.0f));
    if (clock_ >= 24.0f) clock_ -= 24.0f;
    light_ = 1.0f;  // 小岛是固定的大晴天
}

void Tank::StepFish(float dt) {
    const float t = elapsed_;
    const int n = static_cast<int>(fish_.size());
    const int pelletCount = static_cast<int>(pellets_.size());

    for (int i = 0; i < n; ++i) {
        Fish& f = fish_[i];
        const SpeciesTraits& tr = Traits(f.species);
        const Vec3 vel{f.vx, f.vy, f.vz};
        const Vec3 vdir = Normalize(vel);

        Vec3 acc;

        // 1) 群游：分离 / 对齐 / 聚合（同种之间更亲密）
        if (tr.school > 0.01f) {
            Vec3 sep, ali, coh;
            int ali_n = 0, coh_n = 0;

            for (int j = 0; j < n; ++j) {
                if (j == i) continue;
                const Fish& o = fish_[j];
                const Vec3 d = {o.x - f.x, o.y - f.y, o.z - f.z};
                const float d2 = Length2(d);
                if (d2 > 0.49f) continue;  // 0.7 之外不理会

                const float same = (o.species == f.species) ? 1.0f : 0.45f;
                const float minD = tr.size * 0.95f + Traits(o.species).size * o.size * 0.45f;
                if (d2 < minD * minD && d2 > 1e-6f) {
                    const float w = (minD * minD - d2) / (minD * minD);
                    sep += Normalize(d) * (-6.5f * w * same);
                }
                if (o.species == f.species) {
                    ali += Vec3{o.vx, o.vy, o.vz};
                    coh += Vec3{o.x, o.y, o.z};
                    ++ali_n;
                    ++coh_n;
                }
            }
            if (ali_n > 0) {
                Vec3 avg = ali * (1.0f / static_cast<float>(ali_n));
                const float al = Length(avg);
                if (al > 1e-4f) acc += Normalize(avg) * (tr.school * 1.6f);
                Vec3 c = coh * (1.0f / static_cast<float>(coh_n));
                Vec3 toward = {c.x - f.x, c.y - f.y, c.z - f.z};
                if (Length2(toward) > 1e-5f) acc += Normalize(toward) * (tr.school * 0.9f);
            }
            acc += sep;
        }

        // 2) 闲逛：低频正弦，让每条鱼都有自己的小路线
        const float ph = f.phase;
        acc.x += std::sin(t * 0.55f + ph) * 0.22f;
        acc.z += std::cos(t * 0.41f + ph * 1.7f) * 0.22f;
        acc.y += std::sin(t * 0.83f + ph * 2.3f) * 0.05f;

        // 3) 偏好水层
        acc.y += (tr.prefY - f.y) * 2.2f;

        // 3.5) 鲨鱼：沿环海外圈慢慢巡游，不群游也不追饲料
        if (tr.predator) {
            const float r = std::sqrt(f.x * f.x + f.z * f.z);
            const float rx = (r > 1e-4f) ? f.x / r : 1.0f;
            const float rz = (r > 1e-4f) ? f.z / r : 0.0f;
            const float lane = kBaseR - 0.80f;
            acc.x += rx * ((lane - r) * 2.2f);
            acc.z += rz * ((lane - r) * 2.2f);
            acc.x += -rz * 0.40f;   // 切向：顺着环慢慢绕
            acc.z += rx * 0.40f;
            acc.y += (tr.prefY - f.y) * 2.6f;
        }

        // 4) 觅食：hunger 越高看得越远，朝最近的饲料游
        f.hunger = Clampf(f.hunger + dt * 0.05f, 0.0f, 1.4f);
        if (!tr.predator && f.hunger > 0.05f && pelletCount > 0) {
            int best = -1;
            float bestD2 = 3.0f * 3.0f;
            for (int p = 0; p < pelletCount; ++p) {
                const Pellet& q = pellets_[p];
                const float dx = q.x - f.x, dy = q.y - f.y, dz = q.z - f.z;
                const float d2 = dx * dx + dy * dy * 1.6f + dz * dz;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    best = p;
                }
            }
            if (best >= 0) {
                const Pellet& q = pellets_[best];
                Vec3 to = {q.x - f.x, q.y - f.y, q.z - f.z};
                const float l = Length(to);
                if (l > 1e-4f) {
                    // 越近越急，也能在远处就开始转向
                    const float near = 1.0f - Clampf(std::sqrt(bestD2) / 3.0f, 0.0f, 1.0f);
                    const float urgency = 0.45f + 0.55f * f.hunger + 0.7f * near;
                    acc += Normalize(to) * (1.8f * urgency);
                }
            }
        }

        // 5) 受惊：短暂加速躲开
        if (f.panic > 0.0f) {
            f.panic = std::max(0.0f, f.panic - dt * 0.7f);
            acc += vdir * 2.4f;
        }

        // 5.5) 鲨鱼靠近：小鱼四散开（离得越近推得越狠）
        if (!tr.predator) {
            for (int j = 0; j < n; ++j) {
                const Fish& o = fish_[j];
                if (!Traits(o.species).predator) continue;
                const Vec3 d{f.x - o.x, f.y - o.y, f.z - o.z};
                const float d2 = Length2(d);
                constexpr float kAlert = 1.35f;
                if (d2 < kAlert * kAlert && d2 > 1e-6f) {
                    const float w = 1.0f - std::sqrt(d2) / kAlert;
                    acc += Normalize(d) * (3.2f * w);
                    f.panic = std::max(f.panic, 0.45f * w);
                }
            }
        }

        // 6) 边界：环形水域用极坐标处理
        {
            const float r = std::sqrt(f.x * f.x + f.z * f.z);
            const float a = std::atan2(f.z, f.x);
            const float inner = Coast(a) + tr.margin;
            const float outer = kBaseR - tr.margin;
            const float radialX = (r > 1e-4f) ? f.x / r : 1.0f;
            const float radialZ = (r > 1e-4f) ? f.z / r : 0.0f;

            if (r < inner) {
                const float push = (inner - r) * 26.0f;
                acc.x += radialX * push;
                acc.z += radialZ * push;
            } else if (r > outer) {
                const float push = (r - outer) * 26.0f;
                acc.x -= radialX * push;
                acc.z -= radialZ * push;
            }

            // 贴边时沿着切线走，避免“顶墙”抖动
            if (r < inner + 0.12f || r > outer - 0.12f) {
                const float side = std::sin(f.phase) > 0.0f ? 1.0f : -1.0f;
                acc.x += -radialZ * side * 0.6f;
                acc.z += radialX * side * 0.6f;
            }

            const float low = kSwimLow;
            const float high = kSwimHigh;
            if (f.y < low) acc.y += (low - f.y) * 30.0f;
            if (f.y > high) acc.y -= (f.y - high) * 30.0f;
        }

        // 7) 积分：限加速度 -> 限速 -> 平滑朝向 -> 位移
        const float maxAcc = 1.5f;
        const float alen = Length(acc);
        if (alen > maxAcc) acc = acc * (maxAcc / alen);

        f.vx += acc.x * dt;
        f.vy += acc.y * dt;
        f.vz += acc.z * dt;

        const float cruise = tr.speed * (1.0f + 0.10f * std::sin(t * 0.7f + ph));
        float sp = Length(Vec3{f.vx, f.vy, f.vz});
        if (sp > 1e-4f) {
            const float want = Clampf(sp + (cruise - sp) * std::min(1.0f, dt * 3.0f),
                                      cruise * 0.28f, cruise * 2.0f);
            const float k = want / sp;
            f.vx *= k;
            f.vy *= k;
            f.vz *= k;
            sp = want;
        }

        // 限制俯仰：真实的小鱼不会把头扬起来 45° 游，上下换层也只在 20° 左右
        {
            const float hs = std::sqrt(f.vx * f.vx + f.vz * f.vz);
            const float maxVy = hs * 0.38f + 0.015f;
            if (f.vy > maxVy) f.vy = maxVy;
            else if (f.vy < -maxVy) f.vy = -maxVy;
        }
        f.speed = Length(Vec3{f.vx, f.vy, f.vz});

        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.z += f.vz * dt;

        // 硬约束（防止数值爆掉）
        const float rr = std::sqrt(f.x * f.x + f.z * f.z);
        const float aa = std::atan2(f.z, f.x);
        const float rMin = Coast(aa) + kShorePad;
        if (rr < rMin) {
            f.x = std::cos(aa) * rMin;
            f.z = std::sin(aa) * rMin;
        } else if (rr > kBaseR) {
            f.x = std::cos(aa) * kBaseR;
            f.z = std::sin(aa) * kBaseR;
        }
        f.y = Clampf(f.y, kSwimLow, kSwimHigh);

        // 平滑朝向（渲染用）
        if (sp > 1e-4f) {
            const Vec3 dir = Normalize(Vec3{f.vx, f.vy, f.vz});
            const float k = std::min(1.0f, dt * 6.0f);
            f.dx += (dir.x - f.dx) * k;
            f.dy += (dir.y - f.dy) * k;
            f.dz += (dir.z - f.dz) * k;
            const Vec3 nd = Normalize(Vec3{f.dx, f.dy, f.dz});
            f.dx = nd.x;
            f.dy = nd.y;
            f.dz = nd.z;
        }
    }

    // 8) 摄食判定：鱼嘴碰到饲料就算吃到（鲨鱼不吃）
    for (int p = static_cast<int>(pellets_.size()) - 1; p >= 0; --p) {
        const Pellet& q = pellets_[p];
        for (auto& f : fish_) {
            if (Traits(f.species).predator) continue;
            if (f.hunger < 0.02f) continue;
            const float mx = f.x + f.dx * MouthOffset(f);
            const float my = f.y + f.dy * MouthOffset(f);
            const float mz = f.z + f.dz * MouthOffset(f);
            const float dx = q.x - mx, dy = q.y - my, dz = q.z - mz;
            const float rad = MouthRadius(f) + 0.02f;
            if (dx * dx + dy * dy + dz * dz < rad * rad) {
                pellets_.erase(pellets_.begin() + p);
                ++eaten_;
                f.hunger = std::max(0.0f, f.hunger - 0.45f);
                break;
            }
        }
    }
}

void Tank::StepPellets(float dt) {
    for (int i = static_cast<int>(pellets_.size()) - 1; i >= 0; --i) {
        Pellet& p = pellets_[i];
        if (!p.on_sand) {
            p.vy = std::max(-0.05f, p.vy - dt * 0.008f);
            p.y += p.vy * dt;
            p.drift += dt * 1.3f;
            p.x += std::sin(p.drift) * 0.004f * dt * 60.0f;
            p.z += std::cos(p.drift * 0.8f) * 0.003f * dt * 60.0f;
            if (p.y <= kPelletFloor) {
                p.y = kPelletFloor;
                p.on_sand = true;
            }
        } else {
            p.life += dt;
            if (p.life > 26.0f) {
                pellets_.erase(pellets_.begin() + i);
            }
        }
    }
}

void Tank::StepCrawlers(float dt) {
    for (auto& c : crawlers_) {
        if (c.rest > 0.0f) {
            c.rest -= dt;
            continue;
        }

        // 沿着岸线慢慢爬（尺寸 ~0.2，走快了就像虫子），偶尔停下来
        float a = std::atan2(c.z, c.x);
        const float sign = (c.kind == kHermitCrab) ? 1.0f : -1.0f;
        a += sign * dt * 0.022f;

        const float shore = Coast(a) * 1.02f;
        float r = std::sqrt(c.x * c.x + c.z * c.z);
        r = Clampf(r, shore - 0.30f, shore - 0.01f);

        c.x = std::cos(a) * r;
        c.z = std::sin(a) * r;
        c.dir = std::atan2(-std::sin(a) * sign, std::cos(a) * sign);  // 切线方向

        if (Randf() < dt * 0.12f) c.rest = Rand(1.0f, 4.0f);
    }
}

// ---------------------------------------------------------------------------
// 快照
// ---------------------------------------------------------------------------
nlohmann::json Tank::Snapshot() const {
    nlohmann::json j;
    j["stock"] = stock_;
    j["hour"] = Round3(clock_);
    j["light"] = light_;
    {
        const int hh = static_cast<int>(clock_);
        const int mm = static_cast<int>((clock_ - hh) * 60.0f);
        char buf[8];
        std::snprintf(buf, sizeof(buf), "%02d:%02d", hh, mm);
        j["time"] = buf;
    }

    nlohmann::json fish = nlohmann::json::array();
    for (const auto& f : fish_) {
        fish.push_back({
            {"id", f.id},
            {"s", f.species},
            {"x", Round3(f.x)},
            {"y", Round3(f.y)},
            {"z", Round3(f.z)},
            {"hdg", Round3(std::atan2(f.dx, f.dz))},
            {"pit", Round3(-std::asin(Clampf(f.dy, -1.0f, 1.0f)))},
            {"spd", Round3(f.speed)},
            {"sz", Round3(f.size)},
            {"hungry", f.hunger > 0.2f ? 1 : 0},
        });
    }
    j["fish"] = std::move(fish);

    nlohmann::json crawlers = nlohmann::json::array();
    for (const auto& c : crawlers_) {
        crawlers.push_back({
            {"id", c.id},
            {"k", c.kind},
            {"x", Round3(c.x)},
            {"z", Round3(c.z)},
            {"dir", Round3(c.dir)},
            {"sz", Round3(c.size)},
        });
    }
    j["crawlers"] = std::move(crawlers);

    nlohmann::json food = nlohmann::json::array();
    for (const auto& p : pellets_) {
        food.push_back({
            {"x", Round3(p.x)},
            {"y", Round3(p.y)},
            {"z", Round3(p.z)},
            {"s", p.on_sand ? 1 : 0},
        });
    }
    j["food"] = std::move(food);

    j["stats"] = {
        {"fish", static_cast<int>(fish_.size())},
        {"crawlers", static_cast<int>(crawlers_.size())},
        {"fed", fed_},
        {"eaten", eaten_},
        {"caught", caught_},
        {"bottomFood", bottomFood()},
    };
    return j;
}

}  // namespace tank
