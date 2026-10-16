# 素材、来源与许可

## 地理与景点

- 行政区边界来自 [阿里云 DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector)，全国接口 `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json`，各省使用对应 adcode。用于本地旅行探索示意，不作为入口导航。源数据是快照，不是实时行政区划权威查询。
- 5A 景点来自 [Lore Routes / China 5A Scenic Areas](https://github.com/tuansuwu/china-5a-scenic-areas)，CC BY-SA 4.0。保留原始数据 `public/data/5a-source.json`。坐标上游为 Chinese Wikipedia（CC BY-SA）、Wikidata（CC0）与 OpenStreetMap contributors（ODbL），含少量原数据手动近似坐标。
- 建议署名：**China 5A Scenic Areas dataset by Lore Routes, CC BY-SA 4.0. Coordinates derived from Chinese Wikipedia, Wikidata and OpenStreetMap contributors.** 派生景点目录中的对应数据仍须遵守来源的共享、署名等条件；项目代码 MIT 不会覆盖这些数据许可。
- 缺少 5A 条目的城市补充代表性旅行目的地，名称为人工整理，坐标通常是城市中心，精度字段和卡片均标明未核实。基础文案为项目编辑内容，未进行全量旅游资料核查。

## 配图

`catalog.json` 每个景点保留 `imageKind`、`imageSource.title`、`imageSource.url` 和可用时的 `original`。来源网页图片缓存仅用于本地参考；**原图版权与使用条件归原权利人，未纳入代码 MIT 授权，也未获得全量再分发许可**。部分配图可能是来源站点生成图或带水印，不声称实拍。公开发布或分发图片包之前，应逐张确认、获得授权或替换为自有/明确开放许可素材。

11 处来源图片无法获取的景点，使用内置 imagegen 单独生成了景点印象图，保存在 `public/media/ai-*.png`。完整提示与映射见 [generated-scenery-prompts.json](generated-scenery-prompts.json)，采用 Natural Organic 旅行影像风格，逐图指定具体景点场景；没有使用 CLI 或第三方图像 API。UI 明确标注“AI 生成、非实景、预置浏览 $0”。此外保留本地简化景观示意供图片损坏时兜底。所有展示图片都是本地路径；运行中不会将浏览记录、密钥或用户数据发往第三方图片站点。

当前 README 横幅为项目自有 SVG `public/brand/banner-roam.svg`，延续山与太阳徽标和 Natural Organic 配色，仅包含“漫游whereto”项目名称，无副标题或小字。旧版 imagegen 横幅 `public/brand/banner.png` 作为历史素材保留，不再用于 README。UI 山形标识为项目自有 SVG，图标使用 [Lucide](https://lucide.dev/)（ISC）。字体使用操作系统本地中文宋体与系统 UI 字体，不请求外部字体服务。
