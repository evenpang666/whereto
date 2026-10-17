# 素材、来源与许可

## 地理与景点

- 行政区边界来自 [阿里云 DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector)，全国接口 `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json`，各省使用对应 adcode。用于本地旅行探索示意，不作为入口导航。源数据是快照，不是实时行政区划权威查询。
- 5A 景点来自 [Lore Routes / China 5A Scenic Areas](https://github.com/tuansuwu/china-5a-scenic-areas)，CC BY-SA 4.0。保留原始数据 `public/data/5a-source.json`。坐标上游为 Chinese Wikipedia（CC BY-SA）、Wikidata（CC0）与 OpenStreetMap contributors（ODbL），含少量原数据手动近似坐标。
- 建议署名：**China 5A Scenic Areas dataset by Lore Routes, CC BY-SA 4.0. Coordinates derived from Chinese Wikipedia, Wikidata and OpenStreetMap contributors.** 派生景点目录中的对应数据仍须遵守来源的共享、署名等条件；项目代码 MIT 不会覆盖这些数据许可。
- 缺少 5A 条目的城市补充代表性旅行目的地，名称为人工整理，坐标通常是城市中心，精度字段和卡片均标明未核实。基础文案为项目编辑内容，未进行全量旅游资料核查。

## 配图

`catalog.json` 每个景点保留 `imageKind`、`imageSource.title`、`imageSource.url` 和可用时的 `original`。来源网页图片缓存仅用于本地参考；**原图版权与使用条件归原权利人，未纳入代码 MIT 授权，也未获得全量再分发许可**。部分配图可能是来源站点生成图或带水印，不声称实拍。公开发布或分发图片包之前，应逐张确认、获得授权或替换为自有/明确开放许可素材。

11 处来源图片无法获取的景点，使用内置 imagegen 单独生成了景点印象图，保存在 `public/media/ai-*.png`。完整提示与映射见 [generated-scenery-prompts.json](generated-scenery-prompts.json)，采用 Natural Organic 旅行影像风格，逐图指定具体景点场景；没有使用 CLI 或第三方图像 API。UI 明确标注“AI 生成、非实景、预置浏览 $0”。图片损坏时显示“照片暂时无法加载”，不再回退为类别 SVG。所有展示图片都是本地路径；运行中不会将浏览记录、密钥或用户数据发往第三方图片站点。

当前 README 横幅为项目自有 SVG `public/brand/banner-roam.svg`，延续山与太阳徽标和 Natural Organic 配色，仅包含“漫游whereto”项目名称，无副标题或小字。旧版 imagegen 横幅 `public/brand/banner.png` 作为历史素材保留，不再用于 README。UI 山形标识为项目自有 SVG，图标使用 [Lucide](https://lucide.dev/)（ISC）。字体使用操作系统本地中文宋体与系统 UI 字体，不请求外部字体服务。

## 世界地图与目录

- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) 的矢量地图和城市数据为公共领域。使用 [Natural Earth vector 仓库](https://github.com/nvkelso/natural-earth-vector/tree/master/geojson) 的 `ne_50m_admin_0_countries`、`ne_10m_admin_1_states_provinces`、`ne_10m_populated_places_simple`，2026-10-17 获取。边界经简化、中文名称整理和部分国家区划归并；中国复用现有 DataV 数据。Made with Natural Earth。地图用于旅行探索，不作为行政区划权威或导航依据。
- 新增具体地标的名称与代表坐标来自 [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing)（CC0），每条保留具体实体链接。`world-landmarks.json` 为核对后的种子；基础卡片文案为项目编辑内容，不转载 Wikidata 以外的百科正文。
- 世界具体景点已使用 Wikimedia Commons 开放许可照片，保留作者、原始文件页、许可链接和额外署名；照片不表示实时现场状态。城市入口使用当地或同城地标参考照片，无可靠照片时明确显示待补充；不再使用类别示意 SVG。中国原有图片的许可与署名保持各条原记录。

各国层级配置核对参考：[日本国立国会图书馆的地方政府目录](https://ndlsearch.ndl.go.jp/rnavi/politics/440739)、[法国 IGN 大区资料](https://www.ign.fr/mag/quel-est-le-centre-geographique-des-13-regions-metropolitaines)、[意大利官方旅游局大区目录](https://www.italia.it/es/italia/regiones-italianas)、[英国议会关于四个构成国的答复](https://questions-statements.parliament.uk/written-questions/detail/2025-05-06/HL7177/)。这些网页为核对依据，不是批量转载的数据源。

### 世界照片与时区补充

168 处世界具体景点均有本地照片。逐图作者、原始文件与许可见 [world-photo-credits.md](world-photo-credits.md)，结构化元数据位于 `public/data/world-landmarks.json`。图片保持各自的 CC BY、CC BY-SA、CC0／公共领域、FAL、Commons Attribution 或 KOGL Type 1 等声明；代码 MIT 不覆盖这些照片。原始文件页可进一步查看作品来源与署名，卡片亦展示作者、日期、原始来源、许可与额外署名。城市漫步使用地标照片时明确是城市参考画面。新增城市照片的作者、作品页与许可见 [world-city-photo-credits.md](world-city-photo-credits.md)，结构化清单位于 `public/data/world-city-photos.json`；部分图片通过 Openverse 索引检索自 Flickr，并保留原始作品页与 CC 许可。城市实体对应关系使用 Natural Earth 完整城市快照的 Wikidata ID，坐标交叉检查并抽样检查照片。缺图清单见 [world-photo-coverage.json](world-photo-coverage.json)。

景福宫照片来自首尔旅游档案，依据 [KOGL Type 1](https://www.kogl.or.kr/info/licenseType1.do) 保留机构、作品日期、原始来源与署名链接。FAL 作品按 [Free Art License](https://artlibre.org/licence/lal/en/) 保留作者、原作位置和许可。本次未生成新的 AI 图片，也未修改照片内容。

离线 IANA 时区通过 [geo-tz](https://github.com/evansiroky/node-geo-tz)（代码 MIT，边界数据来自 timezone-boundary-builder）构建，夏令时与 UTC 偏移由运行环境的 Intl/IANA 数据计算；天气接口返回的有效时区优先使用。
