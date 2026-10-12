/* ============================================================
   seed.js · 初始示例数据（首次打开时写入，可自由删改）
   ============================================================ */
const SEED = {

  news: {
    a: [{ time: DT.now(), title: '示例：政策/资金面消息', detail: '写清这条消息影响哪些板块、是利好还是利空、持续性如何', sector: '', level: '中' }],
    us: [{ time: DT.now(), title: '示例：美股科技股财报或异动', detail: '判断对 A 股科技链的映射强度', sector: '算力/半导体', level: '中' }],
    fed: [{ time: DT.now(), title: '示例：美联储官员表态 / 通胀数据', detail: '影响降息预期 → 影响成长股估值与外资流向', sector: '成长风格', level: '中' }],
    oil: [{ time: DT.now(), title: '示例：OPEC+ 产量决议 / 地缘事件', detail: '油价波动 → 石化、油服、航空成本端', sector: '石化/航空', level: '中' }]
  },

  scenario: [
    { name: '乐观', prob: 25, trigger: '指数高开且成交量放大，主线龙头封板', action: '顺主线低吸首板，仓位不超过预设上限', target: '电子特气/煤炭前排' },
    { name: '中性', prob: 50, trigger: '平开震荡，量能与昨日持平', action: '只做计划内标的，快进快出，不加仓', target: '低位补涨方向' },
    { name: '悲观', prob: 25, trigger: '低开且高位股集体炸板', action: '不接飞刀，先减仓观望，等情绪冰点', target: '空仓 / 防守板块' }
  ],

  // 收盘情绪快照骨架：初始不预填任何市场数字（涨停/跌停/涨跌家数等全部由实时接口填充）。
  // 北向资金自 2024-08 起暂停披露，固定展示；其余字段联网后由 /api/breadth + 腾讯成交额实时写入。
  sentimentKpi: { _ver: 'v3', limitUp: null, limitDown: null, broken: null, amount: null, height: null, sealRate: null, north: '暂停披露', upCount: null, downCount: null, prevAmount: null },

  sentimentLog: [
    { date: DT.today(), phase: '修复', limitUp: '', limitDown: '', broken: '', height: '', amount: '', score: '', note: '示例：情绪处于修复期，可小仓试错' }
  ],

  themes: [
    { name: '电子特气', chgPct: '5.82', amount: '428', leader: '中巨芯', logic: '六氟化钨等关键材料涨价+HBM需求提升晶圆用量', status: '高潮', plan: '龙头分歧低吸，跟风不追' },
    { name: '煤炭', chgPct: '4.65', amount: '316', leader: '昊华能源', logic: '夏季用电旺季+焦煤供给偏紧+煤价触底反弹', status: '加速', plan: '前排换手板，后排兑现' },
    { name: 'AI算力', chgPct: '2.34', amount: '892', leader: '寒武纪', logic: '海外大厂资本开支+国产替代订单落地', status: '分歧', plan: '等回踩均线，不追高' },
    { name: 'HBM存储', chgPct: '-1.87', amount: '356', leader: '雅克科技', logic: '隔夜美股存储链大跌映射，短期承压', status: '退潮', plan: '观望，等美股修复信号' }
  ],

  ladder: [
    { board: '6', name: 'XX电子', theme: '电子特气', seal: '12500', time: '09:35', grade: '高', note: '一字加速，明日看换手' },
    { board: '5', name: 'YY科技', theme: 'AI算力', seal: '8600', time: '09:42', grade: '中', note: '尾盘炸板回封，筹码松动' },
    { board: '4', name: 'ZZ能源', theme: '煤炭', seal: '6200', time: '09:38', grade: '高', note: '板块共振，晋级概率高' },
    { board: '3', name: 'AA股份', theme: '电子特气', seal: '4800', time: '10:15', grade: '中', note: '跟风补涨，明日看龙头脸色' },
    { board: '3', name: 'BB煤业', theme: '煤炭', seal: '3900', time: '10:22', grade: '中', note: '煤炭跟风，明日分化预期' },
    { board: '2', name: 'CC新材', theme: 'HBM存储', seal: '2100', time: '13:45', grade: '低', note: '存储板块分歧，谨慎接力' }
  ],

  dragonInst: [
    { name: '中巨芯', code: '688000', buy: '42300', sell: '8200', seats: '3', reason: '20CM涨停', view: '机构净买超3亿，电子特气龙头获中线资金认可' },
    { name: '昊华能源', code: '601015', buy: '28600', sell: '5400', seats: '2', reason: '涨幅偏离7%', view: '机构主导，煤炭周期修复预期' },
    { name: '寒武纪', code: '688256', buy: '15200', sell: '18900', seats: '1', reason: '科创板大涨', view: '机构分歧，净卖出，高位兑现' },
    { name: '雅克科技', code: '002409', buy: '6800', sell: '12300', seats: '1', reason: '存储链回调', view: '机构净卖出，HBM方向承压' }
  ],

  dragonHot: [
    { name: '中巨芯', seat: '消闲派', buy: '18500', sell: '1200', style: '首板', prob: '高', note: '主攻电子特气，次日看溢价' },
    { name: '中巨芯', seat: '章盟主', buy: '12800', sell: '0', style: '接力', prob: '高', note: '加仓做多，与机构共振' },
    { name: 'YY科技', seat: '炒新一族', buy: '6200', sell: '8900', style: '砸盘', prob: '低', note: '高位兑现，接力意愿下降' },
    { name: 'ZZ能源', seat: '作手新一', buy: '7800', sell: '2100', style: '首板', prob: '中', note: '煤炭方向试探性进攻' }
  ],

  opportunity: [
    { dir: '电子特气龙头分歧低吸', logic: '主线仍在发酵，中巨芯打开高度，低位补涨有空间', targets: '中巨芯、低位电子特气补涨', priority: 'S', trigger: '龙头高开换手或分歧回踩5日线', position: 25, space: '8-15%' },
    { dir: '煤炭前排换手板', logic: '煤价触底+旺季催化，板块今日最强，前排有望延续', targets: '昊华能源、ZZ能源', priority: 'A', trigger: '竞价煤炭板块涨幅前3且前排高开不超过5%', position: 15, space: '5-10%' },
    { dir: 'AI算力等回踩', logic: '海外资本开支+国产替代中长期逻辑未变，短期分歧是买点', targets: '寒武纪、海光信息', priority: 'B', trigger: '回踩10日线且缩量', position: 10, space: '10%' }
  ],

  risk: [
    { point: '高位股集体分歧', scope: '连板高度板及跟风股', level: '高', avoid: '3板以上未换手个股', plan: '不参与高位接力，持仓遇炸板先减半', stop: 5 },
    { point: '存储链美股映射下跌', scope: 'HBM、闪存、半导体设备', level: '中', avoid: '雅克科技、佰维存储', plan: '隔夜美股存储未修复前不抄底', stop: 3 },
    { point: '北向资金持续流出', scope: '外资重仓白马、消费蓝筹', level: '中', avoid: '贵州茅台、宁德时代', plan: '回避北向重仓股低吸博反弹', stop: 2 }
  ],

  blacklist: [
    { item: '连续一字板后开板的票', why: '获利盘巨大，接力风险远大于收益' },
    { item: '业绩预亏 + 高位', why: '基本面无支撑，情绪一退就是连续跌停' },
    { item: '自己看不懂逻辑的票', why: '看不懂就拿不住，涨也拿不住跌也跑不掉' },
    { item: '隔夜美股大跌映射的存储链', why: '情绪利空未消化，盘中修复也可能是卖点' }
  ],

  holdings: [
    { code: '', name: '', cost: '', now: '', position: '', plan: '观察', note: '填入代码后点「同步现价」自动更新' },
    { code: '600519', name: '', cost: '1500', now: '', position: '10', plan: '观察', note: '示例：贵州茅台' }
  ],

  notes: [
    { date: DT.today(), topic: '示例：情绪周期识别', type: '情绪', content: '冰点期敢买、高潮期敢卖，这两件事做到一件就够吃一年', rate: '★★★' }
  ],

  routine: [
    { date: DT.today(), wake: '', sleep: '', sleepHours: '', sport: '', sportType: '无', energy: '一般', note: '' }
  ],

  routineGoals: [
    { t: '23:30 前睡觉', d: '睡不好，盘中判断力直接打折' },
    { t: '07:00 前起床', d: '留足时间看隔夜消息和早间策略' },
    { t: '每周运动 4 次以上', d: '每次 30 分钟，心率上得去就行' },
    { t: '盘中站起来活动 2 次', d: '久坐盯盘容易情绪化交易' },
    { t: '每天喝够 1500ml 水', d: '基础但有效' }
  ],

  mindset: [
    { week: DT.weekKey(), score: '', pnl: '', best: '示例：止损执行到位', worst: '示例：尾盘冲动追高', fix: '尾盘 14:45 后不开新仓' }
  ],

  goalHistory: [
    { month: DT.monthKey(), target: 10, actual: '', maxDd: '', review: '' }
  ],

  discipline: [
    { t: '只做计划内的标的', d: '盘前没写进机会清单的票，盘中一律不碰' },
    { t: '单笔仓位不超过上限', d: '再看好也不越线，活着比赚得快更重要' },
    { t: '止损位提前设定并无条件执行', d: '触及止损不找理由、不等反弹' },
    { t: '不追超过 3% 的高开缺口', d: '情绪溢价让别人去买单' },
    { t: '亏损单绝不补仓', d: '加仓只加盈利的票，越跌越买是爆仓起点' },
    { t: '每天最多交易 3 次', d: '频繁操作是亏损之母，手痒就关掉软件' },
    { t: '尾盘 14:45 检查持仓', d: '该走的当天走，不留隔夜侥幸' },
    { t: '收盘后必须复盘并写一句话', d: '没有复盘的交易，等于付费赌博' }
  ],

  materials: [
    { title: '示例：情绪周期五阶段图', type: '图表', tag: '情绪周期', link: '', desc: '冰点—修复—发酵—高潮—退潮，对应不同的仓位策略', date: DT.today() }
  ],

  tools: [
    { _id: 't1', icon: '📈', name: '东方财富行情', desc: '免费行情、龙虎榜、资金流向', url: 'https://quote.eastmoney.com' },
    { _id: 't2', icon: '🔎', name: '同花顺问财', desc: '自然语言选股，复盘找票神器', url: 'https://www.iwencai.com' },
    { _id: 't3', icon: '🌱', name: '韭研公社', desc: '题材梳理与连板梯队', url: 'https://www.jiuyangongshe.com' },
    { _id: 't4', icon: '📄', name: '巨潮资讯网', desc: '上市公司公告一手来源', url: 'http://www.cninfo.com.cn' },
    { _id: 't5', icon: '💬', name: '雪球', desc: '中长线观点与财报讨论', url: 'https://xueqiu.com' }
  ],

  prompts: [
    {
      t: '每日复盘结构化提示词', tag: '复盘',
      p: '你是一位资深A股短线交易员。请根据我提供的以下信息，输出结构化复盘：①今日指数与成交量特征 ②情绪周期处于哪一阶段（冰点/修复/发酵/高潮/退潮）及判断依据 ③主线题材及其持续性评分 ④明日三种情景推演与对应操作 ⑤最需要规避的两个风险。要求：不预测点位，只给条件—应对。我的数据是：'
    },
    {
      t: '个股逻辑拆解提示词', tag: '选股',
      p: '请基于我提供的真实数据（盘面/财报/估值/筹码/技术面），拆解这只股票：①列出多头信号与空头信号并逐条给出数据依据 ②综合评级与核心结论 ③建议方向（已有持仓与无持仓分别怎么办）④最需要盯住的三个可观测信号。个股信息：'
    },
    {
      t: '交易心理复盘提示词', tag: '心态',
      p: '我今天做了以下操作（附操作与当时的想法）。请以行为金融学视角，指出我犯了哪些认知偏误（如处置效应、锚定、损失厌恶、过度自信），并给出 3 条可执行的、下次能立即用上的纠偏动作。操作记录：'
    },
    {
      t: '口播底稿润色提示词', tag: '输出',
      p: '请把下面这份复盘笔记改写成 3 分钟口播稿：口语化、有节奏、每段不超过 3 句话，开头一句话点出今天最重要的变化，结尾给出明确的风险提示。原文：'
    }
  ],

  journal: [
    { date: DT.today(), main: '', pnl: '', position: '', mood: '平稳', right: '', wrong: '', score: 'B' }
  ],

  /* ---- 全球隔夜要闻结构化卡片（各 tab 默认空） ---- */
  overnightNewsParsedA: [
    { source: '中国证券报', title: '400亿龙头中巨芯尾盘涨停2连板，电子特气量价齐升', summary: '六氟化钨等关键材料价格上涨，HBM及3D NAND提升单位晶圆用量。', url: 'http://www.cs.com.cn/', impact: '电子特气成今日核心主线，中巨芯市值411亿20CM涨停。' },
    { source: '财联社', title: '煤炭突然暴动！昊华能源、淮北矿业集体涨停', summary: '夏季用电旺季叠加焦煤供给偏紧催化。', url: 'https://www.cls.cn/', impact: '煤炭板块龙头多股涨停，关注明日持续性。' }
  ],
  overnightNewsParsedUs: [
    { source: '财联社', title: '美股盘中震荡：道指转跌0.75%，纳指微跌0.06%', summary: '费城半导体V型反转涨2%，英伟达涨2%创2个月新高。', url: 'https://www.cls.cn/', impact: '纳指相对抗跌但存储链大跌，A股存储/HBM方向次日承压。' }
  ],
  overnightNewsParsedFed: [
    { source: '彭博', title: '美联储沃什：若通胀反弹，9月加息仍在考虑范围内', summary: '克利夫兰联储主席表示对通胀回落信心不足。', url: 'https://www.bloomberg.com/', impact: '降息预期降温，美债与美元偏强，成长股估值承压。' }
  ],
  overnightNewsParsedOil: [
    { source: '同花顺', title: '纽约黄金小幅反弹，避险需求温和回升', summary: '美元指数高位震荡，贵金属区间整理。', url: 'https://www.10jqka.com.cn/', impact: '黄金股短期随金价波动，中期降息预期仍提供支撑。' }
  ],

  /* ---- 夜盘美股新增模块 ---- */
  usnightStocks: [
    { name: '英伟达', code: 'NVDA', chgPct: '+2%', note: '股价创2个月新高，盘中由跌转涨' },
    { name: '闪迪', code: 'SNDK', chgPct: '-10%', note: '下季营收指引不及预期，开盘跌12.54%' },
    { name: '西部数据', code: 'WDC', chgPct: '-19%', note: '创2020年3月以来最大盘中跌幅' }
  ],
  usnightStocksRaw: '',
  usnightEvents: [
    { time: DT.today(), event: '英伟达股价创2个月新高，AI算力链风险偏好回升', impact: '利好A股AI算力/光模块/CPO映射' }
  ],

  /* ---- 日韩股市分析要点（结构化） ---- */
  asiaPointsParsed: [
    { market: '韩国', point: '三星、SK海力士承压', analysis: '隔夜闪迪/西部数据盘后大跌拖累存储产业链。', impact: '韩国半导体板块承压，对A股存储/HBM概念有传导压力' }
  ],
  asiaPointsRaw: '',

  /* ---- 次日盘前总结新增模块（文本域，留空待填） ---- */
  outlookUs: '', outlookCmt: '', outlookEvent: '', outlookSignal: '',
  outlookSummary: '', outlookWatch: '', outlookStrategy: '',
  outlookSignalsParsed: [],
  outlookSignalsRaw: '',

  /* ---- 大盘总览 · 盘后复盘结构化数据（参考截图示例，首次打开预填） ---- */
  sentimentLadder: [
    { board: '11', name: '华映科技', theme: '折叠屏/OLED', seal: '18600', time: '09:30', grade: '高', note: '一字加速，高度标杆' },
    { board: '8', name: '福日电子', theme: '消费电子', seal: '14200', time: '09:35', grade: '高', note: '板块中军，换手充分' },
    { board: '6', name: '凯盛科技', theme: 'UTG玻璃', seal: '9800', time: '09:42', grade: '中高', note: '折叠屏材料核心' },
    { board: '5', name: '睿能科技', theme: '半导体设备', seal: '6200', time: '10:05', grade: '中', note: '设备国产替代补涨' },
    { board: '4', name: '晶方科技', theme: '先进封装', seal: '8100', time: '09:38', grade: '高', note: '机构主买，封单稳健' },
    { board: '3', name: '盈方微 / 万润科技', theme: '存储芯片', seal: '4500', time: '10:18', grade: '中', note: '存储反弹梯队' },
    { board: '2', name: '通富微电 / 华天科技', theme: '封测扩散', seal: '3800', time: '10:55', grade: '中', note: '先进封装跟风' }
  ],

  sentimentThemes: [
    { name: '半导体/先进封装', performance: '全线爆发', fund: '+32亿', leader: '晶方科技 / 长电科技 / 通富微电' },
    { name: 'AI硬件（CPO/光模块）', performance: '再创新高', fund: '+28亿', leader: '新易盛 / 中际旭创 / 天孚通信' },
    { name: '消费电子/折叠屏', performance: '批量涨停', fund: '+15亿', leader: '华映科技 / 福日电子 / 凯盛科技' },
    { name: '科创硬科技', performance: '科创50 +2.51%', fund: '放量', leader: '半导体 / 国产软件 / 工业母机' },
    { name: '资源/有色', performance: '震荡走强', fund: '中性', leader: '紫金矿业 / 洛阳钼业' },
    { name: '红利高股息', performance: '稳健托底', fund: '中性', leader: '长江电力 / 中国神华' }
  ],

  sentimentDragonInst: [
    { name: '晶方科技', theme: '先进封装', move: '机构主买', net: '+8.42' },
    { name: '新易盛', theme: '光模块', move: '机构+外资合力', net: '+6.91' },
    { name: '华映科技', theme: '折叠屏', move: '机构净买入', net: '+4.18' },
    { name: '长电科技', theme: '封测', move: '机构净买入', net: '+3.77' },
    { name: '中际旭创', theme: '光模块', move: '机构净买入', net: '+3.21' },
    { name: '紫金矿业', theme: '黄金', move: '机构净卖出', net: '-5.12' },
    { name: '中国神华', theme: '煤炭', move: '机构净卖出', net: '-3.04' },
    { name: '贵州茅台', theme: '白酒', move: '机构净卖出', net: '-2.86' }
  ],

  sentimentDragonHot: [
    { seat: '上海溧阳路', name: '晶方科技', net: '+3.12', action: '打板主封' },
    { seat: '杭州帮', name: '新易盛', net: '+2.88', action: '高位接力' },
    { seat: '宁波桑田路', name: '华映科技', net: '+2.05', action: '连板接力' },
    { seat: '佛山系', name: '长电科技', net: '+1.74', action: '低位首板' },
    { seat: '北京中关村', name: '万润科技', net: '+1.52', action: '反包板' }
  ],

  sentimentOpportunity: [
    { dir: '半导体国产替代', focus: '先进封装/设备连续爆发，晶方科技、长电科技机构主买', targets: '晶方科技 / 长电科技 / 北方华创', strategy: '趋势持有，分歧低吸' },
    { dir: 'AI硬件（CPO/光模块）', focus: '新易盛、中际旭创再创新高，海外算力开支加码', targets: '新易盛 / 中际旭创 / 天孚通信', strategy: '沿5日线趋势跟随' },
    { dir: '消费电子/折叠屏', focus: '新机周期临近，UTG/OLED 扩散', targets: '华映科技 / 凯盛科技 / 东睦股份', strategy: '连板博弈，去弱留强' },
    { dir: '科创硬科技ETF', focus: '科创50大涨2.5%后量能放大，弹性足', targets: '科创50ETF / 半导体ETF', strategy: '中线配置' }
  ],

  sentimentRisk: [
    { type: '高位连板分化', target: '华映科技（11连板）/ 福日电子（8连板）', desc: '11连板后高位分歧风险加大，周末消息面敏感', handle: '注意高低切换节奏' },
    { type: '成交放量但分化', target: 'AI硬件高位标的', desc: '指数普涨下部分高位题材已拥挤，追涨性价比下降', handle: '避免追高拥挤题材' },
    { type: '外围扰动', target: '—', desc: '美联储9月降息预期反复，外围波动传导', handle: '关注美元/美债' },
    { type: '中报业绩雷', target: '高位题材股', desc: '8月中下旬进入中报密集披露，业绩不及预期个股承压', handle: '规避高估值弱业绩' }
  ],

  sentimentBroadcast: '各位股友晚上好，8月7日周五复盘来啦。今天市场放量普涨，沪指涨1.02%收3940，站稳3900并进一步远离；科创50大涨2.5%领涨，硬科技全面爆发。两市成交2.66万亿，较昨日放量约1300亿，增量资金明显回流，上涨3125家、下跌1876家，赚钱效应修复。盘面上半导体先进封装、AI光模块、折叠屏批量涨停，机构主买晶方科技、新易盛。连板高度打到11板，情绪与指数共振。风险提示：高位连板已透支，周末注意消息面；8月中下旬进入中报密集期，警惕业绩雷。下周一看科创与AI硬件能否延续，祝大家周末愉快，我们下周一见。'
};

/* ============================================================
   云端内容同步层
   - 复盘模板类内容由「云端」统一下发，owner 集中维护、推送到手机
   - 这些数据在「同步」时被整体覆盖；个人记录（持仓/笔记/打卡等）不在此列
   ============================================================ */
const Seed = {
  CLOUD_KEYS: [
    'overnight_md_a', 'overnight_md_us', 'overnight_md_fed', 'overnight_md_oil',
    'overnight_news_parsed_a', 'overnight_news_parsed_us', 'overnight_news_parsed_fed', 'overnight_news_parsed_oil',
    'domestic_news_md',
    'sentiment_kpi', 'sentiment_summary',
    'sentiment_ladder', 'sentiment_themes', 'sentiment_dragon_inst', 'sentiment_dragon_hot',
    'sentiment_opportunity', 'sentiment_risk', 'sentiment_broadcast',
    'themes_main', 'themes_ladder', 'dragon_inst', 'dragon_hot',
    'opportunity', 'risk', 'risk_blacklist', 'outlook_scenario',
    'usnight_stocks', 'usnight_stocks_raw', 'usnight_events', 'usnight_analysis', 'usnight_ah',
    'asia_points_parsed', 'asia_points_raw', 'asia_ah', 'asia_note',
    'opportunity_pool',
    'outlook_us', 'outlook_cmt', 'outlook_event', 'outlook_signal',
    'outlook_summary', 'outlook_watch', 'outlook_strategy',
    'outlook_signals_parsed', 'outlook_signals_raw'
  ],
  async fetchCloud() {
    try {
      const res = await fetch('data/content.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return null;
      const j = await res.json();
      return j && j.content ? j : null;
    } catch (e) { return null; }
  }
};
