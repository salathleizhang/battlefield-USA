export const CAMPAIGNS = [
  {
    id: 'miami-beach',
    index: '01',
    name: '迈阿密海滩登陆战',
    en: 'OPERATION LANDING · MIAMI BEACH',
    date: '1947 年 3 月 12 日',
    location: '美国 · 佛罗里达州 · 迈阿密海滩',
    year: '1947',
    briefing:
      '黎明前，远征军第九兵团搭乘登陆艇驶向迈阿密海滩。大西洋舰队的舰炮正在压制岸防，海洋大道上的装饰艺术酒店已经起火。' +
      '夺取滩头、撕开海滨酒店防线、冲过麦克阿瑟堤道，为后续重装部队打开迈阿密港的门户。',
    objectives: ['抢滩登陆，夺取 A 点「血色沙滩」', '沿海洋大道推进，夺取 B 点「装饰艺术街区」', '攻占 C 点「麦克阿瑟堤道」'],
    weather: '晴 · 晨光 · 海风 5 级',
    art: '/assets/art/miami-beach.jpg',
    video: '/assets/video/miami-beach-war-loop.mp4',
    accent: '#e0906d',
    env: {
      fogColor: 0xefd9bd, fogDensity: 0.0009, sunColor: 0xffd6a8, sunIntensity: 3.1,
      skyTop: 0x4a7fae, skyHorizon: 0xf6d6b0, cloudColor: 0xf0d6b8,
      groundColor: 0x8a7a64, cloudiness: 0.08,
      hemiIntensity: 1.25, hemiColor: 0xbdd9ec, hemiGround: 0xb09470,
      sunDir: { x: 0.76, y: 0.32, z: 0.36 },
      ambience: 'coast', wetness: 0.9,
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
    weather: '大雾 · 侧风 · 能见度 120 米',
    art: '/assets/art/golden-gate.jpg',
    video: '/assets/video/golden-gate-war-loop.mp4',
    accent: '#b6493a',
    env: {
      weather: 'fog', fog: 0x9fb1b3, fogDensity: 0.0056, sun: 0xdde5e2, sunIntensity: 1.15,
      skyTop: 0x738489, skyHorizon: 0x9fb1b3, ground: 0x4b524e, cloudiness: 0.7, cloudColor: 0x738285,
      sunDir: { x: 0.42, y: 0.5, z: 0.76 }, sunDisc: 0.28, godRayWeight: 0.06,
      hemiIntensity: 1.9, hemiColor: 0xbfcfd0, hemiGround: 0x57615e,
      ambience: 'bridge', wetness: 1.0, puddleReflection: 1.0,
      hdri: 'goldenGate', envIntensity: 0.8, hdriRotation: 0.4,
      // Fog also caps bot sight. See Bot.canSee: AI should not fire through a
      // wall of fog the player cannot see through either.
      visibility: 120,
      fogBanks: {
        count: 46, size: 1.5, opacity: 1.5, wind: [4.2, 1.2], densitySwing: 0.28,
        sheets: 3, sheetOpacity: 0.32, sheetColor: 0xc9d3cf,
      },
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
    video: '/assets/video/mississippi-war-loop.mp4',
    accent: '#8a8f4a',
    env: {
      fog: 0xb3ab90, fogDensity: 0.0026, sun: 0xffd7a8, sunIntensity: 2.25,
      skyTop: 0x3f4a44, skyHorizon: 0xc0a071, ground: 0x5d5a44, cloudiness: 0.75,
      sunDir: { x: 0.62, y: 0.28, z: -0.73 },
      ambience: 'river', wetness: 1.0, rain: 0.35,
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
    video: '/assets/video/washington-war-loop.mp4',
    accent: '#c9a15a',
    env: {
      fog: 0xae9f8a, fogDensity: 0.0024, sun: 0xffcf94, sunIntensity: 2.5,
      skyTop: 0x514b50, skyHorizon: 0xd9a777, ground: 0x6b5f4e, cloudiness: 0.62,
      sunDir: { x: -0.72, y: 0.14, z: 0.68 },
      ambience: 'city', wetness: 0.85,
    },
  },
];

export const CAMPAIGN_BY_ID = Object.fromEntries(CAMPAIGNS.map((c) => [c.id, c]));
