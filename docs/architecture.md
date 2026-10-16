# DSH Web 业务插件架构

```text
DSH Web profile（原模型、凭据、预设、工具、skills、持久化）
  └─ dsh-whereto（dsh/index.mjs）
      ├─ 地图与卡片 HTTP 服务 :3789 → React 界面、收藏、足迹、天气
      ├─ whereto_read_place 工具、两个旅行业务 skills
      └─ 宿主 sessionController → 新旅行 Agent 会话
          ├─ 默认宿主模型/预设，或沿用参考会话的模型和预设
          ├─ 宿主启用的工具、搜索、skills、权限与上下文管理
          └─ 会话事件与最终 JSON → 业务校验 → 本地卡片缓存
```

## 插件安装与生命周期

项目 package.json 声明 `dsh.bundle.patch`，入口 `dsh/index.mjs`。执行 `npm run dsh:install`，通过官方 `dsh plugin --profile web add link:<项目目录>` 将整个项目作为本地插件加入已有 Web profile。命令保留现有其他插件、模型和预设。DSH 再次启动时加载 bundle 中的 whereto 行。`start.bat`、`start.sh`、`npm start` 会准备构建、注册插件并启动 DSH Web；已启动的新版地图服务直接复用，旧独立服务需先关闭。

插件注入宿主 `sessionController`、`sessions`、`tools`、`skills`、`agentDefaultModel`、`agentPresets` 和 `webServer`，不自建 Cordis/LLM/搜索运行时，不直接请求任何模型 API。端口默认 3789，可由 `WHERETO_PORT` 或插件 config.port 指定。DSH 卸载插件时取消当前生成并关闭地图服务，收藏和缓存保留。

## 生成与宿主复用

`server/dsh-agent.mjs` 调用宿主 sessionController.create，新会话 cwd 为项目目录，Agent 预设未指定时遵循宿主 defaultId，模型未指定时遵循宿主默认模型。若配置 sourceSessionId，则只 inspect 参考会话的模型选择和 preset，创建新旅行会话并 selectModel；不会向原会话发送消息，也不复制聊天内容。显式选择的预设优先于参考会话预设。

生成通过宿主 prompt 入口入队，Agent 自行调用预设中启用的工具和 skills。漫游不传 model 请求体、不分配 max_tokens、不设置工具轮数，也不替换宿主权限策略。插件额外注册 whereto_read_place 和 whereto-travel-guide、whereto-visited-matcher，宿主其他能力保持可用。受预设限制的工具不会被强行启用；若用户选择极简等缺少搜索能力的预设，应在 DSH Web 选择具有所需能力的预设。

Agent 完成后读取其会话日志，最终 JSON 通过类型、长度、评价来源或库内序号校验才落盘。景点结果 schemaVersion 4；旧版缓存继续可读，但用户下一次主动生成会升级。批量足迹匹配也运行于 DSH Agent，会核验目录序号、去重后合并去过状态。任一生成失败均不覆盖已有景点缓存。

## 引用证据与费用

真实评价来源取自 DSH 会话 tool/result 的结构化 meta.sources，保留工具提供的 snippet；也支持成功网页读取工具返回的原文。模型返回 reviewUrls，可附 reviewExcerpts；额外摘录必须逐字对应工具原文才接受，模型自行声称的 URL 不能作为证据。没有可核验摘录的条目会省略，完整网页正文只在内存校验，不写入卡片缓存。网页、小红书和知乎的覆盖依赖当前工具与网页索引，平台不可达时不会生成虚构评论。

每个任务保留 DSH 会话 ID、实际模型、预设、工具轨迹。`assistant/message.usage` 的输入/输出 tokens 保存到本地用量账本；主模型报告不一定包括所有辅助工具费用，所以 cost 为 null，计费以 DSH 和上游为准。应用不再承诺固定美元上限，也不把未知金额显示为零。缓存再次打开不生成；主动刷新有新的用量。旧本地 API Key 不读取、不发送、不返回，保存新设置时写成只有 sourceSessionId/agentPreset 的新格式。

## 进度、取消和限制

GET /api/generation 返回当前任务的会话 ID 与工具进度。前端每 1.5 秒更新，可打开 DSH Web 或 POST /api/generation/cancel，取消仅作用于本项目当前任务。15 分钟应用等待超时会请求取消，已记录的 DSH 会话保留。权限阻塞和模型错误引导到 DSH 会话处理，不自动重复提交收费任务。

最终结果兼容单一完整 JSON 代码块前后的说明文字。POST /api/places/:id/result 可重新读取已完成会话，不重复 prompt 或计入用量；仅接受本项目为该景点创建的会话，并执行相同内容校验。任务进度按类型和景点匹配，避免在其他卡片显示错误的任务。

HTTP 服务保留原 Host、Origin、回环和所选以太网子网校验；设置写入仅允许主机回环访问。局域网用户可以使用主机已配置的 Agent 能力，与原共享模式一致。主机 DSH Web 仍使用其自己的登录、权限和网络策略。

## 数据与天气

`.local/state.json` 保存收藏、去过、最近探索；details.json 保存卡片；visited-matches.json 保存最近 100 份匹配缓存；usage.json 保存已报告 tokens；config.json 只需会话偏好。LocalStore 采用串行原子更新，仍不支持多个服务同时写同一目录。

天气通过固定 Open-Meteo 免费接口，按景点独立缓存 15 分钟，并拒绝过期数据；与 DSH 生成缓存分离。地图、图片、天气主题、散文样式、收藏与去过界面保持现有实现。独立运行 server/index.mjs 只提供离线探索，生成明确要求加载 DSH 插件，不会回退直接调用 API。
