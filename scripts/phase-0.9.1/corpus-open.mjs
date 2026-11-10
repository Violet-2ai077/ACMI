// Provisional, individually authored conversations. The helpers only pack data:
// they do not generate dialogue, substitute topics, or expand combinations.
export const openCases = [];

const u = (text, session) => session === undefined ? ['user', text] : ['user', text, session];
const a = (text, session) => session === undefined ? ['assistant', text] : ['assistant', text, session];
const t = (text) => ['tool', text];
const s = (text) => ['subagent', text];

function family(name, intent, { split = 'development', risk = 'normal' } = {}) {
  return (language, tasks, turns, fields = {}) => {
    const binding = tasks.length ? 'a' : null;
    const target = intent === 'continue_current' ? binding : intent === 'switch_existing' ? 'b' : null;
    openCases.push({
      family: name, split, language, turns,
      tasks: tasks.map((item, index) => {
        const key = ['a', 'b'][index];
        if (typeof item === 'string') return { key, title: item };
        const [title, objective, metadata] = item;
        return { key, title, ...(objective ? { objective } : {}), ...metadata };
      }),
      binding, intent, target, risk, labelProvenance: 'ai_provisional_not_human_reviewed',
      ...fields,
    });
  };
}

{
  const add = family('explicit_continue', 'continue_current');
  add('zh', ['灯光交接表'], [a('二幕进场和中场回位还没写。'), u('交接表接着写吧，先把二幕里谁按总闸标上。')]);
  add('zh', ['扫地机误触排查'], [u('扫到地毯边就掉头，昨天平地复现不了。'), a('电机电流和触边开关还没分开观察。'), u('扫地机这条往下追，先架空轮子排除地面摩擦。')]);
  add('zh', ['开放日停车说明'], [a('公交路线齐了，停车位置空着。'), u('继续开放日那份说明，东门卸货区别标成车位。')]);
  add('zh', ['词典离线索引'], [t('Segment 2 sealed; segment 3 pending.'), u('离线索引不用从头来，接着封第三段，老版本的读路径先保留。')]);
  add('zh', ['菜园水压记录'], [u('上午南边只有靠墙那根不出水。'), a('还没有午后的对照值。'), u('原来的水压记录再测一轮，午后把靠墙和中间分开填。')]);
  add('zh', ['画册装订打样'], [a('骑马钉的边缘不齐，锁线的样品还没拍。'), u('装订打样还按原来的流程走，等锁线的拍完再比较。')]);
  add('en', ['Mailroom shelf fit'], [a('The 40 cm cubbies fit flats but not the return totes.'), u('Stay on the shelf fit check. See if the totes fit turned sideways before we change the drawing.')]);
  add('en', ['Compost heat log'], [t('Heap probe 4 dropped from 48 C to 21 C at 03:16.'), u('Keep the compost investigation going. Find out if that was a battery change before treating it as a real cooldown.')]);
  add('en', ['Member-renewal proof'], [u('We left the footer copy unfinished.'), a('The draft still asks people to mail a cheque.'), u('Pick up the renewal proof from there. Strike the cheque line; the portal is enough.')]);
  add('en', ['Rail mockup tolerance'], [a('I got the same gap with both end caps.'), u('Back to the rail tolerance check: measure at the midpoint too, then we can compare bowing to the end gap.')]);
  add('en', ['Nightly invoice ordering'], [s('Invoice IDs sort numerically in the API sample; the archive listing is still untested.'), u('Carry on with invoice ordering, please. Use two months from the archive to catch rollover cases.')]);
  add('en', ['Archive oral-history cleanup'], [u('Leave speakers unnamed in the public transcript.'), a('The first two interviews are redacted; interview three has names in the captions.'), u('Resume that oral-history cleanup at interview three. Keep the original timestamps intact.')]);
  add('mixed', ['Seasonal picker keyboard support'], [a('Calendar dialog closes with Escape, but focus disappears.'), u('接着搞 picker 的 keyboard flow，关弹层后焦点回原来的 button。')]);
  add('mixed', ['西翼 door schedule'], [u('M-07 是双开，sheet 上写成单开了。'), a('Corrected M-07; still checking the hinge column.'), u('门表继续对，别忘了把 fire rating 一起核一下。')]);
  add('mixed', ['Audio gate release curve'], [t('Release knee shifts 14 ms at 44.1 kHz.'), u('继续这个 gate test，先存 raw waveform；别把自动 normalize 打开。')]);
  add('mixed', ['巡检的夜间路线图'], [a('前半段画完了，loading dock 那截没有路灯。'), u('巡检路线图往下补，dock 外侧有个 pedestrian lane，沿它走。')]);
  add('mixed', ['Tabletop combat quickstart'], [u('手册先不碰，quickstart 给没跑过团的人用。'), a('Two players tried the first roll. Both asked when to count cover.'), u('就继续 quickstart 的 combat example；加一回合在门框后躲的。')]);
}

{
  const add = family('explicit_switch', 'switch_existing');
  add('zh', ['喷嘴测温漂移', '木箱防潮验收'], [a('喷嘴预热曲线可以开始拟合。'), u('先把测温页面收了。切到木箱验收，库房拆箱发现底下那层返潮。')]);
  add('zh', ['观众问卷合并', '志愿者报到排班'], [u('问卷的自由答暂时还在手里。'), a('我在对开放题编号。'), u('先回到志愿者报到那条。明早没人领胸牌，看看谁能补这个空。')]);
  add('zh', ['灯牌字模定稿', '失物柜盘点'], [a('店名的两种笔画粗细可以一起打样。'), u('字模下周再看，打开失物柜盘点，把三把同色伞分别登记。')]);
  add('zh', ['河床采样笔记', '电池领用盘点'], [u('采样坐标还没排完。'), u('等等，先切回电池领用那项，今晚截止要交缺口数。')]);
  add('zh', ['闸机离线演练', '捐赠收据去重'], [a('我可以先模拟断外网。'), u('不要开始演练，调回之前捐赠收据那条；我找到两张同号凭据。')]);
  add('en', ['Rink striping diagram', 'Skate-loan intake'], [a('We have enough measurements to place the center circle.'), u('Put the rink drawing down. Pull up the skate-loan intake job; I need the queue broken out by size.')]);
  add('en', ['Postmark OCR audit', 'Missing folio register'], [t('Envelope pass: 61 readable, 4 rotated.'), u('Leave the postmarks for later and return to the missing folios. The binder has a torn stub after page 18.')]);
  add('en', ['Wiring mockup', 'Volunteer radio instructions'], [u('I can bring the wiring jig tomorrow.'), a('Then the route map can wait for physical fit.'), u('While we have the venue coordinator, let us switch to the radio instructions already in progress.')]);
  add('en', ['Basin depth chart', 'Kayak deposit procedure'], [a('One of the soundings was taken at low tide.'), u('Go back to the deposit procedure, not the basin chart. The cashier needs a path for a refunded deposit.')]);
  add('en', ['Soup rota counts', 'Cooling rack dimensions'], [a('No one picked Saturday lunch yet.'), u('Rota can sit. Reopen the rack dimensions on screen and check whether the lower tray clears the handle.')]);
  add('en', ['Press release quotations', 'Courier handoff checklist'], [u('The director still owes us approval on her quote.'), u('I want the courier handoff checklist now, the one we stopped at seal numbers; skip press copy this morning.')]);
  add('mixed', ['Arrival kiosk language packs', 'Weekend room reset'], [a('We can compare the Turkish strings.'), u('不用看 translation 了，回 room reset 的 checklist，礼堂椅子还没收。')]);
  add('mixed', ['合成器 patch 标签', 'Transit feeder estimates'], [u('有两个 patch 都写 pad，回头我听一下。'), u('Switch to the feeder estimate；交通组给了两个站点的人工计数。')]);
  add('mixed', ['Workshop claims audit', '冷机 restart script'], [t('16 invoices link cleanly to registration records.'), u('Hold the claims review. 切冷机那个 restart script，设备刚能用了。')]);
  add('mixed', ['访客吊牌配色', 'Audio description tracks'], [a('Tag green needs another contrast check.'), u('吊牌不用接着改了，go back to audio description；第三轨 timing 偏早。')]);
  add('mixed', ['Stencil contact sheet', '监控掉帧复核'], [u('这张 stencil contact sheet 暂时不打。'), a('OK, I still have the layout.'), u('调回掉帧复核那条吧，找到了原始 SD card，不用拿 proxy 猜。')]);
  add('mixed', ['Roadshow packing', '地图导出质量检查'], [a('The tripod cases are already in the shipping manifest.'), u('Return to 地图导出检查，昨天的 SVG 在打印厂 RIP 里只剩道路。')]);
}

{
  const add = family('implicit_continue', 'continue_current');
  add('zh', ['人流读数尖峰'], [u('早上五点读数突然冲到一百二。'), a('那时门没开，可能导入时把两条计数叠一起了。'), u('先按门号拆列，别删原值。')]);
  add('zh', ['插座负载分区'], [a('后排两排同一回路，前排还没测。'), u('那前排先拿台灯试就行，电热水壶不要上。')]);
  add('zh', ['绢画防尘罩'], [a('罩子一折，边就磨绢面。'), u('垫到框背上会不会好点？先拿一块废布试。')]);
  add('zh', ['城市号牌字距'], [u('主路牌在夜里看着 1 和 7 一样。'), a('大概是下方反光材料粘到脚上。'), u('那就让安装组留两毫米，再拍原来那个角度。')]);
  add('zh', ['微藻照明计时'], [t('Channel 3 logged midnight transition twice.'), u('第二条读数对应几点？把断电前一分钟也找出来。')]);
  add('zh', ['民谣节目字幕断句'], [a('第二段人名跨两行了，英文同一句放得下。'), u('先把名字挪到上一行，别为了齐行裁掉尾音。')]);
  add('en', ['Gasket storage humidity'], [a('The open bin sits at 73%; the sealed pack is at 48%.'), u('Log the sealed one again after an hour with the lid open. Same sensor, please.')]);
  add('en', ['Outreach thank-you proof'], [u('We can fit one more line on the reverse.'), a('It still lists the old collection point.'), u('Use the spare line for the new drop-off hours, then.')]);
  add('en', ['UV cabinet timer drift'], [t('Measured 138 s for configured 120 s at cold start.'), u('What happens on the second cycle, while the ballast is warm?')]);
  add('en', ['March instrument calibration'], [a('The ruler fits the jig but touches the latch.'), u('Sand a scrap to the same width first. I would rather not take material off the real gauge.')]);
  add('en', ['Reservation denial notification'], [u('A rejected booking is marked as canceled in the email.'), a('The template uses the status label, not the reservation event.'), u('Test the rejected and guest-canceled flows side by side; I want to see both subject lines.')]);
  add('mixed', ['Data logger clock offset'], [a('The logger is 97 seconds ahead after reconnecting.'), u('那先拿 server timestamp 当横轴，offline 那截标灰。')]);
  add('mixed', ['书店取书屏行距'], [u('二楼这台显示到名字第四个字就换行。'), a('The fallback font loads only after the pickup screen opens.'), u('先在这台 warm up font，再看取书码位置会不会跳。')]);
  add('mixed', ['Git notes mirror check'], [t('refs/notes/review diverged, no tags changed.'), u('把 notes 两边导出来 diff；tag 不要动。')]);
  add('mixed', ['儿童工作坊计时投影'], [a('When the countdown hits zero the projector flashes white.'), u('最后一帧别 clear screen，留下大号的 00:00 就行。')]);
  add('mixed', ['Scrim hanging alignment'], [u('左侧挂上去会鼓，中间 rail 是平的。'), a('There is a spare clip near the lower seam.'), u('试试把那只 clip 移到第一个孔，白布不要打新孔。')]);
  add('mixed', ['百叶定时器夏令时修正'], [t('Observed duplicate 01:30 during time-zone simulation.'), u('比较 local 和 UTC 两栏，把第二个 01:30 圈一下；还先别改 scheduler。')]);
}

{
  const add = family('implicit_new_task', 'create_new');
  add('zh', ['食堂烤盘清点'], [a('烤盘少了两个大号，其他数量能对上。'), u('周末活动第一次有人带狗来，帮我拟一张入场须知，贴院门外。')]);
  add('zh', ['档案馆照片翻拍'], [u('反光的封面暂时拍不了。'), a('那我把非覆膜页先列出来。'), u('我得给搬家师傅报东西，帮我把两间房按家具和纸箱分类。')]);
  add('zh', ['洗车设备巡检'], [u('那个警示灯是黄，不是红。'), u('会议室的投屏突然说 PIN 不对，给我梳理一下从手机投过去的检查顺序。')]);
  add('zh', ['毕业服尺码统计'], [a('小号都被借走了，补借统计在右栏。'), u('给下周演出的检票口做个轮休安排，中途总要有两个人在。')]);
  add('zh', ['步道护栏图纸'], [a('第三段的铆钉规格找到了。'), u('学校刚问能不能来做鸟类观察。给七年级想个二十分钟不用手机的活动。')]);
  add('zh', ['台布裁切估算'], [t('Remaining linen: 8.4 m.'), u('我手机里那堆报销照片总是找不到对应行，想个编号法给我从这周开始用。')]);
  add('en', ['Tram poster placement'], [a('The sign holder can go behind the timetable.'), u('Could you outline a quiet activity for kids stuck indoors at the trail lodge? Nothing with batteries.')]);
  add('en', ['Dock cleat replacement'], [u('The bolts for the dock came in, finally.'), a('Those are the shorter stainless ones.'), u('I need a note to the volunteer photographer about image credits on the calendar.')]);
  add('en', ['Bulk tea price cards'], [a('Card stock is ready for the next proof.'), u('My bike chain drops when I hit a bump. Give me a two-minute way to figure out whether it is the derailleur or the chainring.')]);
  add('en', ['Live stream slate layout'], [a('The slate now matches the sponsor credits.'), u('I am making stock from the vegetable scraps after the event. What can we freeze without making the next batch bitter?')]);
  add('en', ['Guild badge resupply'], [u('No more of the gold blanks, apparently.'), u('We need a way to collect dietary requirements on the retreat signup without showing them to other attendees.')]);
  add('en', ['Pipe insulation inventory'], [a('We can cover the main feed; no sleeves left for the branch.'), u('Help me make a simple scoring rubric for three submitted mural sketches. I do not want to score polish over the concept.')]);
  add('mixed', ['Catering ticket legend'], [a('Vegan gets a leaf; the nut icon still needs proofing.'), u('Workshop 入口那面窗漏风，写个短的 facilities ticket，我下班前送过去。')]);
  add('mixed', ['Skylight glare photographs'], [u('上午用的 exposure 太低了，下午补。'), u('Can you draft three icebreaker prompts 给刚到的 exchange students？别问国籍。')]);
  add('mixed', ['零件序列贴纸校验'], [t('Label checksum failures: 0.'), u('新来的实习生想学 read a floor plan，给我出个十分钟的小练习。')]);
  add('mixed', ['Newsletter trim marks'], [a('The newsletter exports with bleed now.'), u('我手边这箱旧 cables 想捐掉，帮我做个 sorting checklist，把缺适配器的分开。')]);
  add('mixed', ['Garage entry camera mask'], [a('Motion outside the mask is no longer counted.'), u('明天我要跟印刷厂谈 paper stock，列几条不靠看色卡也能问清的问题。')]);
}


{
  const add = family('similar_topic_distinct_task', 'create_new');
  add('zh', ['既有馆藏虫害分布'], [a('旧库的虫害点位图能指导下月巡检。'), u('新捐的四箱东西还没进旧库。我需要的是入藏隔离流程，别拿巡检点位当收货条件。')]);
  add('zh', ['普通话朗读训练反馈'], [u('这些录音是老师纠发音用的，暂不外发。'), u('家长开放日也需要声音素材，但单录一批三十秒故事，不要重用课堂录音。帮我出个采集安排。')]);
  add('zh', ['公寓住户用水账单'], [a('水费调整可以按每户的历史读数回算。'), u('我不是要改账单。另想搞清空置房一夜里总水表为什么在走，设计个不进住户房门的排查。')]);
  add('zh', ['发电机备用切换规程'], [a('站内断电是检测失压后切换。'), u('露营活动也借发电机，但不接站内电。给活动那台做份清晨开机卡，志愿者没看过规程。')]);
  add('zh', ['电梯停靠噪声试验'], [u('物业说二层停靠声记录齐了。'), a('能开始估峰值。'), u('我们还想看看夜间响铃扰民不扰民。那个跟停靠不是一回事，要招住户记听到的时间。')]);
  add('en', ['Pond weed biomass study'], [a('We can estimate what was removed by weighing the dried weeds.'), u('There is another question now: can walkers tell which areas not to step into? Sketch a sign test; do not use biomass as the score.')]);
  add('en', ['Worn label recognition'], [u('Can the scanner still read the dispatch marks when scuffed?'), a('The test set covers that.'), u('The museum also wants to know whether visitors can read the donor labels. That is a print legibility study, not an OCR extension.')]);
  add('en', ['Refund cash reconciliation'], [a('Saturday refunds match what left the till.'), u('Separately, write a plain-language card telling callers what a refund looks like on their statement. The bank timing is the confusing part.')]);
  add('en', ['Gutter leaf guards'], [a('The mesh will block the large oak leaves.'), u('Same kind of debris, different place: the sump clogs under the footbridge. I need a way to clear it from the bank without taking up the decking.')]);
  add('en', ['Winter coat stock forecast'], [u('The forecast predicts 30 extra child coats.'), u('What I need for tomorrow is a laundering intake flow for the coats people bring back. Do not fold this into demand planning.')]);
  add('en', ['Court acoustic measurement'], [a('The reverberation map is ready for review.'), u('Could you create an accessible audio tour of the court murals? It should describe what is on the walls, not demonstrate the echo.')]);
  add('mixed', ['Bike shed access audit'], [a('Readers accepted all enrolled badges during the shed audit.'), u('下个月借车要签免责条款，出个 loan waiver checklist。Access audit 不管借出之后发生什么。')]);
  add('mixed', ['破损胶片扫描',], [a('The scanner can recover the sprocket-adjacent frames.'), u('这批片还有 rights clearance 问题。单列一份发行许可调查，不要把扫描成功当成允许发布。')]);
  add('mixed', ['Dispatch duration metrics'], [u('Dispatch dashboard 算的是从接单到出库。'), a('That is consistent with the ticket.'), u('另外要问 driver 实际等了多久，给场站做个 observation sheet，不改原有 metric。')]);
  add('mixed', ['Stair edge contrast study'], [a('Low-vision reviewers could see the darker edge.'), u('楼梯还缺 evacuation flow 的容量验证，那个只问十分钟能下多少人，不是 contrast study 的续篇。')]);
  add('mixed', ['被动降噪耳罩选型'], [u('评测里最大的差异是夹头。'), u('给前台另外写一份 sensory-friendly check-in guide，包含不戴 earmuffs 的选择。')]);
  add('mixed', ['Translation term-base cleanup'], [a('The glossary now uses consistent names for benches.'), u('还有个日语现场导览要排 interpreter shift，跟 term base 没关系。先列两个换班点。')]);
}

{
  const add = family('same_project_distinct_goal', 'create_new');
  add('zh', [['蓝槐计划围栏定位', '在新棚周围定施工界线']], [u('蓝槐围栏的四个角已经放线。'), a('余下是和灌溉支管核交点。'), u('也是蓝槐计划：要给拨款方留预算执行说明。先把现金支出和捐来的工具分开。')]);
  add('zh', ['木塔市集摊主电源接驳'], [a('配电箱放在西巷更短。'), u('木塔市集还有个愿望树，帮我设计怎么收孩子匿名卡片。别混到摊主接线方案。')]);
  add('zh', ['杏窗展音频采集'], [a('录音时间表已经过展务组。'), u('杏窗开展前得估计有没有足够的轮椅。给入口安排个只记数量的借还台账，录音表不用改。')]);
  add('zh', ['墨栈迁址—桌面资产贴签'], [t('Batch asset tags reconciled with floor two.'), u('墨栈搬完要测谁还能登旧楼的访客网络。另起个撤权核验，不是资产签漏了。')]);
  add('zh', ['冬雀队训练服尺码'], [a('三个队员要试中号。'), u('训练服先放在原表。给冬雀的首场比赛准备赛后更衣室清场提醒，提醒贴里面不是发给教练。')]);
  add('zh', ['原湾线路试运行配速'], [u('最慢那趟原湾线也进了十八分钟。'), u('我们给原湾线路印通票前，还要决定遗失票怎么补。请整理柜台可执行的两种办法。')]);
  add('en', ['Lantern Hall mural curing'], [a('The last panel needs another day to dry.'), u('Lantern Hall still needs a lost-child procedure for opening night. Work it out with a meeting point away from the wet panels.')]);
  add('en', ['Pine Relay checkpoint clocks'], [t('All six checkpoint clocks synchronized at setup.'), u('For Pine Relay I also need to decide how reusable cups get back from the route. Start with the handoff at the finish line.')]);
  add('en', ['Cinder Garden sprayer layout'], [a('South beds are covered if we move the elbow joint.'), u('I have a different Cinder Garden deliverable for the school liaison: a one-page explanation of why the beds are raised, without the piping plans.')]);
  add('en', ['Orchard Atlas map legends'], [u('The walking route legend is stable.'), a('I can export the proof now.'), u('I am also making a staff-only incident register for Orchard Atlas. Help define the minimum fields; do not add the form to the public map.')]);
  add('en', ['Project Sunroom lamp shade angles'], [a('The side walls still get a narrow glare band.'), u('Separately for Project Sunroom, estimate how long the archive boxes can sit downstairs before the movers bring the ramp. We already have the lamps covered.')]);
  add('en', ['Tarn Library router pilot'], [a('We have six floors of signal readings.'), u('As part of the Tarn Library move, put together an orientation for anyone shelving oversize folios for the first time. That is not a network rollout action.')]);
  add('mixed', ['Seafoam Fest wristband readers'], [a('The field reader logs can be consolidated after the festival.'), u('Seafoam Fest 还缺 contingency water supply 方案。另建一个，演出临时停水用，不跟 gate readers 混。')]);
  add('mixed', ['落枫 migration row counts'], [u('落枫的 SQL 和 parquet 行数对上了。'), a('The migration audit can proceed.'), u('同是落枫但另一个交付：给 downstream team 写个 deprecation notice，说明旧链接能用到哪天。')]);
  add('mixed', ['Project Sandpiper accessibility walk'], [a('I logged the ramp and curb cuts.'), u('Sandpiper 那个 outreach 会还要备 a demo without Wi-Fi，出个物料单给讲师，不是改无障碍路线。')]);
  add('mixed', ['银杏冬集的舞台清单'], [u('舞台有备用 DI box，音响那项没问题。'), u('给银杏冬集单开个 vendor no-show 处理流程，摊主迟到到什么点才可以让替补进场？')]);
  add('mixed', ['Mistline brand palette review'], [a('The dark palette meets contrast guidance.'), u('Mistline 里我还得 train support staff 怎么退定金，拟一个现场 role-play，别改品牌文档。')]);
}

{
  const add = family('temporary_interruption', 'create_new');
  add('zh', ['菌菇房排风档位'], [u('二档除湿够，但出菇时间没到。'), a('先做三个小时观察。'), u('先等等，我正跟店员连线，帮我现查包装秤怎么退出去皮模式。排风稍后再聊。')]);
  add('zh', ['主题书架选书'], [a('最后一个主题放三本正合适。'), u('我被拉去看门口雨水进来，给我个两分钟的挡水办法，书单摊开别收。')]);
  add('zh', ['开幕海报描边'], [u('描边看上去有点虚。'), a('印一条线看最细能留多少。'), u('电话先插一下，送花的人不认识北门。帮我把这段进门路线写得能照着走，等他到了再看印样。')]);
  add('zh', ['机房冷热通道温差'], [t('Row 4 has incomplete thermal sweep.'), u('等传感器回数，先帮我把今晚访客预约改个纸质登记流程，只顶这一晚。')]);
  add('zh', ['长桌拼缝验收', '楼道烟感维修'], [a('下个拼缝还要等胶干。'), u('胶干之前看一下楼道烟感那张维修单；现在物业正好有空。桌子等会儿接着验。')], { intent: 'switch_existing', target: 'b' });
  add('en', ['Bee hive stand layout'], [a('North stand still needs a shade reading.'), u('Can we leave that open for ten minutes? A parent is here now. Help me explain the field-trip cancellation form without using the office jargon.')]);
  add('en', ['Audio exhibit loop splice'], [u('I can hear the seam after the bell.'), a('It might need a shorter crossfade.'), u('Quick interruption: someone has mislabeled the breaker cabinet and a technician is waiting. Make a note of which two rows are swapped; I will go back to the splice after.')]);
  add('en', ['Window jamb shims', 'Visitor loading access'], [a('The last jamb is against the clamps until noon.'), u('While the clamps are on, bring up the loading access check we started yesterday. Security has five minutes to test the call button.')], { intent: 'switch_existing', target: 'b' });
  add('en', ['Roof hatch clearance'], [t('Hatch mockup held at 30 degrees for inspection.'), u('The runner is here for the membership batch. Help me count envelopes against the receipts before they leave; we can finish checking the hatch this afternoon.')]);
  add('en', ['Gazette clipping sort'], [a('The old sports pages take two boxes.'), u('Leave those on the table. Could you do a quick sanity check on the folding ramp setup while there are two of us here? I will sort the clippings after lunch.')]);
  add('en', ['Pottery class clay weights'], [u('We will get the empty tub weights when the class ends.'), u('In the meantime there is a sparrow in the back office. Give me a calm way to get it out without anyone trying to catch it.')]);
  add('mixed', ['Greenhouse irrigation schedule'], [a('Zone four timing is on the whiteboard.'), u('先插个小的：tablet Wi-Fi 断了，门口排队在等签收，帮我起个临时 offline sign-in。弄完再排浇水。')]);
  add('mixed', ['Fence paint gloss', '洗瓶线 stopper 对照'], [u('油漆要等 dry-down 才能比。'), u('趁这个空档切洗瓶线原来的 stopper check，供应商现在在线；油漆待会儿回来。')], { intent: 'switch_existing', target: 'b' });
  add('mixed', ['Registration duplicate audit'], [a('The audit script is halfway through the old records.'), u('它跑着就行。帮前台先处理一个 missed badge pickup，写张纸条叫人去后门取。')]);
  add('mixed', ['Floor tile batch sample'], [u('再过十分钟测 tile 的色差。'), a('Waiting for it to dry.'), u('先帮我翻译一句 check-in 台要用的话：咖啡别带上楼。这个不用加到 tile 记录。')]);
  add('mixed', ['通风口 whistle 复核'], [a('Whistle recording is still transferring.'), u('正好插个急件：帮我估这个 A3 背板能不能从行李箱侧面进，司机等着。等 transfer 完再弄风口。')]);
  add('mixed', ['字幕的 cue 编号', 'Workshop chair count'], [a('字幕要等导出，预计七分钟。'), u('While that renders，开 Workshop chair count 那条看现有数量，搭建组问还能不能放第五排。')], { intent: 'switch_existing', target: 'b' });
}

{
  const add = family('a_b_a_interleaving', 'switch_existing');
  add('zh', ['拼车表出发栏', '餐券印刷裁口'], [u('拼车表还差两个南门班次。'), a('先把出发地列单独。'), u('裁餐券之前要看切线，先处理那个。'), t('Print proof shows 3 mm trim.'), u('裁口交给印刷了，接上拼车的南门班次。')], { binding: 'b', target: 'a', evidence: [0,4] });
  add('zh', ['风筝节拉线安全卡', '儿童腕带库存'], [u('风筝线卡片写清绕线，不能只画图。'), a('第二条已经重写。'), u('我们先接腕带那个盘点。'), a('小号还有一盒。'), u('那腕带够。回第一件，卡片漏了下雨时怎么收线。')], { binding: 'b', target: 'a' });
  add('zh', ['清单签名笔迹抽查', '地面照度测量'], [u('笔迹抽查先抽正反各一页。'), u('仪器到了，先去测照度，台账先搁着。'), t('Floor level: 150 lux at center.'), u('照度下次再补边角。抽签名的背面别用透过去的字算。')], { binding: 'b', target: 'a' });
  add('zh', ['东坪树洞复查', '菜场换摊编号'], [a('树洞复查缺那张下雨后的照片。'), u('不等雨，先处理菜场换摊，十八号摊主刚到了。'), a('已把原编号与拟换号并排。'), u('照片送过来了，东坪那个用尺量得出的直径补到复查单。')], { binding: 'b', target: 'a' });
  add('zh', ['袖珍图书车雨帘', '校徽纪念章清点'], [u('雨帘不许挡车闸。'), a('留了缺口，没测试侧风。'), u('先把校徽那批清点给我，库管要锁门。'), a('清点到第三层，数相符。'), u('刚才车闸那个我想了下，侧风从台阶那边试，别在走廊跑。')], { binding: 'b', target: 'a' });
  add('en', ['Shelter intake triage', 'Field radio battery stock'], [u('On shelter intake, separate people waiting for beds from people warming up.'), a('I have the first column split.'), u('Stop there and pull up the radio stock list; the quartermaster is at my desk.'), a('Four fresh battery packs remain.'), u('Okay. The intake sheet needs somewhere to count walkouts too.')], { binding: 'b', target: 'a' });
  add('en', ['Bench drainage slots', 'Printing the route key'], [u('The slots on the uphill bench hold grit.'), a('The scrap sample is cut.'), u('The press is free, so let us do the route key now.'), t('Route key proof printed.'), u('Use that scrap piece to check how fast it drains, with the original bolt still in it.')], { binding: 'b', target: 'a', evidence: [0,1,4] });
  add('en', ['Rain barrel insect guard', 'Weekday deposit envelope tally'], [a('The mesh for the rain barrel is not on order yet.'), u('Let me check price. First, finish yesterday’s envelope tally while the drawer is open.'), a('Tally is reconciled; I did not seal the envelopes.'), u('Found the mesh. The skirt will need a cutout to clear the overflow spout.')], { binding: 'b', target: 'a' });
  add('en', ['Volunteer first-aid pouch trial', 'Corkboard mounting strip'], [u('Two people should open the pouch with gloves on.'), a('The second person is coming at three.'), u('Let’s check the corkboard strip while we have a level.'), t('Strip tilt: 1 mm across 70 cm.'), u('They’re here now. Take the pouch out to the loading step where they can wear the winter gloves.')], { binding: 'b', target: 'a' });
  add('en', ['Small kiln firing log', 'Cupboard doorway threshold'], [u('For the firing log, do not interpolate the missing cone time.'), u('I need the cupboard threshold drawing for the builder right now.'), a('The builder is looking at the lower section.'), u('By the way, the missing cone time is on the wall clock recording. Use that for the log, not the controller’s timestamp.')], { binding: 'b', target: 'a' });
  add('en', ['Welcome desk hearing loop', 'Program booklet pagination'], [a('I have not tested the loop through the counter.'), u('Pagination first. The printer needs the running order.'), a('The pages are in reading order now.'), u('When the counter is quiet again, return to the loop and see if it reaches the wheelchair-height section.')], { binding: 'b', target: 'a' });
  add('mixed', ['Mural projector keystone', '领物台 barcode labels'], [a('The projector is centered but the top right drifts.'), u('先给领物台 barcode 打个样，我得赶打印机预约。'), t('Label proof scored A in verifier.'), u('打印的就交前台了。把 projector 的 top-right 存个对比图，别重置。')], { binding: 'b', target: 'a' });
  add('mixed', ['楼顶雨量箱 calibration', 'Donation sorting cards'], [u('雨量箱 calibration 我们做到了半满。'), u('雨来了，先到屋里把 donation cards 核一下。'), a('The donation cards match the bin list.'), u('雨停了，回楼顶，把 full mark 测一下再倒水。')], { binding: 'b', target: 'a' });
  add('mixed', ['Bathhouse drain flow', '门禁 floor map'], [u('Drain 在接头处咕咕叫，等水退再开盖。'), a('I marked where it gurgles.'), u('趁这会儿做门禁 floor map，我借来的激光尺马上要还。'), a('Added the missing landing.'), u('水现在退了，回去开那个 drain cover，先看看垫圈有没有滑出来。')], { binding: 'b', target: 'a' });
  add('mixed', ['Cold-room dough temperature', '文案的 sponsor marks'], [a('The dough is not yet stable at the core.'), u('先看 sponsor marks，印样今天送走。'), a('The bottom sponsor row no longer clips.'), u('回冷库；probe 放回刚才那个切口，再等一次读数。')], { binding: 'b', target: 'a' });
  add('mixed', ['Portable recorder mono mode', '后场 parking allocation'], [u('Mono 录音只响左耳，我去拿另一副耳机。'), u('路上先把后场 parking 那张分配表给司机看看。'), a('The driver has the slot codes.'), u('新耳机到了，回 mono；先不换 adapter 看能不能复现。')], { binding: 'b', target: 'a' });
  add('mixed', ['Showcase tactile labels', '发言顺序 livestream rundown'], [a('The raised arrows are OK; tactile room numbers have not arrived.'), u('先把直播 rundown 给主持人，他已经上台了。'), t('Program board updated; speaker order confirmed.'), u('Room numbers 刚送到，回触摸标识，把它们跟 raised arrows 放一起核。')], { binding: 'b', target: 'a' });
}
