# 验证记录

日期：2026-10-16（Asia/Shanghai）。Windows、Node.js 24、本机 DSH CLI 0.1.5-rc.1、Edge。

## 当前整项目插件

- `npm test`：17 项通过。覆盖整项目插件挂载/卸载、DSH 会话创建、默认模型委托、参考会话模型与预设继承、引用与网页摘录校验、已完成结果恢复、失败用量保留、取消、缓存升级与复用、收藏和来源保护、目录和本地图片、天气。需要允许本机 HTTP 与临时文件原子写入的运行环境。
- `npm run build`：生产构建通过。server、插件和启动脚本通过 Node 语法检查。
- 已通过官方 `dsh plugin --profile web add link:<项目目录>` 注册 dsh-whereto 整项目 bundle，保留已有 dsh-finance-agent 与其他宿主配置。
- 真正启动现有 DSH Web profile 后，地图 health 返回 engine=dsh-agent；设置接口读取到宿主 deepseek-official/deepseek-flash 和标准、PTC、极简、创造预设，没有返回密钥。
- 真实 DSH Agent JSON 连通验证通过：新会话使用宿主 standard 预设、deepseek-flash 模型，返回 `{"ok":true}`；会话已报告 10,685 输入、6 输出 tokens。未传模型请求体或 token 上限，未调用搜索。验证结果记录在 tmp/dsh-agent-live-check.json（本地忽略文件）。
- 真实西湖生成会话完成，实际使用 skill、read、web_search、whereto_read_place、web_fetch，获得 25 条来源。修复最终 JSON 代码块解析后，经结果恢复接口成功回填 schemaVersion 4 卡片，没有再次调用模型。该会话报告 16,320 输入、2,335 输出 tokens；3 个无可验证评价摘录的链接被省略，没有作为真实评价展示。
- Edge 检查真实插件的地图与已回填卡片，以及新的 DSH 会话设置界面。设置不再包含独立 API Key/费率输入，显示宿主模型与预设。截图 output/playwright/dsh-settings.png、dsh-agent-card.png、dsh-agent-mobile.png。390px 视口的页面宽度为 390px，卡片内容无横向溢出。

## 保留功能

- 543 处景点、391 个城市与地区；每个收录城市均有景点，所有景点均有本地图片，数据测试逐项检查。
- 地图、省市与景点搜索、随机探索、收藏与去过状态保留。既有 Host/Origin、回环与所选以太网子网限制保留。
- 天气与生成缓存分离，WMO 主题、15 分钟缓存、并发合并和过期拒绝均有测试。Open-Meteo 之前已实连返回西湖当日天气。
- 散文邀约位于风景故事前，游客反响分体验推测和原文摘录。新版只接受会话工具的结构化来源，不将最终模型声称的 URL 认定为证据。

## 边界

- 常规自动测试使用宿主会话替身；只有明确列出的真实宿主验证消耗模型用量。
- 本地用量账本记录主模型已报告 tokens，不保证覆盖全部辅助搜索/工具费用，不据此提供美元硬上限。费用和权限按 DSH 配置执行。
- 平台索引和访问限制、工具预设差异会影响搜索覆盖；不是所有预设都具备搜索能力，不能保证每个平台都有可引用评价。
- 未在真实 Linux 桌面或真实手机跨设备连接验证。390px 的排版另用浏览器检查。
- 170 条景点仍为明确标记的城市参考位置，不能作为景区入口导航。网页配图与历史资料未完成全量人工核验；AI 配图为非实景印象。
