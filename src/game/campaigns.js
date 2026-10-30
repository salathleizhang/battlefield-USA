export const CAMPAIGNS = [
  {
    id: 'santa-barbara',
    index: '01',
    name: '圣塔芭芭拉登陆战',
    en: 'OPERATION LANDING · SANTA BARBARA',
    date: '1947 年 3 月 12 日',
    location: '美国 · 加利福尼亚州 · 圣塔芭芭拉海岸',
    year: '1947',
    briefing:
      '黎明前，远征军第九兵团搭乘登陆艇驶向圣塔芭芭拉。美军的岸防炮正从悬崖上的要塞倾泻火力，码头的仓库已经起火。' +
      '夺取滩头、控制栈桥、撕开滨海大道，为后续重装部队打开通往洛杉矶的门户。',
    objectives: ['抢滩登陆，夺取 A 点「血色沙滩」', '沿栈桥推进，夺取 B 点「燃烧码头」', '攻占 C 点「圣塔芭芭拉要塞」'],
    weather: '阴云 · 晨雾 · 海风 6 级',
    art: '/assets/art/santa-barbara.jpg',
    accent: '#c9764a',
    env: {
      fog: 0xaaa79b, fogDensity: 0.0019, sun: 0xffe3c3, sunIntensity: 2.55,
      skyTop: 0x45566c, skyHorizon: 0xd2c3a8, ground: 0x6d6452, cloudiness: 0.52,
      sunDir: { x: -0.55, y: 0.2, z: -0.78 },
      ambience: 'coast',
    },
  },
  {
    id: 'golden-gate',
    index: '02',
    name: '飞夺金门大桥',
    en: 'OPERATION GOLDEN GATE',
    date: '1947 年 3 月 19 日',
    location: '美国 · 旧金山 · 金门海峡',
    year: '1947',
    briefing:
      '旧金山湾的雾墙中，金门大桥是北太平洋舰队的最后一道闸门。先锋部队必须在大雾与横风中夺取桥塔，' +
      '剪断炸药引线，让远征军舰队驶入旧金山湾。脚下是六十米深的冰冷海水，桥面上是美军的机枪交叉火网。',
    objectives: ['夺取 A 点「北塔」', '突进桥面，夺取 B 点「中跨」', '攻占 C 点「南塔 · 旧金山」'],
    weather: '浓雾 · 侧风 · 能见度 120 米',
    art: '/assets/art/golden-gate.jpg',
    accent: '#b6493a',
    env: {
      fog: 0xb4bbbb, fogDensity: 0.0056, sun: 0xf6ead8, sunIntensity: 1.6,
      skyTop: 0x5f6a6f, skyHorizon: 0xb9bec0, ground: 0x5a5f5c, cloudiness: 0.85,
      sunDir: { x: 0.2, y: 0.42, z: 0.88 },
      ambience: 'bridge',
      hdri: 'goldenGate', envIntensity: 0.9, hdriRotation: 0.4,
    },
  },
  {
    id: 'mississippi',
    index: '03',
    name: '强渡密西西比河',
    en: 'OPERATION MISSISSIPPI CROSSING',
    date: '1947 年 4 月 2 日',
    location: '美国 · 路易斯安那州 · 巴吞鲁日',
    year: '1947',
    briefing:
      '密西西比河宽三公里，浑浊的河水挡住了南线的装甲矛头。工兵连夜架设浮桥，对岸的棉花田与河堤上，' +
      '美军第七集团军已经挖好了战壕。渡河，建立桥头堡，然后拿下巴吞鲁日港——南线的补给命脉。',
    objectives: ['强渡河面，夺取 A 点「浮桥」', '攻占 B 点「棉花田堤坝」', '夺取 C 点「巴吞鲁日港」'],
    weather: '闷热 · 雷暴将至 · 河雾',
    art: '/assets/art/mississippi.jpg',
    accent: '#8a8f4a',
    env: {
      fog: 0xb3ab90, fogDensity: 0.0026, sun: 0xffd7a8, sunIntensity: 2.25,
      skyTop: 0x3f4a44, skyHorizon: 0xc0a071, ground: 0x5d5a44, cloudiness: 0.75,
      sunDir: { x: 0.62, y: 0.28, z: -0.73 },
      ambience: 'river',
    },
  },
  {
    id: 'washington',
    index: '04',
    name: '解放华盛顿',
    en: 'OPERATION LIBERATE WASHINGTON',
    date: '1947 年 4 月 19 日',
    location: '美国 · 华盛顿哥伦比亚特区 · 国家广场',
    year: '1947',
    briefing:
      '战争最后一天。远征军从波托马克河岸突入华盛顿，国家广场上的方尖碑在炮火中投下长影。' +
      '国会大厦的圆顶就在前方——那里是美军最后的指挥中枢。拿下它，这场战争就会结束。',
    objectives: ['从波托马克河岸登陆', '夺取 B 点「林肯纪念堂」', '攻占 C 点「国会大厦」', '在圆顶升起红旗'],
    weather: '炮火烟霾 · 黄昏 · 逆光',
    art: '/assets/art/washington.jpg',
    accent: '#c9a15a',
    env: {
      fog: 0xae9f8a, fogDensity: 0.0024, sun: 0xffcf94, sunIntensity: 2.5,
      skyTop: 0x514b50, skyHorizon: 0xd9a777, ground: 0x6b5f4e, cloudiness: 0.62,
      sunDir: { x: -0.72, y: 0.14, z: 0.68 },
      ambience: 'city',
    },
  },
];

export const CAMPAIGN_BY_ID = Object.fromEntries(CAMPAIGNS.map((c) => [c.id, c]));
