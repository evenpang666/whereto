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

Vite 默认 `http://127.0.0.1:5173`，`/api` 转发至 `3789`。已构建网页由 `npm start` 的本地服务提供；修改源码后需要 `npm run build`。开发前先构建一次以备生产预览。

```bash
npm test
npm run build
```

Node 原生测试覆盖全目录城市与图片存在性、串行原子写入、整项目插件挂载与卸载、DSH 会话创建、宿主模型与预设继承、引用校验、失败用量保留、取消、HTTP 来源限制、收藏持久化、缓存升级与命中，以及天气。测试使用临时目录和宿主会话替身，不消耗模型额度。项目已注册到 DSH Web profile 后，`npm start` 启动宿主；`npm run dev` 仍代理其 3789 API。后端插件代码修改后重新启动 DSH，前端修改由 Vite 更新。

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
