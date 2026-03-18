import { useState, useEffect } from "react";

// ── SUPABASE ──
const SB_URL = "https://uqykrqxqtogecakrjpys.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeWtycXhxdG9nZWNha3JqcHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjc2MzcsImV4cCI6MjA4ODkwMzYzN30.h5Y0YTGgEWKPXBIvb1q0I_mwNNKBlxc5jV_EqG78Me4";
const sbH = { "apikey": SB_KEY, "Authorization": "Bearer "+SB_KEY, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" };

async function sbGet(table, filters) {
  try {
    const r = await fetch(SB_URL+"/rest/v1/"+table+"?"+(filters||""), { headers: { "apikey": SB_KEY, "Authorization": "Bearer "+SB_KEY } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function sbUpsert(table, data, onConflict) {
  try {
    const url = SB_URL+"/rest/v1/"+table+(onConflict?"?on_conflict="+onConflict:"");
    const r = await fetch(url, { method:"POST", headers:sbH, body:JSON.stringify(data) });
    if (!r.ok) { console.error("sbUpsert", table, await r.text()); return false; }
    return true;
  } catch(e) { console.error("sbUpsert", e); return false; }
}
async function sbUpdate(table, data, filters) {
  try {
    const headers = { "apikey": SB_KEY, "Authorization": "Bearer "+SB_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" };
    const r = await fetch(SB_URL+"/rest/v1/"+table+"?"+filters, { method:"PATCH", headers, body:JSON.stringify(data) });
    if (!r.ok) { console.error("sbUpdate error", table, await r.text()); return false; }
    return true;
  } catch(e) { console.error("sbUpdate exception", e); return false; }
}
async function sbDelete(table, filters) {
  try {
    await fetch(SB_URL+"/rest/v1/"+table+"?"+filters, { method:"DELETE", headers:sbH });
  } catch {}
}

// ── FONT ──
const FONT = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
* { font-family: 'Tajawal', Georgia, serif; }
.card-hover:hover { box-shadow: 0 8px 32px rgba(194,96,122,0.18) !important; transform: translateY(-1px); transition: all 0.2s; }
`;

const C = {
  bg:"#FDF8F5", card:"#FFFFFF", border:"#EDD9E5", borderSoft:"#F5EBF0",
  pink:"#C2607A", rose:"#D4829A", mauve:"#9B72AA", lavender:"#B8A0CC",
  blush:"#F2D5DF", peach:"#F7E8E0",
  green:"#5DAD85", greenLight:"#E6F5EE", greenBorder:"#A8D9BC",
  text:"#2D1F28", sub:"#8A6070", muted:"#BFA0AD", red:"#C9607A", redLight:"#FFF0F3",
  white:"#FFFFFF", shadow:"rgba(194,96,122,0.10)",
};


const LOGO_SRC = "data:image/png;base64,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";

const PLAN_LABELS = { 1:"شهر", 2:"شهرين", 3:"٣ أشهر" };
const PLAN_MONTHS = { 1:1, 2:2, 3:3 };
const TODAY = new Date().toISOString().split("T")[0];

const PRESET_MSGS = [
  "أنتِ رائعة وتستحقين كل نجاح! 🌸",
  "كل خطوة صغيرة تقربكِ من هدفك 💪",
  "جسمك يشكرك على كل قرار صحي ✨",
  "اليوم فرصة جديدة — استغليها 🌟",
  "الاستمرارية هي السر، وأنتِ تثبتين ذلك 💗",
  "فخورة بكِ جداً، استمري! 🎉",
];

function getSubInfo(startDate, planMonths) {
  const start = new Date(startDate), now = new Date();
  const totalDays = planMonths * 30;
  const elapsed = Math.floor((now - start) / 86400000);
  const remaining = Math.max(0, totalDays - elapsed);
  const weeksDone = Math.floor(elapsed / 7);
  const weeksTotal = Math.floor(totalDays / 7);
  const weeksLeft = Math.max(0, weeksTotal - weeksDone);
  const followupsTotal = planMonths * 4;
  const followupsDone = Math.min(weeksDone, followupsTotal);
  const followupsLeft = Math.max(0, followupsTotal - followupsDone);
  const isExpired = remaining <= 0;
  const progressPct = Math.min(100, Math.round((elapsed / totalDays) * 100));
  return { elapsed, remaining, weeksDone, weeksLeft, weeksTotal, followupsDone, followupsLeft, followupsTotal, isExpired, progressPct, totalDays };
}

function genHistory(name) {
  const days = []; const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    if (Math.random() > 0.25) days.push({
      date: d.toISOString().split("T")[0],
      weight:(60+Math.random()*20).toFixed(1), water:(1.2+Math.random()*1.8).toFixed(1),
      sleep:(5+Math.random()*4).toFixed(1), stress:Math.floor(Math.random()*10)+1,
      meals:Math.floor(Math.random()*3)+2, coffee:Math.floor(Math.random()*4),
      salad:Math.random()>0.4, fastFood:Math.random()>0.7,
      followedPlan:Math.random()>0.3, supplements:Math.random()>0.5,
      exercise:Math.random()>0.5, exerciseMin:Math.floor(Math.random()*60)+10,
      binge:Math.random()>0.8,
      mood:["😞","😐","🙂","😊","🌟"][Math.floor(Math.random()*5)],
      note: i===0?"أحسست بتحسن اليوم!":"",
    });
  }
  return days;
}

const DAYS_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

const INIT_CLIENTS = [
  { name:"Soso",   code:"1234", plan:1, startDate:"2026-03-09", sessionDay:0 },
  { name:"Israa",  code:"1350", plan:1, startDate:"2026-03-09", sessionDay:0 },
  { name:"Mariam", code:"8889", plan:1, startDate:"2026-03-09", sessionDay:0 },
  { name:"Noren",  code:"1351", plan:1, startDate:"2026-03-12", sessionDay:0 },
];

function getNextSessionDate(sessionDay) {
  const today = new Date();
  const todayDay = today.getDay();
  let diff = sessionDay - todayDay;
  if (diff <= 0) diff += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toLocaleDateString("ar-EG", { weekday:"long", day:"numeric", month:"long" });
}

export default function Dashboard() {
  const [view, setView]           = useState("overview");
  const [selected, setSelected]   = useState(null);
  const [histRange, setHistRange] = useState("week");
  const [clients, setClients]     = useState(INIT_CLIENTS);
  const [editing, setEditing]     = useState(null);
  const [saving, setSaving]       = useState(false);
  const [allData, setAllData]     = useState(()=>Object.fromEntries(INIT_CLIENTS.map(c=>[c.name,genHistory(c.name)])));
  const [msgModal, setMsgModal]   = useState(null);
  const [msgText, setMsgText]     = useState("");
  const [msgSent, setMsgSent]     = useState(false);
  const [logoSrc, setLogoSrc]     = useState(null);

  const [newName,  setNewName]  = useState("");
  const [newCode,  setNewCode]  = useState("");
  const [newPlan,  setNewPlan]  = useState(1);
  const [newStart, setNewStart] = useState(TODAY);
  async function loadClients() {
    const rows = await sbGet("clients", "select=name,code,plan,start_date,session_day&order=id");
    if (rows && rows.length > 0) {
      const mapped = rows.map(r=>({ name:r.name, code:r.code, plan:r.plan, startDate:r.start_date, sessionDay:r.session_day||0 }));
      setClients(mapped);
      setAllData(Object.fromEntries(mapped.map(c=>[c.name,genHistory(c.name)])));
      setSelected(prev => prev ? (mapped.find(c=>c.name===prev.name)||prev) : null);
    }
  }

  useEffect(()=>{ loadClients(); },[]);
  useEffect(()=>{ if(view==="overview") loadClients(); },[view]);

  const clientObj = selected ? clients.find(c=>c.name===selected.name) : null;

  async function addClient() {
    if (!newName.trim() || newCode.length !== 4) return;
    const c = { name:newName.trim(), code:newCode, plan:parseInt(newPlan), startDate:newStart, sessionDay:0 };
    // Update UI immediately
    setClients(p=>[...p, c]);
    setAllData(p=>({...p, [c.name]:[]}));
    setNewName(""); setNewCode(""); setNewPlan(1); setNewStart(TODAY);
    setView("overview");
    // Sync to Supabase in background
    sbUpsert("clients", { name:c.name, code:c.code, plan:c.plan, start_date:c.startDate, session_day:0 });
  }

  async function deleteClient(name) {
    // Update UI immediately
    setClients(p=>p.filter(c=>c.name!==name));
    if (selected && selected.name===name) { setSelected(null); setView("overview"); }
    // Sync to Supabase in background
    sbDelete("clients", "name=eq."+name);
  }

  async function saveEdit(u) {
    setSaving(true);
    // Update UI immediately
    setClients(p=>p.map(c=>c.name===u.name?u:c));
    if (selected && selected.name===u.name) setSelected(u);
    // Save to Supabase
    const payload = { name:u.name, code:u.code, plan:parseInt(u.plan), start_date:u.startDate, session_day:u.sessionDay!=null?u.sessionDay:0 };
    console.log("saving to supabase:", payload);
    const ok = await sbUpsert("clients", payload, "name");
    console.log("save result:", ok);
    if (!ok) {
      await new Promise(r=>setTimeout(r,1000));
      const ok2 = await sbUpsert("clients", payload, "name");
      console.log("retry result:", ok2);
      if (!ok2) { alert("⚠️ فشل الحفظ — تحققي من الاتصال"); setSaving(false); return; }
    }
    setSaving(false);
    setEditing(null);
  }

  async function sendMsg(clientName, text) {
    if (!text.trim()) return;
    const t = new Date().toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"});
    // Update UI immediately
    setMsgModal(null); setMsgText(""); setMsgSent(true);
    setTimeout(()=>setMsgSent(false), 3000);
    // Sync to Supabase in background
    sbUpsert("messages", { client_name:clientName, role:"doctor", text:text, time:t });
  }

  function handleLogoUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setLogoSrc(ev.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:C.text }}>
      <style>{FONT}</style>

      {/* ── HEADER ── */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:14, boxShadow:`0 2px 12px ${C.shadow}` }}>
        {view!=="overview" && (
          <button onClick={()=>{ setView("overview"); setSelected(null); }} style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:10, color:C.pink, width:36, height:36, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>←</button>
        )}

        {/* Logo */}
        <label style={{ cursor:"pointer", flexShrink:0 }} title="اضغط لتغيير اللوجو">
          <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleLogoUpload} />
          <div style={{ width:44, height:44, borderRadius:"50%", background:`linear-gradient(135deg,${C.blush},#F0E4F5)`, border:`2px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", boxShadow:`0 2px 8px ${C.shadow}` }}>
  <img src={logoSrc || LOGO_SRC} alt="Nutri Me" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          </div>
        </label>

        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:17, fontWeight:900, color:C.text, margin:0 }}>
            {view==="overview" ? "Dr. Mai" : view==="addClient" ? "إضافة عميلة" : `${selected ? selected.name : ""}`}
          </h1>
          <p style={{ fontSize:11, color:C.muted, margin:"2px 0 0", fontWeight:500 }}>
            {view==="overview" ? `لوحة التحكم · ${TODAY}` : view==="addClient" ? "عميلة جديدة" : `${PLAN_LABELS[(clientObj||{}).plan]} · بدأت ${(clientObj||{}).startDate||""}`}
          </p>
        </div>

        <div style={{ display:"flex", gap:8 }}>
          {view==="overview" && (
            <button onClick={()=>setView("addClient")} style={{ background:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", borderRadius:10, color:C.white, padding:"8px 14px", fontSize:13, fontWeight:800, cursor:"pointer", boxShadow:`0 4px 12px ${C.shadow}` }}>
              + عميلة
            </button>
          )}
          {view==="client" && clientObj && (
            <button onClick={()=>setEditing({...clientObj})} style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:10, color:C.pink, padding:"7px 14px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              ✏️ تعديل
            </button>
          )}
          {view==="client" && clientObj && (
            <button onClick={()=>{ setMsgModal(clientObj.name); setMsgText(""); }} style={{ background:"linear-gradient(135deg,#F5EBF8,#EDE8F5)", border:`1px solid ${C.lavender}`, borderRadius:10, color:C.mauve, padding:"7px 14px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              💬 رسالة
            </button>
          )}
        </div>
      </div>

      {/* ── SENT TOAST ── */}
      {msgSent && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:C.green, color:C.white, borderRadius:12, padding:"10px 24px", fontSize:13, fontWeight:700, zIndex:200, boxShadow:`0 4px 20px ${C.shadow}` }}>
          ✓ تم إرسال الرسالة للعميلة
        </div>
      )}

      {/* ── MSG MODAL ── */}
      {msgModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(45,31,40,0.45)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:24, padding:28, width:"100%", maxWidth:400, boxShadow:`0 16px 48px ${C.shadow}` }}>
            <h3 style={{ fontSize:17, fontWeight:900, color:C.text, marginBottom:6 }}>💬 رسالة تحفيز</h3>
            <p style={{ fontSize:12, color:C.muted, fontWeight:500, marginBottom:18 }}>إلى: {msgModal}</p>

            {/* Preset buttons */}
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              {PRESET_MSGS.map((m,i) => (
                <button key={i} onClick={()=>setMsgText(m)} style={{ textAlign:"right", padding:"10px 14px", borderRadius:12, fontSize:13, fontWeight:600, cursor:"pointer", background:msgText===m?C.blush:C.bg, border:msgText===m?`1.5px solid ${C.pink}`:`1px solid ${C.border}`, color:msgText===m?C.pink:C.sub, transition:"all 0.15s" }}>
                  {m}
                </button>
              ))}
            </div>

            <div style={{ fontSize:12, color:C.muted, fontWeight:600, marginBottom:6 }}>أو اكتبي رسالة خاصة:</div>
            <textarea value={msgText} onChange={e=>setMsgText(e.target.value)} placeholder="اكتبي رسالتك هنا..."
              style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"12px 14px", color:C.text, fontSize:14, fontWeight:500, outline:"none", width:"100%", resize:"vertical", minHeight:80, marginBottom:16, boxSizing:"border-box" }} />

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setMsgModal(null)} style={{ flex:1, padding:"11px 0", borderRadius:12, background:C.bg, border:`1.5px solid ${C.border}`, color:C.muted, cursor:"pointer", fontSize:14, fontWeight:700 }}>إلغاء</button>
              <button onClick={()=>sendMsg(msgModal, msgText)} disabled={!msgText.trim()} style={{ flex:2, padding:"11px 0", borderRadius:12, background:msgText.trim()?`linear-gradient(135deg,${C.pink},${C.mauve})`:C.border, border:"none", color:C.white, cursor:msgText.trim()?"pointer":"not-allowed", fontSize:14, fontWeight:800, boxShadow:msgText.trim()?`0 4px 16px ${C.shadow}`:"none" }}>
                إرسال 💌
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editing && (
        <div style={{ position:"fixed", inset:0, background:"rgba(45,31,40,0.45)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:24, padding:28, width:"100%", maxWidth:380, boxShadow:`0 16px 48px ${C.shadow}` }}>
            <h3 style={{ fontSize:17, fontWeight:900, color:C.text, marginBottom:22 }}>تعديل اشتراك {editing.name}</h3>
            <Lbl>الكود السري 🔑</Lbl>
            <input maxLength={4} value={editing.code||""} onChange={e=>setEditing(ec=>({...ec,code:e.target.value.replace(/\D/g,"").slice(0,4)}))}
              placeholder="••••"
              style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"12px", color:C.pink, fontSize:26, fontWeight:900, letterSpacing:14, width:"100%", outline:"none", textAlign:"center", boxSizing:"border-box", marginBottom:16 }} />
            <Lbl>نوع الاشتراك</Lbl>
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              {[1,2,3].map(p=>(
                <button key={p} onClick={()=>setEditing(e=>({...e,plan:p}))} style={{ flex:1, padding:"10px 0", borderRadius:10, fontSize:14, fontWeight:800, cursor:"pointer", background:editing.plan===p?C.blush:C.bg, border:editing.plan===p?`2px solid ${C.pink}`:`1.5px solid ${C.border}`, color:editing.plan===p?C.pink:C.muted, transition:"all 0.2s" }}>
                  {PLAN_LABELS[p]}
                </button>
              ))}
            </div>
            <Lbl>تاريخ البداية</Lbl>
            <input type="date" value={editing.startDate} onChange={e=>setEditing(ec=>({...ec,startDate:e.target.value}))}
              style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:14, fontWeight:600, width:"100%", outline:"none", marginBottom:16, boxSizing:"border-box" }} />
            <Lbl>يوم الموعد الأسبوعي 📅</Lbl>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:24 }}>
              {DAYS_AR.map((d,i)=>(
                <button key={i} onClick={()=>setEditing(ec=>({...ec,sessionDay:i}))}
                  style={{ padding:"8px 10px", borderRadius:10, fontSize:12, fontWeight:800, cursor:"pointer", background:(editing.sessionDay!=null?editing.sessionDay:0)===i?C.blush:C.bg, border:(editing.sessionDay!=null?editing.sessionDay:0)===i?`2px solid ${C.pink}`:`1.5px solid ${C.border}`, color:(editing.sessionDay!=null?editing.sessionDay:0)===i?C.pink:C.muted, transition:"all 0.2s" }}>
                  {d}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setEditing(null)} style={{ flex:1, padding:"11px 0", borderRadius:12, background:C.bg, border:`1.5px solid ${C.border}`, color:C.muted, cursor:"pointer", fontSize:14, fontWeight:700 }}>إلغاء</button>
              <button onClick={()=>saveEdit(editing)} disabled={saving} style={{ flex:2, padding:"11px 0", borderRadius:12, background:saving?C.muted:`linear-gradient(135deg,${C.pink},${C.mauve})`, border:"none", color:C.white, cursor:saving?"not-allowed":"pointer", fontSize:14, fontWeight:800, boxShadow:saving?"none":`0 4px 16px ${C.shadow}`, opacity:saving?0.7:1 }}>{saving?"⏳ جاري الحفظ...":"✓ حفظ"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEWS ── */}
      <div style={{ padding:"24px 20px", maxWidth:600, margin:"0 auto" }}>
        {view==="overview" && <Overview clients={clients} data={allData} onSelect={c=>{setSelected(c);setView("client");}} onMsg={name=>{setMsgModal(name);setMsgText("");}} />}
        {view==="addClient" && (
          <AddClientForm name={newName} setName={setNewName} code={newCode} setCode={setNewCode}
            plan={newPlan} setPlan={setNewPlan} start={newStart} setStart={setNewStart}
            onAdd={addClient} clients={clients} onDelete={deleteClient} />
        )}
        {view==="client" && clientObj && (
          <ClientDetail client={clientObj} data={allData[clientObj.name]||[]} range={histRange} setRange={setHistRange}
            onMsg={()=>{setMsgModal(clientObj.name);setMsgText("");}} />
        )}
      </div>
    </div>
  );
}

// ── ADD CLIENT FORM ──
function AddClientForm({ name, setName, code, setCode, plan, setPlan, start, setStart, onAdd, clients, onDelete }) {
  const valid = name.trim() && code.length===4;
  return (
    <>
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:20, padding:"24px 22px", marginBottom:20, boxShadow:`0 4px 20px ${C.shadow}` }}>
        <h2 style={{ fontSize:18, fontWeight:900, color:C.pink, marginBottom:20 }}>🌸 إضافة عميلة جديدة</h2>

        <Lbl>الاسم</Lbl>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="مثال: Lina A."
          style={INP} />

        <Lbl>الكود السري (٤ أرقام) 🔑</Lbl>
        <input maxLength={4} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="مثال: 1234"
          style={{ ...INP, fontSize:22, fontWeight:900, letterSpacing:10, textAlign:"center", color:C.pink }} />

        <Lbl>نوع الاشتراك</Lbl>
        <div style={{ display:"flex", gap:10, marginBottom:16 }}>
          {[1,2,3].map(p=>(
            <button key={p} onClick={()=>setPlan(p)} style={{ flex:1, padding:"12px 0", borderRadius:12, fontSize:14, fontWeight:800, cursor:"pointer", background:plan===p?C.blush:C.bg, border:plan===p?`2px solid ${C.pink}`:`1.5px solid ${C.border}`, color:plan===p?C.pink:C.muted, transition:"all 0.2s" }}>
              {PLAN_LABELS[p]}
              <div style={{ fontSize:10, fontWeight:500, color:plan===p?C.rose:C.muted, marginTop:2 }}>{p*4} متابعة</div>
            </button>
          ))}
        </div>

        <Lbl>تاريخ بداية الاشتراك</Lbl>
        <input type="date" value={start} onChange={e=>setStart(e.target.value)} style={{ ...INP, marginBottom:20 }} />

        <button onClick={onAdd} disabled={!valid} style={{ width:"100%", padding:"14px 0", borderRadius:14, fontSize:16, fontWeight:800, cursor:valid?"pointer":"not-allowed", background:valid?`linear-gradient(135deg,${C.pink},${C.mauve})`:C.border, border:"none", color:C.white, boxShadow:valid?`0 6px 20px ${C.shadow}`:"none", transition:"all 0.3s" }}>
          ✓ إضافة العميلة
        </button>
      </div>

      {/* Existing clients */}
      {clients.length > 0 && (
        <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:20, padding:"20px 22px", boxShadow:`0 4px 20px ${C.shadow}` }}>
          <h3 style={{ fontSize:15, fontWeight:800, color:C.sub, marginBottom:14 }}>العملاء الحاليين ({clients.length})</h3>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {clients.map(c => {
              const si = getSubInfo(c.startDate, PLAN_MONTHS[c.plan]);
              return (
                <div key={c.name} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:C.text }}>{c.name}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:3, fontWeight:500 }}>
                      كود: <strong style={{ color:C.pink, letterSpacing:2 }}>{c.code}</strong> · {PLAN_LABELS[c.plan]} · فاضل {si.remaining} يوم
                    </div>
                  </div>
                  <button onClick={()=>onDelete(c.name)} style={{ background:C.redLight, border:`1px solid ${C.red}40`, borderRadius:8, color:C.red, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>حذف</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── OVERVIEW ──
function Overview({ clients, data, onSelect, onMsg }) {
  const notLogged = clients.filter(c=>!(data[c.name]||[]).find(d=>d.date===TODAY));
  const active = clients.filter(c=>getSubInfo(c.startDate,PLAN_MONTHS[c.plan]).remaining>0);

  return (
    <>
      {/* Alert */}
      {notLogged.length>0 && (
        <div style={{ background:C.redLight, border:`1px solid ${C.red}40`, borderRadius:14, padding:"14px 18px", marginBottom:20, display:"flex", gap:12, alignItems:"center" }}>
          <span style={{ fontSize:22 }}>⚠️</span>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:C.red, marginBottom:3 }}>لم يسجّلن اليوم</div>
            <div style={{ fontSize:12, color:C.sub, fontWeight:500 }}>{notLogged.map(c=>c.name).join("  ·  ")}</div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:22 }}>
        <StatBox label="سجّلن اليوم" value={`${clients.length-notLogged.length}/${clients.length}`} color={C.green} bg={C.greenLight} border={C.greenBorder} />
        <StatBox label="اشتراك فعّال" value={`${active.length}`} color={C.mauve} bg="#F5EBF8" border={C.lavender} />
        <StatBox label="عدد العملاء" value={`${clients.length}`} color={C.pink} bg={C.blush} border={C.rose} />
      </div>

      {clients.length===0 ? (
        <div style={{ background:C.white, border:`2px dashed ${C.border}`, borderRadius:20, padding:"48px 24px", textAlign:"center", boxShadow:`0 4px 20px ${C.shadow}` }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🌸</div>
          <h3 style={{ fontSize:18, fontWeight:900, color:C.text, marginBottom:8 }}>لا يوجد عملاء بعد</h3>
          <p style={{ fontSize:14, color:C.muted, fontWeight:500, lineHeight:1.8 }}>اضغطي على زرار <strong style={{ color:C.pink }}>+ عميلة</strong> أعلاه لإضافة أول عميلة وتحديد الكود السري الخاص بها</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize:12, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:2, marginBottom:12 }}>العملاء</div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {clients.map(client => {
              const si = getSubInfo(client.startDate, PLAN_MONTHS[client.plan]);
              const history = data[client.name]||[];
              const todayLog = history.find(d=>d.date===TODAY);
              const last7 = history.slice(0,7);
              const compliance = Math.round((last7.filter(d=>d.followedPlan).length/Math.max(last7.length,1))*100);
              const hasMsg = false; // will be shown in detail view
              const clientReferrals = 0;
              const hasClientMsg = false;

              return (
                <div key={client.name} style={{ background:C.white, border:`1.5px solid ${si.isExpired?C.red+"60":C.border}`, borderRadius:18, padding:"18px 18px", boxShadow:`0 3px 16px ${C.shadow}`, transition:"all 0.2s" }} className="card-hover">
                  {/* Top row */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, cursor:"pointer" }} onClick={()=>onSelect(client)}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:16, color:C.muted }}>›</span>
                      <span style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:8, padding:"3px 10px", fontSize:12, color:C.pink, fontWeight:800, letterSpacing:3 }}>
                        🔑 {client.code}
                      </span>
                      {hasMsg && <span style={{ background:"#F5EBF8", border:`1px solid ${C.lavender}`, borderRadius:8, padding:"3px 8px", fontSize:11, color:C.mauve, fontWeight:700 }}>💬 رسالة</span>}
                      {hasClientMsg && <span style={{ background:"#FFF0F4", border:`1px solid ${C.rose}50`, borderRadius:8, padding:"3px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>💌 سؤال</span>}
                      {clientReferrals > 0 && <span style={{ background:"#FFF8E7", border:"1px solid #F0D9A0", borderRadius:8, padding:"3px 8px", fontSize:11, color:"#A07030", fontWeight:700 }}>🎁 {clientReferrals} دعوة</span>}
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:16, fontWeight:800, color:C.text }}>{client.name}</div>
                      <div style={{ fontSize:11, color:todayLog?C.green:C.red, marginTop:2, fontWeight:700 }}>
                        {todayLog?`✓ سجّلت اليوم ${todayLog.mood}`:"⚠️ لم تسجل اليوم"}
                      </div>
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={{ marginBottom:14 }} onClick={()=>onSelect(client)} className="cursor-pointer">
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.sub, marginBottom:6, fontWeight:600 }}>
                      <span style={{ color:si.isExpired?C.red:C.muted }}>{si.isExpired?"⚠️ انتهى":` فاضل ${si.remaining} يوم`}</span>
                      <span>{PLAN_LABELS[client.plan]} · أسبوع {si.weeksDone+1}</span>
                    </div>
                    <div style={{ height:7, background:C.borderSoft, borderRadius:99, overflow:"hidden" }}>
                      <div style={{ width:`${si.progressPct}%`, height:"100%", background:si.isExpired?C.red:`linear-gradient(90deg,${C.pink},${C.mauve})`, borderRadius:99, transition:"width 0.5s" }} />
                    </div>
                  </div>

                  {/* Chips + msg button */}
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, flex:1 }}>
                      <SmChip label="الالتزام" value={`${compliance}%`} color={compliance>=70?C.green:C.red} />
                      <SmChip label="متابعات" value={`${si.followupsDone}/${si.followupsTotal}`} color={C.mauve} />
                      <SmChip label="أسابيع باقية" value={`${si.weeksLeft}`} color={si.weeksLeft<=1?C.red:C.lavender} />
                    </div>
                    <button onClick={e=>{e.stopPropagation();onMsg(client.name);}} style={{ background:"#F5EBF8", border:`1px solid ${C.lavender}`, borderRadius:10, color:C.mauve, padding:"8px 10px", fontSize:18, cursor:"pointer", flexShrink:0 }} title="إرسال رسالة">💬</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ── CLIENT DETAIL ──
function ClientDetail({ client, data, range, setRange, onMsg }) {
  if (!client) return null;
  const si = getSubInfo(client.startDate, PLAN_MONTHS[client.plan]);
  const { weeksDone, weeksLeft, followupsDone, followupsLeft, followupsTotal, isExpired, progressPct, remaining, totalDays, elapsed } = si;
  const days = range==="week"?data.slice(0,7):data.slice(0,30);
  const today = data.find(d=>d.date===TODAY);
  const [todayMsg, setTodayMsg] = useState(null);
  const [measHistory, setMeasHistory] = useState([]);
  const [chartMetric, setChartMetric] = useState("weight");
  const [realToday, setRealToday] = useState(null);

  useEffect(()=>{
    async function loadRealData() {
      // Load today's real log
      try {
        const logs = await sbGet("daily_logs", "client_name=eq."+client.name+"&date=eq."+TODAY+"&select=data");
        if (logs && logs.length > 0 && logs[0].data) setRealToday(logs[0].data);
      } catch {}
      // Load recent doctor message
      try {
        const msgs = await sbGet("messages", "client_name=eq."+client.name+"&role=eq.doctor&order=created_at.desc&limit=1&select=text,time");
        if (msgs && msgs.length > 0) setTodayMsg(msgs[0]);
      } catch {}
      // Load measurements history
      try {
        const allLogs = await sbGet("daily_logs", "client_name=eq."+client.name+"&select=date,data&order=date.asc");
        if (allLogs && allLogs.length > 0) {
          const hist = allLogs.filter(r=>r.data&&(r.data.weight||r.data.waist||r.data.hips||r.data.bodyFat))
            .map(r=>({ date:r.date, weight:parseFloat(r.data.weight)||null, waist:parseFloat(r.data.waist)||null, hips:parseFloat(r.data.hips)||null, bodyFat:parseFloat(r.data.bodyFat)||null }));
          setMeasHistory(hist);
          return;
        }
      } catch {}
      // Fallback to generated data
      const hist = [];
      data.forEach(d => { if (d.weight) hist.push({ date:d.date, weight:d.weight, waist:d.waist||null, hips:d.hips||null, bodyFat:d.bodyFat||null }); });
      hist.sort((a,b)=>a.date.localeCompare(b.date));
      setMeasHistory(hist);
    }
    loadRealData();
  },[client.name]);

  const effectiveToday = realToday || today;
  const chartPoints = measHistory.filter(d=>d[chartMetric]).slice(-10);
  const vals = chartPoints.map(d=>d[chartMetric]);
  const minV = vals.length ? Math.min(...vals)*0.97 : 0;
  const maxV = vals.length ? Math.max(...vals)*1.03 : 100;
  const W=300, H=90;
  const px = i => vals.length<2 ? W/2 : (i/(vals.length-1))*(W-24)+12;
  const py = v => H - ((v-minV)/(maxV-minV||1))*(H-20)-10;
  const pathD = vals.map((v,i)=>`${i===0?"M":"L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const areaD = vals.length>1 ? `${pathD} L${px(vals.length-1).toFixed(1)},${H} L${px(0).toFixed(1)},${H} Z` : "";
  const trend = vals.length>=2 ? vals[vals.length-1]-vals[0] : null;
  const metricsMeta = { weight:{label:"الوزن",color:C.pink,unit:"kg"}, waist:{label:"الوسط",color:C.mauve,unit:"cm"}, hips:{label:"الأرداف",color:C.lavender,unit:"cm"}, bodyFat:{label:"الدهون",color:"#C8963E",unit:"%"} };
  const active = metricsMeta[chartMetric];

  // Client messages loaded via Supabase in useEffect above
  const [clientMsgs, setClientMsgs] = useState([]);
  const [todaySymptoms, setTodaySymptoms] = useState(null);

  useEffect(()=>{
    async function loadMsgsAndSymptoms() {
      try {
        const msgs = await sbGet("messages", "client_name=eq."+client.name+"&role=eq.user&order=created_at.desc&select=text,time,created_at");
        if (msgs && msgs.length > 0) setClientMsgs(msgs);
      } catch {}
      try {
        const syms = await sbGet("hormone_symptoms", "client_name=eq."+client.name+"&date=eq."+TODAY+"&select=data");
        if (syms && syms.length > 0 && syms[0].data) setTodaySymptoms(syms[0].data);
      } catch {}
    }
    loadMsgsAndSymptoms();
  },[client.name]);

  const milestones = Array.from({length:Math.floor(totalDays/7)},(_,i)=>({
    weekNum:i+1, done:weeksDone>=i+1, current:weeksDone+1===i+1
  }));

  return (
    <>
      {/* Today's message preview */}
      {todayMsg && (
        <div style={{ background:"linear-gradient(135deg,#F5EBF8,#EDE8F5)", border:`1px solid ${C.lavender}`, borderRadius:16, padding:"14px 18px", marginBottom:16, display:"flex", gap:12, alignItems:"flex-start" }}>
          <span style={{ fontSize:22 }}>💬</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, color:C.mauve, fontWeight:800, marginBottom:4 }}>رسالة اليوم من {todayMsg.from}</div>
            <div style={{ fontSize:14, color:C.text, fontWeight:600, lineHeight:1.7 }}>{todayMsg.text}</div>
          </div>
          <button onClick={onMsg} style={{ background:C.blush, border:`1px solid ${C.border}`, borderRadius:8, color:C.pink, padding:"5px 10px", fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>تعديل</button>
        </div>
      )}
      {!todayMsg && (
        <button onClick={onMsg} style={{ width:"100%", background:"#F5EBF8", border:`1.5px dashed ${C.lavender}`, borderRadius:14, padding:"12px 18px", marginBottom:16, color:C.mauve, fontSize:14, fontWeight:700, cursor:"pointer", textAlign:"center" }}>
          💬 أرسلي رسالة تحفيز لـ {client.name} اليوم
        </button>
      )}

      {/* Client messages to doctor */}
      {clientMsgs.length > 0 && (
        <div style={{ background:C.white, border:`1.5px solid ${C.pink}40`, borderRadius:16, padding:"14px 18px", marginBottom:16, boxShadow:`0 2px 12px ${C.shadow}` }}>
          <div style={{ fontSize:12, color:C.pink, fontWeight:800, marginBottom:10 }}>💌 رسائل {client.name} للدكتورة</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {clientMsgs.map((m,i)=>(
              <div key={i} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>{m.date} · {new Date(m.sentAt).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}</div>
                <div style={{ fontSize:13, color:C.text, fontWeight:600, lineHeight:1.7 }}>{m.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscription */}
      <div style={{ background:C.white, border:`1.5px solid ${isExpired?C.red+"50":C.border}`, borderRadius:20, padding:20, marginBottom:16, boxShadow:`0 4px 20px ${C.shadow}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <span style={{ fontSize:12, color:isExpired?C.red:C.pink, fontWeight:800, textTransform:"uppercase", letterSpacing:1 }}>
            {isExpired?"⚠️ انتهى الاشتراك":`اشتراك ${PLAN_LABELS[client.plan]}`}
          </span>
          <span style={{ fontSize:11, color:C.muted, fontWeight:500 }}>بدأت {client.startDate}</span>
        </div>
        <div style={{ height:8, background:C.borderSoft, borderRadius:99, overflow:"hidden", marginBottom:12 }}>
          <div style={{ width:`${progressPct}%`, height:"100%", background:isExpired?C.red:`linear-gradient(90deg,${C.pink},${C.mauve})`, borderRadius:99 }} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:18 }}>
          <BigChip label="يوم مضى" value={`${elapsed}`} color={C.sub} />
          <BigChip label="باقي" value={isExpired?"منتهي":`${remaining}ي`} color={isExpired?C.red:C.pink} />
          <BigChip label="متابعات" value={`${followupsDone}/${followupsTotal}`} color={C.mauve} />
        </div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:10, fontWeight:600 }}>مسار الأسابيع</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:followupsLeft>0?14:0 }}>
          {milestones.map(({weekNum,done,current})=>(
            <div key={weekNum} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:done?C.blush:current?"#F5EBF8":C.bg, border:`2px solid ${done?C.pink:current?C.mauve:C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:done?C.pink:current?C.mauve:C.muted, fontWeight:800 }}>
                {done?"✓":weekNum}
              </div>
              <span style={{ fontSize:9, color:current?C.mauve:C.muted, fontWeight:600 }}>{current?"الآن":done?"✓":`م${weekNum}`}</span>
            </div>
          ))}
        </div>
        {followupsLeft>0 && (
          <div style={{ background:"#F5EBF8", border:`1px solid ${C.lavender}`, borderRadius:12, padding:"10px 14px", display:"flex", gap:10, alignItems:"center" }}>
            <span style={{ fontSize:18 }}>📅</span>
            <div>
              <div style={{ fontSize:12, color:C.mauve, fontWeight:800 }}>متابعة أسبوع {weeksDone+1}</div>
              <div style={{ fontSize:11, color:C.sub, fontWeight:500 }}>فاضل {followupsLeft} متابعة من أصل {followupsTotal}</div>
            </div>
          </div>
        )}
        {/* Session day */}
        <div style={{ background:C.greenLight, border:`1px solid ${C.greenBorder}`, borderRadius:12, padding:"10px 14px", display:"flex", gap:10, alignItems:"center", marginTop:10 }}>
          <span style={{ fontSize:18 }}>🗓️</span>
          <div>
            <div style={{ fontSize:12, color:C.green, fontWeight:800 }}>يوم الموعد: {DAYS_AR[client.sessionDay!=null?client.sessionDay:0]}</div>
            <div style={{ fontSize:11, color:C.sub, fontWeight:500 }}>الموعد القادم: {getNextSessionDate(client.sessionDay!=null?client.sessionDay:0)}</div>
          </div>
        </div>
      </div>

      {/* Today */}
      {effectiveToday ? (
        <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:20, padding:18, marginBottom:16, boxShadow:`0 4px 16px ${C.shadow}` }}>
          <div style={{ fontSize:12, color:C.muted, textTransform:"uppercase", letterSpacing:2, marginBottom:14, fontWeight:700 }}>ملخص اليوم</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:14 }}>
            {(effectiveToday||{}).weight && <BigChip label="الوزن" value={`${(effectiveToday||{}).weight} kg`} color={C.pink} />}
            <BigChip label="الماء" value={`${(effectiveToday||{}).water} L`} color={C.mauve} />
            <BigChip label="النوم" value={`${(effectiveToday||{}).sleep} ساعة`} color={C.lavender} />
            <BigChip label="التوتر" value={`${(effectiveToday||{}).stress}/10`} color={(effectiveToday||{}).stress>7?C.red:C.muted} />
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <Tag text={(effectiveToday||{}).followedPlan?"✓ التزمت":"✗ لم تلتزم"} color={(effectiveToday||{}).followedPlan?C.green:C.red} />
            {(effectiveToday||{}).exercise && <Tag text={`🏃 ${(effectiveToday||{}).exerciseMin}د`} color={C.mauve} />}
            {(effectiveToday||{}).salad && <Tag text="🥗 سلطة" color={C.green} />}
            {(effectiveToday||{}).fastFood && <Tag text="🍔 fast food" color={C.red} />}
            {(effectiveToday||{}).binge && <Tag text="⚠️ binge" color={C.red} />}
            <Tag text={(effectiveToday||{}).mood} color={C.rose} />
          </div>
          {/* Period info */}
          {(effectiveToday||{}).period !== null && (effectiveToday||{}).period !== undefined && (
            <div style={{ marginTop:12, background:(effectiveToday||{}).period?"#FFF0F4":"#F5FBF7", border:`1px solid ${(effectiveToday||{}).period?C.rose+"50":"#A8D9BC"}`, borderRadius:12, padding:"10px 14px" }}>
              <div style={{ fontSize:12, fontWeight:800, color:(effectiveToday||{}).period?C.rose:C.green, marginBottom:(effectiveToday||{}).period?6:0 }}>
                🩸 الدورة الشهرية: {(effectiveToday||{}).period?"موجودة":"غير موجودة"}
              </div>
              {(effectiveToday||{}).period && (
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                  {(effectiveToday||{}).periodPain && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>ألم 😣</span>}
                  {(effectiveToday||{}).periodBloat && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>انتفاخ</span>}
                  {(effectiveToday||{}).periodMood && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>مزاج 😤</span>}
                  {(effectiveToday||{}).periodCraving && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>شهية 🍫</span>}
                  {(effectiveToday||{}).periodFatigue && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>إرهاق 😴</span>}
                  {(effectiveToday||{}).periodHeadache && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>صداع 🤕</span>}
                  {(effectiveToday||{}).periodBack && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>ألم ظهر 💢</span>}
                  {(effectiveToday||{}).periodNausea && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>غثيان 🤢</span>}
                  {(effectiveToday||{}).periodPainLevel > 0 && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:11, color:C.rose, fontWeight:700 }}>شدة: {(effectiveToday||{}).periodPainLevel}/10</span>}
                </div>
              )}
            </div>
          )}
          {(effectiveToday||{}).note && <div style={{ marginTop:12, fontSize:12, color:C.sub, fontStyle:"italic", borderRight:`3px solid ${C.rose}`, paddingRight:10, textAlign:"right", fontWeight:500 }}>"{(effectiveToday||{}).note}"</div>}

          {/* Meal Photos */}
          {(effectiveToday||{}).photos && Object.values((effectiveToday||{}).photos||{}).some(Boolean) && (
            <div style={{ marginTop:14, borderTop:"1px solid #F5EBF0", paddingTop:14 }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#7A5565", marginBottom:10 }}>📸 صور الوجبات</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[{key:"breakfast",label:"الفطار 🌅"},{key:"lunch",label:"الغداء ☀️"},{key:"dinner",label:"العشاء 🌙"},{key:"snack",label:"السناك 🍎"}].map(m=>(
                  (effectiveToday||{}).photos && (effectiveToday||{}).photos[m.key] ? (
                    <div key={m.key}>
                      <div style={{ fontSize:10, color:"#B09AA8", fontWeight:700, marginBottom:4 }}>{m.label}</div>
                      <img src={(effectiveToday||{}).photos[m.key]} alt={m.label} style={{ width:"100%", height:80, objectFit:"cover", borderRadius:10, border:"1px solid #EDD9E5" }}/>
                    </div>
                  ) : null
                ))}
              </div>
            </div>
          )}

          {/* Hormone symptoms from cycle tracker */}
          {(()=>{
            const h = effectiveToday?Symptoms;
            if (!h || !Object.keys(h).length) return null;
            const ENERGY_ICONS = ["😴","😑","🙂","⚡","🔥"];
            const MOOD_ICONS   = ["😢","😤","😐","😊","🥰"];
            const FOCUS_ICONS  = ["🌫️","😵","🤔","💡","🎯"];
            return (
              <div style={{ marginTop:12, background:"#F5EBF8", border:`1px solid ${C.lavender}`, borderRadius:12, padding:"10px 14px" }}>
                <div style={{ fontSize:11, color:C.mauve, fontWeight:800, marginBottom:8 }}>🧬 أعراض هرمونية اليوم</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {h.hEnergy && <span style={{ fontSize:13 }}>{ENERGY_ICONS[(h.hEnergy||3)-1]} طاقة</span>}
                  {h.hMood   && <span style={{ fontSize:13 }}>{MOOD_ICONS[(h.hMood||3)-1]} مزاج</span>}
                  {h.hFocus  && <span style={{ fontSize:13 }}>{FOCUS_ICONS[(h.hFocus||3)-1]} تركيز</span>}
                  {h.hBloating  && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:10, color:C.rose, fontWeight:700 }}>🫃 انتفاخ</span>}
                  {h.hCramps    && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:10, color:C.rose, fontWeight:700 }}>😣 تشنجات</span>}
                  {h.hHeadache  && <span style={{ background:"#FDE0EA", border:`1px solid ${C.rose}40`, borderRadius:99, padding:"2px 8px", fontSize:10, color:C.rose, fontWeight:700 }}>🤕 صداع</span>}
                  {h.hCraving   && <span style={{ background:"#FFF8E7", border:"1px solid #F0D9A0", borderRadius:99, padding:"2px 8px", fontSize:10, color:"#C8963E", fontWeight:700 }}>🍫 رغبة سكر</span>}
                  {h.hSkinGlow  && <span style={{ background:"#E6F5EE", border:"1px solid #A8D9BC", borderRadius:99, padding:"2px 8px", fontSize:10, color:"#5DAD85", fontWeight:700 }}>✨ بشرة مشرقة</span>}
                  {h.hInsomnia  && <span style={{ background:"#EDE8F5", border:`1px solid ${C.lavender}`, borderRadius:99, padding:"2px 8px", fontSize:10, color:C.mauve, fontWeight:700 }}>🌙 صعوبة نوم</span>}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div style={{ background:C.redLight, border:`1px solid ${C.red}40`, borderRadius:14, padding:"14px 18px", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:800, color:C.red }}>⚠️ لم تسجل اليوم</div>
        </div>
      )}

      {/* Measurements Progress Chart */}
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:20, padding:"18px 18px", marginBottom:16, boxShadow:`0 4px 16px ${C.shadow}` }}>
        <div style={{ fontSize:12, color:C.muted, fontWeight:700, letterSpacing:1.5, marginBottom:12 }}>تطور القياسات 📈</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
          {Object.entries(metricsMeta).map(([k,m])=>(
            <button key={k} onClick={()=>setChartMetric(k)}
              style={{ padding:"5px 12px", borderRadius:99, fontSize:11, fontWeight:800, cursor:"pointer", border:`1.5px solid ${chartMetric===k?m.color:C.border}`, background:chartMetric===k?m.color+"18":C.bg, color:chartMetric===k?m.color:C.muted, transition:"all 0.2s" }}>
              {m.label}
            </button>
          ))}
        </div>
        {chartPoints.length >= 2 ? (
          <>
            <svg width="100%" viewBox={`0 0 ${W} ${H+14}`} style={{ overflow:"visible", display:"block" }}>
              <defs>
                <linearGradient id="docGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={active.color} stopOpacity="0.22"/>
                  <stop offset="100%" stopColor={active.color} stopOpacity="0.02"/>
                </linearGradient>
              </defs>
              {areaD && <path d={areaD} fill="url(#docGrad)"/>}
              <path d={pathD} fill="none" stroke={active.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              {vals.map((v,i)=>(
                <g key={i}>
                  <circle cx={px(i)} cy={py(v)} r="4" fill={active.color} stroke="white" strokeWidth="2"/>
                  <text x={px(i)} y={py(v)-10} textAnchor="middle" fontSize="9" fill={active.color} fontWeight="700">{v}</text>
                </g>
              ))}
            </svg>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              {chartPoints.map((d,i)=>(
                <span key={i} style={{ fontSize:9, color:C.muted, fontWeight:600 }}>{new Date(d.date).getDate()}/{new Date(d.date).getMonth()+1}</span>
              ))}
            </div>
            {trend !== null && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:(trend<0?C.green:trend>0?C.red:C.muted)+"15", borderRadius:10 }}>
                <span style={{ fontSize:14 }}>{trend<0?"📉":trend>0?"📈":"➡️"}</span>
                <span style={{ fontSize:12, fontWeight:800, color:trend<0?C.green:trend>0?C.red:C.muted }}>
                  {trend<0?`تحسن ${Math.abs(trend).toFixed(1)}${active.unit}`:trend>0?`زيادة ${trend.toFixed(1)}${active.unit}`:"ثابت"}
                </span>
                <span style={{ fontSize:11, color:C.muted }}>منذ أول قياس</span>
              </div>
            )}
          </>
        ) : (
          <div style={{ background:C.bg, borderRadius:12, padding:14, textAlign:"center" }}>
            <div style={{ fontSize:13, color:C.muted, fontWeight:600 }}>بعد تسجيلين أسبوعيين هيظهر الجراف 📊</div>
          </div>
        )}
      </div>

      {/* Range + history */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {["week","month"].map(r=>(
          <button key={r} onClick={()=>setRange(r)} style={{ padding:"8px 20px", borderRadius:99, fontSize:13, fontWeight:800, cursor:"pointer", background:range===r?C.blush:C.white, border:range===r?`1.5px solid ${C.pink}`:`1.5px solid ${C.border}`, color:range===r?C.pink:C.muted, transition:"all 0.2s" }}>
            {r==="week"?"أسبوع":"شهر"}
          </button>
        ))}
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {days.map((d,i)=>(
          <div key={d.date} style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:16, padding:"14px 16px", boxShadow:`0 2px 10px ${C.shadow}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <span style={{ fontSize:22 }}>{d.mood}</span>
              <span style={{ fontSize:13, fontWeight:700, color:C.text }}>
                {i===0?"اليوم":new Date(d.date).toLocaleDateString("ar-EG",{weekday:"long",day:"numeric",month:"short"})}
              </span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:10 }}>
              {d.weight && <SmChip label="وزن" value={`${d.weight}kg`} color={C.pink} />}
              {d.bodyFat && <SmChip label="دهون" value={`${d.bodyFat}%`} color="#C8963E" />}
              <SmChip label="ماء" value={`${d.water}L`} color={C.mauve} />
              <SmChip label="نوم" value={`${d.sleep}h`} color={C.lavender} />
              <SmChip label="توتر" value={`${d.stress}/10`} color={d.stress>7?C.red:C.muted} />
            </div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              <Tag text={d.followedPlan?"✓ خطة":"✗ خطة"} color={d.followedPlan?C.green:C.red} small />
              {d.exercise && <Tag text={`🏃${d.exerciseMin}د`} color={C.mauve} small />}
              {d.salad && <Tag text="🥗" color={C.green} small />}
              {d.fastFood && <Tag text="🍔" color={C.red} small />}
              {d.binge && <Tag text="⚠️" color={C.red} small />}
            </div>
          </div>
        ))}
      </div>

      {/* Messages from client */}
      {clientMsgs.length > 0 ? (
        <div style={{ background:"linear-gradient(135deg,#FFF8E7,#FDF5EC)", border:"1.5px solid #F0D9A0", borderRadius:20, padding:"18px 18px", marginTop:16, boxShadow:"0 2px 12px rgba(200,150,62,0.12)" }}>
          <div style={{ fontSize:12, color:"#A07030", fontWeight:800, letterSpacing:1.5, marginBottom:12 }}>💬 رسائل العميلة</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {clientMsgs.slice(0,5).map((m,i)=>(
              <div key={i} style={{ background:"#FFFAF0", border:"1px solid #F0D9A0", borderRadius:10, padding:"8px 12px", fontSize:12, color:"#7A5020", fontWeight:600 }}>
                <span style={{ color:"#B08040", fontSize:11 }}>{m.time} · </span>{m.text}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── TINY COMPONENTS ──
function Lbl({children}) { return <label style={{ fontSize:12,color:C.sub,display:"block",marginBottom:8,fontWeight:700 }}>{children}</label>; }

function StatBox({label,value,color,bg,border}) {
  return (
    <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:14, padding:"14px 10px", textAlign:"center" }}>
      <div style={{ fontSize:22, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:10, color, marginTop:4, fontWeight:700 }}>{label}</div>
    </div>
  );
}
function SmChip({label,value,color}) {
  return (
    <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 6px", textAlign:"center" }}>
      <div style={{ fontSize:9, color:C.muted, marginBottom:2, fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:800, color }}>{value}</div>
    </div>
  );
}
function BigChip({label,value,color}) {
  return (
    <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", textAlign:"center" }}>
      <div style={{ fontSize:10, color:C.muted, letterSpacing:1, marginBottom:4, fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:17, fontWeight:900, color }}>{value}</div>
    </div>
  );
}
function Tag({text,color,small}) {
  return <span style={{ background:`${color}15`, border:`1px solid ${color}40`, borderRadius:99, padding:small?"3px 8px":"5px 12px", fontSize:small?11:12, color, fontWeight:700 }}>{text}</span>;
}
const INP = { background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"11px 14px", color:C.text, fontSize:15, fontWeight:600, outline:"none", width:"100%", marginBottom:16, boxSizing:"border-box" };

function Field({label,type="text",placeholder,value,onChange}) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={{ fontSize:12, color:C.sub, display:"block", marginBottom:6, fontWeight:700 }}>{label}</label>}
      <input type={type} placeholder={placeholder} value={value||""} onChange={onChange} style={INP}/>
    </div>
  );
}
