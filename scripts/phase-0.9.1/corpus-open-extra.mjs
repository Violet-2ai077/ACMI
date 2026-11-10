// Individually written continuation of the non-holdout provisional corpus.
export const extraCases = [];

const u = (text, session) => session === undefined ? ['user', text] : ['user', text, session];
const a = (text, session) => session === undefined ? ['assistant', text] : ['assistant', text, session];
const t = (text) => ['tool', text];
const s = (text) => ['subagent', text];

function family(name, intent, split = 'development', risk = 'normal') {
  return (language, tasks, turns, fields = {}) => {
    const binding = tasks.length ? 'a' : null;
    const target = intent === 'continue_current' ? binding : intent === 'switch_existing' ? 'b' : null;
    extraCases.push({
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
  const add = family('user_correction', 'continue_current');
  add('zh', ['观鸟记录地图'], [a('我把候鸟停在河心的那处标成桥墩。'), u('不是桥墩，是露出来的浅滩。原图改一个符号就好，不用加地标。')]);
  add('zh', ['货梯门槛深度', '货梯门槛剖面出图'], [a('我按你说的去重新量门槛深度。'), u('不用量，数是我给你的。我要看出图那条，剖面标注现在指到砖面了。')], { intent: 'switch_existing', target: 'b' });
  add('zh', ['展位押金核销'], [u('这家收的是占位费。'), a('我会从货品款里减。'), u('减错栏了，从返还的押金里扣，货款别动。')]);
  add('zh', ['馆藏油画包装流程'], [a('发泡膜紧贴画面，两侧用纸板固定。'), u('这步反了，纸板要悬空，不能有材料贴画面。给打包单加张侧视图。')]);
  add('zh', ['讲座主持词'], [u('讲者最后那段是主持人接话的提示。'), a('我会补进讲者介绍。'), u('不是介绍，那句话只给主持人看，标个台下提示，不能照念。')]);
  add('zh', ['后院落水槽渗漏定位'], [t('Leak log: moisture at south elbow.'), a('所以北面接口漏了。'), u('记反了，录像里滴的是朝储藏室那个弯头。先别拆接口，拿粉笔圈一下。')]);
  add('en', ['Pump prime troubleshooting'], [u('Pressure holds while the valve is shut.'), a('I will retest with it closed.'), u('No, closed is the control. Open it for the run where we watch the gauge drop.')]);
  add('en', ['Field-trip balance letter'], [a('The draft says the fee is due for every child.'), u('I did not mean every child has an unpaid balance. Keep the group mailing, but only print the amount for families that still owe it.')]);
  add('en', ['Painter tape removal trial'], [t('Sample green: adhesive residue on steel.'), a('The blue tape left the residue.'), u('Green, not blue. Take a photo of that steel panel before wiping it.')]);
  add('en', ['Silent auction rules', 'Fundraiser payment handoff'], [a('I can amend the winning-bid rule.'), u('Sorry, I meant the separate payment handoff we left unfinished. No change to what constitutes a winning bid.')], { intent: 'switch_existing', target: 'b' });
  add('en', ['Temporary path marker placement'], [u('We do not want anyone coming up the steep side.'), a('I will close the path on both ends.'), u('Keep it open downhill. One directional sign at the split is what I meant.')]);
  add('en', ['Training attendance correction'], [a('Everyone on the sign-in sheet will be marked trained.'), u('Signing in does not count as training. Mark the people who actually completed the practical check; keep the sign-in records for audit.')]);
  add('mixed', ['弹窗 pointer capture'], [a('I will disable all pointer events on the overlay.'), u('不是 overlay 都关；drag 结束以后 release capture。按钮还有点击。')]);
  add('mixed', ['门票 back-print 核验'], [t('Sample card backing lot stamped C9.'), a('C9 is the visitor ID.'), u('C9 是 print lot，别当 visitor ID。那个编号应该在右上小框。')]);
  add('mixed', ['升降台 dead-man switch 观察'], [u('开关不松手还能停。'), a('You mean the emergency stop is unreliable?'), u('不是 E-stop。说的是脚踏 dead-man 松开之前马达就自己停了，先抓那一秒的继电器声音。')]);
  add('mixed', ['Audio mix stem render', '录音室 booking rules'], [a('I can mute the backing stem so the next mix is quieter.'), u('我说 quiet slot 指的是录音室的 booking rules，回那项。别在 stem 上做 gain change。')], { intent: 'switch_existing', target: 'b' });
  add('mixed', ['Library hold expiry wording'], [a('The proposed email says the borrower loses their account after 48 hours.'), u('Expire 的只是这次 hold，account 还在。保留到期提醒，别写重新注册。')]);
}

{
  const add = family('goal_scope_change', 'continue_current');
  add('zh', [['演出走台流程', '写完所有演员全流程走台安排']], [a('一幕、二幕和谢幕都可以分时段。'), u('今天演员只到一半，走台这份先只做换景和安全出口，两幕台词明天补。')], { changes: ['objective'] });
  add('zh', [['园舍失物通知', '整理并公开发布遗失物照片']], [a('照片快排完了，准备放园舍公众号。'), u('改一下，这轮不公开照片了。原任务只做纸质认领编号，照片留在柜台。')], { changes: ['objective'] });
  add('zh', [['大院防滑维护', '把雨天湿滑位置做成一张图']], [u('总有人没看到门口那块湿地。'), a('图上可以加三角。'), u('不只图了，这个任务最后要交一套雨天布置方案，画完再把垫子和告示的摆法放进去。')], { changes: ['objective'] });
  add('zh', [['二手书定价表', '按品相做对外售价表']], [a('每个品相有三个价位。'), u('这批确定不卖，定价表改成交接估值表，只让双方确认数量和大类。')], { changes: ['objective'] });
  add('zh', [['充电座耐久验证', '完成七天的实际充电循环']], [t('Only 18 hours left in instrument reservation.'), u('取消七天循环。耐久这张单交付改成接触不良的复现实验；离开前至少把故障拍下来。')], { changes: ['objective'] });
  add('en', [['Bramble route brochure', 'Build a take-home booklet for the whole circuit']], [a('We have space for a trail mileage spread.'), u('The brochure is becoming an at-the-gate sign. Change the brief to one glance and just the accessible loop; no booklet this year.')], { changes: ['objective'] });
  add('en', [['Firewood shed estimate', 'Give a single estimate for full replacement']], [a('A full rebuild also includes the concrete pads.'), u('Maintenance has asked us to price options instead. Change this estimate to show the safe minimum repair next to the full rebuild.')], { changes: ['objective'] });
  add('en', [['Bicycle valet staffing model', 'Estimate peak-hour volunteers for check-in']], [a('Intake peaks just before noon.'), u('Expand the model to cover pickup and the overnight hold as well. The funding request has to cover the whole service, not just intake.')], { changes: ['objective'] });
  add('en', [['Otter cam daily digest', 'Produce a daily reel of recorded otter sightings']], [u('We thought the clips were all water-level views.'), a('Several show members of the public on the bank.'), u('Change the digest to an aggregate count with no reel. Keep the same date range.')], { changes: ['objective'] });
  add('en', [['Varnish sample finish review', 'Select a finish and specify an order quantity']], [a('We could get a gallon delivered on Friday.'), u('Not buying this round. Revise the finish review to only report the samples that survived the spill test.')], { changes: ['objective'] });
  add('en', [['Kitchen sink access mockup', 'Mock up the entire accessible kitchen bay']], [u('The builder only has one section of counter left.'), u('Let us narrow this to the sink reach experiment, not the whole bay. We can still use the original measurements.')], { changes: ['objective'] });
  add('mixed', [['便携展板 load test', 'Verify stability outdoors for a full setup']], [a('Still need a gust test with the tall panels.'), u('改 scope，只验室内自立，outdoor configuration 今年取消；原来的 load test 任务更新一下。')], { changes: ['objective'] });
  add('mixed', [['Fundraiser site RSVP integration', 'Ship event registration plus payment capture']], [u('Payment provider 审批不会在周五前好。'), u('把这次 integration 定成只收 RSVP，不开付款。预算别挪去做其他 checkout。')], { changes: ['objective'] });
  add('mixed', [['仓库条码替换 pilot', 'Replace tags on all three aisles in the first pilot']], [a('Forklift time is only available in aisle two.'), u('Pilot 收到二排就停，验收改成一次正常补货，不测全库。')], { changes: ['objective'] });
  add('mixed', [['Annual lighting color profile', 'Provide fixture-specific dimming profiles']], [a('The dimmers on the balcony are a different revision.'), u('客户不要每盏 fixture 的 profile 了，改成给摄影团队一份现场 white-balance cheat sheet，任务还是这条。')], { changes: ['objective'] });
  add('mixed', [['Museum audio booth access review', 'Check if entrance and controls fit mobility aids']], [u('试走还没人看过 headphone jack。'), a('I can add it to the hardware route.'), u('Scope 扩一下，验收还要包括无声和听不清时怎么用，不能只算 reach。')], { changes: ['objective'] });
  add('mixed', [['防尘工单自动分类', '自动把所有报修送到各组队列']], [a('The classifier separates dust and damp reliably on the sample.'), u('别自动 routing，这阶段目标改成 read-only 标签建议，保留人工指派。')], { changes: ['objective'] });
}

{
  const add = family('acknowledgement_no_task', 'no_task');
  add('zh', ['冷柜温度贴条'], [a('印样放在左边抽屉，和正式贴条分开了。'), u('收到，我知道在哪了。')]);
  add('zh', ['鱼池清洗工具表'], [u('之前那个网兜还有吗？'), a('有，只是挂回了库房门后。'), u('哦难怪刚才没看见。')]);
  add('zh', ['折叠椅维修分拣'], [a('红胶带表示待修，不是报废。'), u('行，意思明白了。')]);
  add('zh', ['玻璃花房开放时段'], [a('早场从十一点算，十点半只开西门做准备。'), u('原来如此，跟我记的差半小时。')]);
  add('zh', ['纱窗压边实验'], [a('这只是手摇样品，不代表量产压紧力。'), u('嗯，我就是确认我没听岔。')]);
  add('zh', ['乐团装车顺序'], [a('大鼓已经列在最后一趟，名单先不变。'), u('看到了，多谢提醒。')]);
  add('en', ['Auditorium cable length survey'], [a('The 14 m reading starts at the rack, not the plug.'), u('That explains the difference I saw.')]);
  add('en', ['Pallet jack rental receipt'], [u('Was tax on the rental line?'), a('No, the two amounts were printed at the bottom.'), u('Ah, I see them now.')]);
  add('en', ['Film club poster approvals'], [a('The orange proof is the one on the corkboard.'), u('Right, that is the one I was looking at.')]);
  add('en', ['Rowing launch checklist'], [a('The white flag is just a training cue, not a launch authorization.'), u('Understood. I was only checking what the flag meant.')]);
  add('en', ['Pigeon loft panel fitting'], [a('A 9 mm gap accounts for the hinge swing.'), u('Got it, I had read the dimension from the other side.')]);
  add('mixed', ['Keycap jig layout'], [a('The top row is shown upside down in the jig photo.'), u('OK，难怪 row number 看起来反着的。')]);
  add('mixed', ['礼堂 DMX 地址册'], [a('The starting channel is written on the back of the dimmer.'), u('明白，那个 label 我刚看到。')]);
  add('mixed', ['Warehouse cart return path'], [a('The arrows show empty carts only.'), u('哦 empty only，我以为来回都画一起了。懂了。')]);
  add('mixed', ['积木课程 kit 备件'], [u('Extra pins 在几号箱？'), a('Box 4, behind the spacer tray.'), u('找到了，thanks。')]);
  add('mixed', ['Loom pedal counting'], [a('Press 2 before 1 when weaving that border.'), u('Ah 对，order 我记反了，多谢。')]);
  add('mixed', ['Workshop waiver read-through'], [a('Draft 3 is only for side-by-side review.'), u('OK 只作 reference，我没有同意用第三版。')]);
}

{
  const add = family('social_no_task', 'no_task');
  add('zh', ['社区面包炉开孔'], [a('面板还在等公差图。'), u('今天风真大，伞直接给我吹翻了。')]);
  add('zh', [], [u('晚上好，我来打个招呼。')]);
  add('zh', ['钥匙柜挂点编号'], [u('我歇会儿，眼花了。'), a('可以缓一下。'), u('这两天净做梦在数钥匙，真是服了。')]);
  add('zh', ['连廊门牌重新排序'], [a('北门入口的顺序还留在对照表里。'), u('刚下楼买了杯热豆浆，今天第一次没排队。')]);
  add('zh', ['课程领结印染检查'], [u('说句题外的，你今天这一句把我逗乐了。')]);
  add('zh', ['粉笔墙边条安装'], [a('边条还没开始切。'), u('我去接人啦，回见。')]);
  add('en', ['Shore hatch label proof'], [a('The illustration can be trimmed later.'), u('The fog here looks like a badly cropped photo this morning.')]);
  add('en', [], [u('Morning! I finally got a seat on the bus.')]);
  add('en', ['Seed packet moisture barrier'], [u('My hands smell like basil now.'), a('That happens after handling fresh leaves.'), u('Not complaining. Beats the smell of the packing room.')]);
  add('en', ['Conference lamp loaner tags'], [a('The tag colors are on the counter.'), u('I have to run. Have a good evening.')]);
  add('en', ['Roving check-in cart layout'], [u('This cart squeaks in the exact key of the lobby music. Made my day.')]);
  add('en', ['Patchwork blanket display pins'], [a('The pins are not part of the display itself.'), u('My grandmother used to have that same pattern on the couch. Funny what you remember.')]);
  add('mixed', ['除湿机 intake filter 检修'], [a('The filter can slide out without tools.'), u('哈哈，这个声音好像 coffee grinder，不是让你改。')]);
  add('mixed', [], [u('Morning 啊，刚把窗户打开，总算有点凉风。')]);
  add('mixed', ['Small theater seat restoration'], [u('Back row 的木头味好像我小学礼堂。'), a('Old varnish can hold that smell.'), u('Yep，小时候坐那儿总是走神。')]);
  add('mixed', ['木槌 weight test'], [a('We have enough scrap for later.'), u('我 break 一下，去听外头那段 live jazz。')]);
  add('mixed', ['Folded map paper stock'], [a('The heavier stock held up at the fold.'), u('Off topic：刚看到有人把地图折成纸鹤，挺有意思。')]);
}


{
  const add = family('assistant_suggestion_not_user_decision', 'continue_current', 'development', 'high');
  add('zh', ['码头夜间照明变更'], [a('我建议把北角的感应灯改成常亮。'), u('把这条建议放在照明变更单里，电费和邻楼影响都没问过，不是定常亮。')], { changes: ['decision-proposed'] });
  add('zh', ['桌牌印刷匿名选项'], [u('报名名单不一定能给别人看。'), a('那我建议统一用编号代替名字。'), u('编号先写成待选项吧。要看主持人怎么叫人，我没选。')], { changes: ['decision-proposed'] });
  add('zh', ['潮汐现场通知渠道'], [a('最省维护的是把三处公告都换成二维码。'), u('先把二维码的优缺点放到通知方案对比里；站点有没有信号还没查。')], { changes: ['decision-proposed'] });
  add('zh', ['琴房借钥匙管理'], [a('要不然放个密码盒，晚班能自取。'), u('你这个办法可以留在借钥匙的候选里，但物业不会让钥匙无人管，别当成决定。')], { changes: ['decision-proposed'] });
  add('zh', ['池边防滑施工报价'], [a('看数据我倾向把石板整片换掉。'), u('先拿整换的假设算面积，不要写已选方案。还没问能不能局部重铺。')], { changes: ['decision-proposed'] });
  add('en', ['Stamp inventory custody'], [a('I would move the stamps to the finance cabinet.'), u('Add that to the custody options, not the standing instructions. I still need to see who has the spare key.')], { changes: ['decision-proposed'] });
  add('en', ['Snow closure phone tree'], [u('People missed the last notice.'), a('A paid SMS broadcast might solve that.'), u('Keep SMS in the comparison; check what happens to the two people without mobiles before we choose.')], { changes: ['decision-proposed'] });
  add('en', ['Tool library late penalties'], [a('A suggested change is to waive the first late penalty.'), u('Put that in the review notes as your proposal. We have not asked members to vote yet.')], { changes: ['decision-proposed'] });
  add('en', ['Practice floor matte finish'], [a('Sand the surface instead of adding another coating? That would solve the glare.'), u('I want the downside written out, particularly grip. Nothing is getting sanded yet.')], { changes: ['decision-proposed'] });
  add('en', ['Observatory after-hours access'], [a('My suggestion is to issue a separate night pass.'), u('Record the night pass as one option. The caretaker gets to tell us first how many calls it might generate.')], { changes: ['decision-proposed'] });
  add('en', ['Mobile book cart axle spacer'], [a('The simplest approach would be a washer inside the wheel.'), u('Draw it so I can ask the machinist. Do not change the build sheet; I have not picked a fix.')], { changes: ['decision-proposed'] });
  add('mixed', ['Credential pickup access flow'], [a('Could issue a temporary QR pass at the desk.'), u('QR 先记成 proposal；入口无网怎么做还空着，不要把 temporary pass 定了。')], { changes: ['decision-proposed'] });
  add('mixed', ['活动报名 database retention'], [a('My recommendation is a 30-day TTL.'), u('TTL 30 天只进 options 那栏；学校要保多久我没确认，不能现在 apply。')], { changes: ['decision-proposed'] });
  add('mixed', ['后台音频 monitor 分配'], [a('We could move all backing tracks to bus 3.'), u('把 bus 3 方案画出来看看，不是改 patch；周一的人还没试过。')], { changes: ['decision-proposed'] });
  add('mixed', ['Parking heater thermostat placement'], [a('Maybe put the thermostat on the loading wall.'), u('这个 location 可以先列 candidate；dock 门开的时候温度飘，别签定稿。')], { changes: ['decision-proposed'] });
  add('mixed', ['墨印 scanner replacement'], [a('The handheld model would be my default.'), u('Handheld 是你的建议，先加到试用表，receipt 反光那项得过才会选。')], { changes: ['decision-proposed'] });
  add('mixed', ['Cycling club emergency beacon'], [a('I suggest setting the beacon to broadcast every minute.'), u('留这个 interval 做 benchmark，不是决定上生产。还要查电池寿命。')], { changes: ['decision-proposed'] });
}

{
  const add = family('cross_session_reference', 'switch_existing', 'validation');
  add('zh', ['周五放映机镜头对焦', ['石凳题字拓印', '辨认缺的那一笔', { session: 1 }]], [u('石凳那字只差右下的一点，白天拍的看不出来。', 1), a('斜着打光应该能看见。', 1), u('这会儿回上周那个石凳字，手电斜着照的照片我找到了。', 2)], { retrievalTarget: 'b' });
  add('zh', ['春游车载呕吐袋补货', ['高架泵房门锁封条复查', '确认编号是否重复使用', { session: 2 }]], [u('门锁封条照片拍糊了，只看得到尾号 72。', 2), a('先等现场记录送来。', 2), a('春游袋还有两箱。', 3), u('你能翻到上次高架泵房封条那条吗？我现在拿到出入登记了。', 3)], { retrievalTarget: 'b' });
  add('zh', [['石灰墙返碱观察', '等待下一轮降雨照片', { session: 1 }]], [u('先别铲，等下雨后看白印是不是往上走。', 1), u('照片来了，接上我们前几天看的墙，不用建另一条。', 3)], { intent: 'continue_current', target: 'a', retrievalTarget: 'a' });
  add('zh', ['讲座签到簿编号', ['光谱仪空白片核对', '归档空白参考片', { session: 1 }]], [u('空白片别和正常的读数存在同一抽屉。', 1), a('标签已经补了，还差签收。', 1), u('昨天没签的那条空白片归档，今天保管员来了，回那边。', 2)], { retrievalTarget: 'b' });
  add('zh', ['泳池池壁拼花更换', ['旧邮局口述史线索', '追踪最后一个邮筒搬到哪里', { session: 1 }]], [a('那位目击者说是邮局停业以后才搬的。', 1), a('泳池新砖样品可以领取了。', 3), u('旧邮局那个不是已经查完了吗？我说的是刚才查泳池墙面缺片这件，拿到样品就对色。', 3)], { intent: 'continue_current', target: 'a', retrievalTarget: 'a' });
  add('zh', ['临展防倾倒拉索', ['清洁船启航时窗', '周日等水位回升后过坝', { session: 3 }]], [u('那一艘船太早走会蹭坝，先把时窗搁着。', 3), u('麻烦接回上个窗口的清洁船时窗，水站说早上六点过线。', 4)], { retrievalTarget: 'b' });
  add('en', ['Clubhouse raffle slips', ['Meadow lantern lens fracture', 'Match crack shapes to the old bench photos', { session: 1 }]], [a('There is one fracture that stops before the brass ring.', 1), u('Going back to the lantern lens from Friday: I have the original picture, not the cropped one.', 2)], { retrievalTarget: 'b' });
  add('en', ['Shuttle crew name tags', ['Loom shuttle jam diagnosis', 'Isolate the jam at the left return', { session: 2 }]], [u('The loom shuttle catches only after returning left.', 2), a('The crew badge proof is in your downloads.', 3), u('Not the bus crew. Bring up the loom shuttle from our previous chat, the one I could free by nudging the bobbin.', 3)], { retrievalTarget: 'b' });
  add('en', [['Storage drum density check', 'Confirm which grain mix is over the maximum bin load', { session: 1 }]], [u('I can weigh a full scoop next week.', 1), a('Only the exact scoop from the drum counts.', 1), u('I have the scoop on the scale in front of me. Let us finish the same drum check we started before the move.', 4)], { intent: 'continue_current', target: 'a', retrievalTarget: 'a' });
  add('en', ['Signal flag color match', ['West lift leveling alarm', 'Compare empty-car offsets with loaded measurements', { session: 2 }]], [t('Reference reading at mezzanine: 6 mm low.'), u('File that as the empty-car baseline, not a floor survey.', 2), u('Could you pull the West lift alarm ticket we were on in the other session? The loaded reading is finally in.', 4)], { retrievalTarget: 'b' });
  add('en', ['Weathering block photo log', ['Greenway traffic counter resets', 'Explain duplicate Mondays in the archive', { session: 1 }]], [u('The greenway log has four Mondays on a three-week window.', 1), a('The weathering photos are ready for a contact sheet.', 2), u('Leave the photos for today. The four-Mondays problem we talked about earlier is why I brought the old counter in.', 2)], { retrievalTarget: 'b' });
  add('en', ['Scarecrow judging sheet', ['North bell delayed playback', 'Recover the source clip with the missing onset', { session: 3 }]], [a('There is a take in the phone recording where the bell starts late.', 3), u('Remember where we stopped on the delayed bell? Go there first; I found another take on the handheld.', 5)], { retrievalTarget: 'b' });
  add('mixed', ['Pump cavitation survey', ['练琴房窗户 latch 复核', 'Compare latch position before and after seal replacement', { session: 1 }]], [u('换 seal 前关到一半就顶住。', 1), a('We can mark the stop position with tape.', 1), u('昨天练琴房 latch 那条帮我 pull up，胶条换完了要再找 stop point。', 2)], { retrievalTarget: 'b' });
  add('mixed', ['葡萄架节距确认', ['Wardrobe fabric bleed test', 'Wait for a second wash comparison', { session: 2 }]], [u('Blue sample 跟白布一起洗了一次。', 2), u('接回上个 chat 的 fabric bleed test；第二次水是清的，拍一张白布能不能说明问题？', 5)], { retrievalTarget: 'b' });
  add('mixed', [['Tablet garage stand RMA', 'Collect timestamps for a replacement request', { session: 2 }]], [a('The tablet tilted after the second vibration run, not the first.', 2), u('我找到了那次 run 的原视频。接着我们上回 garage stand 的 RMA 整证据。', 3)], { intent: 'continue_current', target: 'a', retrievalTarget: 'a' });
  add('mixed', ['暗场广播词语速', ['Eco-label removable adhesive trial', 'Test whether adhesive remains after freezing', { session: 1 }]], [u('Eco-label freezer test 留了一张控制样。', 1), a('The blackout announcement audio is normalized.', 3), u('广播先过；翻上上次那个 freezer test，我已经让两张都 thaw 完了。', 3)], { retrievalTarget: 'b' });
  add('mixed', ['屋檐防鸟网孔径', ['Backstage return lost MIDI events', 'Track whether return channel drops note-off', { session: 1 }]], [u('Backstage return 有时没有 note-off。', 1), u('把前一个 session 的 MIDI return 拉回来吧，这次可以在两端同时 capture。', 2)], { retrievalTarget: 'b' });
}

{
  const add = family('ambiguous_pronoun', 'uncertain', 'validation', 'high');
  add('zh', ['周五加急物料单', '周日补购需求单'], [a('两张都各有一项被库管退回，还没做修改。'), u('那个帮我换成买国产的，别再退。')], { unresolved: ['ambiguous_reference'] });
  add('zh', ['坡道钢板防滑试验', '同坡道的扶手握感试验'], [u('志愿者把两个试验都跑了一遍。'), a('地面刮花和握起来发凉的问题都有记录。'), u('嗯，前面那个重跑一次。')], { unresolved: ['ambiguous_reference'] });
  add('zh', ['晚场场馆照片裁剪', '晚场节目组照片裁剪'], [a('两个样张我都裁到 16:9 了。'), u('它还是留个原尺寸吧，明天或许要竖着用。')], { unresolved: ['ambiguous_reference'] });
  add('zh', ['布景车窄门通行', '道具车窄门通行'], [u('我不记得说的是布景车还是道具车了，两辆都卡过。'), u('先把那个的前轮尺寸加到图里吧。')], { unresolved: ['ambiguous_reference'] });
  add('zh', ['手册白天折页', '手册夜游折页'], [a('纸样左右摆好，右上角都折了。'), u('对，就手指着那份，改细一点。')], { unresolved: ['ambiguous_reference'] });
  add('en', ['East gate hourly walk count', 'West gate hourly walk count'], [a('Both gate counts use the same four time buckets.'), u('Use that one for the footfall slide and crop the morning labels.')], { unresolved: ['ambiguous_reference'] });
  add('en', ['Miniature ramp material quote', 'Full-scale ramp material quote'], [u('There are two quotes in the folder and neither one is signed.'), a('Both have separate labor and delivery lines.'), u('Can you send it to purchasing without the labor line?')], { unresolved: ['ambiguous_reference'] });
  add('en', ['Ceramic slip viscosity', 'Ceramic glaze viscosity'], [a('Neither reading stabilized overnight.'), u('Retest the same one after lunch, at room temp this time.')], { unresolved: ['ambiguous_reference'] });
  add('en', ['Walking tour oral prompt', 'Audio guide accessibility prompt'], [a('Each prompt has an audio take and a text-only proof.'), u('Use the short version of that one at the next tryout.')], { unresolved: ['ambiguous_reference'] });
  add('en', ['Indoor parking sensor outage', 'Loading yard parking sensor outage'], [t('Offline sensor found in each zone; no priority flag.'), u('The one I am thinking of is needed before the weekend. Put it first.')], { unresolved: ['ambiguous_reference'] });
  add('en', ['Canopy transport clearance', 'Canopy deployed clearance'], [a('The two drawings list dimensions from two different surfaces.'), u('Take the figure from the one that matters here and update the build note.')], { unresolved: ['ambiguous_reference'] });
  add('mixed', ['Print proof foil migration', 'Print proof ink drying'], [a('Both samples are on the table and marked with orange tape.'), u('那个 proof 按原来的 curing time 再做一次。')], { unresolved: ['ambiguous_reference'] });
  add('mixed', ['志愿者 pre-check 试点', '摊主 pre-check 试点'], [u('两个 pilot 都是周五。'), a('Both use mobile check-in at the same gate.'), u('就把那个 check-in move to the side door 吧。')], { unresolved: ['ambiguous_reference'] });
  add('mixed', ['Audio cue left side mix', 'Audio cue right side mix'], [a('Both mixes have the same tone burst, panned opposite ways.'), u('把这个 cue 提前 half a beat，另一条不动。')], { unresolved: ['ambiguous_reference'] });
  add('mixed', ['Anchor bolts v2 dry fit', 'Anchor bolts v3 dry fit'], [t('Both bags opened. Both contain a bent specimen.'), u('按那包的 batch number 查 supplier，照片我放桌上了。')], { unresolved: ['ambiguous_reference'] });
  add('mixed', ['校门 emergency call script', '操场 emergency call script'], [a('Both use the same dispatch phone number but different location wording.'), u('下次 drill 用那条旧 script；地点短一点。')], { unresolved: ['ambiguous_reference'] });
  add('mixed', ['Packet acceptance path A', 'Packet acceptance path B'], [a('The server accepts either path, but retry semantics differ.'), u('For now 把它的 retry 上限改成三次，另一条别碰。')], { unresolved: ['ambiguous_reference'] });
}


{
  const add = family('missing_referent', 'uncertain', 'validation', 'high');
  add('zh', [], [u('还按那份名单来，最后三个先排除。')], { unresolved: ['missing_reference'] });
  add('zh', ['书车踏板修整'], [u('手头别动，另一台说要补上周漏的那个。'), a('这里只看到书车踏板，没有另一台的编号。'), u('它跟书车不是一回事；就是管理室转来的那个，你接过去。')], { unresolved: ['missing_reference'] });
  add('zh', ['社区露台滴水边', '露台节日花箱摆放'], [a('这两个只存了文字说明，没有视频。'), u('不是它们。昨晚群里截的那小段，你把结尾发回去让他们看。')], { unresolved: ['missing_reference'] });
  add('zh', [], [u('她还是想用上次那个版本，给仓库的文件也跟着一起换。')], { unresolved: ['missing_reference'] });
  add('zh', ['园艺教室雨布扣眼'], [a('雨布只有几个扣眼没修。'), u('我想找的是东巷那个没收尾的预约，日历没同步过来。先接一下，我现在也想不起是干什么的。')], { unresolved: ['missing_reference'] });
  add('zh', ['储物柜排风测量'], [u('之前上传了红线图，应该有吧。'), t('Current chat: no attachment received.'), a('我看不到红线图。'), u('就是圈出来最右边那个，这回先给它上罩。')], { unresolved: ['missing_reference'] });
  add('en', [], [u('Would you carry on with the thing I left on the other laptop? I never saved its name.')], { unresolved: ['missing_reference'] });
  add('en', ['Orchestra stand footprint'], [a('The stand layout is the only item in this room history.'), u('It is not the stand. I got a voice note with what to pick up next; I thought you had it. Can you finish that first?')], { unresolved: ['missing_reference'] });
  add('en', ['Ride marshal briefing cards'], [u('They changed it again.'), a('Who changed what? I only have the marshal cards.'), u('There was a separate promise on the call. Make it read the way they asked.')], { unresolved: ['missing_reference'] });
  add('en', ['Equipment loan return tray'], [a('I could not open the image from the shared folder.'), u('Please move the work highlighted in yellow ahead of everything else. Do not start the return tray again.')], { unresolved: ['missing_reference'] });
  add('en', ['Ceramic market demo placard'], [u('Back on the proposal that came from the organizer last year.'), a('This chat does not contain that proposal.'), u('They sent it to someone else, right. Can you still update the second condition on it?')], { unresolved: ['missing_reference'] });
  add('mixed', [], [u('把上周那个没 merge 的接回去，PR 号我现在也查不到。')], { unresolved: ['missing_reference'] });
  add('mixed', ['演员换装 compartment sketch'], [a('The fitting-room drawing has labels 01–07.'), u('我讲的是另一个 room 的 layout，微信没同步。照原来口头说的把它定下来。')], { unresolved: ['missing_reference'] });
  add('mixed', ['Timecard month-end export'], [u('那个 mobile 截图我现在传不了。'), a('I only have the timecard export in this thread.'), u('Not timesheets，是图里弹出来的那条 warning；按那里提到的东西继续。')], { unresolved: ['missing_reference'] });
  add('mixed', [], [u('Can you go ahead with 第三个选项？我忘了当时那几条在哪个窗口。')], { unresolved: ['missing_reference'] });
  add('mixed', ['喷墨 plotter 色轮验收'], [a('The plotter swatches are available as a PDF.'), u('Hold that。我手里的纸上还写了另一件 open item，按那行来，我正开车拍不了。')], { unresolved: ['missing_reference'] });
  add('mixed', ['走廊 occupancy counter 调整'], [t('Audio memo unavailable: attachment not shared.'), u('刚发的 memo 里提到有人等答复，给那件事加个 reminder；不是 occupancy counter。')], { unresolved: ['missing_reference'] });
}

{
  const add = family('result_consumed_not_accepted', 'continue_current', 'validation', 'high');
  add('zh', ['公共长凳朝向试摆'], [s('数了一个小时：朝河的长凳有人坐过 9 次，朝路 4 次。只测了晴天。'), u('把九和四先放到遮阴讨论的工作表里，用来挑下次观察点，别当作朝向定案。')], { changes: ['result-consumed'], evidence: [0,1] });
  add('zh', ['服装室清洗用水比较'], [u('同一型号的洗衣机不一定水位一样。'), s('空桶冲洗记录：左机 32 升，右机 38 升。'), u('拿这两个数来选流量计量程就行，暂不接受左右机节水排名。')], { changes: ['result-consumed'] });
  add('zh', ['风荷载仿真夹具位置'], [t('Trial render, not verified: lowest displacement at clamp hole D.'), u('先用 D 孔画试装草图，别把仿真结果写进验收报告。')], { changes: ['result-consumed'] });
  add('zh', ['口述档案录音波段筛查'], [s('第 08 段 04:11 听到人名，另外两段像是背景广播。'), a('我会保留时间点。'), u('用 04:11 带编辑去听原声；人名没二审，不算审核过。')], { changes: ['result-consumed'] });
  add('zh', ['厨房隔热手套检验'], [t('Prototype glove thermocouple: 47 C at 35 s, one trial.'), u('以三十五秒估下轮试验排班就好，那个温度不能盖章，手套也先不发。')], { changes: ['result-consumed'] });
  add('zh', ['车棚屋顶光照调查'], [s('周三晴天，三个点都在十点前进入阴影，尚无冬季数据。'), u('先把这些点当作周五调查的起点。不能凭这趟就接受全年结论。')], { changes: ['result-consumed'] });
  add('en', ['Bird feeder tray retention'], [s('In the prototype test, the tray held 380 g once and spilled on repeat.'), u('Use 380 g to set the next test range. It is not a certified load rating.')], { changes: ['result-consumed'] });
  add('en', ['Sensor batch baseline histogram'], [t('Preliminary CSV comparison: the high-bin count is 11/80.'), u('Drop that count into the sampling worksheet so we can size the rerun, but keep it out of the approved baseline.')], { changes: ['result-consumed'] });
  add('en', ['Student leaflet vocabulary trial'], [u('This read-through was with parents, not the target age group.'), s('Three parents paused at the sentence about reciprocal membership.'), u('Give the copywriter that sentence as a lead. We are not approving the readability finding off the parent group.')], { changes: ['result-consumed'] });
  add('en', ['East pond pump seal choice'], [t('Bench comparison: seal Q reduced initial drips by four per minute.'), a('That is the first measurement only.'), u('Use it to pick Q for the longer run, not to accept the trial finding as final.')], { changes: ['result-consumed'] });
  add('en', ['Crate loader reach mockup'], [s('Two trial users could not reach the rear clip.'), u('For the next drawing show me the clearance if we move that clip. Do not sign off the reach study until the wheelchair trial.')], { changes: ['result-consumed'] });
  add('en', ['Pop-up gallery wait time'], [u('The side door was shut during the observation, so the line doubled back.'), s('I counted seven minutes from the steps to the desk during the closure.'), u('Use those seven minutes to plan staffing for a blocked-door drill. The normal wait figure stays unverified.')], { changes: ['result-consumed'] });
  add('mixed', ['Bake sale prep station capacity'], [s('One volunteer filled 24 trays in an hour, pre-portioned mix only.'), u('先拿 24 做 staffing sensitivity 算一下，不能当 prep rate approved。')], { changes: ['result-consumed'] });
  add('mixed', ['馆外 speaker falloff map'], [t('Uncalibrated sound meter: 62 dB at the gate.'), u('拿 62 dB 选下次 instrument range，先别给场地方发 compliance 结论。')], { changes: ['result-consumed'] });
  add('mixed', ['Aquarium touch panel localization'], [u('试读只有两位游客，不能代表全场。'), s('Both volunteers tapped the EN button before selecting a language.'), u('可以用这个 observation 改下一轮 test script，别判现版 translation 不通过。')], { changes: ['result-consumed'] });
  add('mixed', ['旧烤架烟气 tracer run'], [t('Video marker: visible smoke reaches canopy at t=6 s.'), u('先照 6 秒定高速相机的 buffer，排烟的 verification 还没签。')], { changes: ['result-consumed'] });
  add('mixed', ['Tandem saddle clamp torque'], [s('I saw the clamp slip once at 5 Nm. The wrench has not been checked.'), u('把 5 Nm 留作 failure reproduction 的起点；别写成 final torque limit。')], { changes: ['result-consumed'] });
}

{
  const add = family('stale_task_candidate', 'uncertain', 'validation', 'high');
  add('zh', ['双层推车坡道验收', ['旧货梯载荷试测', '旧梯空厢配重改造前试测', { status: 'closed', age: 330 }]], [u('载荷这事上回查过，那个旧梯都拆掉了。新楼的货梯要测哪条我还没拿到单子，你先别拿旧的跑。')], { unresolved: ['missing_candidate'] });
  add('zh', ['周中操场草皮晾晒', ['冬前操场积水调查', '记录下凹处与水深', { status: 'closed', age: 210 }]], [a('去年的积水调查在归档。'), u('我要给新铺的操场安排夜间照明试跑，草皮晾晒和去年的水都不改。')], { intent: 'create_new' });
  add('zh', ['样片放映帧率复核', ['暗房红灯遮光补片', '验证防漏光', { age: 160 }]], [a('新投影仪已经能播 24 帧。'), u('暗房没搬，别看新投影，翻回夏天那件红灯漏光补片。我找到当时裁剩的黑卡。')], { intent: 'switch_existing', target: 'b', retrievalTarget: 'b' });
  add('zh', ['夏令营口令测试', ['上季度大门开门口令', '处理旧无线电口令', { status: 'closed', age: 105 }]], [u('旧口令不再用。那边说就照原样处理，但我不确定说的是门还是无线电，先别动任何权限。')], { unresolved: ['ambiguous_reference'] });
  add('zh', ['访客储物柜排号', ['清场广播旧版复核', '确认早场散场广播听感', { status: 'closed', age: 182 }]], [a('搜到的清场广播是拆旧扬声器前的。'), u('我提那个只是让你知道之前漏过一句。给明年还在施工的临时场地另做一份疏散广播。')], { intent: 'create_new' });
  add('en', ['Parade route curb measurements', ['Spring parade curb ramp sign-off', 'Verify ramps on the retired south route', { status: 'closed', age: 260 }]], [a('The signed April inspection is for the south route.'), u('The wheelchair group is asking about a curb on the detour they just announced. Start a separate access check for that detour; the April certificate does not apply.')], { intent: 'create_new' });
  add('en', ['Front desk doorbell battery', ['Boathouse night bell wiring', 'Track an intermittent break at the joist', { age: 280 }]], [a('A fresh battery worked on the desk unit.'), u('Return to the boathouse night bell from last winter. The joist wire is still loose, and I can lift the same panel now.')], { intent: 'switch_existing', target: 'b', retrievalTarget: 'b' });
  add('en', ['Trial paint solvent disposal', ['Rehearsal fog unit fluid choice', 'Verify fluid approved for the retired fogger', { status: 'closed', age: 401 }]], [u('The old fogger has been recycled.'), a('Its fluid review is archived.'), u('I got asked to verify the replacement but the tag could say F7 or P7. Do not carry the old review across; what is the replacement job called?')], { unresolved: ['missing_candidate'] });
  add('en', ['Locker label stencil proof', ['Former facility locker door count', 'Count old building doors for closure', { status: 'closed', age: 460 }]], [a('The old facility count came up when I searched for locker.'), u('I just need the wording on the live stencil proof. The old count was for moving out, not for this.')], { intent: 'continue_current', target: 'a' });
  add('en', ['Crop bed water bill variance', ['Canceled orchard feed meter move', 'Reroute meter before the abandoned branch', { status: 'closed', age: 391 }]], [u('A redacted screenshot says "meter move" but does not say where.'), a('The only hit is for the branch we abandoned.'), u('Do not start that again. I cannot tell which live request the screenshot was about.')], { unresolved: ['missing_candidate'] });
  add('en', ['Studio riser felt pads', ['Porch handrail winter flex test', 'Repeat the pull test after thaw', { age: 225 }]], [a('The studio pad trial will use new felt.'), u('Put the felt aside. The porch rail from the January flex test is thawed; do the spring repeat on that same rail.')], { intent: 'switch_existing', target: 'b', retrievalTarget: 'b' });
  add('mixed', ['Exhibit west panel captions', ['旧展拐角 banner replacement', 'Replace cloth for last season theme', { status: 'closed', age: 355 }]], [a('Search hit is the retired banner from last season.'), u('No，那个早撤展了。新一季要先做一个投影方向的 mockup，caption 也不用改。')], { intent: 'create_new' });
  add('mixed', ['Library floor plan print', ['North wing projector sync lag', 'Measure the unexplained frame delay', { age: 241 }]], [a('The floor plan has its fold markers now.'), u('找回北翼旧的 sync-lag task；不是开新单，那根长 HDMI 现在又找到了，可以复现。')], { intent: 'switch_existing', target: 'b', retrievalTarget: 'b' });
  add('mixed', ['Metro mural touch-up tally', ['上季站台 escalator outage', 'Coordinate maintenance of removed unit', { status: 'closed', age: 570 }]], [t('Asset index: old escalator removed. Active replacement work order not present.'), u('现场找的是 replacement 的 current ticket，不要 reopen 旧那张；我先去问新设备的牌号。')], { unresolved: ['missing_candidate'] });
  add('mixed', ['吊车日检 checklist', ['Old shed hoist removal permit', 'Approve removal of an obsolete hoist', { status: 'closed', age: 287 }]], [a('The search found the removal permit, not a working hoist.'), u('用的是现役吊车，继续 daily checklist；旧 hoist 的 permit 不作依据。')], { intent: 'continue_current', target: 'a' });
  add('mixed', ['花车 battery charger 接线', ['Last year parade battery range', 'Document the old lead-acid system', { status: 'closed', age: 392 }]], [u('Range 以前那条写的是铅酸，我们今年全换了。'), u('别把旧续航报告打开，我要一个针对新 pack 的 overnight storage 检查方案。')], { intent: 'create_new' });
  add('mixed', ['Lodge access reader enrollment', ['North stair snowmelt controller', 'Find why the preheat relay opens early', { age: 198 }]], [u('North stair 控制器那块冬天记过一下。'), a('No further checks were logged after the trip.'), u('Pick that snowmelt relay task back up；今天拿到了温度探头，不跟 reader enrollment 合。')], { intent: 'switch_existing', target: 'b', retrievalTarget: 'b' });
}
