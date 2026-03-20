import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────
//  SUPABASE CONFIG
// ─────────────────────────────────────────────
const SB_URL = "https://uqykrqxqtogecakrjpys.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeWtycXhxdG9nZWNha3JqcHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjc2MzcsImV4cCI6MjA4ODkwMzYzN30.h5Y0YTGgEWKPXBIvb1q0I_mwNNKBlxc5jV_EqG78Me4";
const sbHeaders = { "apikey": SB_KEY, "Authorization": "Bearer "+SB_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" };

async function sbGet(table, filters) {
  try {
    let url = SB_URL+"/rest/v1/"+table+"?";
    if (filters) url += filters;
    const r = await fetch(url, { headers: { "apikey": SB_KEY, "Authorization": "Bearer "+SB_KEY } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function sbUpsert(table, data) {
  try {
    const conflictMap = { clients:"name", daily_logs:"client_name,date", hormone_symptoms:"client_name,date", cycle_data:"client_name", messages:"client_name,role,time" };
    const col = conflictMap[table] || "id";
    const url = SB_URL+"/rest/v1/"+table+"?on_conflict="+col;
    const r = await fetch(url, {
      method: "POST",
      headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(data)
    });
    if (!r.ok) {
      const err = await r.text();
      console.error("sbUpsert error", table, err);
      return false;
    }
    return true;
  } catch(e) { console.error("sbUpsert exception", e); return false; }
}
async function sbUploadPhoto(clientName, mealKey, file) {
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = clientName + '/' + new Date().toISOString().slice(0,10) + '_' + mealKey + '.' + ext;
    const r = await fetch(SB_URL + "/storage/v1/object/food-photos/" + path, {
      method: "POST",
      headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": file.type, "x-upsert": "true" },
      body: file
    });
    if (!r.ok) { console.error("sbUploadPhoto error", await r.text()); return null; }
    return SB_URL + "/storage/v1/object/public/food-photos/" + path;
  } catch(e) { console.error("sbUploadPhoto", e); return null; }
}

async function sbUpdate(table, data, filters) {
  try {
    const r = await fetch(SB_URL+"/rest/v1/"+table+"?"+filters, {
      method: "PATCH",
      headers: sbHeaders,
      body: JSON.stringify(data)
    });
    return r.ok;
  } catch { return false; }
}

// ─────────────────────────────────────────────
//  LOCAL STORAGE FALLBACK
// ─────────────────────────────────────────────
const memStore = {};
const storage = {
  get: k => { try { const v = localStorage.getItem(k); return v ? {value:v} : (memStore[k]?{value:memStore[k]}:null); } catch { return memStore[k]?{value:memStore[k]}:null; } },
  set: (k,v) => { try { localStorage.setItem(k,v); } catch {} memStore[k]=v; },
  del: k => { try { localStorage.removeItem(k); } catch {} delete memStore[k]; },
};

const TODAY = new Date().toISOString().slice(0,10);

// ─────────────────────────────────────────────
//  CLIENTS
// ─────────────────────────────────────────────
const DEMO_CLIENTS = [
  { name:"Soso",   code:"1234", plan:1, startDate:"2026-03-09", sessionDay:0 },
  { name:"Israa",  code:"1350", plan:1, startDate:"2026-03-09", sessionDay:0 },
  { name:"Mariam", code:"8889", plan:1, startDate:"2026-03-09", sessionDay:0 },
  { name:"Noren",  code:"1351", plan:1, startDate:"2026-03-12", sessionDay:0 },
  { name:"Sara",   code:"1352", plan:1, startDate:"2026-03-18", sessionDay:0 },
];
const PLAN_MONTHS = {1:1,2:2,3:3};
const DAYS_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

function getClients() {
  try { const r = storage.get("__clients__"); return r ? JSON.parse(r.value) : DEMO_CLIENTS; }
  catch { return DEMO_CLIENTS; }
}
async function getClientsFromDB() {
  const rows = await sbGet("clients", "select=name,code,plan,start_date,session_day&order=id");
  if (rows && rows.length > 0) {
    return rows.map(r => ({ name:r.name, code:r.code, plan:r.plan, startDate:r.start_date, sessionDay:r.session_day }));
  }
  return DEMO_CLIENTS;
}

function getSubInfo(sub) {
  if (!sub) return null;
  const start = new Date(sub.startDate); const now = new Date();
  const totalDays = PLAN_MONTHS[sub.plan] * 30;
  const elapsed = Math.floor((now - start) / 86400000);
  const weeksDone = Math.floor(elapsed / 7);
  const weeksTotal = Math.floor(totalDays / 7);
  const followupsTotal = PLAN_MONTHS[sub.plan] * 4;
  const followupsDone = Math.min(weeksDone, followupsTotal);
  const remaining = Math.max(0, totalDays - elapsed);
  return { weeksDone, weeksTotal, followupsDone, followupsLeft: Math.max(0,followupsTotal-followupsDone), followupsTotal, remaining, plan: sub.plan, elapsed };
}

function getNextSessionDate(sessionDay) {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayDay = today.getDay();
  let diff = sessionDay - todayDay;
  if (diff <= 0) diff += 7;
  const next = new Date(today); next.setDate(today.getDate() + diff);
  return next.toLocaleDateString("ar-EG", { weekday:"long", day:"numeric", month:"long" });
}

// ─────────────────────────────────────────────
//  CYCLE
// ─────────────────────────────────────────────
const CYCLE_PHASES = [
  { id:"menstrual",  name:"الطمث",    emoji:"🩸", days:"١–٥",   color:"#C2607A", bg:"#FFF0F4", border:"#F5C6D3",
    tagline:"جسمك يستحق الراحة والحنان",
    hormones:"الإستروجين والبروجستيرون في أدنى مستوياتهم",
    eat:["سبانخ وخضار ورقية 🥬","لحم أحمر خفيف 🥩","شوكولاتة داكنة 🍫","تمر وتين 🫘","كركم وزنجبيل 🫚"],
    avoid:["كافيين زيادة ☕","ملح زيادة 🧂","أكل مصنّع 🍟"],
    tip:"الشوكولاتة الداكنة مغنيسيوم حقيقي — ليست مجرد رغبة! 🍫",
    exercise:"يوجا خفيف، مشي، تمدد 🧘", selfcare:"حمام دافئ، وسادة تدفئة 🛁" },
  { id:"follicular", name:"الجريبي",  emoji:"🌱", days:"٦–١٣",  color:"#5DAD85", bg:"#E6F5EE", border:"#A8D9BC",
    tagline:"طاقة صاعدة — الوقت المثالي للبدء",
    hormones:"الإستروجين يرتفع تدريجياً",
    eat:["بيض وبروتين خفيف 🥚","كينوا وحبوب كاملة 🌾","بروكلي وكرنب 🥦","فراولة وتوت 🍓","بذور كتان 🌰"],
    avoid:["سكريات مكررة 🍰","أكل ثقيل قبل التمرين"],
    tip:"الإستروجين الصاعد يحسن التمثيل الغذائي — ابدأي عادات جديدة الآن! 🌿",
    exercise:"قوة، ركض، HIIT 💪", selfcare:"تخطيط أهداف، تعلم شيء جديد 📚" },
  { id:"ovulatory",  name:"الإباضة",  emoji:"✨", days:"١٤–١٦", color:"#C8963E", bg:"#FFF8E7", border:"#F0D9A0",
    tagline:"ذروة الطاقة — أفضل أيام الشهر",
    hormones:"ذروة الإستروجين + ارتفاع LH",
    eat:["أفوكادو وزيت زيتون 🥑","سمك سلمون 🐟","فاكهة ملونة 🍊","مكسرات 🥜","خضار طازجة 🥗"],
    avoid:["كحول وسكر زيادة","أكل مقلي ثقيل 🍔"],
    tip:"أكلي ألوان قوس قزح — جسمك في أوج قوته! 🌈",
    exercise:"كثافة عالية، رقص، سباحة 🏊", selfcare:"تواصل اجتماعي، مشاريع مهمة 🌟" },
  { id:"luteal",     name:"الأصفر",   emoji:"🌙", days:"١٧–٢٨", color:"#9B72AA", bg:"#F5EBF8", border:"#C8A8D8",
    tagline:"استعدي — جسمك يطلب الاهتمام",
    hormones:"البروجستيرون يرتفع ثم ينخفض",
    eat:["بطاطا حلوة 🍠","كاكاو خام 🍫","سمك تونة 🐟","خضار مطبوخة 🥕","شاي أعشاب 🍵"],
    avoid:["كافيين ☕","ملح وسوديوم 🧂","سكر مكرر 🍪"],
    tip:"رغبتك في السكر حقيقية — اختاري التمر والشوكولاتة الداكنة بدل السكر الأبيض 🌙",
    exercise:"يوجا، بيلاتس، مشي هادئ 🧘", selfcare:"نوم مبكر، جورنال ✍️" },
];

function getCycleInfo(startDate, len=28) {
  if (!startDate) return null;
  const s = new Date(startDate); const t = new Date(); s.setHours(0,0,0,0); t.setHours(0,0,0,0);
  const day = ((Math.floor((t-s)/86400000) % len) + len) % len + 1;
  const phase = day<=5?CYCLE_PHASES[0]:day<=13?CYCLE_PHASES[1]:day<=16?CYCLE_PHASES[2]:CYCLE_PHASES[3];
  const nextPeriod = (() => { const d=new Date(s); while(true){ d.setDate(d.getDate()+len); if(d>t) return d; } })();
  const daysToNext = Math.ceil((nextPeriod-t)/86400000);
  return { phase, day, len, daysToNext };
}

// ─────────────────────────────────────────────
//  CONTENT DATA
// ─────────────────────────────────────────────
const ARTICLES = [
  {
    id:1, emoji:"🔬", category:"PCOS & Hormones", time:"5 min",
    title:"أسباب تكيس المبايض وكيف تؤثر التغذية",
    summary:"تكيس المبايض (PCOS) من أكثر الاضطرابات الهرمونية شيوعاً عند النساء — لكن التغذية الصحيحة تغير كل شيء.",
    body:`تكيس المبايض (PCOS) يؤثر على 1 من كل 10 نساء في سن الإنجاب. الأسباب الرئيسية: مقاومة الإنسولين، ارتفاع الأندروجينات، وخلل في محور الهرمونات.

التغذية العلاجية تُحدث فرقاً حقيقياً:

✅ الكربوهيدرات المعقدة (الشوفان، الكينوا، البطاطا الحلوة) تخفض مقاومة الإنسولين
✅ البروتين في كل وجبة يثبت السكر ويقلل الشهية
✅ الأوميجا 3 (السمك، بذور الكتان) تقلل الالتهاب
✅ القرفة تحسن حساسية الإنسولين

⚠️ ما يجب تجنبه: السكر المكرر، الكربوهيدرات البيضاء، الألبان بكميات كبيرة، والكافيين الزيادة.

النتيجة؟ مع التغذية الصحيحة يمكن تنظيم الدورة، تحسين الخصوبة، وفقدان الوزن بشكل مستدام.`,
    tips:["تناولي وجبة فطور غنية بالبروتين","أضيفي القرفة لقهوتك أو شايك","قللي الكربوهيدرات البيضاء في العشاء"],
  },
  {
    id:2, emoji:"🩸", category:"Insulin Resistance", time:"4 min",
    title:"مقاومة الإنسولين وتأثيرها على الوزن",
    summary:"لماذا تتعبين في إنقاص وزنك رغم الحمية؟ مقاومة الإنسولين قد تكون السبب الخفي.",
    body:`مقاومة الإنسولين تعني أن خلاياك لا تستجيب للإنسولين بشكل صحيح — فيرتفع الإنسولين في الدم ويُخزّن الدهون بدلاً من حرقها.

العلامات التحذيرية:
🔴 صعوبة فقدان وزن رغم الحمية
🔴 رغبة شديدة في السكر بعد الأكل
🔴 تعب بعد الوجبات
🔴 تراكم الدهون في منطقة البطن

خطة التغذية لمقاومة الإنسولين:

1️⃣ نظام Low Glycemic Index — أكلي الأطعمة ذات المؤشر الجلايسيمي المنخفض
2️⃣ تناولي البروتين أولاً في كل وجبة — يبطئ امتصاص السكر
3️⃣ الدهون الصحية (أفوكادو، زيتون، مكسرات) تحسن حساسية الإنسولين
4️⃣ تحركي بعد الأكل — مشي 10 دقائق يخفض سكر الدم 20%`,
    tips:["مشي 10 دقائق بعد الأكل","ابدأي وجباتك بالبروتين والخضار","تجنبي العصائر حتى الطبيعية"],
  },
  {
    id:3, emoji:"🥗", category:"Hormone Nutrition", time:"3 min",
    title:"أفضل 10 أطعمة لتوازن الهرمونات",
    summary:"طعامك هو دواؤك — هذه الأطعمة تدعم الهرمونات بشكل مباشر وتحدث فرقاً ملموساً.",
    body:`الهرمونات تحتاج مواد خام لتُصنع — وهذه الأطعمة توفرها:

🥑 أفوكادو — دهون صحية لبناء هرمون الاستروجين والبروجستيرون
🥦 البروكلي والكرنب — يساعدان في detox الاستروجين الزائد
🐟 السمك الدهني — أوميجا 3 لتقليل الالتهاب وتنظيم الدورة
🌰 بذور الكتان — فيتوإستروجين طبيعي يوازن الهرمونات
🥚 البيض — كوليسترول صحي ضروري لصنع جميع الهرمونات
🍠 البطاطا الحلوة — فيتامين B6 لدعم البروجستيرون
🫐 التوت الداكن — مضادات أكسدة تحمي الخلايا الهرمونية
🌿 الزنجبيل — يقلل التشنجات ويدعم الدورة الطبيعية
🥜 المكسرات — فيتامين E لتوازن الاستروجين
🍵 الشاي الأخضر — يقلل الأندروجينات الزائدة في PCOS`,
    tips:["أضيفي بذور الكتان لأي وجبة","أكلي بيضتين يومياً على الأقل","تناولي التوت كـ snack صحي"],
  },
  {
    id:4, emoji:"⚠️", category:"Diet Mistakes", time:"4 min",
    title:"أخطاء شائعة في الدايت تخرّب الهرمونات",
    summary:"بعض عادات الحمية الشائعة تضر بالهرمونات أكثر مما تنفع — تعرفي عليها.",
    body:`❌ الخطأ الأول: تخطي الفطور
خفض الكورتيزول الصباحي يعتمد على الأكل — تخطي الفطور يرفع هرمون التوتر ويزيد مقاومة الإنسولين.

❌ الخطأ الثاني: الإفراط في قطع الكربوهيدرات
الكربوهيدرات ضرورية لإنتاج السيروتونين والنوم الجيد — القطع الكامل يُحدث خللاً هرمونياً.

❌ الخطأ الثالث: أكل الدهون قليل جداً
الكوليسترول هو المادة الخام لجميع الهرمونات الجنسية — بدون دهون كافية تنخفض الهرمونات.

❌ الخطأ الرابع: الإفراط في الكافيين
فنجانان كافيين محددان — أكثر من ذلك يرفع الكورتيزول ويزيد القلق ويؤخر النوم.

❌ الخطأ الخامس: الحمية الشديدة (Very Low Calorie)
أقل من 1200 سعرة يوقف الحيض ويخفض هرمونات الغدة الدرقية!`,
    tips:["لا تتخطي الفطور أبداً","أكلي دهوناً صحية في كل وجبة","الكافيين بحد أقصى فنجانين يومياً"],
  },
];

const RECIPES = [
  {
    id:1, emoji:"🌅", category:"Breakfast", tag:"Insulin Balance",
    title:"فطور توازن الإنسولين",
    time:"10 دقائق", cal:"320 سعرة",
    desc:"فطور غني بالبروتين يثبت سكر الدم طول اليوم",
    ingredients:["2 بيضة مسلوقة أو مقلية بالهواء","نصف أفوكادو مهروس","شريحة خبز حبوب كاملة","طماطم صغيرة","ملح وأعشاب"],
    steps:["اسلقي البيضتين 7 دقائق","هرسي الأفوكادو مع الملح والليمون","رتبي الكل على الخبز"],
    tip:"أضيفي بذور الكتان للأفوكادو لأوميجا 3 إضافية! 🌰",
  },
  {
    id:2, emoji:"🥣", category:"Anti-inflammatory", tag:"Hormone Support",
    title:"بول مضاد للالتهاب",
    time:"15 دقيقة", cal:"380 سعرة",
    desc:"كيس الشوفان بالتوت والكركم — مضاد التهاب طبيعي",
    ingredients:["نصف كوب شوفان","كوب حليب نباتي","ملعقة كركم","ملعقة زنجبيل","حفنة توت أزرق","ملعقة عسل"],
    steps:["سخني الحليب النباتي","أضيفي الشوفان والكركم والزنجبيل","أطهيه 5 دقائق مع التحريك","زيّني بالتوت والعسل"],
    tip:"الكركم مع الفلفل الأسود يزيد امتصاصه 2000%! 🔥",
  },
  {
    id:3, emoji:"🥜", category:"PCOS Snack", tag:"PCOS Friendly",
    title:"سناك صديق لتكيس المبايض",
    time:"5 دقائق", cal:"180 سعرة",
    desc:"مكسرات وزبادي — توازن مثالي للهرمونات",
    ingredients:["نصف كوب زبادي يوناني خالي الدهون","ملعقة زبدة اللوز","حفنة مكسرات مشكلة","ملعقة قرفة","ملعقة بذور الشيا"],
    steps:["ضعي الزبادي في وعاء","أضيفي زبدة اللوز والقرفة","رشي المكسرات وبذور الشيا"],
    tip:"القرفة تحسن حساسية الإنسولين — أضيفيها لكل وجبة! 🌿",
  },
  {
    id:4, emoji:"🐟", category:"Lunch", tag:"Anti-inflammatory",
    title:"سلمون مع كينوا الهرموني",
    time:"25 دقيقة", cal:"520 سعرة",
    desc:"وجبة متكاملة للهرمونات — بروتين، أوميجا 3، وألياف",
    ingredients:["150 جرام سمك سلمون","نصف كوب كينوا مطبوخة","خيار مقطع","طماطم كرزية","ليمون وزيت زيتون","أعشاب طازجة"],
    steps:["اشوي السلمون 15 دقيقة بالفرن","اطبخي الكينوا بالماء والملح","رتبي الكينوا ثم السلمون","أضيفي الخضار والتتبيلة"],
    tip:"السلمون 3 مرات أسبوعياً يخفض الالتهاب ويوازن الدورة! 🌊",
  },
];

const FAQS = [
  { q:"هل تكيس المبايض يمنع نزول الوزن؟", a:"لا يمنعه، لكن يجعله أصعب بسبب مقاومة الإنسولين. مع التغذية العلاجية المناسبة وخفض الكربوهيدرات المكررة، نزول الوزن ممكن ومستدام. كثير من مريضات PCOS يفقدن وزنهن بشكل أفضل من غيرهن مع البروتوكول الصحيح." },
  { q:"هل الصيام المتقطع مفيد لمقاومة الإنسولين؟", a:"نعم، لكن بحذر. الصيام 14:10 (أي الأكل في نافذة 10 ساعات) مناسب لمعظم النساء. تجنبي الصيام الشديد 18+ ساعة لأنه قد يرفع الكورتيزول ويضر بالهرمونات الأنثوية. دائماً استشيري طبيبتك." },
  { q:"هل الألبان تزيد الهرمونات وتؤثر على PCOS؟", a:"الألبان تحتوي على IGF-1 والهرمونات الطبيعية التي قد تزيد الأندروجينات في بعض النساء. إذا كانت أعراضك تزيد مع الألبان (حبوب البشرة، شعر الوجه)، جربي تقليلها أو استبدالها بالبدائل النباتية لشهر وراقبي الفرق." },
  { q:"ما الفرق بين التغذية العلاجية والدايت العادي؟", a:"التغذية العلاجية تُعالج السبب الجذري — الهرمونات والتمثيل الغذائي — بينما الدايت العادي يركز على السعرات فقط. عندنا نصمم خطة تناسب هرموناتك وتحسن صحتك من الداخل، وليس مجرد خفض سعرات." },
  { q:"هل يمكن تنظيم الدورة الشهرية بالتغذية؟", a:"نعم! كثير من حالات عدم انتظام الدورة مرتبطة بالتغذية. الكالوريات الكافية، الدهون الصحية، وتقليل التوتر الغذائي كلها تدعم تنظيم الدورة. في كثير من الحالات تنتظم الدورة خلال 3 أشهر من التغذية الصحيحة." },
  { q:"متى أرى نتائج مع التغذية العلاجية الهرمونية؟", a:"التغير الهرموني يحتاج وقتاً — دورة هرمونية كاملة حوالي 28 يوماً. معظم العميلات يلاحظن تحسناً في الطاقة والمزاج خلال 2-3 أسابيع، وتحسن في القياسات والوزن خلال 4-6 أسابيع من الالتزام." },
];

const HORMONE_SYMS = [
  { key:"hEnergy",   label:"الطاقة",       type:"scale", icons:["😴","😑","🙂","⚡","🔥"] },
  { key:"hMood",     label:"المزاج",        type:"scale", icons:["😢","😤","😐","😊","🥰"] },
  { key:"hFocus",    label:"التركيز",       type:"scale", icons:["🌫️","😵","🤔","💡","🎯"] },
  { key:"hAppetite", label:"الشهية",        type:"scale", icons:["🚫","😐","🙂","😋","🍽️"] },
  { key:"hBloat",    label:"انتفاخ",        type:"bool",  emoji:"🫃" },
  { key:"hCramps",   label:"تشنجات",        type:"bool",  emoji:"😣" },
  { key:"hHeadache", label:"صداع",          type:"bool",  emoji:"🤕" },
  { key:"hCraving",  label:"رغبة سكر",      type:"bool",  emoji:"🍫" },
  { key:"hGlow",     label:"بشرة مشرقة",    type:"bool",  emoji:"✨" },
  { key:"hInsomnia", label:"صعوبة نوم",     type:"bool",  emoji:"🌙" },
];

const defaultLog = {
  water:"", sleep:"", stress:5, weight:"", waist:"", hips:"", arm:"",
  meals:"", salad:null, fastFood:null, coffee:"", supplements:null,
  followedPlan:null, exercise:null, exerciseMin:"", binge:null, mood:"", note:"",
  period:null, periodPainLevel:0, periodPain:false, periodBloat:false,
  periodMood:false, periodCraving:false, periodFatigue:false, periodHeadache:false,
  photos:{breakfast:null,lunch:null,dinner:null,snack:null},
};

// ─────────────────────────────────────────────
//  STYLES & FONTS
// ─────────────────────────────────────────────
const LOGO_SRC = "data:image/png;base64,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";

const C = {
  bg:"#FDFAF8", card:"#FFFFFF", border:"#EDD9E5", borderSoft:"#F5EBF0",
  pink:"#C2607A", rose:"#D4829A", mauve:"#9B72AA", lavender:"#B8A0CC",
  blush:"#F2D5DF", peach:"#F7E8E0",
  green:"#5DAD85", greenLight:"#E6F5EE", greenBorder:"#A8D9BC",
  text:"#1E1218", sub:"#7A5565", muted:"#B09AA8",
  red:"#C9607A", redLight:"#FFF0F3",
  white:"#FFFFFF", shadow:"rgba(194,96,122,0.10)",
  gold:"#C8963E", goldLight:"#FFF8E7",
};

const FONT = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;900&family=Tajawal:wght@400;500;700;800;900&display=swap');
  * { font-family: 'Tajawal', sans-serif; box-sizing: border-box; }
  .serif { font-family: 'Playfair Display', Georgia, serif !important; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
  @keyframes spin { to{transform:rotate(360deg)} }
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
  @keyframes heartbeat { 0%,100%{transform:scale(1)} 30%{transform:scale(1.3)} 60%{transform:scale(1.1)} }
  .fade-up { animation: fadeUp 0.5s ease forwards; }
  .code-dot { width:14px;height:14px;border-radius:50%;border:2px solid #EDD9E5;transition:all .2s; }
  .code-dot.filled { background:#C2607A;border-color:#C2607A;box-shadow:0 0 8px #C2607A50; }
  .numpad { width:70px;height:56px;background:#FDFAF8;border:1.5px solid #EDD9E5;border-radius:14px;font-size:20px;font-weight:700;color:#1E1218;cursor:pointer;transition:all .15s;font-family:'Tajawal',sans-serif; }
  .numpad:active { background:#F2D5DF;border-color:#C2607A;transform:scale(.94); }
  .tab-btn { flex:1;padding:11px 0 8px;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:all .2s; }
  .yn-btn { flex:1;padding:11px 8px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;font-family:'Tajawal',sans-serif; }
`;

// Shared layout primitives
const page = { background:C.bg, minHeight:"100vh", padding:"0 0 100px", direction:"rtl" };
const wrap = { maxWidth:480, margin:"0 auto", padding:"0 16px" };
const card = { background:C.white, border:`1px solid ${C.border}`, borderRadius:20, padding:"18px 18px", marginBottom:14, boxShadow:`0 2px 12px ${C.shadow}` };
const lbl = { fontSize:13, color:C.sub, fontWeight:700, display:"block", marginBottom:6 };

// ─────────────────────────────────────────────
//  SMALL COMPONENTS
// ─────────────────────────────────────────────
function Chip({ label, value, color }) {
  return (
    <div style={{ background:`${color}15`, border:`1px solid ${color}40`, borderRadius:12, padding:"10px 12px", textAlign:"center" }}>
      <div style={{ fontSize:15, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:10, color:C.muted, fontWeight:600, marginTop:1 }}>{label}</div>
    </div>
  );
}
function Tag({ text, color }) {
  return <span style={{ background:`${color}18`, border:`1px solid ${color}40`, borderRadius:99, padding:"3px 10px", fontSize:11, color, fontWeight:700 }}>{text}</span>;
}
function Field({ label, ...rest }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <label style={lbl}>{label}</label>
      <input {...rest} style={{ padding:"11px 14px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.bg, color:C.text, fontSize:14, fontWeight:600, outline:"none", width:"100%", direction:"rtl", fontFamily:"'Tajawal',sans-serif" }}/>
    </div>
  );
}
function YesNo({ label, value, onChange, yColor=C.green }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      <label style={lbl}>{label}</label>
      <div style={{ display:"flex", gap:8 }}>
        <button className="yn-btn" onClick={()=>onChange(true)} style={{ background:value===true?yColor:C.bg, border:`1.5px solid ${value===true?yColor:C.border}`, color:value===true?"white":C.muted }}>نعم ✓</button>
        <button className="yn-btn" onClick={()=>onChange(false)} style={{ background:value===false?C.red:C.bg, border:`1.5px solid ${value===false?C.red:C.border}`, color:value===false?"white":C.muted }}>لا ✗</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  BOTTOM NAV
// ─────────────────────────────────────────────
function MemberNav({ active, onChange }) {
  const tabs = [
    { id:"home",    icon:"🏠", label:"الرئيسية" },
    { id:"checkin", icon:"📋", label:"يومي" },
    { id:"cycle",   icon:"🌙", label:"دورتي" },
    { id:"tracker", icon:"🧬", label:"الأعراض" },
    { id:"library", icon:"📚", label:"مكتبة" },
    { id:"chat",    icon:"💬", label:"الدكتورة" },
  ];
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:C.white, borderTop:`1.5px solid ${C.border}`, display:"flex", zIndex:100, boxShadow:"0 -4px 20px rgba(0,0,0,0.07)", paddingBottom:"env(safe-area-inset-bottom)" }}>
      {tabs.map(t=>(
        <button key={t.id} className="tab-btn" onClick={()=>onChange(t.id)}>
          <span style={{ fontSize:20 }}>{t.icon}</span>
          <span style={{ fontSize:9, fontWeight:800, color:active===t.id?C.pink:C.muted }}>{t.label}</span>
          {active===t.id && <div style={{ width:16, height:2.5, borderRadius:99, background:C.pink }}/>}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
//  GUEST HOME
// ─────────────────────────────────────────────

// ── HORMONE QUIZ ──
function QuizSection({ onLogin }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  const questions = [
    { q:"كيف دورتك الشهرية؟", key:"cycle", options:[{l:"منتظمة ✅",v:0},{l:"غير منتظمة أحياناً 😐",v:1},{l:"غير منتظمة دايماً ⚠️",v:2},{l:"مش بيجي 🔴",v:3}] },
    { q:"مستوى طاقتك خلال اليوم؟", key:"energy", options:[{l:"ممتاز ⚡",v:0},{l:"مقبول 🙂",v:1},{l:"تعب مزمن 😴",v:2},{l:"إرهاق شديد 🔴",v:3}] },
    { q:"عندك أعراض PCOS؟", key:"pcos", options:[{l:"لأ ✅",v:0},{l:"شعر زائد بس 🤔",v:1},{l:"حبوب + شعر زائد ⚠️",v:2},{l:"مشخصة PCOS 🔴",v:3}] },
    { q:"وزنك بيتغير بسهولة؟", key:"weight", options:[{l:"متحكمة فيه ✅",v:0},{l:"صعب شوية 🙂",v:1},{l:"صعب جداً ⚠️",v:2},{l:"بيزيد وما ينزلش 🔴",v:3}] },
    { q:"مزاجك وقلقك؟", key:"mood", options:[{l:"مستقر ✅",v:0},{l:"تقلبات خفيفة 🙂",v:1},{l:"تقلبات كتير ⚠️",v:2},{l:"قلق/اكتئاب مزمن 🔴",v:3}] },
  ];

  function calcResult() {
    const total = Object.values(answers).reduce((a,b)=>a+b,0);
    if (total <= 3) return { level:"متوازنة هرمونياً 🌟", color:C.green, bg:C.greenLight, border:C.greenBorder, msg:"جسمك في توازن ممتاز! استمري على نمط حياتك الصحي مع متابعة دورية.", plan:"متابعة وقائية — شهر واحد" };
    if (total <= 7) return { level:"خلل هرموني خفيف 🌙", color:C.gold, bg:C.goldLight, border:"#E8C87A", msg:"في بعض الاختلال الهرموني اللي يحتاج انتباه. خطة التغذية المناسبة هتساعدك تتوازني.", plan:"خطة تصحيح — شهر إلى شهرين" };
    return { level:"خلل هرموني واضح ⚠️", color:C.red, bg:C.redLight, border:`${C.red}40`, msg:"جسمك محتاج تدخل تغذوي متخصص. Dr. Mai هتعمل خطة علاجية مخصصة لحالتك.", plan:"برنامج علاجي — شهرين إلى 3 أشهر" };
  }

  if (result) return (
    <div className="fade-up" style={{ ...wrap, paddingTop:20 }}>
      <div style={{ ...card, textAlign:"center", background:result.bg, border:`2px solid ${result.border}`, marginBottom:16 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🧬</div>
        <div style={{ fontSize:11, color:result.color, fontWeight:700, letterSpacing:2, marginBottom:8 }}>نتيجة اختبارك</div>
        <div style={{ fontSize:22, fontWeight:900, color:result.color, marginBottom:12 }}>{result.level}</div>
        <div style={{ fontSize:13, color:C.sub, fontWeight:500, lineHeight:1.8, marginBottom:16 }}>{result.msg}</div>
        <div style={{ background:"white", borderRadius:12, padding:"12px 16px", marginBottom:16 }}>
          <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:4 }}>الخطة المقترحة لك</div>
          <div style={{ fontSize:14, fontWeight:800, color:result.color }}>{result.plan}</div>
        </div>
        <button onClick={onLogin} style={{ width:"100%", padding:"14px 0", borderRadius:14, background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", color:"white", fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:10 }}>
          🌸 ابدأي خطتك المخصصة
        </button>
        <button onClick={()=>{setStep(0);setAnswers({});setResult(null);}} style={{ background:"none", border:"none", color:C.muted, fontSize:12, fontWeight:600, cursor:"pointer" }}>
          إعادة الاختبار
        </button>
      </div>
    </div>
  );

  const q = questions[step];
  return (
    <div className="fade-up">
      <div style={{ textAlign:"center", marginBottom:20 }}>
        <div style={{ fontSize:13, color:C.mauve, fontWeight:700, letterSpacing:2, marginBottom:6 }}>HORMONE QUIZ</div>
        <h2 style={{ fontSize:22, fontWeight:900, color:C.text, margin:"0 0 8px" }}>اختبري وضعك الهرموني 🧬</h2>
        <p style={{ fontSize:13, color:C.sub }}>5 أسئلة فقط — نتيجة فورية</p>
      </div>

      {/* Progress */}
      <div style={{ display:"flex", gap:4, marginBottom:20 }}>
        {questions.map((_,i)=>(
          <div key={i} style={{ flex:1, height:4, borderRadius:99, background:i<=step?C.pink:C.borderSoft, transition:"background .3s" }}/>
        ))}
      </div>

      <div style={{ ...card, marginBottom:16 }}>
        <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:10 }}>سؤال {step+1} من {questions.length}</div>
        <div style={{ fontSize:17, fontWeight:800, color:C.text, marginBottom:20, lineHeight:1.5 }}>{q.q}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {q.options.map((o,i)=>(
            <button key={i} onClick={()=>{
              const newA = {...answers, [q.key]:o.v};
              setAnswers(newA);
              if (step < questions.length-1) { setStep(s=>s+1); }
              else { setResult(calcResult()); }
            }} style={{ padding:"13px 16px", borderRadius:12, border:`1.5px solid ${answers[q.key]===o.v?C.pink:C.border}`, background:answers[q.key]===o.v?C.blush:C.bg, color:answers[q.key]===o.v?C.pink:C.text, fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"right", transition:"all .15s" }}>
              {o.l}
            </button>
          ))}
        </div>
      </div>
      {step > 0 && <button onClick={()=>setStep(s=>s-1)} style={{ background:"none", border:"none", color:C.muted, fontSize:13, fontWeight:600, cursor:"pointer" }}>← السابق</button>}
    </div>
  );
}

function GuestHome({ onLogin }) {
  const [guestTab, setGuestTab] = useState("home");
  const [openArticle, setOpenArticle] = useState(null);
  const [openRecipe, setOpenRecipe] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  if (openArticle) {
    const a = ARTICLES.find(x=>x.id===openArticle);
    return (
      <div style={page}>
        <style>{FONT}</style>
        <div style={{ ...wrap, paddingTop:20 }}>
          <button onClick={()=>setOpenArticle(null)} style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700, color:C.sub, cursor:"pointer", marginBottom:20 }}>← رجوع</button>
          <div style={{ ...card, padding:"24px 20px" }}>
            <div style={{ fontSize:48, textAlign:"center", marginBottom:16 }}>{a.emoji}</div>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <Tag text={a.category} color={C.mauve}/>
              <Tag text={`⏱ ${a.time}`} color={C.muted}/>
            </div>
            <h1 className="serif" style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:12, lineHeight:1.5 }}>{a.title}</h1>
            <p style={{ fontSize:14, color:C.sub, fontWeight:500, lineHeight:1.9, marginBottom:20, whiteSpace:"pre-line" }}>{a.body}</p>
            <div style={{ background:C.greenLight, border:`1px solid ${C.greenBorder}`, borderRadius:14, padding:"14px 16px", marginBottom:24 }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.green, marginBottom:8 }}>💡 نصائح عملية</div>
              {a.tips.map((t,i)=><div key={i} style={{ fontSize:13, color:C.text, fontWeight:600, padding:"4px 0", display:"flex", gap:8 }}><span style={{ color:C.green }}>✓</span>{t}</div>)}
            </div>
            <button onClick={onLogin} style={{ width:"100%", padding:"15px 0", borderRadius:16, background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", color:"white", fontSize:15, fontWeight:800, cursor:"pointer", boxShadow:`0 6px 20px ${C.shadow}` }}>
              🌸 Start Your Personalized Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (openRecipe) {
    const r = RECIPES.find(x=>x.id===openRecipe);
    return (
      <div style={page}>
        <style>{FONT}</style>
        <div style={{ ...wrap, paddingTop:20 }}>
          <button onClick={()=>setOpenRecipe(null)} style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700, color:C.sub, cursor:"pointer", marginBottom:20 }}>← رجوع</button>
          <div style={{ ...card, padding:"24px 20px" }}>
            <div style={{ fontSize:48, textAlign:"center", marginBottom:16 }}>{r.emoji}</div>
            <Tag text={r.tag} color={C.mauve}/>
            <h1 className="serif" style={{ fontSize:20, fontWeight:700, color:C.text, margin:"12px 0 6px", lineHeight:1.5 }}>{r.title}</h1>
            <p style={{ fontSize:13, color:C.sub, marginBottom:16 }}>{r.desc}</p>
            <div style={{ display:"flex", gap:12, marginBottom:20 }}>
              <Chip label="وقت التحضير" value={r.time} color={C.mauve}/>
              <Chip label="السعرات" value={r.cal} color={C.pink}/>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:8 }}>🛒 المكونات</div>
              {r.ingredients.map((ing,i)=><div key={i} style={{ fontSize:13, color:C.sub, padding:"5px 0", borderBottom:`1px solid ${C.borderSoft}`, display:"flex", gap:8 }}><span style={{ color:C.pink }}>•</span>{ing}</div>)}
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:8 }}>👩‍🍳 طريقة التحضير</div>
              {r.steps.map((s,i)=><div key={i} style={{ fontSize:13, color:C.sub, padding:"5px 0", display:"flex", gap:10 }}><span style={{ width:20, height:20, background:C.blush, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:C.pink, flexShrink:0 }}>{i+1}</span>{s}</div>)}
            </div>
            <div style={{ background:C.peach, border:"1px solid #F0D8CC", borderRadius:12, padding:"10px 14px", marginBottom:24, fontSize:13, color:C.sub, fontWeight:600 }}>✨ {r.tip}</div>
            <button onClick={onLogin} style={{ width:"100%", padding:"15px 0", borderRadius:16, background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", color:"white", fontSize:15, fontWeight:800, cursor:"pointer" }}>
              🌸 Get Your Full Meal Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  const GUEST_TABS = [
    { id:"home",     icon:"🏠", label:"Home" },
    { id:"packages", icon:"💎", label:"الباقات" },
    { id:"services", icon:"🩺", label:"خدماتنا" },
    { id:"quiz",     icon:"🧬", label:"اختبري" },
    { id:"stories",  icon:"⭐", label:"قصص" },
    { id:"articles", icon:"📖", label:"مقالات" },
    { id:"recipes",  icon:"🥗", label:"وصفات" },
    { id:"faq",      icon:"❓", label:"FAQ" },
  ];

  return (
    <div style={page}>
      <style>{FONT}</style>

      {/* Top Bar */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src={LOGO_SRC} alt="NM" style={{ background:"white", borderRadius:6, padding:2, width:36, height:36 }}/>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:C.text, lineHeight:1.2, fontFamily:"'Poppins','Tajawal',sans-serif" }}>Nutrime</div>
            <div style={{ fontSize:9, color:C.muted, fontWeight:600, letterSpacing:1 }}>By Dr Mai ElBanna</div>
          </div>
        </div>
        <button onClick={onLogin} style={{ background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", borderRadius:12, color:"white", padding:"9px 18px", fontSize:12, fontWeight:800, cursor:"pointer" }}>
          🔑 Sign In
        </button>
      </div>

      {/* Guest Nav */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, display:"flex", overflowX:"auto", padding:"0 12px" }}>
        {GUEST_TABS.map(t=>(
          <button key={t.id} onClick={()=>setGuestTab(t.id)} style={{ padding:"12px 16px", background:"none", border:"none", borderBottom:`2.5px solid ${guestTab===t.id?C.pink:"transparent"}`, fontSize:12, fontWeight:800, color:guestTab===t.id?C.pink:C.muted, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"'Tajawal',sans-serif" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ ...wrap, paddingTop:20 }}>

        {/* HOME TAB */}
        {guestTab==="home" && (
          <div className="fade-up">

            {/* HERO */}
            <div style={{ background:"linear-gradient(135deg,#6B2FA0,#C2607A,#E8A0B4)", borderRadius:28, padding:"40px 24px 36px", marginBottom:20, textAlign:"center", position:"relative", overflow:"hidden" }}>
              {/* decorative circles */}
              <div style={{ position:"absolute", top:-30, right:-30, width:140, height:140, borderRadius:"50%", background:"rgba(255,255,255,0.08)" }}/>
              <div style={{ position:"absolute", bottom:-40, left:-20, width:100, height:100, borderRadius:"50%", background:"rgba(255,255,255,0.06)" }}/>
              <div style={{ position:"absolute", top:"50%", left:-10, transform:"translateY(-50%)", width:60, height:180, borderRadius:99, background:"rgba(255,255,255,0.04)" }}/>
              {/* female line art */}
              <div style={{ position:"relative", marginBottom:20 }}>
                <svg width="80" height="100" viewBox="0 0 80 100" style={{ margin:"0 auto", display:"block", opacity:0.9 }}>
                  <circle cx="40" cy="18" r="12" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"/>
                  <path d="M40 30 Q28 45 25 65 Q22 80 30 85 Q40 88 50 85 Q58 80 55 65 Q52 45 40 30" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"/>
                  <path d="M30 50 Q15 55 12 68" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M50 50 Q65 55 68 68" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M33 75 Q30 88 28 95" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M47 75 Q50 88 52 95" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="55" cy="40" r="4" fill="rgba(255,255,255,0.2)"/>
                  <circle cx="58" cy="38" r="2" fill="rgba(255,255,255,0.15)"/>
                </svg>
              </div>
              <div style={{ position:"relative" }}>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.8)", fontWeight:700, letterSpacing:3, marginBottom:6, fontFamily:"'Poppins',sans-serif", textTransform:"uppercase" }}>Welcome to</div>
                <h1 style={{ fontSize:32, fontWeight:900, color:"white", margin:"0 0 4px", lineHeight:1.2, fontFamily:"'Poppins',sans-serif" }}>Nutrime</h1>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.85)", fontWeight:600, marginBottom:16, fontFamily:"'Poppins',sans-serif" }}>By Dr Mai ElBanna</div>
                <div style={{ width:40, height:2, background:"rgba(255,255,255,0.4)", margin:"0 auto 18px", borderRadius:99 }}/>
                <div style={{ background:"rgba(255,255,255,0.15)", borderRadius:14, padding:"12px 16px", marginBottom:16, backdropFilter:"blur(4px)" }}>
                  <div style={{ fontSize:14, color:"white", fontWeight:700, lineHeight:1.8, direction:"rtl" }}>
                    "مش دايت… دي خطة علاج مخصصة لجسمك 💜"
                  </div>
                </div>
                <p style={{ fontSize:12, color:"rgba(255,255,255,0.85)", fontWeight:500, lineHeight:1.9, marginBottom:20, direction:"rtl" }}>
                  متابعة أونلاين للتغذية العلاجية وصحة المرأة<br/>بناءً على حالتك وهرموناتك<br/>
                  <span style={{ fontWeight:700 }}>👩‍⚕️ بإشراف دكاترة متخصصة</span>
                </p>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.9)", fontWeight:800, letterSpacing:1, marginBottom:24, fontFamily:"'Poppins',sans-serif", fontStyle:"italic" }}>
                  "Balance Your Hormones. Transform Your Life."
                </div>
                <button onClick={onLogin} style={{ background:"rgba(255,255,255,0.95)", border:"none", borderRadius:16, color:C.pink, padding:"14px 32px", fontSize:14, fontWeight:900, cursor:"pointer", boxShadow:"0 8px 24px rgba(0,0,0,0.2)", fontFamily:"'Poppins',sans-serif" }}>
                  🌸 Start Your Personalized Plan
                </button>
              </div>
            </div>

            {/* About Dr Mai */}
            <div style={{ ...card, background:"linear-gradient(135deg,#FDF8F5,#F5EBF8)", marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.mauve, fontWeight:700, letterSpacing:2, marginBottom:12, textTransform:"uppercase" }}>About</div>
              <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                <div style={{ width:60, height:60, borderRadius:"50%", background:`linear-gradient(135deg,${C.mauve},${C.pink})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0, boxShadow:`0 4px 16px ${C.shadow}` }}>👩‍⚕️</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:17, fontWeight:900, color:C.text, marginBottom:2, fontFamily:"'Poppins',sans-serif" }}>Dr. Mai ElBanna</div>
                  <div style={{ fontSize:11, color:C.mauve, fontWeight:700, letterSpacing:0.5, marginBottom:10, lineHeight:1.5 }}>
                    Lecturer of Women's Health Physiotherapy & Clinical Nutrition
                  </div>
                  <div style={{ fontSize:12, color:C.sub, fontWeight:500, lineHeight:1.9, marginBottom:10 }}>
                    PhD holder from Cairo University in Women's Health Physiotherapy, with advanced qualifications in clinical nutrition, including a diploma from the American University in Cairo.
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {[
                      "🎓 PhD — Women's Health Physiotherapy, Cairo University",
                      "🏛️ Clinical Nutrition Diploma — American University in Cairo",
                      "💊 PCOS & Insulin Resistance Specialist",
                      "⭐ 100% Online Personalized Follow-up"
                    ].map((x,i)=>(
                      <div key={i} style={{ fontSize:12, color:C.sub, fontWeight:600, display:"flex", gap:6, alignItems:"flex-start" }}>{x}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Services */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              {[
                { icon:"🔬", title:"PCOS Support", desc:"خطة علاجية لتكيس المبايض", color:C.pink },
                { icon:"🩸", title:"Insulin Balance", desc:"تنظيم مقاومة الإنسولين", color:C.gold },
                { icon:"🌙", title:"Cycle Sync", desc:"تغذية موافقة للدورة", color:C.mauve },
                { icon:"⚖️", title:"Hormone Reset", desc:"توازن هرموني شامل", color:C.green },
              ].map((s,i)=>(
                <div key={i} style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:16, padding:"14px 12px", cursor:"pointer" }} onClick={onLogin}>
                  <div style={{ fontSize:24, marginBottom:8 }}>{s.icon}</div>
                  <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:3, fontFamily:"'Poppins',sans-serif" }}>{s.title}</div>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:500 }}>{s.desc}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div style={{ ...card, textAlign:"center", background:"linear-gradient(135deg,#FDF0F4,#F5EBF8)", border:`1.5px dashed ${C.border}` }}>
              <div style={{ fontSize:28, marginBottom:8 }}>✨</div>
              <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:6, fontFamily:"'Poppins',sans-serif" }}>Ready to balance your hormones?</div>
              <div style={{ fontSize:13, color:C.sub, fontWeight:500, lineHeight:1.8, marginBottom:16 }}>
                ابدأي رحلتك مع متابعة شخصية<br/>خطة مخصصة لهرموناتك بالكامل
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
                <button onClick={onLogin} style={{ background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", borderRadius:14, color:"white", padding:"13px 24px", fontSize:13, fontWeight:800, cursor:"pointer" }}>
                  ابدأي رحلتك 🌸
                </button>
                <a href="https://wa.me/201000423752" style={{ display:"inline-block", background:"#25D366", border:"none", borderRadius:14, color:"white", padding:"13px 24px", fontSize:13, fontWeight:800, textDecoration:"none" }}>
                  واتساب 💬
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ARTICLES TAB */}


        {/* ── QUIZ TAB ── */}
        {guestTab==="quiz" && (
          <QuizSection onLogin={onLogin} />
        )}

        {/* ── SUCCESS STORIES TAB ── */}
        {guestTab==="stories" && (
          <div className="fade-up">
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:13, color:C.mauve, fontWeight:700, letterSpacing:2, marginBottom:6 }}>SUCCESS STORIES</div>
              <h2 style={{ fontSize:24, fontWeight:900, color:C.text, margin:"0 0 8px" }}>قصص نجاح 🌸</h2>
              <p style={{ fontSize:13, color:C.sub, fontWeight:500 }}>عملاء حقيقيات — نتائج حقيقية</p>
            </div>
            {[
              { name:"سوسو", months:1, result:"فقدت 5 كجم وانتظمت دورتها", before:"كانت تعاني من PCOS وتقلبات هرمونية شديدة", emoji:"🌟", tag:"PCOS" },
              { name:"مريم", months:2, result:"تحسّن مستوى الإنسولين بشكل ملحوظ", before:"مقاومة إنسولين وتعب مزمن", emoji:"💪", tag:"Insulin" },
              { name:"إسراء", months:1, result:"انتظام الدورة وتقليل آلام الطمث 80%", before:"دورة غير منتظمة منذ سنوات", emoji:"🌙", tag:"Cycle" },
              { name:"نورين", months:2, result:"فقدان 8 كجم مع توازن هرموني كامل", before:"صعوبة في إنقاص الوزن رغم الحمية", emoji:"⚡", tag:"Weight" },
            ].map((s,i)=>(
              <div key={i} style={{ ...card, marginBottom:14, background:"linear-gradient(135deg,#FDFAF8,#F5EBF8)" }}>
                <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
                  <div style={{ width:48, height:48, borderRadius:"50%", background:`linear-gradient(135deg,${C.pink},${C.mauve})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{s.emoji}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:900, color:C.text }}>{s.name}</div>
                    <div style={{ display:"flex", gap:6, marginTop:3 }}>
                      <span style={{ background:C.blush, color:C.pink, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99 }}>{s.tag}</span>
                      <span style={{ background:C.greenLight, color:C.green, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99 }}>{s.months} شهر</span>
                    </div>
                  </div>
                </div>
                <div style={{ background:C.redLight, borderRadius:10, padding:"10px 12px", marginBottom:10, fontSize:12, color:C.sub, fontWeight:500 }}>
                  قبل: {s.before}
                </div>
                <div style={{ background:C.greenLight, border:`1px solid ${C.greenBorder}`, borderRadius:10, padding:"10px 12px", fontSize:13, color:C.green, fontWeight:700 }}>
                  ✅ {s.result}
                </div>
              </div>
            ))}
            <div style={{ ...card, textAlign:"center", background:"linear-gradient(135deg,#6B2FA0,#C2607A)", border:"none" }}>
              <div style={{ fontSize:24, marginBottom:8 }}>🌸</div>
              <div style={{ fontSize:16, fontWeight:900, color:"white", marginBottom:6 }}>ابدأي قصتك مع Dr. Mai</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.85)", marginBottom:16 }}>انضمي لمئات العملاء اللي غيّرن حياتهن</div>
              <button onClick={onLogin} style={{ background:"rgba(255,255,255,0.95)", border:"none", borderRadius:14, color:C.pink, padding:"13px 28px", fontSize:14, fontWeight:900, cursor:"pointer" }}>
                ابدأي رحلتك الآن ←
              </button>
            </div>
          </div>
        )}

        {/* PACKAGES TAB */}
        {guestTab==="packages" && (
          <div className="fade-up">
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:13, color:C.mauve, fontWeight:700, letterSpacing:2, marginBottom:6, textTransform:"uppercase" }}>Our Plans</div>
              <h2 style={{ fontSize:24, fontWeight:900, color:C.text, margin:"0 0 8px" }}>اختاري باقتك</h2>
              <p style={{ fontSize:13, color:C.sub, fontWeight:500 }}>خطة مخصصة لهرموناتك وصحتك</p>
            </div>

            {/* Package 1 - 1 Month */}
            <div style={{ ...card, border:`2px solid ${C.border}`, marginBottom:14, position:"relative" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:11, color:C.mauve, fontWeight:700, letterSpacing:1, marginBottom:4 }}>PLAN 01</div>
                  <div style={{ fontSize:20, fontWeight:900, color:C.text }}>شهر متابعة</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:28, fontWeight:900, color:C.pink }}>4</div>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>جلسات</div>
                </div>
              </div>
              {["✓ 4 جلسات أسبوعية متابعة","✓ خطة غذائية مخصصة","✓ متابعة على الواتساب","✓ تقييم هرموني أولي"].map((f,i)=>(
                <div key={i} style={{ fontSize:13, color:C.sub, fontWeight:600, padding:"6px 0", borderBottom:i<3?`1px solid ${C.borderSoft}`:"none", display:"flex", gap:8 }}>
                  <span style={{ color:C.green }}>✓</span>{f.replace("✓ ","")}
                </div>
              ))}
              <button onClick={onLogin} style={{ width:"100%", marginTop:16, padding:"13px 0", borderRadius:14, background:C.bg, border:`2px solid ${C.pink}`, color:C.pink, fontSize:14, fontWeight:800, cursor:"pointer" }}>
                ابدأي الآن ←
              </button>
            </div>

            {/* Package 2 - 2 Months - FEATURED */}
            <div style={{ ...card, border:`2px solid ${C.pink}`, marginBottom:14, position:"relative", background:"linear-gradient(135deg,#FDF0F4,#F5EBF8)" }}>
              <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:`linear-gradient(135deg,${C.pink},${C.mauve})`, color:"white", fontSize:11, fontWeight:800, padding:"4px 16px", borderRadius:99 }}>
                الأكثر طلباً ⭐
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, marginTop:8 }}>
                <div>
                  <div style={{ fontSize:11, color:C.mauve, fontWeight:700, letterSpacing:1, marginBottom:4 }}>PLAN 02</div>
                  <div style={{ fontSize:20, fontWeight:900, color:C.text }}>شهرين متابعة</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:28, fontWeight:900, color:C.pink }}>8</div>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>جلسات</div>
                </div>
              </div>
              {["4 جلسات شهرياً","خطة غذائية محدّثة كل شهر","متابعة يومية واتساب","تقييم هرموني + تحليل دورة","تعديل الخطة حسب التقدم"].map((f,i)=>(
                <div key={i} style={{ fontSize:13, color:C.sub, fontWeight:600, padding:"6px 0", borderBottom:i<4?`1px solid ${C.borderSoft}`:"none", display:"flex", gap:8 }}>
                  <span style={{ color:C.green }}>✓</span>{f}
                </div>
              ))}
              <button onClick={onLogin} style={{ width:"100%", marginTop:16, padding:"13px 0", borderRadius:14, background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", color:"white", fontSize:14, fontWeight:800, cursor:"pointer", boxShadow:`0 6px 20px ${C.shadow}` }}>
                ابدأي الآن ←
              </button>
            </div>

            {/* Package 3 - 3 Months */}
            <div style={{ ...card, border:`2px solid ${C.mauve}`, marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:11, color:C.mauve, fontWeight:700, letterSpacing:1, marginBottom:4 }}>PLAN 03</div>
                  <div style={{ fontSize:20, fontWeight:900, color:C.text }}>3 أشهر متابعة</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:28, fontWeight:900, color:C.mauve }}>12</div>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>جلسة</div>
                </div>
              </div>
              {["4 جلسات شهرياً","خطة غذائية شاملة ومحدّثة","متابعة يومية واتساب","تحليل هرموني كامل","تعديل مستمر حسب التقدم","دعم نفسي وتغذوي متكامل"].map((f,i)=>(
                <div key={i} style={{ fontSize:13, color:C.sub, fontWeight:600, padding:"6px 0", borderBottom:i<5?`1px solid ${C.borderSoft}`:"none", display:"flex", gap:8 }}>
                  <span style={{ color:C.mauve }}>✓</span>{f}
                </div>
              ))}
              <button onClick={onLogin} style={{ width:"100%", marginTop:16, padding:"13px 0", borderRadius:14, background:`linear-gradient(135deg,${C.mauve},${C.lavender})`, border:"none", color:"white", fontSize:14, fontWeight:800, cursor:"pointer" }}>
                ابدأي الآن ←
              </button>
            </div>

            {/* WhatsApp CTA */}
            <div style={{ ...card, textAlign:"center", background:"linear-gradient(135deg,#E8F8F0,#D4F5E4)", border:`1.5px solid ${C.greenBorder}` }}>
              <div style={{ fontSize:28, marginBottom:8 }}>💬</div>
              <div style={{ fontSize:15, fontWeight:800, color:"#1A5C3A", marginBottom:6 }}>مش عارفة تختاري؟</div>
              <div style={{ fontSize:13, color:"#2D7A50", fontWeight:500, marginBottom:14 }}>تواصلي مع Dr. Mai على واتساب وهتساعدك تختاري الباقة المناسبة</div>
              <a href="https://wa.me/201000423752" style={{ display:"inline-block", background:"#25D366", border:"none", borderRadius:14, color:"white", padding:"13px 28px", fontSize:14, fontWeight:800, textDecoration:"none" }}>
                واتساب مباشر 💬
              </a>
            </div>
          </div>
        )}

        {/* SERVICES TAB */}
        {guestTab==="services" && (
          <div className="fade-up">
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:13, color:C.mauve, fontWeight:700, letterSpacing:2, marginBottom:6, textTransform:"uppercase" }}>What We Offer</div>
              <h2 style={{ fontSize:24, fontWeight:900, color:C.text, margin:"0 0 8px" }}>خدماتنا</h2>
              <p style={{ fontSize:13, color:C.sub, fontWeight:500 }}>رعاية متكاملة لصحتك الهرمونية</p>
            </div>

            {[
              { icon:"🔬", title:"PCOS & تكيس المبايض", color:C.pink, bg:"#FFF0F4", border:C.rose,
                desc:"خطة علاجية مخصصة لتنظيم الهرمونات، تحسين الإباضة، وتقليل أعراض PCOS من خلال التغذية العلاجية.",
                points:["تنظيم مستوى الأندروجين","تحسين حساسية الإنسولين","دعم الخصوبة الطبيعية","تقليل الشعر الزائد والأعراض"] },
              { icon:"🩸", title:"مقاومة الإنسولين", color:C.gold, bg:"#FFFBF0", border:"#E8C87A",
                desc:"برنامج متخصص لتحسين استجابة الخلايا للإنسولين وتنظيم مستوى السكر في الدم.",
                points:["خطة غذائية منخفضة الجلايسيمي","تحسين حساسية الخلايا","إدارة الوزن بفعالية","تقليل خطر السكري"] },
              { icon:"🌙", title:"صحة الدورة الشهرية", color:C.mauve, bg:"#F5EBF8", border:C.lavender,
                desc:"متابعة متخصصة لتنظيم الدورة وتخفيف الأعراض المصاحبة لها من خلال التغذية الموافقة للدورة.",
                points:["تنظيم الدورة الشهرية","تقليل آلام الطمث","تغذية موافقة للمراحل الأربع","دعم التوازن الهرموني"] },
              { icon:"⚖️", title:"إدارة الوزن الهرموني", color:C.green, bg:C.greenLight, border:C.greenBorder,
                desc:"برنامج لإدارة الوزن يراعي الحالة الهرمونية والاستقلابية لكل عميلة بشكل فردي.",
                points:["تقييم هرموني شامل","خطة سعرات مخصصة","دعم الاستقلاب","متابعة أسبوعية للتقدم"] },
            ].map((s,i)=>(
              <div key={i} style={{ ...card, background:s.bg, border:`1.5px solid ${s.border}`, marginBottom:14 }}>
                <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:12 }}>
                  <div style={{ fontSize:32, flexShrink:0 }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize:16, fontWeight:900, color:s.color, marginBottom:4 }}>{s.title}</div>
                    <div style={{ fontSize:12, color:C.sub, fontWeight:500, lineHeight:1.7 }}>{s.desc}</div>
                  </div>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {s.points.map((p,j)=>(
                    <div key={j} style={{ background:"white", border:`1px solid ${s.border}`, borderRadius:8, padding:"5px 10px", fontSize:11, color:s.color, fontWeight:700 }}>✓ {p}</div>
                  ))}
                </div>
              </div>
            ))}

            {/* WhatsApp button */}
            <div style={{ ...card, textAlign:"center", background:"linear-gradient(135deg,#E8F8F0,#D4F5E4)", border:`1.5px solid ${C.greenBorder}` }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#1A5C3A", marginBottom:6 }}>ابدأي رحلتك مع Dr. Mai 🌸</div>
              <div style={{ fontSize:13, color:"#2D7A50", fontWeight:500, marginBottom:14 }}>تواصلي معها مباشرة على واتساب</div>
              <a href="https://wa.me/201000423752" style={{ display:"inline-block", background:"#25D366", border:"none", borderRadius:14, color:"white", padding:"13px 28px", fontSize:14, fontWeight:800, textDecoration:"none" }}>
                💬 تواصلي على واتساب
              </a>
            </div>
          </div>
        )}
        {guestTab==="articles" && (
          <div className="fade-up">
            <div className="serif" style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:4 }}>Hormone Health</div>
            <div className="serif" style={{ fontSize:14, color:C.rose, marginBottom:20 }}>Articles & Education</div>
            {ARTICLES.map(a=>(
              <div key={a.id} style={{ ...card, cursor:"pointer" }} onClick={()=>setOpenArticle(a.id)}>
                <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                  <div style={{ fontSize:36, flexShrink:0 }}>{a.emoji}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                      <Tag text={a.category} color={C.mauve}/>
                      <Tag text={`⏱ ${a.time}`} color={C.muted}/>
                    </div>
                    <div className="serif" style={{ fontSize:15, fontWeight:700, color:C.text, lineHeight:1.5 }}>{a.title}</div>
                    <div style={{ fontSize:12, color:C.sub, fontWeight:500, marginTop:4, lineHeight:1.6 }}>{a.summary}</div>
                  </div>
                  <div style={{ color:C.muted, fontSize:16 }}>›</div>
                </div>
              </div>
            ))}
            <div style={{ ...card, textAlign:"center", background:"linear-gradient(135deg,#FDF0F4,#F5EBF8)", border:`1.5px dashed ${C.border}` }}>
              <div style={{ fontSize:13, color:C.sub, fontWeight:500, marginBottom:12, lineHeight:1.8 }}>💡 المحتوى التعليمي هذا مجاني للجميع<br/>لمتابعة شخصية وخطة مخصصة:</div>
              <button onClick={onLogin} style={{ background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", borderRadius:12, color:"white", padding:"12px 24px", fontSize:13, fontWeight:800, cursor:"pointer" }}>
                🌸 Start Your Personalized Plan
              </button>
            </div>
          </div>
        )}

        {/* RECIPES TAB */}
        {guestTab==="recipes" && (
          <div className="fade-up">
            <div className="serif" style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:4 }}>Hormone Friendly</div>
            <div className="serif" style={{ fontSize:14, color:C.rose, marginBottom:20 }}>Recipes & Nutrition</div>
            {RECIPES.map(r=>(
              <div key={r.id} style={{ ...card, cursor:"pointer" }} onClick={()=>setOpenRecipe(r.id)}>
                <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                  <div style={{ fontSize:36, flexShrink:0 }}>{r.emoji}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                      <Tag text={r.tag} color={C.gold}/>
                      <Tag text={r.time} color={C.muted}/>
                    </div>
                    <div className="serif" style={{ fontSize:15, fontWeight:700, color:C.text, lineHeight:1.5 }}>{r.title}</div>
                    <div style={{ fontSize:12, color:C.sub, fontWeight:500, marginTop:4 }}>{r.desc}</div>
                  </div>
                  <div style={{ color:C.muted, fontSize:16 }}>›</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAQ TAB */}
        {guestTab==="faq" && (
          <div className="fade-up">
            <div className="serif" style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:4 }}>FAQ</div>
            <div className="serif" style={{ fontSize:14, color:C.rose, marginBottom:20 }}>أسئلة شائعة</div>
            {FAQS.map((f,i)=>(
              <div key={i} style={{ ...card, cursor:"pointer" }} onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:C.text, lineHeight:1.6, flex:1 }}>{f.q}</div>
                  <div style={{ fontSize:18, color:C.muted, flexShrink:0, transition:"transform .2s", transform:openFaq===i?"rotate(180deg)":"none" }}>⌄</div>
                </div>
                {openFaq===i && (
                  <div style={{ marginTop:12, fontSize:13, color:C.sub, fontWeight:500, lineHeight:1.9, paddingTop:12, borderTop:`1px solid ${C.borderSoft}` }}>{f.a}</div>
                )}
              </div>
            ))}
            <div style={{ ...card, textAlign:"center", background:"linear-gradient(135deg,#FDF0F4,#F5EBF8)", border:`1.5px dashed ${C.border}` }}>
              <div style={{ fontSize:13, color:C.sub, fontWeight:500, marginBottom:12 }}>عندك سؤال تاني؟ 🌸</div>
              <button onClick={onLogin} style={{ background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", borderRadius:12, color:"white", padding:"12px 24px", fontSize:13, fontWeight:800, cursor:"pointer" }}>
                تواصلي مع Dr. Mai
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  LOGIN SCREEN
// ─────────────────────────────────────────────
function LoginScreen({ onBack, onSuccess }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  async function tryLogin() {
    const clients = await getClientsFromDB();
    const c = clients.find(x=>x.code===pin.trim());
    if (c) { storage.set("__session__",c.name); onSuccess(c); }
    else { setError(true); setShaking(true); setPin(""); setTimeout(()=>setShaking(false),600); }
  }
  useEffect(()=>{ if(pin.length===4) tryLogin(); },[pin]);

  return (
    <div style={{ ...page, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px" }}>
      <style>{FONT}</style>
      <button onClick={onBack} style={{ position:"absolute", top:20, right:20, background:C.blush, border:`1px solid ${C.border}`, borderRadius:10, color:C.sub, padding:"8px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>← Back</button>
      <div style={{ width:"100%", maxWidth:340, textAlign:"center" }}>
        <img src={LOGO_SRC} style={{ width:80, height:80, margin:"0 auto 16px", display:"block", background:"white", borderRadius:10, padding:3 }} alt="NM"/>
        <h1 className="serif" style={{ fontSize:28, fontWeight:700, color:C.text, margin:"0 0 4px" }}>Welcome back</h1>
        <div style={{ fontSize:12, color:C.muted, fontWeight:500, marginBottom:28 }}>Enter your personal PIN to access your plan</div>
        <div style={{ ...card, animation: shaking?"shake .5s ease":"none" }}>
          <div style={{ display:"flex", gap:14, justifyContent:"center", marginBottom:20 }}>
            {[0,1,2,3].map(i=><div key={i} className={`code-dot${pin.length>i?" filled":""}`}/>)}
          </div>
          {error && <div style={{ background:C.redLight, border:`1px solid ${C.red}40`, borderRadius:10, padding:"9px 14px", marginBottom:14, fontSize:12, color:C.red, fontWeight:700 }}>❌ Incorrect PIN — try again</div>}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, justifyItems:"center" }}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k,i)=>{
              if(k==="") return <div key={i}/>;
              return <button key={i} className="numpad" onClick={()=>{ setError(false); k==="⌫"?setPin(p=>p.slice(0,-1)):pin.length<4&&setPin(p=>p+k); }}>{k}</button>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MEMBER HOME TAB
// ─────────────────────────────────────────────
function MemberHomeTab({ client, onTabChange }) {
  const sub = getSubInfo(client);
  const [cycleStart, setCycleStart] = useState("");
  const [cycleLen, setCycleLen] = useState(28);
  const [todayLog, setTodayLog] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);

  useEffect(()=>{
    async function loadHome() {
      try {
        const cyc = await sbGet("cycle_data", "client_name=eq."+client.name+"&select=cycle_start,cycle_len");
        if (cyc && cyc.length > 0) {
          if (cyc[0].cycle_start) setCycleStart(cyc[0].cycle_start);
          if (cyc[0].cycle_len) setCycleLen(cyc[0].cycle_len);
        }
      } catch {
        try { const r=storage.get("cycleStart"); if(r) setCycleStart(r.value); } catch {}
        try { const r=storage.get("cycleLen"); if(r) setCycleLen(parseInt(r.value)); } catch {}
      }
      try {
        const logs = await sbGet("daily_logs", "client_name=eq."+client.name+"&date=eq."+TODAY+"&select=data");
        if (logs && logs.length > 0 && logs[0].data) { setTodayLog(logs[0].data); setCheckedIn(true); return; }
      } catch {}
      try { const r=storage.get("log:"+client.name+":"+TODAY); if(r){ setTodayLog(JSON.parse(r.value)); setCheckedIn(true); } } catch {}
    }
    loadHome();
  },[]);

  const cycleInfo = getCycleInfo(cycleStart, cycleLen);
  const phase = cycleInfo ? cycleInfo.phase : null;

  const cards = [
    { id:"checkin",   icon:"📋", title:"Daily Check-in",              desc:checkedIn?"✅ سجّلتِ اليوم":"سجّلي يومك الآن", color:C.pink,  tab:"checkin" },
    { id:"cycle",     icon:"🌙", title:"Cycle Tracker",                desc:phase?`${phase.emoji} ${phase.name} — يوم ${cycleInfo.day}`:"أدخلي تاريخ دورتك", color:C.mauve, tab:"cycle" },
    { id:"tracker",   icon:"🧬", title:"Hormone Symptoms Tracker",     desc:"تتبعي أعراضك الهرمونية", color:"#5DAD85", tab:"tracker" },
    { id:"chat",      icon:"💬", title:"Chat with Dr. Mai",            desc:"رسالة للدكتورة", color:C.gold, tab:"chat" },
  ];

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ paddingTop:20, marginBottom:20 }}>
        <div style={{ fontSize:13, color:C.muted, fontWeight:600 }}>
          {new Date().toLocaleDateString("ar-EG",{weekday:"long",day:"numeric",month:"long"})}
        </div>
        <h1 style={{ fontSize:24, fontWeight:900, color:C.text, margin:"4px 0 2px" }}>
          Good morning 🌸
        </h1>
        <div style={{ fontSize:13, color:C.sub, fontWeight:500 }}>Dr. Mai is following your progress</div>
      </div>

      {/* Subscription banner */}
      {sub && (
        <div style={{ background:"linear-gradient(135deg,#FDF0F4,#F5EBF8)", border:`1px solid ${C.border}`, borderRadius:16, padding:"14px 18px", marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, color:C.sub, fontWeight:600 }}>فاضل <strong style={{ color:C.pink }}>{sub.remaining}</strong> يوم</span>
            <span style={{ fontSize:12, color:C.pink, fontWeight:800 }}>أسبوع {sub.weeksDone+1}/{sub.weeksTotal}</span>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {Array.from({length:sub.weeksTotal},(_,i)=>(
              <div key={i} style={{ flex:1, height:5, borderRadius:99, background:i<sub.weeksDone?C.pink:i===sub.weeksDone?C.lavender:C.blush }}/>
            ))}
          </div>
          <div style={{ marginTop:8, fontSize:12, color:C.green, fontWeight:700 }}>
            🗓️ الموعد القادم: {getNextSessionDate(client.sessionDay??0)}
          </div>
        </div>
      )}

      {/* Phase card */}
      {phase && (
        <div style={{ background:phase.bg, border:`2px solid ${phase.border}`, borderRadius:20, padding:"16px 18px", marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11, color:phase.color, fontWeight:800, letterSpacing:1.5, marginBottom:3 }}>CURRENT PHASE</div>
              <div style={{ fontSize:20, fontWeight:900, color:phase.color }}>{phase.emoji} {phase.name}</div>
              <div style={{ fontSize:11, color:C.sub, fontWeight:500, marginTop:2 }}>{phase.tagline}</div>
            </div>
            <div style={{ fontSize:32, fontWeight:900, color:`${phase.color}60` }}>يوم {cycleInfo.day}</div>
          </div>
        </div>
      )}

      {/* Dashboard Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
        {cards.map(c=>(
          <div key={c.id} onClick={()=>onTabChange(c.tab)} style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:18, padding:"16px 14px", cursor:"pointer", boxShadow:`0 2px 12px ${C.shadow}`, transition:"transform .15s" }}>
            <div style={{ fontSize:28, marginBottom:10 }}>{c.icon}</div>
            <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:3, lineHeight:1.3 }}>{c.title}</div>
            <div style={{ fontSize:11, color:c.color, fontWeight:600, lineHeight:1.5 }}>{c.desc}</div>
          </div>
        ))}
      </div>

      {/* Today summary if checked in */}
      {checkedIn && todayLog && (
        <div style={{ ...card }}>
          <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1.5, marginBottom:12 }}>ملخص اليوم ✅</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
            {todayLog.water && <Chip label="ماء" value={`${todayLog.water}L`} color="#7BACC4"/>}
            {todayLog.sleep && <Chip label="نوم" value={`${todayLog.sleep}h`} color={C.mauve}/>}
            <Chip label="توتر" value={`${todayLog.stress}/10`} color={todayLog.stress>7?C.red:C.muted}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  CHECK-IN TAB (Daily Log)
// ─────────────────────────────────────────────
function CheckInTab({ client }) {
  const [log, setLog] = useState(defaultLog);
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyLogged, setAlreadyLogged] = useState(false);
  const set = (k,v) => setLog(p=>({...p,[k]:v}));

  useEffect(()=>{
    async function loadLog() {
      try {
        const rows = await sbGet("daily_logs", "client_name=eq."+client.name+"&date=eq."+TODAY+"&select=data");
        if (rows && rows.length > 0 && rows[0].data) { setLog(rows[0].data); setAlreadyLogged(true); return; }
      } catch {}
      try { const r=storage.get("log:"+client.name+":"+TODAY); if(r){setLog(JSON.parse(r.value));setAlreadyLogged(true);} } catch {}
    }
    loadLog();
  },[]);

  const isSessionDay = new Date().getDay() === (client.sessionDay||0);
  const STEPS = [
    { label:"جسم", icon:"⚖️" },{ label:"أكل", icon:"🌺" },{ label:"عادات", icon:"✨" },{ label:"مزاج", icon:"💗" },
  ];

  async function submit() {
    try {
      const logData = {...log, date:TODAY, client:client.name, submittedAt:new Date().toISOString()};
      // Save to localStorage immediately so it's never lost
      storage.set("log:"+client.name+":"+TODAY, JSON.stringify(logData));
      // Then try Supabase (don't block UI on this)
      sbUpsert("daily_logs", { client_name:client.name, date:TODAY, data:logData });
      setSubmitted(true);
    } catch(e) {
      console.error("submit error", e);
      alert("خطأ — حاولي تاني");
    }
  }

  if (submitted || (alreadyLogged && step===0 && !submitted)) {
    return (
      <div style={wrap}>
        <div style={{ paddingTop:20 }}>
          <div style={{ ...card, textAlign:"center", padding:"32px 24px" }}>
            <div style={{ fontSize:52, marginBottom:12 }}>{submitted?"✅":"📋"}</div>
            <h2 style={{ fontSize:20, fontWeight:900, color:C.pink, marginBottom:8 }}>{submitted?"تم الحفظ! 🌸":"سجّلتِ اليوم!"}</h2>
            <p style={{ fontSize:13, color:C.sub, fontWeight:500, lineHeight:1.8, marginBottom:20 }}>
              {submitted?"دكتورتك شايفة تحديثك. أحسنتِ!":TODAY}
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
              {log.water && <Chip label="الماء" value={`${log.water}L`} color="#7BACC4"/>}
              {log.sleep && <Chip label="النوم" value={`${log.sleep}h`} color={C.mauve}/>}
              {log.weight && <Chip label="الوزن" value={`${log.weight}kg`} color={C.pink}/>}
              <Chip label="التوتر" value={`${log.stress}/10`} color={log.stress>7?C.red:C.muted}/>
            </div>
            {alreadyLogged && !submitted && (
              <button style={{ width:"100%", padding:"12px 0", borderRadius:12, background:C.bg, border:`1.5px solid ${C.border}`, color:C.sub, cursor:"pointer", fontSize:13, fontWeight:700 }} onClick={()=>setAlreadyLogged(false)}>✏️ تعديل التسجيل</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ paddingTop:20 }}>
        {/* Step progress */}
        <div style={{ display:"flex", alignItems:"center", marginBottom:24, position:"relative" }}>
          <div style={{ position:"absolute", top:19, left:"8%", right:"8%", height:2, background:C.borderSoft, zIndex:0 }}/>
          {STEPS.map((s,i)=>(
            <div key={i} onClick={()=>setStep(i)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer", zIndex:1 }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:i<step?C.pink:C.white, border:i===step?`2.5px solid ${C.pink}`:i<step?`2px solid ${C.pink}`:`2px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:i<step?13:16, color:i<step?"white":i===step?C.pink:C.muted, boxShadow:i===step?`0 4px 14px ${C.shadow}`:"none" }}>
                {i<step?"✓":s.icon}
              </div>
              <span style={{ fontSize:10, color:i===step?C.pink:C.muted, fontWeight:i===step?800:500 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Step 0 — Body */}
        {step===0 && (
          <div style={card}>
            <div style={{ fontSize:17, fontWeight:800, color:C.text, marginBottom:16 }}>⚖️ القياسات اليومية</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="الماء (لتر)" type="number" placeholder="1.8" value={log.water} onChange={e=>set("water",e.target.value)}/>
              <Field label="النوم (ساعة)" type="number" placeholder="7" value={log.sleep} onChange={e=>set("sleep",e.target.value)}/>
            </div>
            {isSessionDay ? (
              <>
                <div style={{ background:"linear-gradient(135deg,#FDF0F4,#F5EBF8)", border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px", marginBottom:12, display:"flex", gap:10, alignItems:"center" }}>
                  <span style={{ fontSize:18 }}>📏</span>
                  <div><div style={{ fontSize:13, color:C.pink, fontWeight:800 }}>قياسات الأسبوع</div><div style={{ fontSize:11, color:C.muted }}>يوم متابعتك 🌸</div></div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                  <Field label="الوزن (كجم)" type="number" placeholder="71" value={log.weight} onChange={e=>set("weight",e.target.value)}/>
                  <Field label="الوسط (سم)" type="number" placeholder="72" value={log.waist} onChange={e=>set("waist",e.target.value)}/>
                  <Field label="الأرداف (سم)" type="number" placeholder="98" value={log.hips} onChange={e=>set("hips",e.target.value)}/>
                  <Field label="الذراع (سم)" type="number" placeholder="30" value={log.arm} onChange={e=>set("arm",e.target.value)}/>
                </div>
                <YesNo label="الدورة الشهرية 🩸" value={log.period} onChange={v=>set("period",v)} yColor={C.rose}/>
                {log.period===true && (
                  <div style={{ background:"#FFF0F4", border:`1px solid ${C.rose}40`, borderRadius:12, padding:"14px 14px", marginTop:12 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:C.rose, marginBottom:10 }}>🩸 أعراض الدورة</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                      {[{k:"periodPain",l:"ألم 😣"},{k:"periodBloat",l:"انتفاخ"},{k:"periodMood",l:"مزاج 😤"},{k:"periodCraving",l:"شهية 🍫"},{k:"periodFatigue",l:"إرهاق 😴"},{k:"periodHeadache",l:"صداع 🤕"},{k:"periodBack",l:"ظهر 💢"}].map(s=>(
                        <button key={s.k} onClick={()=>set(s.k,!log[s.k])} style={{ padding:"7px 12px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", background:log[s.k]?"#FDE0EA":C.white, border:`1.5px solid ${log[s.k]?C.rose:C.border}`, color:log[s.k]?C.rose:C.muted }}>
                          {log[s.k]?"✓ ":""}{s.l}
                        </button>
                      ))}
                    </div>
                    <label style={lbl}>شدة الألم <strong style={{ color:C.rose }}>{log.periodPainLevel}/10</strong></label>
                    <input type="range" min="0" max="10" value={log.periodPainLevel} onChange={e=>set("periodPainLevel",+e.target.value)} style={{ width:"100%", accentColor:C.rose }}/>
                  </div>
                )}
              </>
            ) : (
              <div style={{ background:C.peach, borderRadius:10, padding:"10px 14px", fontSize:12, color:C.sub, fontWeight:600, display:"flex", gap:8, alignItems:"center" }}>
                <span>📅</span> القياسات الأسبوعية بتيجي يوم <strong style={{ color:C.pink }}>{DAYS_AR[client.sessionDay??0]}</strong> بس
              </div>
            )}
            <div style={{ marginTop:12 }}>
              <label style={lbl}>التوتر <strong style={{ color:C.red }}>{log.stress}/10</strong></label>
              <input type="range" min="1" max="10" value={log.stress} onChange={e=>set("stress",+e.target.value)} style={{ width:"100%", accentColor:C.red }}/>
            </div>
          </div>
        )}

        {/* Step 1 — Food */}
        {step===1 && (
          <div style={card}>
            <div style={{ fontSize:17, fontWeight:800, color:C.text, marginBottom:16 }}>🌺 الغذاء والتغذية</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="عدد الوجبات" type="number" placeholder="3" value={log.meals} onChange={e=>set("meals",e.target.value)}/>
              <Field label="القهوة (كوب)" type="number" placeholder="2" value={log.coffee} onChange={e=>set("coffee",e.target.value)}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
              <YesNo label="سلطة 🥗" value={log.salad} onChange={v=>set("salad",v)} yColor={C.green}/>
              <YesNo label="وجبة سريعة 🍔" value={log.fastFood} onChange={v=>set("fastFood",v)} yColor={C.red}/>
            </div>
            <div style={{ borderTop:"1px solid #F5EBF0", paddingTop:14 }}>
              <div style={{ fontSize:13, fontWeight:800, color:"#7A5565", marginBottom:12 }}>📸 صور الوجبات (اختياري)</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[{key:"breakfast",label:"الفطار 🌅"},{key:"lunch",label:"الغداء ☀️"},{key:"dinner",label:"العشاء 🌙"},{key:"snack",label:"السناك 🍎"}].map(m=>(
                  <div key={m.key}>
                    <input type="file" accept="image/*" capture="environment" id={"photo-"+m.key} style={{ display:"none" }}
                      onChange={async e=>{
                        const file = e.target.files[0];
                        if (!file) return;
                        // Show preview immediately
                        const reader = new FileReader();
                        reader.onload = ev => set("photos", Object.assign({}, log.photos||{}, {[m.key]: ev.target.result}));
                        reader.readAsDataURL(file);
                        // Upload to Supabase Storage in background
                        const url = await sbUploadPhoto(client.name, m.key, file);
                        if (url) set("photos", Object.assign({}, log.photos||{}, {[m.key]: url}));
                      }}/>
                    <label htmlFor={"photo-"+m.key} style={{ display:"block", cursor:"pointer" }}>
                      {log.photos && log.photos[m.key] ? (
                        <div style={{ position:"relative" }}>
                          <img src={log.photos[m.key]} alt={m.label} style={{ width:"100%", height:90, objectFit:"cover", borderRadius:12, border:"2px solid #C2607A" }}/>
                          <button onClick={e=>{e.preventDefault();set("photos", Object.assign({}, log.photos||{}, {[m.key]:null}));}} style={{ position:"absolute", top:4, left:4, background:"rgba(0,0,0,0.5)", border:"none", borderRadius:"50%", width:22, height:22, color:"white", fontSize:12, cursor:"pointer" }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ height:90, borderRadius:12, border:"2px dashed #EDD9E5", background:"#FDFAF8", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4 }}>
                          <span style={{ fontSize:22 }}>📷</span>
                          <span style={{ fontSize:10, color:"#B09AA8", fontWeight:700 }}>{m.label}</span>
                        </div>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Habits */}
        {step===2 && (
          <div style={card}>
            <div style={{ fontSize:17, fontWeight:800, color:C.text, marginBottom:16 }}>✨ العادات الصحية</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <YesNo label="التزام بالخطة" value={log.followedPlan} onChange={v=>set("followedPlan",v)} yColor={C.green}/>
              <YesNo label="مكملات غذائية" value={log.supplements} onChange={v=>set("supplements",v)} yColor={C.mauve}/>
              <YesNo label="تمرين" value={log.exercise} onChange={v=>set("exercise",v)} yColor="#5DAD85"/>
              <YesNo label="أكل عاطفي" value={log.binge} onChange={v=>set("binge",v)} yColor={C.red}/>
            </div>
            {log.exercise && <Field label="مدة التمرين (دقائق)" type="number" placeholder="30" value={log.exerciseMin} onChange={e=>set("exerciseMin",e.target.value)}/>}
          </div>
        )}

        {/* Step 3 — Mood */}
        {step===3 && (
          <div style={card}>
            <div style={{ fontSize:17, fontWeight:800, color:C.text, marginBottom:16 }}>💗 المزاج والملاحظات</div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>كيف مزاجك اليوم؟</label>
              <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                {["😢","😐","🙂","😊","🥰"].map(e=>(
                  <button key={e} onClick={()=>set("mood",e)} style={{ width:44, height:44, borderRadius:"50%", fontSize:24, border:`2px solid ${log.mood===e?C.pink:C.border}`, background:log.mood===e?C.blush:C.bg, cursor:"pointer" }}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>ملاحظات للدكتورة (اختياري)</label>
              <textarea value={log.note} onChange={e=>set("note",e.target.value)} placeholder="أي شيء تحبي تشاركيه..."
                style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.bg, color:C.text, fontSize:13, fontWeight:500, outline:"none", resize:"none", minHeight:80, direction:"rtl", fontFamily:"'Tajawal',sans-serif", lineHeight:1.7 }}/>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div style={{ display:"flex", gap:10, marginTop:4 }}>
          {step>0 && <button onClick={()=>setStep(s=>s-1)} style={{ flex:1, padding:"13px 0", borderRadius:12, background:C.bg, border:`1.5px solid ${C.border}`, color:C.sub, cursor:"pointer", fontSize:14, fontWeight:700 }}>← السابق</button>}
          {step<3
            ? <button onClick={()=>setStep(s=>s+1)} style={{ flex:2, padding:"13px 0", borderRadius:12, background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", color:"white", cursor:"pointer", fontSize:14, fontWeight:800 }}>التالي ←</button>
            : <button onClick={submit} style={{ flex:2, padding:"13px 0", borderRadius:12, background:`linear-gradient(135deg,${C.green},#4A9A72)`, border:"none", color:"white", cursor:"pointer", fontSize:14, fontWeight:800 }}>✓ إرسال التسجيل</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  CYCLE TAB
// ─────────────────────────────────────────────
function CycleTab({ client }) {
  const [cycleStart, setCycleStart] = useState("");
  const [cycleLen, setCycleLen] = useState(28);
  const ci = getCycleInfo(cycleStart, cycleLen);
  const phase = ci ? ci.phase : null;

  useEffect(()=>{
    async function loadCycle() {
      try {
        const rows = await sbGet("cycle_data", "client_name=eq."+client.name+"&select=cycle_start,cycle_len");
        if (rows && rows.length > 0) {
          if (rows[0].cycle_start) setCycleStart(rows[0].cycle_start);
          if (rows[0].cycle_len) setCycleLen(rows[0].cycle_len);
          return;
        }
      } catch {}
      try { const r=storage.get("cycleStart"); if(r) setCycleStart(r.value); } catch {}
      try { const r=storage.get("cycleLen"); if(r) setCycleLen(parseInt(r.value)); } catch {}
    }
    loadCycle();
  },[]);

  async function saveCycleStart(val) {
    setCycleStart(val);
    storage.set("cycleStart", val);
    sbUpsert("cycle_data", { client_name:client.name, cycle_start:val, cycle_len:cycleLen });
  }
  async function saveCycleLen(val) {
    setCycleLen(val);
    storage.set("cycleLen", String(val));
    sbUpsert("cycle_data", { client_name:client.name, cycle_start:cycleStart, cycle_len:val });
  }
  async function resetCycle() {
    setCycleStart("");
    storage.del("cycleStart");
    sbUpsert("cycle_data", { client_name:client.name, cycle_start:"", cycle_len:cycleLen });
  }

  return (
    <div style={wrap}>
      <div style={{ paddingTop:20 }}>
        <h2 style={{ fontSize:20, fontWeight:900, color:C.text, marginBottom:4 }}>🌙 دورتي</h2>
        <div style={{ fontSize:12, color:C.muted, fontWeight:500, marginBottom:20 }}>Cycle-Based Nutrition</div>

        {!cycleStart ? (
          <div style={{ ...card, textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🩸</div>
            <div style={{ fontSize:15, fontWeight:800, color:C.text, marginBottom:6 }}>سجّلي أول يوم دورتك</div>
            <div style={{ fontSize:12, color:C.muted, fontWeight:500, marginBottom:18, lineHeight:1.9 }}>عشان نحسبلك مرحلتك الهرمونية ونديكِ توصيات تغذية مخصصة</div>
            <input type="date" value={cycleStart} onChange={e=>saveCycleStart(e.target.value)}
              style={{ padding:"11px 14px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.bg, color:C.text, fontSize:14, width:"100%", marginBottom:10, boxSizing:"border-box" }}/>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <label style={{ ...lbl, marginBottom:0, flexShrink:0 }}>طول الدورة:</label>
              <input type="number" min="21" max="40" value={cycleLen} onChange={e=>saveCycleLen(+e.target.value)}
                style={{ flex:1, padding:"11px 14px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.bg, color:C.text, fontSize:14, fontWeight:700, textAlign:"center" }}/>
              <span style={{ fontSize:13, color:C.muted }}>يوم</span>
            </div>
          </div>
        ) : (
          <>
            {/* Current phase hero */}
            <div style={{ background:phase?.bg, border:`2px solid ${phase?.border}`, borderRadius:24, padding:"22px 20px", marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:11, color:phase?.color, fontWeight:800, letterSpacing:2, marginBottom:4 }}>CURRENT PHASE</div>
                  <div style={{ fontSize:26, fontWeight:900, color:phase?.color }}>{phase?.emoji} {phase?.name}</div>
                  <div style={{ fontSize:12, color:C.sub, fontWeight:500, marginTop:4 }}>{phase?.tagline}</div>
                </div>
                <div style={{ background:C.white, borderRadius:14, padding:"10px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:24, fontWeight:900, color:phase?.color }}>{ci.day}</div>
                  <div style={{ fontSize:9, color:C.muted }}>/ {cycleLen}</div>
                </div>
              </div>
              <div style={{ height:6, borderRadius:99, background:`${phase?.color}25`, overflow:"hidden", marginBottom:10 }}>
                <div style={{ height:"100%", width:`${(ci.day/cycleLen)*100}%`, background:phase?.color, borderRadius:99 }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div style={{ fontSize:11, color:C.sub, fontWeight:500 }}>{phase?.hormones}</div>
                <div style={{ fontSize:11, color:C.green, fontWeight:700 }}>📅 {ci.daysToNext}يوم للدورة القادمة</div>
              </div>
            </div>

            {/* Phases nav */}
            <div style={{ display:"flex", gap:6, marginBottom:14 }}>
              {CYCLE_PHASES.map(p=>(
                <div key={p.id} style={{ flex:1, background:p.id===phase?.id?p.bg:C.white, border:`1.5px solid ${p.id===phase?.id?p.color:C.border}`, borderRadius:12, padding:"8px 4px", textAlign:"center" }}>
                  <div style={{ fontSize:16 }}>{p.emoji}</div>
                  <div style={{ fontSize:9, fontWeight:800, color:p.id===phase?.id?p.color:C.muted, marginTop:2 }}>{p.name}</div>
                </div>
              ))}
            </div>

            {/* Nutrition */}
            <div style={card}>
              <div style={{ fontSize:13, fontWeight:800, color:phase?.color, marginBottom:12 }}>🥗 تغذية مرحلة {phase?.name}</div>
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:800, color:C.green, marginBottom:8 }}>✅ أكلي من:</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {phase?.eat.map((f,i)=><span key={i} style={{ background:C.greenLight, border:`1px solid ${C.greenBorder}`, borderRadius:99, padding:"4px 10px", fontSize:11, color:C.green, fontWeight:600 }}>{f}</span>)}
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:C.red, marginBottom:8 }}>⚠️ قللي من:</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {phase?.avoid.map((f,i)=><span key={i} style={{ background:C.redLight, border:`1px solid ${C.red}40`, borderRadius:99, padding:"4px 10px", fontSize:11, color:C.red, fontWeight:600 }}>{f}</span>)}
                </div>
              </div>
              <div style={{ background:phase?.bg, border:`1px solid ${phase?.border}`, borderRadius:12, padding:"10px 14px", fontSize:12, color:phase?.color, fontWeight:600, lineHeight:1.7 }}>💡 {phase?.tip}</div>
            </div>

            {/* Exercise & Selfcare */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              <div style={card}><div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:6 }}>تمرين مناسب</div><div style={{ fontSize:12, color:C.text, fontWeight:600, lineHeight:1.7 }}>{phase?.exercise}</div></div>
              <div style={card}><div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:6 }}>عناية بالنفس</div><div style={{ fontSize:12, color:C.text, fontWeight:600, lineHeight:1.7 }}>{phase?.selfcare}</div></div>
            </div>

            <button onClick={resetCycle} style={{ width:"100%", padding:"10px 0", borderRadius:12, background:C.bg, border:`1px solid ${C.border}`, color:C.muted, fontSize:12, fontWeight:600, cursor:"pointer" }}>
              🔄 تحديث تاريخ الدورة
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  HORMONE TRACKER TAB
// ─────────────────────────────────────────────
function TrackerTab({ client }) {
  const [hLog, setHLog] = useState({});
  const [cycleStart, setCycleStart] = useState("");

  useEffect(()=>{
    async function load() {
      try {
        const rows = await sbGet("hormone_symptoms", "client_name=eq."+client.name+"&date=eq."+TODAY+"&select=data");
        if (rows && rows.length > 0 && rows[0].data) { setHLog(rows[0].data); return; }
      } catch {}
      try { const r=storage.get("hsym:"+client.name+":"+TODAY); if(r) setHLog(JSON.parse(r.value)); } catch {}
      try {
        const cyc = await sbGet("cycle_data", "client_name=eq."+client.name+"&select=cycle_start");
        if (cyc && cyc.length > 0 && cyc[0].cycle_start) { setCycleStart(cyc[0].cycle_start); return; }
      } catch {}
      try { const r=storage.get("cycleStart"); if(r) setCycleStart(r.value); } catch {}
    }
    load();
  },[]);

  const setH = async (k,v) => {
    const n = {...hLog,[k]:v};
    setHLog(n);
    // Save locally immediately
    storage.set("hsym:"+client.name+":"+TODAY, JSON.stringify(n));
    // Sync to Supabase in background
    sbUpsert("hormone_symptoms", { client_name:client.name, date:TODAY, data:n });
  };

  const ci = getCycleInfo(cycleStart);
  const phase = ci ? ci.phase : null;
  const phaseColor = phase ? phase.color : C.pink;
  const phaseBg = phase ? phase.bg : C.blush;

  return (
    <div style={wrap}>
      <div style={{ paddingTop:20 }}>
        <h2 style={{ fontSize:20, fontWeight:900, color:C.text, marginBottom:4 }}>🧬 الأعراض الهرمونية</h2>
        <div style={{ fontSize:12, color:C.muted, fontWeight:500, marginBottom:16 }}>Hormone Symptoms Tracker • {TODAY}</div>

        {phase && (
          <div style={{ background:phaseBg, border:`1px solid ${phase.border}`, borderRadius:14, padding:"10px 16px", marginBottom:16, display:"flex", gap:10, alignItems:"center" }}>
            <span style={{ fontSize:20 }}>{phase.emoji}</span>
            <div style={{ fontSize:12, color:phaseColor, fontWeight:700 }}>مرحلة {phase.name} — يوم {ci.day} من دورتك</div>
          </div>
        )}

        <div style={card}>
          <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:16 }}>📊 مستوى الأعراض اليوم</div>
          {HORMONE_SYMS.filter(s=>s.type==="scale").map(s=>(
            <div key={s.key} style={{ marginBottom:16 }}>
              <label style={lbl}>{s.label}</label>
              <div style={{ display:"flex", gap:6 }}>
                {s.icons.map((icon,i)=>(
                  <button key={i} onClick={()=>setH(s.key,i+1)}
                    style={{ flex:1, padding:"9px 4px", borderRadius:10, fontSize:20, cursor:"pointer", background:(hLog[s.key]||3)===i+1?phaseBg:C.bg, border:`1.5px solid ${(hLog[s.key]||3)===i+1?phaseColor:C.border}`, transition:"all .15s" }}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:12 }}>أعراض جسدية اليوم</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {HORMONE_SYMS.filter(s=>s.type==="bool").map(s=>(
              <button key={s.key} onClick={()=>setH(s.key,!hLog[s.key])}
                style={{ padding:"9px 14px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", background:hLog[s.key]?phaseBg:C.bg, border:`1.5px solid ${hLog[s.key]?phaseColor:C.border}`, color:hLog[s.key]?phaseColor:C.muted, transition:"all .15s" }}>
                {s.emoji} {s.label} {hLog[s.key]?"✓":""}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...card, background:"linear-gradient(135deg,#E6F5EE,#F5FBF7)", border:`1px solid ${C.greenBorder}` }}>
          <div style={{ fontSize:12, color:C.green, fontWeight:800, marginBottom:4 }}>✅ تم حفظ الأعراض للدكتورة</div>
          <div style={{ fontSize:11, color:C.sub, fontWeight:500 }}>الدكتورة ستراها في الموعد القادم</div>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
//  LIBRARY TAB
// ─────────────────────────────────────────────
function LibraryTab({ client }) {
  const [openItem, setOpenItem] = useState(null);
  const [activeSection, setActiveSection] = useState("articles");

  const LIBRARY_ITEMS = [
    { id:1, type:"article", icon:"🔬", category:"PCOS", title:"تكيس المبايض والتغذية", time:"5 دقائق",
      summary:"كيف تؤثر التغذية على أعراض PCOS وكيف تتحكمي فيها من خلال طعامك اليومي",
      body:"تكيس المبايض (PCOS) من أكثر الاضطرابات الهرمونية شيوعاً عند النساء. التغذية الصحيحة تلعب دوراً محورياً في التحكم بالأعراض.\n\nالأطعمة التي تساعد:\n• الخضروات الورقية والبروكلي\n• البروتين الخالي من الدهون\n• الدهون الصحية (أفوكادو، زيت زيتون)\n• الألياف من الخضار والبقوليات\n\nالأطعمة التي تزيد الأعراض:\n• السكريات المضافة والمعالجة\n• الدقيق الأبيض والكربوهيدرات البسيطة\n• الأطعمة المقلية والمعالجة\n• الكافيين الزائد",
      tips:["تناولي 3 وجبات منتظمة + سناك صحي","اشربي 2-3 لتر ماء يومياً","قللي السكريات المضافة تدريجياً","أضيفي البروتين لكل وجبة"] },
    { id:2, type:"article", icon:"🩸", category:"الإنسولين", title:"مقاومة الإنسولين خطوة بخطوة", time:"4 دقائق",
      summary:"افهمي مقاومة الإنسولين وكيف تتغلبي عليها بالتغذية الصحيحة",
      body:"مقاومة الإنسولين تعني أن خلايا جسمك لا تستجيب بشكل صحيح للإنسولين، مما يرفع مستوى السكر في الدم.\n\nعلامات مقاومة الإنسولين:\n• تعب بعد الوجبات\n• رغبة شديدة في السكريات\n• صعوبة في خسارة الوزن\n• تجمع الدهون في البطن\n\nاستراتيجيات غذائية:\n• الصيام المتقطع 14-16 ساعة\n• تقليل الكربوهيدرات المكررة\n• زيادة الأوميغا 3 والمغنيسيوم\n• تمرين بعد الوجبات 15 دقيقة",
      tips:["ابدأي يومك ببروتين لا سكريات","تجنبي العصائر والمشروبات المحلاة","المشي 15 دقيقة بعد الأكل مفيد جداً","نومي 7-8 ساعات لتحسين الإنسولين"] },
    { id:3, type:"article", icon:"🌙", category:"الدورة", title:"تغذية كل مرحلة من الدورة", time:"6 دقائق",
      summary:"خطة غذائية مخصصة لكل مرحلة من مراحل دورتك الشهرية الأربع",
      body:"جسمك يتغير هرمونياً طوال الشهر — وتغذيتك لازم تتغير معاه!\n\nالمرحلة الطمثية (أيام 1-5):\nركزي على الحديد (لحوم حمراء، عدس، سبانخ) والمغنيسيوم لتقليل التشنجات\n\nالمرحلة الجريبية (أيام 6-13):\nوقت رائع للبروتين والخضروات الطازجة. جسمك يبني ويجدد\n\nمرحلة الإباضة (أيام 14-16):\nأوج الطاقة — استغليه في التمارين والأنشطة المكثفة\n\nالمرحلة الأصفرية (أيام 17-28):\nقللي الكافيين وزيدي الكالسيوم والفيتامين B6 لتقليل PMS",
      tips:["تتبعي دورتك لتعرفي في أي مرحلة أنتِ","الشوكولاتة الداكنة 70%+ مفيدة أيام الطمث","قللي الملح قبل الدورة لتقليل الانتفاخ","الزنجبيل والكركم يقللان الألم طبيعياً"] },
    { id:4, type:"article", icon:"✨", category:"الهرمونات", title:"أطعمة تعزز صحتك الهرمونية", time:"3 دقائق",
      summary:"قائمة بأهم الأطعمة التي تدعم التوازن الهرموني وتحسن صحتك العامة",
      body:"الهرمونات تتأثر بشكل مباشر بما تأكلينه. إليكِ أهم الأطعمة الداعمة للتوازن الهرموني:\n\nأطعمة إستروجين صحي:\n• بذور الكتان (ملعقة يومياً)\n• برعم البروكلي\n• التوت الأزرق والرمان\n\nأطعمة داعمة للبروجستيرون:\n• المكسرات والبذور\n• الخضروات الورقية\n• البيض والدواجن\n\nمضادات الالتهاب:\n• الكركم مع الفلفل الأسود\n• زيت الزيتون البكر\n• سمك السلمون والسردين",
      tips:["بذرة الكتان يومياً تدعم الإستروجين الصحي","تجنبي البلاستيك في تخزين الطعام","العضوي أفضل للخضروات الأكثر استهلاكاً","الطبخ بالأواني الحديد يزيد الحديد في الطعام"] },
    { id:5, type:"ebook", icon:"📘", category:"دليل", title:"دليل PCOS الشامل", time:"دليل كامل",
      summary:"دليلك الكامل لفهم PCOS والتعايش معه بشكل صحي وسعيد",
      body:"هذا الدليل الشامل يغطي كل ما تحتاجين معرفته عن PCOS:\n\n• ما هو PCOS وأسبابه\n• الفحوصات المطلوبة\n• الخيارات العلاجية\n• التغذية المناسبة\n• التمارين الموصى بها\n• الصحة النفسية والعاطفية\n• الخصوبة والحمل مع PCOS",
      tips:["راجعي طبيبك لتأكيد التشخيص","التغذية والنمط الحياتي أساس العلاج","الدعم النفسي جزء مهم من الرحلة","الصبر والاستمرار مفتاح النجاح"] },
    { id:6, type:"ebook", icon:"📗", category:"دليل", title:"خطة الـ 30 يوم لتوازن الهرمونات", time:"دليل عملي",
      summary:"خطة عملية يوم بيوم لتحسين توازنك الهرموني خلال شهر واحد",
      body:"الأسبوع الأول: التخلص من المحفزات\n• أزيلي السكريات المضافة\n• قللي الكافيين تدريجياً\n• ابدأي بتتبع دورتك\n\nالأسبوع الثاني: بناء العادات\n• 3 وجبات منتظمة يومياً\n• 8 أكواب ماء\n• نوم منتظم 7-8 ساعات\n\nالأسبوع الثالث: التعمق\n• أضيفي بذور الكتان والكركم\n• مشي 30 دقيقة يومياً\n• تمارين تنفس للإجهاد\n\nالأسبوع الرابع: التثبيت\n• راجعي تحسناتك\n• عدلي ما يحتاج تعديل\n• استمري على ما نجح",
      tips:["دوّني تغيراتك يومياً","لا تتوقعي نتائج فورية - الجسم يحتاج وقت","اطلبي الدعم من Dr. Mai في أي وقت","احتفلي بكل تقدم صغير"] },
  ];

  const articles = LIBRARY_ITEMS.filter(x=>x.type==="article");
  const ebooks = LIBRARY_ITEMS.filter(x=>x.type==="ebook");
  const current = activeSection==="articles" ? articles : ebooks;

  if (openItem) {
    const item = LIBRARY_ITEMS.find(x=>x.id===openItem);
    return (
      <div style={wrap}>
        <style>{FONT}</style>
        <div style={{ paddingTop:20 }}>
          <button onClick={()=>setOpenItem(null)} style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700, color:C.sub, cursor:"pointer", marginBottom:20 }}>← رجوع</button>
          <div style={{ ...card, padding:"24px 20px" }}>
            <div style={{ fontSize:48, textAlign:"center", marginBottom:12 }}>{item.icon}</div>
            <div style={{ display:"flex", gap:8, marginBottom:12, justifyContent:"center" }}>
              <span style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:99, padding:"4px 12px", fontSize:11, color:C.pink, fontWeight:700 }}>{item.category}</span>
              <span style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:99, padding:"4px 12px", fontSize:11, color:C.muted, fontWeight:600 }}>⏱ {item.time}</span>
            </div>
            <h2 style={{ fontSize:20, fontWeight:900, color:C.text, marginBottom:12, lineHeight:1.5, textAlign:"center" }}>{item.title}</h2>
            <p style={{ fontSize:14, color:C.sub, fontWeight:500, lineHeight:2, marginBottom:20, whiteSpace:"pre-line" }}>{item.body}</p>
            <div style={{ background:C.greenLight, border:`1px solid ${C.greenBorder}`, borderRadius:14, padding:"14px 16px", marginBottom:24 }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.green, marginBottom:10 }}>💡 نصائح عملية</div>
              {item.tips.map((t,i)=>(
                <div key={i} style={{ fontSize:13, color:C.text, fontWeight:600, padding:"5px 0", display:"flex", gap:8 }}>
                  <span style={{ color:C.green, flexShrink:0 }}>✓</span>{t}
                </div>
              ))}
            </div>
            <a href="https://wa.me/201000423752" style={{ display:"block", width:"100%", padding:"13px 0", borderRadius:14, background:"#25D366", border:"none", color:"white", fontSize:14, fontWeight:800, cursor:"pointer", textAlign:"center", textDecoration:"none", boxSizing:"border-box" }}>
              💬 اسأليني عن هذا الموضوع
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ paddingTop:20 }}>
        <div style={{ marginBottom:20 }}>
          <h2 style={{ fontSize:22, fontWeight:900, color:C.text, marginBottom:4 }}>📚 المكتبة العلمية</h2>
          <p style={{ fontSize:13, color:C.sub, fontWeight:500 }}>محتوى علمي مخصص لصحتك الهرمونية</p>
        </div>

        {/* Section toggle */}
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {[{id:"articles",label:"📖 مقالات"},{id:"ebooks",label:"📘 أدلة وكتب"}].map(s=>(
            <button key={s.id} onClick={()=>setActiveSection(s.id)}
              style={{ flex:1, padding:"10px 0", borderRadius:12, fontSize:13, fontWeight:800, cursor:"pointer",
                background:activeSection===s.id?`linear-gradient(135deg,${C.pink},${C.mauve})`:C.bg,
                border:activeSection===s.id?"none":`1.5px solid ${C.border}`,
                color:activeSection===s.id?"white":C.muted }}>
              {s.label}
            </button>
          ))}
        </div>

        {current.map(item=>(
          <div key={item.id} style={{ ...card, cursor:"pointer" }} onClick={()=>setOpenItem(item.id)}>
            <div style={{ display:"flex", gap:14, alignItems:"center" }}>
              <div style={{ fontSize:36, flexShrink:0 }}>{item.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                  <span style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:99, padding:"3px 10px", fontSize:10, color:C.pink, fontWeight:700 }}>{item.category}</span>
                  <span style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:99, padding:"3px 10px", fontSize:10, color:C.muted, fontWeight:600 }}>⏱ {item.time}</span>
                </div>
                <div style={{ fontSize:15, fontWeight:800, color:C.text, lineHeight:1.4, marginBottom:4 }}>{item.title}</div>
                <div style={{ fontSize:12, color:C.sub, fontWeight:500, lineHeight:1.6 }}>{item.summary}</div>
              </div>
              <div style={{ color:C.muted, fontSize:18, flexShrink:0 }}>›</div>
            </div>
          </div>
        ))}

        {/* WhatsApp */}
        <div style={{ ...card, textAlign:"center", background:"linear-gradient(135deg,#E8F8F0,#D4F5E4)", border:`1.5px solid ${C.greenBorder}`, marginTop:8 }}>
          <div style={{ fontSize:13, color:"#1A5C3A", fontWeight:700, marginBottom:10 }}>عندك سؤال عن أي موضوع؟ 🌸</div>
          <a href="https://wa.me/201000423752" style={{ display:"inline-block", background:"#25D366", border:"none", borderRadius:12, color:"white", padding:"12px 24px", fontSize:13, fontWeight:800, textDecoration:"none" }}>
            💬 تواصلي مع Dr. Mai
          </a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  CHAT TAB
// ─────────────────────────────────────────────
function ChatTab({ client }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(()=>{
    async function loadMsgs() {
      try {
        const rows = await sbGet("messages", "client_name=eq."+client.name+"&order=created_at.asc&select=role,text,time");
        if (rows && rows.length > 0) { setMsgs(rows); return; }
      } catch {}
      try { const r=storage.get("chat:"+client.name); if(r) setMsgs(JSON.parse(r.value)); } catch {}
    }
    loadMsgs();
  },[]);

  useEffect(()=>{ if(bottomRef.current) bottomRef.current.scrollIntoView({behavior:"smooth"}); },[msgs]);

  async function send() {
    if(!input.trim()) return;
    const t = new Date().toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"});
    const userMsg = { role:"user", text:input, time:t };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs); setInput(""); setSending(true);
    // Save locally immediately
    storage.set("chat:"+client.name, JSON.stringify(newMsgs.slice(-60)));
    // Sync to Supabase in background
    sbUpsert("messages", { client_name:client.name, role:"user", text:userMsg.text, time:t });
    setTimeout(async ()=>{
      const replyText = "✅ وصلتني رسالتك يا حبيبتي! سأرد عليكِ في أقرب وقت 🌸";
      const replyTime = new Date().toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"});
      const reply = { role:"doctor", text:replyText, time:replyTime };
      const withReply = [...newMsgs, reply];
      setMsgs(withReply);
      storage.set("chat:"+client.name, JSON.stringify(withReply.slice(-60)));
      sbUpsert("messages", { client_name:client.name, role:"doctor", text:replyText, time:replyTime });
      setSending(false);
    }, 900);
  }

  return (
    <div style={{ maxWidth:480, margin:"0 auto", height:"100vh", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:40, height:40, borderRadius:"50%", background:`linear-gradient(135deg,${C.pink},${C.mauve})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>👩‍⚕️</div>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:C.text }}>Dr. Mai 🌸</div>
          <div style={{ fontSize:11, color:C.green, fontWeight:600 }}>● متاحة للرد</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:10, background:C.bg, paddingBottom:160 }}>
        {msgs.length===0 && (
          <div style={{ textAlign:"center", padding:"40px 0" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>💌</div>
            <div style={{ fontSize:13, color:C.muted, fontWeight:600, lineHeight:1.9 }}>ابعتي سؤالك للدكتورة<br/>وهترد عليكِ بأسرع وقت</div>
          </div>
        )}
        {msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            {m.role==="doctor" && <div style={{ width:28, height:28, borderRadius:"50%", background:`linear-gradient(135deg,${C.pink},${C.mauve})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0, marginLeft:8, alignSelf:"flex-end" }}>👩‍⚕️</div>}
            <div style={{ maxWidth:"75%", background:m.role==="user"?`linear-gradient(135deg,${C.pink},${C.mauve})`:C.white, borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px", padding:"10px 14px", boxShadow:`0 2px 8px ${C.shadow}`, border:m.role==="doctor"?`1px solid ${C.border}`:"none" }}>
              <div style={{ fontSize:13, fontWeight:600, lineHeight:1.7, color:m.role==="user"?"white":C.text }}>{m.text}</div>
              <div style={{ fontSize:10, marginTop:3, opacity:.65, color:m.role==="user"?"white":C.muted }}>{m.time}</div>
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:"16px 16px 16px 4px", padding:"10px 16px" }}>
              <div style={{ display:"flex", gap:4 }}>
                {[0,1,2].map(i=><div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.muted, animation:`bounce 1s ${i*0.2}s infinite` }}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div style={{ position:"fixed", bottom:64, left:0, right:0, background:C.white, borderTop:`1px solid ${C.border}`, padding:"10px 16px", display:"flex", gap:10 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
          placeholder="اكتبي رسالتك للدكتورة..."
          style={{ flex:1, padding:"11px 14px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.bg, color:C.text, fontSize:13, outline:"none", direction:"rtl", fontFamily:"'Tajawal',sans-serif" }}/>
        <button onClick={send} disabled={!input.trim()||sending}
          style={{ width:44, height:44, borderRadius:12, background:input.trim()?`linear-gradient(135deg,${C.pink},${C.mauve})`:C.border, border:"none", cursor:input.trim()?"pointer":"default", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
          💌
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────

// ── LIBRARY TAB ──
function LibraryTab({ client }) {
  const [openItem, setOpenItem] = useState(null);
  const [filter, setFilter] = useState("all");

  const items = [
    { id:1, type:"article", tag:"PCOS", icon:"🔬", title:"PCOS والتغذية العلاجية", time:"5 دقائق",
      summary:"كيف تؤثر التغذية على أعراض تكيس المبايض وكيف تتحكمي فيها.",
      body:"تكيس المبايض (PCOS) هو اضطراب هرموني شائع يؤثر على 1 من كل 10 نساء. التغذية العلاجية تلعب دوراً محورياً في إدارة الأعراض...

أهم المبادئ الغذائية:
- تقليل السكريات المكررة والكربوهيدرات عالية الجلايسيمي
- زيادة البروتين والألياف في كل وجبة
- الدهون الصحية (أفوكادو، زيت زيتون، أوميغا 3)
- مضادات الأكسدة من الخضار والفاكهة الملونة",
      tips:["تناولي البروتين في كل وجبة","تجنبي السكر المضاف","مارسي المشي 30 دقيقة يومياً","احرصي على النوم 7-8 ساعات"] },
    { id:2, type:"article", tag:"Insulin", icon:"🩸", title:"مقاومة الإنسولين — دليلك الكامل", time:"7 دقائق",
      summary:"فهم مقاومة الإنسولين وكيف تعالجيها بالتغذية.",
      body:"مقاومة الإنسولين تعني أن خلايا جسمك لا تستجيب بشكل كافٍ للإنسولين، مما يجبر البنكرياس على إنتاج المزيد منه...

علامات مقاومة الإنسولين:
- تعب شديد بعد الأكل
- رغبة شديدة في السكريات
- صعوبة في إنقاص الوزن
- تقلبات في مستوى الطاقة",
      tips:["قللي الكربوهيدرات المكررة","اشربي 2-3 لتر ماء يومياً","تناولي الخل التفاح قبل الوجبات","مارسي تمارين المقاومة"] },
    { id:3, type:"article", tag:"Cycle", icon:"🌙", title:"التغذية حسب مراحل الدورة", time:"6 دقائق",
      summary:"ما تأكليه في كل مرحلة من دورتك يغير كل حاجة.",
      body:"جسمك يمر بـ 4 مراحل هرمونية مختلفة خلال الدورة. كل مرحلة تحتاج نوع مختلف من التغذية...

المرحلة 1 (الطمث): ركزي على الحديد والمغنيسيوم — عدس، سبانخ، شوكولاتة داكنة
المرحلة 2 (الجريبي): بروتين وخضار خضراء — بيض، بروكلي، تفاح
المرحلة 3 (الإباضة): خام وطازج — فاكهة، سلطات، عصائر
المرحلة 4 (الأصفر): دهون صحية وكربوهيدرات معقدة — بطاطا حلوة، أفوكادو، بذور",
      tips:["خططي وجباتك حسب مرحلة دورتك","زيدي الحديد أيام الطمث","قللي الكافيين في المرحلة الأصفر","تناولي المغنيسيوم لتقليل الآلام"] },
    { id:4, type:"guide", tag:"Hormone", icon:"⚖️", title:"دليل التوازن الهرموني", time:"10 دقائق",
      summary:"الدليل الشامل لتوازن هرموناتك من خلال الغذاء.",
      body:"التوازن الهرموني يعتمد على 5 محاور أساسية:

1. التغذية المتوازنة
2. النوم الكافي
3. إدارة التوتر
4. التمارين المناسبة
5. المكملات الغذائية

الأطعمة الداعمة للهرمونات:
- الكتان: يدعم الإستروجين الصحي
- البروكلي: يساعد في التخلص من الإستروجين الزائد
- الزنجبيل: يقلل الالتهاب
- الكركم: مضاد أكسدة قوي",
      tips:["ابدأي يومك ببروتين وليس كربوهيدرات","تجنبي البلاستيك في تخزين الطعام","نامي في غرفة مظلمة تماماً","اعملي فحص هرموني كل 6 أشهر"] },
    { id:5, type:"recipe", tag:"PCOS", icon:"🥗", title:"سلطة مكافحة الالتهاب", time:"3 دقائق",
      summary:"وصفة مضادة للالتهاب تدعم توازن هرمونات PCOS.",
      body:"المكونات:
- كوب سبانخ طازج
- نصف أفوكادو
- ربع كوب جوز
- حبة طماطم
- ملعقة زيت زيتون
- عصير ليمون
- ملح وفلفل

طريقة التحضير:
اخلطي كل المكونات معاً. أضيفي زيت الزيتون وعصير الليمون. قدمي فوراً.",
      tips:["أضيفي بذور الكتان لدعم إضافي","تناوليها على الغداء","يمكن إضافة تونة أو بيض مسلوق للبروتين"] },
    { id:6, type:"recipe", tag:"Insulin", icon:"🥣", title:"بول الإفطار المتوازن", time:"5 دقائق",
      summary:"إفطار منخفض الجلايسيمي يثبت السكر ويعطي طاقة طول اليوم.",
      body:"المكونات:
- نصف كوب شوفان
- كوب حليب لوز
- ملعقة بذور شيا
- حفنة توت أزرق
- ملعقة زبدة لوز
- قرفة حسب الرغبة

طريقة التحضير:
اطبخي الشوفان بحليب اللوز. أضيفي بذور الشيا واتركي 2 دقيقة. أضيفي التوت وزبدة اللوز والقرفة.",
      tips:["القرفة تساعد في تنظيم السكر","لا تضيفي سكر أبداً","يمكن تحضيره ليلاً وتناوله بارداً"] },
  ];

  const tags = ["all","PCOS","Insulin","Cycle","Hormone"];
  const filtered = filter==="all" ? items : items.filter(i=>i.tag===filter);

  if (openItem) {
    const item = items.find(x=>x.id===openItem);
    return (
      <div style={wrap}>
        <div style={{ paddingTop:20 }}>
          <button onClick={()=>setOpenItem(null)} style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700, color:C.sub, cursor:"pointer", marginBottom:20 }}>← رجوع</button>
          <div style={{ ...card, padding:"24px 20px" }}>
            <div style={{ fontSize:48, textAlign:"center", marginBottom:16 }}>{item.icon}</div>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <Tag text={item.tag} color={C.mauve}/>
              <Tag text={item.type==="recipe"?"🥗 وصفة":"📖 مقال"} color={C.pink}/>
              <Tag text={`⏱ ${item.time}`} color={C.muted}/>
            </div>
            <h1 style={{ fontSize:20, fontWeight:900, color:C.text, marginBottom:12, lineHeight:1.5 }}>{item.title}</h1>
            <p style={{ fontSize:13, color:C.sub, fontWeight:500, lineHeight:1.9, marginBottom:20, whiteSpace:"pre-line" }}>{item.body}</p>
            <div style={{ background:C.greenLight, border:`1px solid ${C.greenBorder}`, borderRadius:14, padding:"14px 16px" }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.green, marginBottom:8 }}>💡 نصائح عملية</div>
              {item.tips.map((t,i)=><div key={i} style={{ fontSize:13, color:C.text, fontWeight:600, padding:"4px 0", display:"flex", gap:8 }}><span style={{ color:C.green }}>✓</span>{t}</div>)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ paddingTop:20 }}>
        <div style={{ marginBottom:16 }}>
          <h2 style={{ fontSize:20, fontWeight:900, color:C.text, marginBottom:4 }}>📚 مكتبتك الهرمونية</h2>
          <p style={{ fontSize:13, color:C.sub, fontWeight:500 }}>مقالات ووصفات مخصصة لصحتك</p>
        </div>
        {/* Filter tags */}
        <div style={{ display:"flex", gap:8, overflowX:"auto", marginBottom:16, paddingBottom:4 }}>
          {tags.map(t=>(
            <button key={t} onClick={()=>setFilter(t)} style={{ padding:"7px 14px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", background:filter===t?C.pink:C.bg, border:`1.5px solid ${filter===t?C.pink:C.border}`, color:filter===t?"white":C.sub, transition:"all .15s" }}>
              {t==="all"?"الكل 📚":t}
            </button>
          ))}
        </div>
        {/* Items */}
        {filtered.map(item=>(
          <div key={item.id} style={{ ...card, cursor:"pointer" }} onClick={()=>setOpenItem(item.id)}>
            <div style={{ display:"flex", gap:12, alignItems:"center" }}>
              <div style={{ fontSize:32, flexShrink:0 }}>{item.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                  <Tag text={item.tag} color={C.mauve}/>
                  <Tag text={item.type==="recipe"?"🥗 وصفة":"📖 مقال"} color={C.pink} small/>
                  <Tag text={`⏱ ${item.time}`} color={C.muted} small/>
                </div>
                <div style={{ fontSize:14, fontWeight:800, color:C.text, lineHeight:1.4, marginBottom:4 }}>{item.title}</div>
                <div style={{ fontSize:12, color:C.sub, fontWeight:500, lineHeight:1.5 }}>{item.summary}</div>
              </div>
              <div style={{ color:C.muted, fontSize:18, flexShrink:0 }}>›</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen]   = useState("guest"); // guest | login | member
  const [client, setClient]   = useState(null);
  const [activeTab, setActiveTab] = useState("home");

  useEffect(()=>{
    async function restoreSession() {
      try {
        const saved = storage.get("__session__");
        if (saved && saved.value) {
          const clients = await getClientsFromDB();
          const c = clients.find(x=>x.name===saved.value);
          if (c) { setClient(c); setScreen("member"); }
        }
      } catch {}
    }
    restoreSession();
  },[]);

  function logout() {
    storage.del("__session__");
    setClient(null); setScreen("guest"); setActiveTab("home");
  }

  if (screen==="guest") return <GuestHome onLogin={()=>setScreen("login")}/>;
  if (screen==="login") return <LoginScreen onBack={()=>setScreen("guest")} onSuccess={c=>{setClient(c);setScreen("member");}}/>;

  // MEMBER VIEW
  return (
    <div style={{ ...page, paddingBottom:0 }}>
      <style>{FONT}</style>

      {/* Member top bar */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"12px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src={LOGO_SRC} alt="NM" style={{ background:"white", borderRadius:6, padding:2, width:32, height:32 }}/>
          <div>
            <div className="serif" style={{ fontSize:13, fontWeight:700, color:C.text, lineHeight:1.2 }}>Nutri Me</div>
            <div style={{ fontSize:9, color:C.pink, fontWeight:700, letterSpacing:1 }}>{client?.name} 🌸</div>
          </div>
        </div>
        <button onClick={logout} style={{ background:C.peach, border:`1px solid #F0D8CC`, borderRadius:10, color:C.sub, padding:"7px 14px", fontSize:11, fontWeight:700, cursor:"pointer" }}>خروج ↩</button>
      </div>

      {/* Tab content */}
      <div style={{ paddingBottom:80 }}>
        {activeTab==="home"    && <MemberHomeTab client={client} onTabChange={setActiveTab}/>}
        {activeTab==="checkin" && <CheckInTab    client={client}/>}
        {activeTab==="cycle"   && <CycleTab      client={client}/>}
        {activeTab==="tracker" && <TrackerTab    client={client}/>}
        {activeTab==="chat"    && <ChatTab       client={client}/>}
        {activeTab==="library"  && <LibraryTab     client={client}/> }
        {activeTab==="library"  && <LibraryTab     client={client}/>}
      </div>

      <MemberNav active={activeTab} onChange={t=>{ if(t==="home") setActiveTab("home"); else setActiveTab(t); }}/>
    </div>
  );
}
