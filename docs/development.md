# 开发说明

## 开发与验证

```bash
npm ci
```

两个终端分别运行：

```bash
npm start
```

```bash
npm run dev
```

Vite 默认页面 `http://127.0.0.1:5173/whereto/`，`/whereto/api` 转发至 `DSH_WEB_URL` 或默认 DSH `3080`，仍需宿主认证。日常验证优先使用 DSH 下的 `/whereto/`。已构建网页由 `npm start` 的本地服务提供；修改源码后需要 `npm run build`。开发前先构建一次以备生产预览。

```bash
npm test
npm run build
```

Node 原生测试覆盖全目录城市与图片存在性、串行原子写入、整项目插件挂载与卸载、DSH 会话创建、宿主模型与预设继承、引用校验、失败用量保留、取消、HTTP 来源限制、收藏持久化、缓存升级与命中，以及天气。测试使用临时目录和宿主会话替身，不消耗模型额度。项目已注册到 DSH Web profile 后，`npm start` 启动宿主；`npm run dev` 代理宿主的 `/whereto/api`。后端插件代码修改后重新启动 DSH，前端修改由 Vite 更新。

启动器的环境检查只确认 DSH、npm、pnpm 是否已安装；复用已有入口，不自动安装或升级 DSH。常规测试使用替身验证缺失提示、已有服务复用与浏览器参数，不访问 npm registry。真实 DSH `0.2.0-rc.2` 已在临时 `DSH_HOME` 中完成插件注册和 Web 健康检查，未调用模型。评价校验测试覆盖长搜索摘要、多次网页读取、逐条略过未通过校验的评价，以及完整原文不进入缓存。

启动器先检查已有地图，再检测 DSH Web 的页面或认证响应。已有宿主时只注册插件并等待其加载，不启动新的 Web 进程；地图已就绪时跳过依赖和更新流程。`DSH_WEB_PORT` 指定宿主检测与新启动使用的端口。测试覆盖后台复用、插件加载或需要重启、无 CLI 时直接复用地图，以及其他服务占用端口；`/whereto/api/runtime` 的 `dshWebUrl` 指向本机 DSH 管理页，局域网 URL 使用实际地图端口。

浏览器人工检查应覆盖：全国 → 省 → 城市 → 标记 → 卡片；搜索和无结果；全部风景与类型筛选；有结果和无结果的随机按钮；收藏、重载、取消；设置保存；空清单；Esc 关闭与键盘焦点；手机和桌面布局；减少动态效果偏好。截图保存在 `output/playwright/`。

## 数据维护

```bash
npm run data:sync
node scripts/build-catalog.mjs
node scripts/cache-guide-images.mjs
node scripts/audit-data.mjs
npm run build
```

`data:sync` 下载阿里云全国/省级 GeoJSON 与 Lore Routes 的 5A 快照，`build-catalog` 完成城市匹配、补充条目与基础说明。已下载且在旧目录中有记录的图片会保留。源数据可能变化，新增无法匹配的城市会明确报错，不自动编造地名。

`scripts/discovered-images.json` 为搜索得到的具体图片页面和原图地址。确认图文对应与使用许可后，可运行 `node scripts/cache-discovered-images.mjs` 下载。图片来源保留在 `catalog.json`，不要把这些原图视作 MIT 授权素材。`sync-images.mjs` 为可选 Commons 搜索尝试，来源不可达时保留明确示意，不应把搜索匹配直接称为人工核验。

调整基础景点数据请更新 builder 或原始补充表后重建；不要仅修改 `dist/`。独立新增景点至少填写稳定 ID、名称、城市、省份、分类、坐标及精度、图源和资料来源。涉及景区参考点与城市中心的条目应如实标记。

### 世界数据重建

从 Natural Earth vector 的 `geojson/` 目录下载下列原始文件到同一临时目录（公共领域），不要替换中国现有目录：

- `ne_50m_admin_0_countries.geojson`
- `ne_10m_admin_1_states_provinces.geojson`
- `ne_10m_populated_places_simple.geojson`

```bash
python scripts/build-world-data.py --source-dir /tmp
npm test
npm run build
```

构建脚本生成 `public/data/world-catalog.json`、`public/data/maps/world.json` 和逐国地图。`public/data/world-landmarks.json` 为已核对的 Wikidata 地标种子，增加时需核对实体名称、坐标与城市归属。国家专有层级规则集中在 builder 的 `profiles` 与归并逻辑；不要仅手工修改生成结果。

前后端使用 `shared/catalog.mjs` 合并中国和世界目录，保留中国稳定 ID。DSH 的 `whereto_read_place` 使用同一合并目录，生成与足迹匹配的业务 skills 支持世界目的地与中英文名。`src/geography.js` 校正每个多边形的环方向；`src/WorldMap.jsx` 处理世界投影、国家主要陆地视角和下钻。新增测试覆盖逐国地图与区划 ID、日英法意层级、跨模式记录、世界卡片生成缓存、匹配提示和目的地跨午夜天气。

### 扩充景点、开放照片与当地时钟

编辑 `scripts/data/world-destinations.tsv` 的国家、中文名、资料标题、类别、IANA 时区和已核验 QID。优先填写具体 QID，以避免同名景点和网页重定向造成误匹配。批量预取再下载，可减少接口限流：

```bash
python scripts/prefetch-world-sources.py
python scripts/enrich-world-destinations.py
python scripts/build-world-data.py --source-dir /tmp
node scripts/audit-world-data.mjs
npm test
npm run build
```

预取工具使用 Wikidata SPARQL 的 CC0 事实和 Commons imageinfo，元数据按批获取；限流时重试并保留缓存。下载器只接受明确许可、带作者的图片，保存原始来源、许可与额外署名。已下载条目默认复用，`--refresh` 可重新核对元数据。新增或变更图片后同步维护 `docs/world-photo-credits.md`。运行不需要模型或 API Key。

城市照片另用 `scripts/enrich-world-city-photos.py`。准备同一 Natural Earth 快照的完整 `ne_10m_populated_places.geojson`（包含 `WIKIDATAID`；`_simple` 不含此字段），放进 `/tmp`。Python 需要 Pillow 以验证照片能解码及尺寸。运行：

```bash
python scripts/enrich-world-city-photos.py --source-dir /tmp
python scripts/build-world-data.py --source-dir /tmp
node scripts/audit-world-data.mjs
node scripts/audit-world-photos.mjs
```

工具按城市实体及坐标匹配照片，排除地图、徽章和绘画，只下载有作者和明确许可的实景候选。人工补图、历史照片说明及无法被 imageinfo 解析的署名补充放在 `scripts/data/world-city-photo-overrides.json`，必须保留核对来源。请求带真实项目机器人标识，默认单线程，遇限流等待并支持断点续跑；使用 Wikimedia 的标准缩略图尺寸。静态清单与本地照片写入项目，源响应留在 `/tmp/whereto-city-photo-cache`。重建器读取清单；无可靠照片时生成 `unavailable` 状态，加载错误和缺图均由共用 `PlaceImage` 显示文字，不再换成虚构 SVG。更新后运行测试与构建，并检查浏览器的照片、署名、缺图与加载失败状态。

Python builder 完成后调用 `assign-world-timezones.mjs`（开发依赖 geo-tz），将离线 IANA 时区写入每座城市和每个条目；已核实的景点时区优先。远程景点不能因缺少近距离城市而被丢弃，无法合理挂靠的条目建立 `destination-area`。区划来源有缺口时可在种子写 `regionName` 和 `regionSource`，例如索洛韦茨基群岛。

`shared/local-time.mjs` 是时区与日期计算的共同实现。界面每秒更新实时时钟，独立展示天气观测的完整日期时间；天气请求每 15 分钟刷新，并检查当地日期跨日。测试覆盖日期变更线、跨年、美国夏令时重复时段、印度和尼泊尔半／四分之一小时时区、未知国外时区不回退北京时间、断网时使用预置 IANA 时区。
