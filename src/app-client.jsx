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
const LOGO_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='90' fill='%23FDF8F5' stroke='%23EDD9E5' stroke-width='2'/%3E%3Ctext x='100' y='115' text-anchor='middle' font-size='32' font-weight='900' fill='%23C2607A' font-family='Georgia,serif'%3ENM%3C/text%3E%3C/svg%3E";

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
    { id:"cycle",   icon:"🌙", label:"دورتي" },
    { id:"tracker", icon:"🧬", label:"الأعراض" },
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
    { id:"home", icon:"🏠", label:"Home" },
    { id:"articles", icon:"📖", label:"Articles" },
    { id:"recipes", icon:"🥗", label:"Recipes" },
    { id:"faq", icon:"❓", label:"FAQ" },
  ];

  return (
    <div style={page}>
      <style>{FONT}</style>

      {/* Top Bar */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src={LOGO_SRC} alt="NM" style={{ width:36, height:36 }}/>
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
                      "🎓 دكتوراه في فيزيوثيرابي صحة المرأة — جامعة القاهرة",
                      "🏛️ دبلوم تغذية إكلينيكية — الجامعة الأمريكية بالقاهرة",
                      "💊 متخصصة PCOS ومقاومة الإنسولين",
                      "⭐ متابعة أونلاين شخصية 100%"
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
              <button onClick={onLogin} style={{ background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", borderRadius:14, color:"white", padding:"14px 28px", fontSize:14, fontWeight:800, cursor:"pointer" }}>
                Start your personalized follow-up →
              </button>
            </div>
          </div>
        )}

        {/* ARTICLES TAB */}
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
        <img src={LOGO_SRC} style={{ width:80, height:80, margin:"0 auto 16px", display:"block" }} alt="NM"/>
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
          <img src={LOGO_SRC} alt="NM" style={{ width:32, height:32 }}/>
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
      </div>

      <MemberNav active={activeTab} onChange={t=>{ if(t==="home") setActiveTab("home"); else setActiveTab(t); }}/>
    </div>
  );
}
