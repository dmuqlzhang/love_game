# Fireworks Implementation Plan

**Goal:** 增加单手触发的全画布烟花与本地音效。

**Architecture:** `fireworks.js` 管理有上限的发射时间线和粒子解析运动，返回当帧音效事件；`fireworks-renderer.js` 绘制烟花；`fireworks-audio.js` 管理 Web Audio 生命周期与合成；`romance-ui.js` 统一动作与控制。原 `RomanceScene` 不承载烟花数据，原告白阶段不受影响。

**Tech Stack:** Canvas 2D、Web Audio、现有 ES modules/Node test/Vite。按 subagent-driven-development 分离音效实现并独立审查；无 Git 仓库，不建立提交。

- [x] 在 `tests/romance.test.js` / `tests/romance-ui.test.js` 先增加 🤟 几何、触发、防重复、阶段不变断言；运行 `node --test tests/romance*.test.js` 观察新断言失败。
- [x] 修改 `src/romance.js` 的手指分类，增加 love pose 和一次触发事件；补齐测试 helper 的 thumb/指形。
- [x] `tests/fireworks.test.js` 覆盖发射间隔、结束清理、禁止叠加、事件只播一次、过时声音丢弃、粒子上限、减少动态效果；先失败再实现 `FireworksShow.trigger/tick/reset`。
- [x] `tests/fireworks-audio.test.js` 验证不自动建音频上下文、用户解锁、静音立即停止、无权限降级、有限振幅及音源清理；先失败再实现本地噪声/低音/爆裂包络与音量控制。
- [x] 接入 `src/romance-ui.js`、`src/main.js`；增加按钮、快捷键 5、音量/静音控件及说明；`drawFireworks` 在告白前绘制。后台/重置/模式切换停止视觉及音源。
- [x] `npm test`、`npm run build`；浏览器完成 5 触发、关闭音效、重新播放、4 告白后的烟花、R 重置，检查控制台。使用独立审查检查时间线、声音资源清理和旧手势回归。
- [x] 更新 README、验证记录，保留 localhost 服务并交付。


## 验证记录

- `npm test`：68/68 通过；最新 `npm run build`：15 模块构建成功。
- 新增识别/时间线/音频/UI 测试遵循先失败后实现；补充 🤟 保持跨越爱心成形阶段的回归测试，已复现并修复。
- 独立审查已复核通过，无剩余 P1/P2；修复 BFCache 返回后音频不可恢复、零音量开启逻辑及错误提示。
- 浏览器：按钮与 5 启动/重播、音效开启/关闭、音量 35%→40%、R 重置和全屏控件可用，未见 warn/error。
- 使用正式绘制模块的临时固定帧页面核对彩色圆花、爱心烟花、金柳、姓名、完整告白同屏。临时页面/文件已移除。
- 合成音频的图结构与生命周期已自动验证，浏览器音频状态可开启；尚未实际试听扬声器，也未验证真人 🤟 手势的准确率。
- 原本地服务保留于 http://127.0.0.1:5173/。
