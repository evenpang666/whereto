import fs from "node:fs/promises";
import path from "node:path";
const dir = path.resolve(import.meta.dirname, "../public/data");
const cities = JSON.parse(await fs.readFile(path.join(dir, "cities.json")));
for (const [id, name, x, y] of [
  ["712100", "新竹县", 121.0177, 24.8387],
  ["712200", "嘉义县", 120.2555, 23.4598],
])
  if (!cities.some((c) => c.id === id))
    cities.push({
      id,
      name,
      provinceId: "710000",
      province: "台湾省",
      center: [x, y],
    });
const original = JSON.parse(
  await fs.readFile(path.join(dir, "5a-source.json")),
);
const previous = JSON.parse(
  await fs
    .readFile(path.join(dir, "catalog.json"))
    .catch(() => '{"places":[]}'),
);
const extra = {
  邢台市: "天河山",
  张家口市: "大境门",
  沧州市: "沧州铁狮子",
  廊坊市: "天下第一城",
  阳泉市: "娘子关",
  朔州市: "应县木塔",
  吕梁市: "碛口古镇",
  包头市: "五当召",
  乌海市: "乌海湖",
  通辽市: "大青沟",
  巴彦淖尔市: "乌梁素海",
  乌兰察布市: "乌兰哈达火山",
  锡林郭勒盟: "锡林郭勒草原",
  抚顺市: "赫图阿拉城",
  丹东市: "鸭绿江断桥",
  锦州市: "笔架山",
  营口市: "山海广场",
  阜新市: "海棠山",
  辽阳市: "辽阳白塔",
  铁岭市: "莲花湖湿地",
  朝阳市: "朝阳鸟化石国家地质公园",
  葫芦岛市: "兴城古城",
  吉林市: "松花湖",
  四平市: "叶赫那拉古城",
  辽源市: "龙首山",
  鹤岗市: "萝北名山",
  双鸭山市: "七星峰",
  大庆市: "铁人王进喜纪念馆",
  佳木斯市: "黑瞎子岛",
  七台河市: "桃山公园",
  绥化市: "金斗湾旅游区",
  蚌埠市: "龙子湖",
  淮南市: "八公山",
  淮北市: "相山公园",
  铜陵市: "天井湖",
  宿州市: "皇藏峪",
  亳州市: "花戏楼",
  新余市: "仙女湖",
  日照市: "日照海滨国家森林公园",
  德州市: "泉城欧乐堡",
  聊城市: "光岳楼",
  滨州市: "魏氏庄园",
  菏泽市: "曹州牡丹园",
  鹤壁市: "云梦山",
  濮阳市: "戚城遗址",
  许昌市: "春秋楼",
  漯河市: "沙澧河风景区",
  三门峡市: "天鹅湖国家城市湿地公园",
  济源市: "王屋山",
  黄石市: "黄石国家矿山公园",
  鄂州市: "鄂州西山",
  孝感市: "双峰山",
  荆州市: "荆州古城",
  随州市: "炎帝故里",
  仙桃市: "梦里水乡",
  潜江市: "返湾湖湿地",
  天门市: "陆羽故园",
  益阳市: "桃花江竹海",
  永州市: "柳子庙",
  怀化市: "洪江古商城",
  娄底市: "紫鹊界梯田",
  珠海市: "珠海渔女",
  汕头市: "南澳岛",
  湛江市: "湖光岩",
  茂名市: "中国第一滩",
  汕尾市: "红海湾",
  东莞市: "可园",
  潮州市: "广济桥",
  揭阳市: "揭阳学宫",
  云浮市: "蟠龙洞",
  梧州市: "骑楼城",
  防城港市: "白浪滩",
  钦州市: "三娘湾",
  贵港市: "西山风景区",
  玉林市: "真武阁",
  河池市: "百魔洞",
  来宾市: "金秀大瑶山",
  海口市: "骑楼老街",
  三沙市: "永兴岛",
  儋州市: "东坡书院",
  五指山市: "五指山热带雨林",
  琼海市: "博鳌玉带滩",
  文昌市: "铜鼓岭",
  万宁市: "石梅湾",
  东方市: "鱼鳞洲",
  定安县: "文笔峰",
  屯昌县: "木色湖",
  澄迈县: "福山咖啡文化风情镇",
  临高县: "临高角",
  白沙黎族自治县: "白沙陨石坑",
  昌江黎族自治县: "棋子湾",
  乐东黎族自治县: "尖峰岭",
  陵水黎族自治县: "分界洲岛",
  保亭黎族苗族自治县: "呀诺达雨林文化旅游区",
  琼中黎族苗族自治县: "百花岭",
  自贡市: "自贡恐龙博物馆",
  攀枝花市: "二滩国家森林公园",
  泸州市: "尧坝古镇",
  德阳市: "三星堆博物馆",
  遂宁市: "广德寺",
  内江市: "张大千纪念馆",
  眉山市: "三苏祠",
  宜宾市: "蜀南竹海",
  达州市: "八台山",
  资阳市: "安岳石刻",
  凉山彝族自治州: "邛海",
  六盘水市: "乌蒙大草原",
  曲靖市: "九龙瀑布群",
  玉溪市: "抚仙湖",
  昭通市: "大山包",
  普洱市: "普洱国家公园",
  临沧市: "翁丁古寨",
  楚雄彝族自治州: "元谋土林",
  红河哈尼族彝族自治州: "元阳梯田",
  德宏傣族景颇族自治州: "勐焕大金塔",
  怒江傈僳族自治州: "怒江大峡谷",
  昌都市: "然乌湖",
  山南市: "桑耶寺",
  那曲市: "萨普神山",
  阿里地区: "冈仁波齐",
  铜川市: "药王山",
  汉中市: "汉中石门栈道",
  榆林市: "镇北台",
  安康市: "瀛湖",
  兰州市: "黄河铁桥",
  金昌市: "骊靬古城",
  白银市: "黄河石林",
  武威市: "雷台汉墓",
  庆阳市: "周祖陵",
  定西市: "遮阳山",
  黄南藏族自治州: "隆务寺",
  海南藏族自治州: "贵德国家地质公园",
  果洛藏族自治州: "年保玉则",
  玉树藏族自治州: "结古寺",
  海西蒙古族藏族自治州: "茶卡盐湖",
  哈密市: "哈密魔鬼城",
  克孜勒苏柯尔克孜自治州: "白沙湖",
  和田地区: "和田玉龙喀什河",
  塔城地区: "巴尔鲁克山",
  石河子市: "新疆兵团军垦博物馆",
  阿拉尔市: "三五九旅屯垦纪念馆",
  图木舒克市: "唐王城遗址",
  五家渠市: "青格达湖",
  北屯市: "西海风情园",
  铁门关市: "将军河",
  双河市: "怪石峪",
  可克达拉市: "伊犁河谷",
  昆玉市: "昆玉文化公园",
  胡杨河市: "胡杨河生态公园",
  台北市: "台北故宫博物院",
  高雄市: "西子湾",
  台南市: "安平古堡",
  台中市: "高美湿地",
  新竹市: "新竹城隍庙",
  嘉义市: "桧意森活村",
  基隆市: "和平岛公园",
  花莲县: "太鲁阁",
  南投县: "日月潭",
  台东县: "三仙台",
  宜兰县: "龟山岛",
  新北市: "九份",
  桃园市: "大溪老街",
  苗栗县: "胜兴车站",
  彰化县: "鹿港老街",
  云林县: "北港朝天宫",
  屏东县: "垦丁国家公园",
  澎湖县: "澎湖跨海大桥",
  金门县: "莒光楼",
  连江县: "芹壁聚落",
  香港特别行政区: "太平山顶",
  澳门特别行政区: "大三巴牌坊",
};
const notes = {
  西湖风景名胜区: [
    "一湖烟水，半城诗意。沿着苏堤慢慢走，把杭州的温柔收进眼底。",
    "西湖的人文景观与白居易、苏轼等人的治湖活动密切相关。“白蛇传”是流传于此的民间传说。",
    "适合漫步、看展与摄影。若想避开热闹，试着在清晨走向茅家埠。",
    "春秋",
    "半天至一天",
  ],
  故宫博物院: [
    "走入红墙与金瓦之间，在一重重院落中感受古代宫城的秩序。",
    "故宫位于北京中轴线，是明清两代皇宫。今天的博物院以建筑和馆藏展示中国历史与艺术。",
    "适合建筑、历史和博物馆爱好者。院落尺度大，建议穿舒适的鞋，并提前核实预约规则。",
    "春秋",
    "一天",
  ],
  黄山风景区: [
    "在云海、奇松与花岗岩峰林之间，走一段向上的山路。",
    "黄山长期进入中国山水画与诗文传统。其地质景观与山地生态也是重要的自然价值。",
    "适合徒步与山水摄影。山间天气变化快，体力、装备和天气比打卡数量更重要。",
    "春秋",
    "一至两天",
  ],
  丽江古城景区: [
    "顺着流水与石板路，走入雪山脚下的纳西聚落。",
    "丽江古城体现了纳西文化与多元商贸交往形成的城镇空间。水系与街巷共同构成其特色。",
    "适合慢走与了解地方文化。主街商业氛围较浓，清晨的支巷更适合安静探索。",
    "春秋",
    "一天",
  ],
};
function category(name) {
  if (
    /海螺沟|可可托海|喀纳斯|喀拉峻|那拉提|普达措|神农架|九寨沟|黄龙|亚丁|普者黑|武陵源|魔鬼城|植物园/.test(
      name,
    )
  )
    return "山野自然";
  if (
    /博物|纪念|故居|遗址|古城|古镇|古村|祠|庙|寺|宫|楼|阁|书院|学宫|石刻|古堡|街|桥|城墙|园林/.test(
      name,
    )
  )
    return "人文古迹";
  if (/湖|河|溪|泉|湿地|瀑|水|漓江|长江|两江/.test(name)) return "湖光水色";
  if (/海|岛|滩|湾/.test(name) && !/云海|林海|竹海|沙海/.test(name))
    return "海岸漫游";
  if (/山|林|峡|谷|峰|草|地质|洞|火山|梯田/.test(name)) return "山野自然";
  return "城市漫步";
}
const places = [];
extra["新竹县"] = "内湾老街";
extra["嘉义县"] = "阿里山";
for (const item of original) {
  const cityOverride = {
    "bin-lang-gu-li-miao-cultural-tourism-area": "保亭黎族苗族自治县",
    "boundary-island-hainan": "陵水黎族自治县",
    "yanoda-rainforest-cultural-tourism-area": "保亭黎族苗族自治县",
    "ta-ke-la-ma-gan-san-wu-jiu-lv-cultural-tourism-area": "阿拉尔市",
  };
  const city =
    cities.find((c) => c.name === (cityOverride[item.slug] || item.city_zh)) ||
    cities.find(
      (c) =>
        c.province === item.province_zh &&
        (c.name.startsWith(item.city_zh.replace(/市$|地区$|自治州$/, "")) ||
          item.city_zh.startsWith(c.name.replace(/市$|地区$|自治州$/, ""))),
    );
  if (!city) {
    console.warn("未匹配城市", item.name_zh, item.city_zh);
    continue;
  }
  places.push({
    id: item.slug,
    name: item.name_zh,
    englishName: item.name_en,
    cityId: city.id,
    city: city.name,
    provinceId: city.provinceId,
    province: city.province,
    coordinates: [item.longitude, item.latitude],
    coordinateSource: item.coordinate_source,
    precision: "scenic-reference",
    grade: item.grade,
    category: category(item.name_zh),
    sources: [{ title: "Lore Routes · 5A 景点资料", url: item.profile_url }],
    guideUrl: item.guide_url,
  });
}
for (const city of cities) {
  if (!places.some((p) => p.cityId === city.id)) {
    if (!extra[city.name]) throw Error(`缺少城市景点：${city.name}`);
    places.push({
      id: `local-${city.id}`,
      name: extra[city.name],
      cityId: city.id,
      city: city.name,
      provinceId: city.provinceId,
      province: city.province,
      coordinates: city.center,
      coordinateSource: "city-center",
      precision: "city-reference",
      category: category(extra[city.name]),
      sources: [
        {
          title: "地方文旅检索（出发前核实）",
          url: `https://www.bing.com/search?q=${encodeURIComponent(city.name + " " + extra[city.name] + " 官方 文旅")}`,
        },
      ],
      guideUrl: "",
    });
  }
}
const aiImages = JSON.parse(
  await fs.readFile(path.join(dir, "ai-images.json")).catch(() => "[]"),
);
for (const p of places) {
  const note = notes[p.name];
  p.intro =
    note?.[0] ||
    `${p.name}，是探索${p.city}的一站。留一点时间，沿着${p.category === "人文古迹" ? "街巷与建筑，看看地方文化留下的痕迹" : p.category === "海岸漫游" ? "海岸线，听风和潮汐" : p.category === "湖光水色" ? "水边慢慢走，让旅程放缓一些" : "当地的风景，发现旅途中细小的惊喜"}。`;
  p.history =
    note?.[1] ||
    "具体沿革与典故尚未核实。可以生成一份 AI 文化解读；涉及史实的内容，请结合地方志或景区官方资料确认。";
  p.aiReview =
    note?.[2] ||
    `如果你喜欢${p.category}，可以把这里加入${p.city}的行程。先核实交通与开放信息，再按自己的节奏安排停留。`;
  p.bestSeason = note?.[3] || "依当地天气与开放情况";
  p.duration = note?.[4] || "按体力与交通安排";
  p.feedback =
    "尚未接入真实游客评论。这里不展示未经核实的评分、热度或评论数量。";
  p.tips = /三沙|年保玉则/.test(p.name + p.city)
    ? "该地区可能限制进入或不对公众开放，务必先向当地官方核实，切勿擅自前往。"
    : "出发前请核实预约、开放、交通与天气；地图点位用于探索参考。";
  p.image = `/media/illustration-${p.category}.svg`;
  p.imageKind = "illustration";
  p.imageSource = { title: "去哪里 · 景观示意，非实景照片", url: null };
  const old = previous.places.find((x) => x.id === p.id);
  if (old && old.imageKind !== "illustration") {
    p.image = old.image;
    p.imageKind = old.imageKind;
    p.imageSource = old.imageSource;
  }
  const ai = aiImages.find((item) => item.id === p.id);
  if (ai && ["illustration", "ai-illustration"].includes(p.imageKind)) {
    p.image = ai.image;
    p.imageKind = "ai-illustration";
    p.imageSource = {
      title: "去哪里 · AI 景点印象图，非实景",
      url: null,
      generator: ai.generator,
      created: ai.created,
      note: "预制 AI 印象图，不能据此判断现场建筑、天气或开放状态；本地浏览免费。",
    };
  }
}
const catalog = {
  version: 1,
  updated: new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Shanghai",
  }),
  attribution:
    "China 5A Scenic Areas by Lore Routes, CC BY-SA 4.0. Coordinates from Chinese Wikipedia, Wikidata and OpenStreetMap contributors.",
  cities,
  places,
};
await fs.writeFile(path.join(dir, "catalog.json"), JSON.stringify(catalog));
await fs.mkdir(path.resolve(dir, "../media"), { recursive: true });
// Honest, offline fallbacks. They are explicitly labelled illustrations, never real photos.
for (const cat of [
  "人文古迹",
  "海岸漫游",
  "湖光水色",
  "山野自然",
  "城市漫步",
]) {
  const building = cat === "人文古迹" || cat === "城市漫步";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="660" viewBox="0 0 900 660"><rect width="900" height="660" fill="#eae8db"/><circle cx="670" cy="155" r="64" fill="#d8bc91"/><path d="M0 400Q190 180 340 380T900 310V660H0" fill="#b0baa0"/><path d="M0 460Q260 280 490 470T900 410V660H0" fill="#7d907c"/><path d="M0 510Q240 460 470 530T900 500V660H0" fill="#c3cfc2"/>${building ? '<path d="M330 490V320H570V490M300 320 450 235 600 320M350 370H550M350 420H550" fill="#d4c5a6" stroke="#62715d" stroke-width="12" stroke-linejoin="round"/>' : ""}<text x="42" y="610" font-family="sans-serif" font-size="20" fill="#54654f">景观示意 · 非实景</text></svg>`;
  await fs.writeFile(
    path.resolve(dir, `../media/illustration-${cat}.svg`),
    svg,
  );
}
console.log(
  `${cities.length} 城市 / ${places.length} 景点，所有城市至少一条；${places.filter((p) => p.precision === "city-reference").length} 个点为明确标注的城市参考位置。`,
);
