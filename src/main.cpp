// 海岛鱼缸 —— 基于 TauriCPP（C++ 后端 + Web 前端）
//
// 场景：原封不动的小岛标本（前端 island.js 逐行还原）
// 后端：环岛浅水里养一群鱼（含一条礁鲨）—— 群游 / 惊慌 / 投喂与摄食 / 岸边寄居蟹
// 前端：Three.js 实例化鱼体 + 水面着色器（鼠标点水面即可投喂，岛上还有一只猫）
#include "tauricpp/app.hpp"

#include <Windows.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <fstream>
#include <mutex>
#include <random>
#include <thread>

#include "tank.hpp"

using nlohmann::json;

namespace {

std::mutex g_mutex;
tank::Tank g_tank;
std::atomic<bool> g_running{true};
std::atomic<bool> g_paused{false};

/// 周期把全量状态推给前端（前端据此插值渲染，不自己跑逻辑）
constexpr int kTickMs = 50;

}  // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    tauricpp::App::Config config;
    config.window_config.title = "海岛鱼缸";
    config.window_config.width = 1320;
    config.window_config.height = 820;  // 略小于 1080p 工作区，标题栏不会顶出屏幕
    config.window_config.center = true;
    config.window_config.resizable = true;
    config.window_config.devtools = true;              // F12 打开 DevTools
    config.window_config.bg_color = RGB(196, 223, 226);  // 与天空同色，消除白屏

    tauricpp::App app(config);
    auto& bridge = app.GetBridge();

    {
        std::lock_guard<std::mutex> lock(g_mutex);
        g_tank.Reset(static_cast<uint32_t>(std::random_device{}()));
    }

    // 重新放鱼（鱼群密度 / 随机种子）
    bridge.RegisterCommand("new_tank", [](const json& args) -> json {
        const int stock = args.value("stock", 1);
        const int seed = args.value("seed", 0);

        std::lock_guard<std::mutex> lock(g_mutex);
        g_tank.SetStock(stock);
        g_tank.Reset(seed > 0 ? static_cast<uint32_t>(seed)
                              : static_cast<uint32_t>(std::random_device{}()));
        return g_tank.Snapshot();
    });

    // 鱼群密度：0 稀疏 / 1 正常 / 2 密集
    bridge.RegisterCommand("set_stock", [](const json& args) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        g_tank.SetStock(args.value("level", 1));
        return g_tank.Snapshot();
    });

    // 投喂：x/z 为水面落点（前端点击水面的世界坐标），缺省时随机落到环海里
    bridge.RegisterCommand("feed", [](const json& args) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        const int count = args.value("count", 14);
        const float x = args.value("x", std::nanf(""));
        const float z = args.value("z", std::nanf(""));

        float fx = x;
        float fz = z;
        if (!std::isfinite(fx) || !std::isfinite(fz)) {
            static std::mt19937 rng{std::random_device{}()};
            std::uniform_real_distribution<float> angle(0.0f, 6.2831853f);
            std::uniform_real_distribution<float> offset(0.55f, 1.45f);
            const float a = angle(rng);
            const float r = (std::min)(tank::Coast(a) + offset(rng), tank::kBaseR - 0.45f);
            fx = std::cos(a) * r;
            fz = std::sin(a) * r;
        }

        g_tank.Feed(fx, fz, count);

        json j;
        j["ok"] = true;
        j["x"] = fx;
        j["z"] = fz;
        j["state"] = g_tank.Snapshot();
        return j;
    });

    // 岛上的猫抓到鱼：把这尾鱼从鱼群里取走（几秒后补回同种的一条），前端负责叼回家
    bridge.RegisterCommand("catch_fish", [](const json& args) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        json r = g_tank.CatchFish(args.value("id", 0));
        r["state"] = g_tank.Snapshot();
        return r;
    });

    // 暂停 / 继续（暂停时不再推进模拟，前端仍可继续渲染与旋转视角）
    bridge.RegisterCommand("set_paused", [](const json& args) -> json {
        g_paused = args.value("paused", false);
        return json{{"paused", g_paused.load()}};
    });

    bridge.RegisterCommand("get_state", [](const json&) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        return g_tank.Snapshot();
    });

    bridge.RegisterCommand("window.set_title", [&app](const json& args) -> json {
        app.GetWindow().SetTitle(args.value("title", "海岛鱼缸"));
        return json{{"success", true}};
    });

    // 前端诊断日志（写到 exe 同级目录，便于排查 WebView2 里的脚本错误）
    bridge.RegisterCommand("log_error", [](const json& args) -> json {
        char exePath[MAX_PATH];
        GetModuleFileNameA(nullptr, exePath, MAX_PATH);
        char* slash = strrchr(exePath, '\\');
        if (slash) *slash = '\0';
        std::string path = std::string(exePath) + "\\fish_error.log";
        std::ofstream log(path, std::ios::app);
        log << args.value("message", "") << std::endl;
        return json{{"success", true}};
    });

    app.OnSetup([](tauricpp::App& app) {
        app.GetWindow().OnClose([]() -> bool {
            g_running = false;
            return true;
        });

        // 模拟主循环：固定步长推进，向前端推送全量状态
        std::thread([&app]() {
            auto last = std::chrono::steady_clock::now();
            while (g_running) {
                std::this_thread::sleep_for(std::chrono::milliseconds(kTickMs));
                if (!g_running) break;

                const auto now = std::chrono::steady_clock::now();
                const float dt = std::chrono::duration<float>(now - last).count();
                last = now;

                json snapshot;
                {
                    std::lock_guard<std::mutex> lock(g_mutex);
                    if (!g_paused) g_tank.Step(dt);
                    snapshot = g_tank.Snapshot();
                }
                app.GetBridge().Emit("tick", snapshot);
            }
        }).detach();
    });

    return app.Run();
}
