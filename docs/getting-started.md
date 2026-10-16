# 安装与启动

[返回首页](../README.md) · [使用指南](user-guide.md) · [排错指南](troubleshooting.md)

## 环境

- Windows 10/11 或 Linux 桌面。
- 安装包含 npm 的 [Node.js 22 或更新版本](https://nodejs.org/)。
- 首次安装依赖、DSH 和插件需要联网。使用 AI 功能前，在 DSH Web 配置模型及所需工具。

基础地图、搜索、随机探索、收藏和手动标记去过不需要模型密钥。已在 DSH `0.1.5-rc.1`、`0.2.0-rc.2` 的 Web profile 实测加载，范围见 [验证记录](verification.md)。

## 启动项目

**Windows：** 双击根目录 `start.bat`。失败日志保留在启动窗口。

**Linux：** 在项目目录执行：

```bash
bash start.sh
```

需要桌面双击入口时，先运行 `chmod +x start.sh start.desktop`，再按桌面环境提示允许启动。快捷方式细节见 [Linux 双击排错](troubleshooting.md#linux-双击)。

**Windows / Linux 终端：** 在项目目录执行：

```bash
npm start
```

启动器会检查运行环境，补齐本项目依赖并构建网页，将项目注册为 DSH Web 插件。DSH 优先使用 PATH 中满足最低版本的入口；过低或缺失时准备共享目标版本 0.2.0-rc.2。pnpm 继续复用当前环境。

页面默认独立监听 `0.0.0.0:3101`，本机访问 `http://127.0.0.1:3101/`，局域网设备访问 `http://主机局域网IP:实际端口/`，无需登录。首选端口由 `WHERETO_PORT` 或插件 `config.port` 设置；端口占用时直接使用系统分配的空闲端口，启动器与页面显示实际地址。DSH 的模型和凭据继续复用，管理页认证保留，旧 DSH 子路径仅作兼容入口。

## 已有后台服务

地图已就绪时也先检查 DSH 版本和插件登记，再复用已有服务。仅 DSH Web 在运行时，注册插件并等待加载；无法自动加载或原进程仍使用旧运行环境时，需要重启原宿主。

DSH 最低版本为 0.2.0-rc.2。低于要求或缺失时，在 `$DSH_HOME/runtimes/web/versions/0.2.0-rc.2` 暂存安装并校验后切换；失败保留原环境。版本变化后自动重新注册，成功才记录版本。符合要求的新版直接复用，不查询 npm `latest`，不降级。

启动器通过 `dsh plugin --profile web add link:项目目录` 注册整个项目，保留原宿主的插件、模型、预设和 skills。只有本次启动的服务随启动窗口关闭或 `Ctrl+C` 停止；复用的后台服务不受影响。

## 常用设置

| 设置 | 用途 |
| --- | --- |
| `DSH_WEB_URL` | 显式指定已有本机 DSH Web 地址；仅用于定位 DSH 管理服务，地图使用独立端口。 |
| `DSH_WEB_PORT` | DSH Web 的检测和新启动端口，默认 `3080`。 |
| `DSH_HOME` | 选择已有 DSH 配置目录，默认 `~/.dsh`。 |
| `DSH_CLI` | 特殊安装位置的 DSH `lib/bin.js` 完整路径。 |
| `WHERETO_NO_OPEN=1` | 关闭地图自动打开，也可使用下方命令。 |

```bash
npm run launch -- --no-open
```

例如，DSH Web 已运行在 `3081`：

```bash
# Linux
DSH_WEB_PORT=3081 bash start.sh
```

```powershell
# PowerShell
$env:DSH_WEB_PORT = '3081'
npm start
```

## 准备 AI 功能

1. 在 DSH Web 配好模型凭据，并选择具备搜索、网页读取与 skill 能力的预设。
2. 打开漫游的“本地设置”，沿用宿主默认配置，或选择已有预设、填写参考会话 ID。
3. 打开景点卡片，点击“生成散文简介与解读”。

漫游不单独保存或调用模型密钥。权限、模型和工具问题在对应 DSH 会话处理，详见 [使用指南](user-guide.md#dsh-会话与生成)。
