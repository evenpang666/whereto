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

启动器会检查运行环境，补齐依赖并构建网页，将项目注册为 DSH Web 插件。自动安装或升级的 DSH，以及缺少时安装的 pnpm，保存在 `.local/runtime/`，由本项目优先使用。

地图默认地址为 `http://127.0.0.1:3789`。地图会自动打开，DSH Web 只打印 URL；首次登录 DSH 时使用它原启动窗口输出的登录链接。

## 已有后台服务

地图已就绪时，直接复用并跳过安装升级。仅 DSH Web 在运行时，注册插件并等待加载，不再启动第二个 Web 服务；无法自动加载时，会提示在原宿主检查插件或重启。

尚未就绪时，启动器查询 npm `latest`，检测到更旧的 DSH 就自动升级。断网且已有可用环境时继续使用已装版本；首次安装无法联网则停止并说明原因。升级的版本在下次启动宿主时生效。

启动器通过 `dsh plugin --profile web add link:项目目录` 注册整个项目，保留原宿主的插件、模型、预设和 skills。只有本次启动的服务随启动窗口关闭或 `Ctrl+C` 停止；复用的后台服务不受影响。

## 常用设置

| 设置 | 用途 |
| --- | --- |
| `WHERETO_PORT` 或 `PORT` | 地图端口，默认 `3789`；两者同时设置时前者优先。 |
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
