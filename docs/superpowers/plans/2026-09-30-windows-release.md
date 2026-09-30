# Windows 桌面包与 GitHub Release

目标：将现有网页封装为 Windows x64 免安装 exe，包含手部模型和浏览器运行时，并让 GitHub Actions 构建、校验及发布。现有浏览器启动方式保留。

设计：Electron 窗口加载仅绑定 127.0.0.1 随机端口的静态资源服务，保持 Worker、WASM、摄像头和下载的现有 URL 行为。渲染进程禁用 Node 集成、启用 sandbox 与 contextIsolation；拒绝外部导航和非摄像头权限。

桌面包默认姓名为“亲爱的”。免安装 exe 首次启动在旁边生成 config.json，并提供打开配置的菜单；开发运行使用 Electron userData 目录。已有配置，包括格式错误的配置，均不覆盖。发布不依赖个人访问令牌，使用工作流限定权限的 GITHUB_TOKEN。

默认发布规则：普通推送和 PR 执行测试、打包并保存构建产物；推送 v版本号 标签发布对应 Release。仓库地址由用户指定；当前目录不是 Git 仓库，不推测远端、不自动公开。

执行清单：
- [x] 先写桌面配置、路径隔离、资源 MIME 和版本检查测试，确认缺失功能导致失败。
- [x] 实现桌面入口、只读本地资源服务、可编辑配置和真实模型自检模式。
- [x] 接入 Electron Builder，锁定依赖，制作 Windows x64 portable exe。
- [x] 增加 GitHub Windows 构建及标签发布流程，发布前校验版本和包内容。
- [x] 运行完整测试、网页构建、打包检查；验证生成 exe 的文件格式与包内资源。
- [x] 更新使用与发布说明，说明代码签名和当前未完成的 Windows 实机验证。

验证边界：本机是 macOS。跨平台生成 exe 不等于 Windows 成功运行；Windows runner 需运行打包后的程序自检并检查模型初始化，真实摄像头和声音仍需 Windows 设备试用。

实际结果：79 项自动测试通过；Windows exe 成功生成，107552957 字节。PE 格式、x64 主程序、20 个归档资源的校验和与最终文件 SHA-256 均通过校验。工作流 YAML、固定 Actions 提交、权限及依赖锁文件一致性已检查。exe 未包含 Authenticode 签名。

未执行：仓库尚未连接，GitHub Actions 和 Windows exe 启动自检尚未运行。辅助 macOS 自检因 Electron 官方下载连接失败而无法启动，阻塞的辅助打包进程已终止。发布工作流配置为 Windows 自检通过后才发布。
