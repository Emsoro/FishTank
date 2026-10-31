// 海岛鱼缸的鱼群模拟 —— 纯逻辑，不依赖窗口/渲染，便于单元测试
//
// 坐标系与前端 island.js（小岛场景）完全一致：
//   x / z 为水平面，y 向上；水面 y = 0.105，环海海底 y ≈ -0.195
//   小岛位于原点，海岸线半径 coast(a) ≈ 6.45（随角度起伏）
//   鱼群活动范围：海岸线外 margin ~ 展缸内沿 8.42 之间的浅水环，
//                深度方向只有 0.105 ~ -0.195 这么薄的一层，
//                所以鱼的体型、速度都是“微缩标本”尺度（体长 0.20~0.28）
//
// 后端负责：群游 / 惊慌 / 觅食 / 摄食判断；前端只做插值渲染与动画。
#pragma once

#include <cstdint>
#include <random>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace tank {

// ---- 与 island.js 对齐的几何常量 ----
inline constexpr float kSeaLevel = 0.105f;    // 水面
inline constexpr float kSeaFloor = -0.195f;   // 环海海底
inline constexpr float kSwimLow = -0.140f;    // 鱼心下限（贴底游，鱼腹刚好离沙）
inline constexpr float kSwimHigh = 0.045f;    // 鱼心上限（鱼背仍在水面之下）
inline constexpr float kBaseR = 8.42f;        // 鱼群外沿（水面 9.0 留出半个身位）
inline constexpr float kShorePad = 0.20f;     // 与岸线的最小距离
inline constexpr float kPelletFloor = -0.185f;  // 饲料沉底高度

/// 海岸线半径（与 island.js 的 coast() 公式一致）
float Coast(float angle);

/// 某点所在方向的海岸半径
float ShoreRadius(float x, float z);

// ---- 鱼种（id 与前端 creatures.js 一致）----
enum Species {
    kNeon = 0,   // 霓虹灯鱼：蓝红细纹，小群
    kGuppy,      // 孔雀鱼：偏上层的散游小鱼
    kCory,       // 鼠鱼：贴着沙面
    kAngel,      // 神仙鱼（本场景不使用）
    kClown,      // 小丑鱼：橙白条纹
    kChromis,    // 蓝绿光鳃鱼：成群
    kGoby,       // 虾虎鱼：贴底
    kFlame,      // 火焰鱼：通体橙红，环海里最显眼的那几条
    kShark,      // 礁鲨：不群游、不吃饲料，只沿外圈慢慢巡游
    kGrouper,    // 石斑：贴底独居的大块头，慢慢蹭
    kSpeciesCount
};

// ---- 岸边小生物（前端按地形高度贴地）----
enum CrawlerKind {
    kCherryShrimp = 0,
    kNerite,
    kCleanerShrimp,
    kHermitCrab,
};

struct SpeciesTraits {
    const char* key;
    const char* name;
    float speed;   // 巡航速度（单位/秒，约 1.6 体长/秒）
    float size;    // 体长
    float school;  // 群游权重 0..1
    float prefY;   // 偏好水层
    float margin;  // 离岸 / 离水面的最小裕度
    int predator;  // 1 = 鲨鱼：跳过群游与觅食，小鱼看到它会散开
};

const SpeciesTraits& Traits(int species);

/// 猫能不能把这条鱼叼走（大块头捞不动：目前只有鲨鱼）
inline bool Catchable(int species) { return !Traits(species).predator; }

struct Fish {
    int id = 0;
    int species = 0;
    float x = 0, y = 0, z = 0;
    float vx = 0, vy = 0, vz = 0;
    float dx = 0, dy = 0, dz = 1;  // 平滑朝向（前端直接用）
    float size = 1.0f;
    float hunger = 0.4f;
    float phase = 0.0f;
    float speed = 0.0f;   // 当前速度，前端据此调整摆尾频率
    float panic = 0.0f;   // 受惊（玩家点击 / 鱼群拥挤）
};

struct Crawler {
    int id = 0;
    int kind = 0;
    float x = 0, z = 0;
    float dir = 0.0f;
    float rest = 0.0f;
    float size = 1.0f;
};

struct Pellet {
    float x = 0, y = 0, z = 0;
    float vy = -0.05f;
    float drift = 0.0f;
    float life = 0.0f;
    bool on_sand = false;
};

class Tank {
public:
    Tank();

    /// 重新放鱼
    void Reset(uint32_t seed);

    /// 推进 dt 秒
    void Step(float dt);

    /// 在水面 (x, z) 处撒 pellets 粒饲料
    void Feed(float x, float z, int pellets);

    /// 鱼群密度：0 稀疏 / 1 正常 / 2 密集
    void SetStock(int level);

    /// 岛上的猫抓到一条鱼：按 id 把这尾鱼从鱼群里取走，过几秒补回同种的一条
    /// 返回 {ok, s, sz}；鲨鱼抓不动
    nlohmann::json CatchFish(int id);

    int stock() const { return stock_; }
    float clock() const { return clock_; }
    float light() const { return light_; }

    const std::vector<Fish>& fishes() const { return fish_; }
    const std::vector<Crawler>& crawlers() const { return crawlers_; }
    const std::vector<Pellet>& pellets() const { return pellets_; }

    int eaten() const { return eaten_; }
    int fed() const { return fed_; }
    int caught() const { return caught_; }
    int bottomFood() const;

    nlohmann::json Snapshot() const;

private:
    void Populate();
    void SpawnFish(int species, int count, float radius, float spread);
    void SpawnCrawler(int kind, int count);
    void StepFish(float dt);
    void StepCrawlers(float dt);
    void StepPellets(float dt);
    void StepClock(float dt);
    void StepRespawn(float dt);

    float Rand(float a, float b);
    float Randf() { return Rand(0.0f, 1.0f); }

    std::mt19937 rng_;
    int stock_ = 1;
    float clock_ = 8.4f;  // 场景时间（小时），只用于展示
    float light_ = 1.0f;

    std::vector<Fish> fish_;
    std::vector<Crawler> crawlers_;
    std::vector<Pellet> pellets_;

    /// 被猫叼走的鱼：过几秒在同种鱼群里补一条，种群数量恒定
    struct Respawn {
        int species = 0;
        float timer = 0.0f;
    };
    std::vector<Respawn> respawn_;

    int next_id_ = 1;
    int fed_ = 0;
    int eaten_ = 0;
    int caught_ = 0;
    float elapsed_ = 0.0f;
};

}  // namespace tank
