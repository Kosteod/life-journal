import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// КОНФИГУРАЦИЯ
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://hfnjanaljjxohdkvwyoo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbmphbmFsamp4b2hka3Z3eW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDIxODQsImV4cCI6MjA5NjU3ODE4NH0.36RQExXDeRQBsHoQphttKiVNC9nte6lLIPs0aRyALJw";
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

// ─────────────────────────────────────────────────────────────────────────────
// КЭШ
// ─────────────────────────────────────────────────────────────────────────────
const _cache = new Map();
const TTL = 30_000;
const cGet = (k) => { const e=_cache.get(k); if(!e) return null; if(Date.now()-e.ts>TTL){_cache.delete(k);return null;} return e.d; };
const cSet = (k,d) => _cache.set(k,{d,ts:Date.now()});
const cDel = (p) => { for(const k of _cache.keys()) if(k.includes(p)) _cache.delete(k); };

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
let _session = null;

function getHeaders(token) {
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${token || SUPABASE_KEY}`,
    "Prefer": "return=representation",
  };
}

const auth = {
  async signUp(email, password) {
    const r = await fetch(`${AUTH_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    return await r.json();
  },
  async signIn(email, password) {
    const r = await fetch(`${AUTH_URL}/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    return await r.json();
  },
  async signOut(token) {
    await fetch(`${AUTH_URL}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
    });
  },
  async refresh(refreshToken) {
    const r = await fetch(`${AUTH_URL}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return await r.json();
  },
  saveSession(session) {
    _session = session;
    localStorage.setItem("lj_session", JSON.stringify(session));
  },
  loadSession() {
    try { _session = JSON.parse(localStorage.getItem("lj_session")); } catch { _session = null; }
    return _session;
  },
  clearSession() {
    _session = null;
    localStorage.removeItem("lj_session");
  },
  getToken() { return _session?.access_token || null; },
  getUserId() { return _session?.user?.id || null; },
};

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────
async function cfetch(url) {
  const hit = cGet(url); if(hit !== null) return hit;
  const r = await fetch(url, { headers: getHeaders(auth.getToken()) });
  const d = await r.json();
  const result = Array.isArray(d) ? d : [];
  cSet(url, result); return result;
}

const api = {
  async get(table, match) {
    const p = Object.entries(match).map(([k,v])=>`${k}=eq.${encodeURIComponent(v)}`).join("&");
    const data = await cfetch(`${SUPABASE_URL}/rest/v1/${table}?${p}&user_id=eq.${auth.getUserId()}`);
    return data[0] || null;
  },
  async getMany(table, match={}, order="") {
    let url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${auth.getUserId()}`;
    Object.entries(match).forEach(([k,v]) => url += `&${k}=eq.${encodeURIComponent(v)}`);
    if(order) url += `&order=${order}`;
    return await cfetch(url);
  },
  async getRange(table, from, to) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${auth.getUserId()}&date=gte.${from}&date=lte.${to}&order=date.asc`;
    return await cfetch(url);
  },
  async upsert(table, data, inv) {
    if(inv) cDel(inv);
    const payload = { ...data, user_id: auth.getUserId() };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...getHeaders(auth.getToken()), "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },
  async update(table, id, data, inv) {
    if(inv) cDel(inv);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH", headers: getHeaders(auth.getToken()), body: JSON.stringify(data),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },
  async insert(table, data, inv) {
    if(inv) cDel(inv);
    const payload = { ...data, user_id: auth.getUserId() };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST", headers: getHeaders(auth.getToken()), body: JSON.stringify(payload),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },
  async delete(table, id, inv) {
    if(inv) cDel(inv);
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE", headers: getHeaders(auth.getToken()),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ─────────────────────────────────────────────────────────────────────────────
const todayISO  = () => new Date().toISOString().slice(0,10);
const monthISO  = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const fmt       = (n,dec=0) => Number(n||0).toLocaleString("ru-RU",{minimumFractionDigits:dec,maximumFractionDigits:dec});
const DAY_SHORT = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const MONTH_NAMES = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const MONTH_GEN   = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
function getLast7() {
  return Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10);});
}
function daysUntil(dateStr) {
  if(!dateStr) return null;
  const diff = new Date(dateStr) - new Date(todayISO());
  return Math.ceil(diff/(1000*60*60*24));
}

const BLOCK_COLORS = {
  "сон":"#3d405b","учёба":"#7b9ccc","спорт":"#e07a5f","еда":"#81b29a",
  "работа":"#c9a96e","отдых":"#6b6760","прогулка":"#81b29a","свободно":"#2a2825",
};
const BLOCK_TYPES  = Object.keys(BLOCK_COLORS);
const HOURS        = Array.from({length:18},(_,i)=>i+6);
const EXPENSE_CATS = ["🍔 Еда","🚇 Транспорт","☕ Кафе","🛒 Продукты","💊 Здоровье","📱 Подписки","👕 Одежда","🎮 Развлечения","📚 Учёба","💸 Другое"];
const INCOME_CATS  = ["💼 Работа","🤝 Поддержка","📦 Прочее"];

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────
const shimmer = `@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
function Sk({w="100%",h=16,r=6,mb=10}) {
  return <div style={{width:w,height:h,borderRadius:r,marginBottom:mb,
    background:"linear-gradient(90deg,#1a1917 25%,#252220 50%,#1a1917 75%)",
    backgroundSize:"200% 100%",animation:"sh 1.4s infinite"}}/>;
}
function SkPage() {
  return <div style={{paddingTop:20}}><style>{shimmer}</style>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:20}}>
      {[1,2,3].map(i=><Sk key={i} h={80} r={12}/>)}
    </div>
    {[1,2,3,4,5,6].map(i=><Sk key={i} h={36} r={8}/>)}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ЭКРАН ВХОДА / РЕГИСТРАЦИИ
// ─────────────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode,     setMode]    = useState("login"); // login | register
  const [email,    setEmail]   = useState("");
  const [password, setPassword]= useState("");
  const [error,    setError]   = useState("");
  const [loading,  setLoading] = useState(false);
  const [success,  setSuccess] = useState("");

  async function handleSubmit() {
    if(!email || !password) { setError("Заполни email и пароль"); return; }
    if(password.length < 6) { setError("Пароль минимум 6 символов"); return; }
    setLoading(true); setError(""); setSuccess("");

    if(mode === "register") {
      const result = await auth.signUp(email, password);
      if(result.error) { setError(result.error.message || "Ошибка регистрации"); setLoading(false); return; }
      setSuccess("Проверь почту — мы отправили письмо для подтверждения.");
      setLoading(false);
    } else {
      const result = await auth.signIn(email, password);
      if(result.error) { setError("Неверный email или пароль"); setLoading(false); return; }
      auth.saveSession(result);
      onAuth(result);
    }
  }

  return (
    <div style={{minHeight:"100vh",background:"#0a0908",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <style>{shimmer}</style>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{marginBottom:32,textAlign:"center"}}>
          <div style={{fontSize:28,color:"#f0ece4",marginBottom:8,fontFamily:"Georgia,serif"}}>Дневник жизни</div>
          <div style={{fontSize:13,color:"#6b6760"}}>
            {mode==="login" ? "Войди в свой аккаунт" : "Создай аккаунт"}
          </div>
        </div>

        <div style={{display:"flex",marginBottom:24,background:"#1a1917",borderRadius:10,padding:4}}>
          {[["login","Войти"],["register","Регистрация"]].map(([m,lbl])=>(
            <button key={m} onClick={()=>{setMode(m);setError("");setSuccess("");}}
              style={{flex:1,padding:"9px",borderRadius:7,border:"none",fontSize:13,cursor:"pointer",fontFamily:"inherit",
                background:mode===m?"#2a2825":"transparent",color:mode===m?"#f0ece4":"#555",transition:"all 0.15s"}}>
              {lbl}
            </button>
          ))}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="Email" style={S.authInput}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}/>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            placeholder="Пароль (минимум 6 символов)" style={S.authInput}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}/>
        </div>

        {error   && <div style={{marginTop:12,fontSize:13,color:"#e07a5f",padding:"10px 14px",background:"#e07a5f15",borderRadius:8,border:"1px solid #e07a5f33"}}>{error}</div>}
        {success && <div style={{marginTop:12,fontSize:13,color:"#81b29a",padding:"10px 14px",background:"#81b29a15",borderRadius:8,border:"1px solid #81b29a33"}}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading}
          style={{marginTop:16,width:"100%",padding:"13px",borderRadius:10,border:"none",
            background:"#e07a5f",color:"#fff",fontSize:15,cursor:loading?"wait":"pointer",
            fontFamily:"inherit",opacity:loading?0.7:1}}>
          {loading ? "..." : mode==="login" ? "Войти" : "Зарегистрироваться"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [session,  setSession]  = useState(null);
  const [authReady,setAuthReady]= useState(false);
  const [tab,      setTab]      = useState("day");
  const [date,     setDate]     = useState(todayISO());
  const [settings, setSettings] = useState(null);

  // Восстанавливаем сессию при загрузке
  useEffect(()=>{
    const saved = auth.loadSession();
    if(saved?.access_token) {
      // Проверяем не истёк ли токен
      const exp = saved.expires_at || 0;
      if(Date.now()/1000 < exp) {
        setSession(saved);
      } else if(saved.refresh_token) {
        auth.refresh(saved.refresh_token).then(result=>{
          if(result.access_token) { auth.saveSession(result); setSession(result); }
          else { auth.clearSession(); }
          setAuthReady(true);
        });
        return;
      } else {
        auth.clearSession();
      }
    }
    setAuthReady(true);
  },[]);

  // Загружаем настройки после авторизации
  useEffect(()=>{
    if(!session) return;
    api.get("settings",{user_id:auth.getUserId()}).then(s=>{
      setSettings(s || {study_name:"SQL",kcal_goal:2500,balance:0,next_income_date:null,next_income_amount:0});
    });
  },[session]);

  async function saveSettings(patch) {
    const updated = {...settings,...patch};
    setSettings(updated);
    cDel("settings");
    await api.upsert("settings",{...updated},"settings");
  }

  async function handleSignOut() {
    await auth.signOut(auth.getToken());
    auth.clearSession();
    _cache.clear();
    setSession(null);
    setSettings(null);
  }

  if(!authReady) return (
    <div style={{minHeight:"100vh",background:"#0a0908",display:"flex",alignItems:"center",justifyContent:"center",color:"#555",fontSize:13}}>
      <style>{shimmer}</style>загрузка...
    </div>
  );

  if(!session) return <AuthScreen onAuth={(s)=>{ setSession(s); setAuthReady(true); }}/>;
  if(!settings) return (
    <div style={{minHeight:"100vh",background:"#0a0908",display:"flex",alignItems:"center",justifyContent:"center",color:"#555",fontSize:13}}>
      загрузка...
    </div>
  );

  const now = new Date();
  const dateLabel = `${DAY_SHORT[now.getDay()]}, ${now.getDate()} ${MONTH_GEN[now.getMonth()]}`;

  return (
    <div style={S.root}>
      <style>{shimmer}</style>
      <div style={S.header}>
        <div>
          <div style={S.dateSmall}>{dateLabel}</div>
          <div style={S.h1}>Дневник жизни</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          <button onClick={handleSignOut}
            style={{fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit"}}>
            Выйти
          </button>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={S.datePicker}/>
        </div>
      </div>

      <div style={S.tabs}>
        {[["day","День"],["week","Неделя"],["month","Месяц"],["finance","Финансы"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{...S.tab,...(tab===id?S.tabOn:{})}}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={S.body}>
        {tab==="day"     && <DayTab     date={date} settings={settings} saveSettings={saveSettings}/>}
        {tab==="week"    && <WeekTab    last7={getLast7()}/>}
        {tab==="month"   && <MonthTab   monthK={monthISO()}/>}
        {tab==="finance" && <FinanceTab settings={settings} saveSettings={saveSettings}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ДЕНЬ
// ─────────────────────────────────────────────────────────────────────────────
function DayTab({date,settings,saveSettings}) {
  const [log,      setLog]      = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editHour, setEditHour] = useState(null);
  const [blockType,setBlockType]= useState("учёба");
  const [blockNote,setBlockNote]= useState("");
  const [editStudyName,setEditStudyName]=useState(false);
  const saveTimer = useRef({});

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      api.get("daily_logs",{date}),
      api.getMany("schedule_blocks",{date},"hour.asc"),
    ]).then(([l,s])=>{
      setLog(l||{});
      setSchedule(s||[]);
      setLoading(false);
    });
  },[date]);

  function saveLog(field, value) {
    setLog(prev=>({...prev,[field]:value}));
    clearTimeout(saveTimer.current[field]);
    saveTimer.current[field] = setTimeout(()=>{
      api.upsert("daily_logs",{date,[field]:value},`daily_logs?date=eq.${date}`);
    },600);
  }

  async function saveBlock(hour) {
    const existing = schedule.find(b=>b.hour===hour);
    cDel("schedule_blocks");
    if(existing) {
      await api.update("schedule_blocks",existing.id,{block_type:blockType,note:blockNote});
      setSchedule(prev=>prev.map(b=>b.hour===hour?{...b,block_type:blockType,note:blockNote}:b));
    } else {
      const created = await api.insert("schedule_blocks",{date,hour,block_type:blockType,note:blockNote});
      if(created) setSchedule(prev=>[...prev,created].sort((a,b)=>a.hour-b.hour));
    }
    setEditHour(null); setBlockNote("");
  }

  async function clearBlock(hour) {
    const block = schedule.find(b=>b.hour===hour);
    if(block){ await api.delete("schedule_blocks",block.id,"schedule_blocks"); setSchedule(prev=>prev.filter(b=>b.hour!==hour)); }
  }

  const isToday = date===todayISO();
  const nowHour = new Date().getHours();
  const schedMap = Object.fromEntries(schedule.map(b=>[b.hour,b]));

  function getGroupedSchedule() {
    const groups = [];
    HOURS.forEach(h=>{
      const block = schedMap[h];
      const last  = groups[groups.length-1];
      if(last && block && last.type===block.block_type && !block.note && !last.note) {
        last.endHour = h+1;
      } else {
        groups.push({startHour:h,endHour:h+1,type:block?.block_type||null,note:block?.note||null,hasBlock:!!block});
      }
    });
    return groups;
  }
  const grouped = getGroupedSchedule();

  const kcalGoal  = settings.kcal_goal||2500;
  const kcalEaten = Number(log?.kcal||0);
  const kcalLeft  = kcalGoal - kcalEaten;
  const kcalPct   = Math.min(100, kcalEaten/kcalGoal*100);

  const blockCount = {};
  schedule.forEach(b=>{blockCount[b.block_type]=(blockCount[b.block_type]||0)+1;});

  if(loading) return <SkPage/>;

  return (
    <>
      {/* КАЛОРИИ */}
      <Sec title="Калории">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:4}}>Съедено</div>
              <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                <input type="number" value={log?.kcal||""} onChange={e=>saveLog("kcal",e.target.value)}
                  placeholder="0" style={{...S.bigInput,color:"#f0ece4",width:100}}/>
                <span style={{fontSize:13,color:"#6b6760"}}>ккал</span>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:2}}>Норма</div>
              <div style={{fontSize:15,color:"#555"}}>{fmt(kcalGoal)}</div>
            </div>
          </div>
          <div style={{height:8,background:"#0f0e0d",borderRadius:4,overflow:"hidden",marginBottom:10}}>
            <div style={{height:"100%",borderRadius:4,transition:"width 0.4s",width:`${kcalPct}%`,
              background:kcalPct>100?"#e07a5f":kcalPct>80?"#e8c97a":"#81b29a"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
            <span style={{color:kcalLeft<0?"#e07a5f":"#81b29a"}}>
              {kcalLeft>=0?`Осталось: ${fmt(kcalLeft)} ккал`:`Превышено на ${fmt(-kcalLeft)} ккал`}
            </span>
            <span style={{color:"#555"}}>{Math.round(kcalPct)}%</span>
          </div>
        </div>
      </Sec>

      {/* ШАГИ + НАСТРОЕНИЕ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:24}}>
        <div style={S.metricCard}>
          <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>👣 Шаги</div>
          <input type="number" value={log?.steps||""} onChange={e=>saveLog("steps",e.target.value)}
            placeholder="0" style={{...S.bigInput,color:"#81b29a"}}/>
        </div>
        <div style={S.metricCard}>
          <div style={{fontSize:11,color:"#6b6760",marginBottom:8}}>🙂 Настроение</div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {[1,2,3,4,5,6,7,8,9,10].map(n=>(
              <button key={n} onClick={()=>saveLog("mood",n)}
                style={{width:25,height:25,borderRadius:5,border:"1px solid",fontSize:10,cursor:"pointer",fontFamily:"inherit",
                  borderColor:log?.mood===n?"#e07a5f":"#2a2825",
                  background:log?.mood===n?"#e07a5f22":"#0f0e0d",
                  color:log?.mood===n?"#e07a5f":"#555"}}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* РАСПИСАНИЕ */}
      <Sec title="Расписание дня">
        {Object.keys(blockCount).length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {Object.entries(blockCount).map(([type,c])=>(
              <div key={type} style={{...S.tag,borderColor:BLOCK_COLORS[type]+"66",color:BLOCK_COLORS[type],background:BLOCK_COLORS[type]+"15"}}>
                {type} {c}ч
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          {grouped.map((g,gi)=>{
            const isCurrent = isToday&&nowHour>=g.startHour&&nowHour<g.endHour;
            const isPast    = isToday&&nowHour>=g.endHour;
            const timeLabel = g.endHour-g.startHour>1
              ?`${String(g.startHour).padStart(2,"0")}:00–${String(g.endHour).padStart(2,"0")}:00`
              :`${String(g.startHour).padStart(2,"0")}:00`;
            const isEditing = editHour===g.startHour;
            return(
              <div key={gi}>
                <div onClick={()=>{setEditHour(isEditing?null:g.startHour);if(g.hasBlock){setBlockType(g.type);setBlockNote(g.note||"");}}}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,cursor:"pointer",
                    borderLeft:`3px solid ${g.hasBlock?BLOCK_COLORS[g.type]||"#555":isCurrent?"#e07a5f":"#2a2825"}`,
                    background:g.hasBlock?BLOCK_COLORS[g.type]+"15":isCurrent?"#e07a5f08":"transparent",
                    opacity:isPast&&!g.hasBlock?0.3:1,transition:"background 0.15s"}}>
                  <div style={{fontSize:12,minWidth:90,color:isCurrent?"#e07a5f":isPast?"#444":"#777",fontVariantNumeric:"tabular-nums"}}>
                    {timeLabel}{isCurrent&&<span style={{fontSize:8,color:"#e07a5f",marginLeft:4}}>●</span>}
                  </div>
                  <div style={{flex:1,fontSize:13,color:g.hasBlock?BLOCK_COLORS[g.type]:"#2a2825"}}>
                    {g.hasBlock&&<><span style={{textTransform:"capitalize"}}>{g.type}</span>{g.note&&<span style={{color:"#555",fontSize:12}}> — {g.note}</span>}</>}
                  </div>
                  {g.hasBlock&&<button onClick={e=>{e.stopPropagation();for(let h=g.startHour;h<g.endHour;h++)clearBlock(h);}} style={S.clearBtn}>✕</button>}
                </div>
                {isEditing&&(
                  <div style={S.editPanel}>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                      {BLOCK_TYPES.map(bt=>(
                        <button key={bt} onClick={()=>setBlockType(bt)}
                          style={{...S.tag,borderColor:blockType===bt?BLOCK_COLORS[bt]:BLOCK_COLORS[bt]+"44",
                            color:BLOCK_COLORS[bt],background:blockType===bt?BLOCK_COLORS[bt]+"25":"transparent"}}>
                          {bt}
                        </button>
                      ))}
                    </div>
                    <input value={blockNote} onChange={e=>setBlockNote(e.target.value)}
                      placeholder="Заметка (необязательно)" style={{...S.input,marginBottom:8}}/>
                    <button onClick={()=>saveBlock(g.startHour)} style={S.saveBtn}>Сохранить</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Sec>

      {/* УЧЁБА */}
      <Sec title="Учёба">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            {editStudyName?(
              <input autoFocus value={settings.study_name||""}
                onChange={e=>saveSettings({study_name:e.target.value})}
                onBlur={()=>setEditStudyName(false)}
                onKeyDown={e=>e.key==="Enter"&&setEditStudyName(false)}
                style={{...S.input,fontSize:16,padding:"4px 10px"}}/>
            ):(
              <>
                <span style={{fontSize:16,color:"#e8c97a"}}>{settings.study_name||"SQL"}</span>
                <button onClick={()=>setEditStudyName(true)}
                  style={{fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                  переименовать
                </button>
              </>
            )}
          </div>
          <div style={{display:"flex",gap:12,alignItems:"flex-end",marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:"#6b6760",marginBottom:4}}>Минут сегодня</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <input type="number" value={log?.study_minutes||""} onChange={e=>saveLog("study_minutes",e.target.value)}
                  placeholder="0" style={{...S.bigInput,color:"#7b9ccc",width:70}}/>
                <span style={{fontSize:13,color:"#6b6760"}}>мин</span>
              </div>
            </div>
            {log?.study_minutes>0&&(
              <div style={{fontSize:13,color:"#555",marginBottom:4}}>= {(log.study_minutes/60).toFixed(1)} ч</div>
            )}
          </div>
          <input value={log?.study_note||""} onChange={e=>saveLog("study_note",e.target.value)}
            placeholder="Что изучил сегодня..." style={S.input}/>
        </div>
      </Sec>

      {/* ЗАМЕТКА */}
      <Sec title="Заметка дня">
        <textarea rows={3} value={log?.note||""} onChange={e=>saveLog("note",e.target.value)}
          placeholder="Мысли, ощущения, итог дня..." style={S.ta}/>
      </Sec>

      {/* ИТОГ ДНЯ */}
      <Sec title="День удался?">
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <button onClick={()=>saveLog("day_result","yes")}
            style={{...S.resultBtn,borderColor:log?.day_result==="yes"?"#81b29a":"#2a2825",
              color:log?.day_result==="yes"?"#81b29a":"#555",background:log?.day_result==="yes"?"#81b29a18":"#1a1917"}}>
            ✓ Да
          </button>
          <button onClick={()=>saveLog("day_result","no")}
            style={{...S.resultBtn,borderColor:log?.day_result==="no"?"#e07a5f":"#2a2825",
              color:log?.day_result==="no"?"#e07a5f":"#555",background:log?.day_result==="no"?"#e07a5f18":"#1a1917"}}>
            ✗ Нет
          </button>
        </div>
        {log?.day_result==="no"&&(
          <textarea rows={2} value={log?.day_fail||""} onChange={e=>saveLog("day_fail",e.target.value)}
            placeholder="Что пошло не так?" style={{...S.ta,borderColor:"#e07a5f33"}}/>
        )}
      </Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// НЕДЕЛЯ
// ─────────────────────────────────────────────────────────────────────────────
function WeekTab({last7}) {
  const [days,setDays]=useState([]);
  const [txs,setTxs]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const from=last7[0], to=last7[last7.length-1];
    Promise.all([
      api.getRange("daily_logs",from,to),
      api.getRange("transactions",from,to),
    ]).then(([logs,t])=>{
      const logMap=Object.fromEntries(logs.map(l=>[l.date,l]));
      setDays(last7.map(date=>({key:date,label:DAY_SHORT[new Date(date+"T12:00:00").getDay()],...(logMap[date]||{})})));
      setTxs(t||[]);
      setLoading(false);
    });
  },[]);

  if(loading) return <SkPage/>;

  const withMood=days.filter(d=>d.mood);
  const avgMood=withMood.length?(withMood.reduce((s,d)=>s+d.mood,0)/withMood.length).toFixed(1):"—";
  const avgSteps=(()=>{const a=days.map(d=>Number(d.steps)).filter(Boolean);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—";})();
  const avgKcal=(()=>{const a=days.map(d=>Number(d.kcal)).filter(Boolean);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—";})();
  const totalStudy=days.reduce((s,d)=>s+(Number(d.study_minutes)||0),0);
  const weekExp=txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const weekInc=txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const goodDays=days.filter(d=>d.day_result==="yes").length;
  const maxSteps=Math.max(...days.map(d=>Number(d.steps)||0),8000);
  const maxKcal=Math.max(...days.map(d=>Number(d.kcal)||0),2500);
  const maxStudy=Math.max(...days.map(d=>Number(d.study_minutes)||0),60);

  return (
    <>
      <div style={{...S.statsGrid,marginTop:20}}>
        <StatCard icon="🙂" label="Ср. настроение" val={`${avgMood}/10`}         color="#e07a5f"/>
        <StatCard icon="👣" label="Ср. шаги"       val={fmt(avgSteps)}            color="#81b29a"/>
        <StatCard icon="🔥" label="Ср. калории"    val={`${fmt(avgKcal)} ккал`}   color="#e8c97a"/>
        <StatCard icon="📚" label="Учёба"          val={`${fmt(totalStudy)} мин`}  color="#7b9ccc"/>
        <StatCard icon="💰" label="Доходы"         val={`${fmt(weekInc)} ₽`}      color="#81b29a"/>
        <StatCard icon="💸" label="Расходы"        val={`${fmt(weekExp)} ₽`}      color="#e07a5f"/>
      </div>

      {goodDays>0&&(
        <div style={{marginTop:12,padding:"10px 14px",background:"#81b29a18",border:"1px solid #81b29a33",borderRadius:10,fontSize:13,color:"#81b29a"}}>
          ✓ Хороших дней: {goodDays} из {days.filter(d=>d.day_result).length}
        </div>
      )}

      <Sec title="Настроение"> <BarChart days={days} field="mood"          max={10}       color="#e07a5f"/></Sec>
      <Sec title="Калории">    <BarChart days={days} field="kcal"          max={maxKcal}  color="#e8c97a"/></Sec>
      <Sec title="Шаги">       <BarChart days={days} field="steps"         max={maxSteps} color="#81b29a"/></Sec>
      <Sec title="Учёба (мин)"><BarChart days={days} field="study_minutes" max={maxStudy} color="#7b9ccc"/></Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// МЕСЯЦ
// ─────────────────────────────────────────────────────────────────────────────
function MonthTab({monthK}) {
  const [logs,setLogs]=useState([]);
  const [txs,setTxs]=useState([]);
  const [loading,setLoading]=useState(true);

  const [yr,mo]=monthK.split("-").map(Number);
  const daysInMonth=new Date(yr,mo,0).getDate();
  const allDays=Array.from({length:daysInMonth},(_,i)=>`${yr}-${String(mo).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      api.getRange("daily_logs",`${monthK}-01`,`${monthK}-${String(daysInMonth).padStart(2,"0")}`),
      api.getRange("transactions",`${monthK}-01`,`${monthK}-${String(daysInMonth).padStart(2,"0")}`),
    ]).then(([l,t])=>{ setLogs(l||[]); setTxs(t||[]); setLoading(false); });
  },[monthK]);

  if(loading) return <SkPage/>;

  const logMap=Object.fromEntries(logs.map(l=>[l.date,l]));
  const totalExp=txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalInc=txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalStudy=logs.reduce((s,l)=>s+(Number(l.study_minutes)||0),0);
  const totalSteps=logs.reduce((s,l)=>s+(Number(l.steps)||0),0);
  const avgMood=(()=>{const a=logs.map(l=>l.mood).filter(Boolean);return a.length?(a.reduce((s,v)=>s+v,0)/a.length).toFixed(1):"—";})();
  const avgKcal=(()=>{const a=logs.map(l=>Number(l.kcal)).filter(Boolean);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—";})();
  const goodDays=logs.filter(l=>l.day_result==="yes").length;
  const badDays=logs.filter(l=>l.day_result==="no").length;
  const catMap={};
  txs.filter(t=>t.type==="expense").forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});

  return (
    <>
      <div style={{marginTop:20,marginBottom:12,fontSize:18,color:"#f0ece4"}}>{MONTH_NAMES[mo-1]} {yr}</div>
      <div style={S.statsGrid}>
        <StatCard icon="💰" label="Доходы"         val={`${fmt(totalInc)} ₽`}    color="#81b29a"/>
        <StatCard icon="💸" label="Расходы"        val={`${fmt(totalExp)} ₽`}    color="#e07a5f"/>
        <StatCard icon="🏦" label="Результат"      val={`${totalInc-totalExp>=0?"+":""}${fmt(totalInc-totalExp)} ₽`} color={totalInc-totalExp>=0?"#81b29a":"#e07a5f"}/>
        <StatCard icon="🙂" label="Ср. настроение" val={`${avgMood}/10`}          color="#e07a5f"/>
        <StatCard icon="📚" label="Учёба"          val={`${fmt(Math.round(totalStudy/60))} ч`} color="#7b9ccc"/>
        <StatCard icon="👣" label="Шаги всего"     val={fmt(totalSteps)}           color="#81b29a"/>
        <StatCard icon="🔥" label="Ср. калории"    val={`${fmt(avgKcal)} ккал`}   color="#e8c97a"/>
        <StatCard icon="✓"  label="Хороших дней"  val={`${goodDays}/${goodDays+badDays}`} color="#81b29a"/>
      </div>

      {Object.keys(catMap).length>0&&(
        <Sec title="Расходы по категориям">
          {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                <span style={{color:"#f0ece4"}}>{cat}</span>
                <span style={{color:"#e07a5f"}}>{fmt(amt)} ₽ <span style={{color:"#555",fontSize:11}}>({Math.round(amt/totalExp*100)}%)</span></span>
              </div>
              <div style={S.progressBg}>
                <div style={{...S.progressFill,width:`${Math.min(100,amt/totalExp*100)}%`,background:"#e07a5f"}}/>
              </div>
            </div>
          ))}
        </Sec>
      )}

      <Sec title="Календарь настроения">
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(d=>(
            <div key={d} style={{fontSize:9,color:"#555",textAlign:"center",paddingBottom:4}}>{d}</div>
          ))}
          {Array.from({length:(new Date(yr,mo-1,1).getDay()+6)%7},(_,i)=><div key={"e"+i}/>)}
          {allDays.map(k=>{
            const l=logMap[k]; const mood=l?.mood; const d=Number(k.slice(8));
            const isToday=k===todayISO();
            return(
              <div key={k} style={{aspectRatio:"1",borderRadius:5,
                background:mood?`hsl(${20+mood*8},${40+mood*4}%,${22+mood*3}%)`:"#1a1917",
                border:isToday?"1px solid #e07a5f":"1px solid #2a2825",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:9,color:mood?"#f0ece4":"#333"}}>
                {d}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:8}}>
          <span style={{fontSize:10,color:"#555"}}>1</span>
          {[1,3,5,7,10].map(n=>(
            <div key={n} style={{width:14,height:14,borderRadius:3,background:`hsl(${20+n*8},${40+n*4}%,${22+n*3}%)`}}/>
          ))}
          <span style={{fontSize:10,color:"#555"}}>10</span>
        </div>
      </Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ФИНАНСЫ
// ─────────────────────────────────────────────────────────────────────────────
function FinanceTab({settings,saveSettings}) {
  const [txs,setTxs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({type:"expense",amount:"",cat:EXPENSE_CATS[0],note:""});
  const [editBalance,setEditBalance]=useState(false);
  const [editIncome,setEditIncome]=useState(false);
  const date=todayISO();

  useEffect(()=>{
    const from=new Date(); from.setDate(from.getDate()-30);
    api.getRange("transactions",from.toISOString().slice(0,10),date).then(t=>{setTxs(t||[]);setLoading(false);});
  },[]);

  async function addTx() {
    if(!form.amount||isNaN(Number(form.amount))) return;
    const amount=Number(form.amount);
    const t=await api.insert("transactions",{date,type:form.type,amount,category:form.cat,note:form.note},"transactions");
    if(t){
      setTxs(prev=>[...prev,t]);
      saveSettings({balance:(settings.balance||0)+(form.type==="income"?amount:-amount)});
    }
    setForm(f=>({...f,amount:"",note:""}));
  }

  async function removeTx(id,type,amount) {
    await api.delete("transactions",id,"transactions");
    setTxs(prev=>prev.filter(t=>t.id!==id));
    saveSettings({balance:(settings.balance||0)+(type==="income"?-amount:amount)});
  }

  const todayTxs=txs.filter(t=>t.date===date);
  const last7from=new Date(); last7from.setDate(last7from.getDate()-7);
  const last30from=new Date(); last30from.setDate(last30from.getDate()-30);
  const exp7=txs.filter(t=>t.type==="expense"&&new Date(t.date)>=last7from).reduce((s,t)=>s+t.amount,0);
  const exp30=txs.filter(t=>t.type==="expense"&&new Date(t.date)>=last30from).reduce((s,t)=>s+t.amount,0);
  const avgPerDay7=exp7/7;
  const avgPerDay30=exp30/30;
  const balance=settings.balance||0;
  const daysLeft7=avgPerDay7>0?Math.floor(balance/avgPerDay7):null;
  const daysLeft30=avgPerDay30>0?Math.floor(balance/avgPerDay30):null;
  const nextDate=settings.next_income_date;
  const nextAmount=settings.next_income_amount||0;
  const daysToNext=daysUntil(nextDate);
  const canSpendPerDay=daysToNext>0?Math.floor(balance/daysToNext):null;
  const willRunOut=daysToNext&&avgPerDay7>0&&balance/avgPerDay7<daysToNext;
  const catMap={};
  const monthStart=monthISO()+"-01";
  txs.filter(t=>t.type==="expense"&&t.date>=monthStart).forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});
  const monthExp=Object.values(catMap).reduce((s,v)=>s+v,0);

  if(loading) return <SkPage/>;

  return (
    <>
      {/* БАЛАНС */}
      <div style={{marginTop:20,background:"#1a1917",borderRadius:16,padding:"20px",border:"1px solid #2a2825"}}>
        <div style={{fontSize:11,letterSpacing:2,color:"#6b6760",textTransform:"uppercase",marginBottom:8}}>Текущий баланс</div>
        {editBalance?(
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="number" autoFocus defaultValue={balance}
              onBlur={e=>{saveSettings({balance:Number(e.target.value)});setEditBalance(false);}}
              onKeyDown={e=>e.key==="Enter"&&e.target.blur()}
              style={{...S.bigInput,fontSize:28,color:"#f0ece4",flex:1}}/>
            <span style={{fontSize:18,color:"#6b6760"}}>₽</span>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:4}}>
            <div style={{fontSize:32,color:balance>0?"#f0ece4":"#e07a5f"}}>{fmt(balance)}</div>
            <div style={{fontSize:18,color:"#6b6760",marginBottom:4}}>₽</div>
            <button onClick={()=>setEditBalance(true)}
              style={{fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",marginBottom:4}}>
              изменить
            </button>
          </div>
        )}
        <div style={{display:"flex",gap:16,marginTop:8,fontSize:12,color:"#6b6760"}}>
          <span>Ср/день 7д: <span style={{color:"#f0ece4"}}>{fmt(avgPerDay7,0)} ₽</span></span>
          <span>Ср/день 30д: <span style={{color:"#f0ece4"}}>{fmt(avgPerDay30,0)} ₽</span></span>
        </div>
      </div>

      {/* ПРОГНОЗ */}
      {(daysLeft7||daysLeft30)&&(
        <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:"#1a1917",borderRadius:12,padding:"14px",border:"1px solid #2a2825",textAlign:"center"}}>
            <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Хватит (7д темп)</div>
            <div style={{fontSize:22,color:daysLeft7<14?"#e07a5f":daysLeft7<30?"#e8c97a":"#81b29a"}}>{daysLeft7} дн</div>
          </div>
          <div style={{background:"#1a1917",borderRadius:12,padding:"14px",border:"1px solid #2a2825",textAlign:"center"}}>
            <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Хватит (30д темп)</div>
            <div style={{fontSize:22,color:daysLeft30<14?"#e07a5f":daysLeft30<30?"#e8c97a":"#81b29a"}}>{daysLeft30} дн</div>
          </div>
        </div>
      )}

      {/* СЛЕДУЮЩИЙ ДОХОД */}
      <Sec title="Следующий доход">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825"}}>
          {editIncome?(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:8}}>
                <input type="date" defaultValue={nextDate||""} onChange={e=>saveSettings({next_income_date:e.target.value})} style={{...S.input,flex:1}}/>
                <input type="number" defaultValue={nextAmount||""} onChange={e=>saveSettings({next_income_amount:Number(e.target.value)})} placeholder="Сумма ₽" style={{...S.input,flex:1}}/>
              </div>
              <button onClick={()=>setEditIncome(false)} style={S.saveBtn}>Сохранить</button>
            </div>
          ):(
            <div>
              {nextDate?(
                <>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:11,color:"#6b6760",marginBottom:2}}>Дата</div>
                      <div style={{fontSize:15,color:"#f0ece4"}}>{new Date(nextDate+"T12:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:11,color:"#6b6760",marginBottom:2}}>Сумма</div>
                      <div style={{fontSize:15,color:"#81b29a"}}>{fmt(nextAmount)} ₽</div>
                    </div>
                  </div>
                  {daysToNext!==null&&(
                    <div style={{display:"flex",gap:16,fontSize:13}}>
                      <span style={{color:"#6b6760"}}>До дохода: <span style={{color:daysToNext<=3?"#e07a5f":"#f0ece4"}}>{daysToNext} дн</span></span>
                      {canSpendPerDay&&<span style={{color:"#6b6760"}}>Лимит/день: <span style={{color:"#e8c97a"}}>{fmt(canSpendPerDay)} ₽</span></span>}
                    </div>
                  )}
                </>
              ):(
                <div style={{fontSize:13,color:"#555"}}>Не указано</div>
              )}
              <button onClick={()=>setEditIncome(true)}
                style={{marginTop:10,fontSize:11,color:"#555",background:"none",border:"1px solid #2a2825",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                {nextDate?"изменить":"указать дату дохода"}
              </button>
            </div>
          )}
        </div>
        {willRunOut&&(
          <div style={{marginTop:10,padding:"12px 14px",background:"#e07a5f15",border:"1px solid #e07a5f44",borderRadius:10,fontSize:13,color:"#e07a5f"}}>
            ⚠ При текущем темпе деньги закончатся через {daysLeft7} дн — до дохода ещё {daysToNext} дн
          </div>
        )}
      </Sec>

      {/* ДОБАВИТЬ ОПЕРАЦИЮ */}
      <Sec title="Добавить">
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {["expense","income"].map(t=>(
            <button key={t} onClick={()=>setForm(f=>({...f,type:t,cat:t==="expense"?EXPENSE_CATS[0]:INCOME_CATS[0]}))}
              style={{...S.tag,...(form.type===t?{borderColor:t==="expense"?"#e07a5f":"#81b29a",color:t==="expense"?"#e07a5f":"#81b29a",background:t==="expense"?"#e07a5f18":"#81b29a18"}:{})}}>
              {t==="expense"?"💸 Расход":"💰 Доход"}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {(form.type==="expense"?EXPENSE_CATS:INCOME_CATS).map(c=>(
            <button key={c} onClick={()=>setForm(f=>({...f,cat:c}))}
              style={{...S.tag,...(form.cat===c?{borderColor:"#7b9ccc",color:"#7b9ccc",background:"#7b9ccc18"}:{})}}>
              {c}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
            placeholder="Сумма ₽" style={{...S.input,flex:1}}/>
          <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
            placeholder="Заметка" style={{...S.input,flex:2}}/>
        </div>
        <button onClick={addTx} style={S.saveBtn}>+ Добавить</button>
      </Sec>

      {/* ОПЕРАЦИИ СЕГОДНЯ */}
      {todayTxs.length>0&&(
        <Sec title="Сегодня">
          {todayTxs.slice().reverse().map(tx=>(
            <div key={tx.id} style={S.txRow}>
              <div style={{flex:1,fontSize:13,color:"#f0ece4"}}>{tx.category}{tx.note&&<span style={{color:"#555"}}> — {tx.note}</span>}</div>
              <div style={{fontSize:15,color:tx.type==="expense"?"#e07a5f":"#81b29a",marginRight:8}}>
                {tx.type==="expense"?"-":"+"}{fmt(tx.amount)} ₽
              </div>
              <button onClick={()=>removeTx(tx.id,tx.type,tx.amount)} style={S.clearBtn}>✕</button>
            </div>
          ))}
        </Sec>
      )}

      {/* СТРУКТУРА РАСХОДОВ */}
      {Object.keys(catMap).length>0&&(
        <Sec title="Расходы за месяц">
          {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                <span style={{color:"#f0ece4"}}>{cat}</span>
                <span style={{color:"#e07a5f"}}>{fmt(amt)} ₽ <span style={{color:"#555",fontSize:11}}>({Math.round(amt/monthExp*100)}%)</span></span>
              </div>
              <div style={S.progressBg}>
                <div style={{...S.progressFill,width:`${Math.min(100,amt/monthExp*100)}%`,background:"#e07a5f"}}/>
              </div>
            </div>
          ))}
        </Sec>
      )}

      {/* НАСТРОЙКИ */}
      <Sec title="Настройки">
        <div style={{background:"#1a1917",borderRadius:14,padding:"16px",border:"1px solid #2a2825",display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Дневная норма калорий</div>
            <input type="number" defaultValue={settings.kcal_goal||2500}
              onBlur={e=>saveSettings({kcal_goal:Number(e.target.value)})} style={S.input}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#6b6760",marginBottom:6}}>Направление обучения</div>
            <input defaultValue={settings.study_name||"SQL"}
              onBlur={e=>saveSettings({study_name:e.target.value})} style={S.input}/>
          </div>
        </div>
      </Sec>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// КОМПОНЕНТЫ
// ─────────────────────────────────────────────────────────────────────────────
function Sec({title,children}) {
  return <div style={{marginTop:24}}><div style={S.secTitle}>{title}</div>{children}</div>;
}
function BarChart({days,field,max,color}) {
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
      {days.map(d=>{
        const val=Number(d[field])||0;
        const pct=max>0?val/max:0;
        const isToday=d.key===todayISO();
        return(
          <div key={d.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            {val>0&&<div style={{fontSize:9,color:"#888"}}>{val}</div>}
            <div style={{width:"100%",borderRadius:4,height:Math.max(val?4:2,pct*60),
              background:val?color+"cc":"#2a2825",border:isToday?`1px solid ${color}`:"none"}}/>
            <div style={{fontSize:10,color:isToday?color:"#555"}}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}
function StatCard({icon,label,val,color}) {
  return(
    <div style={{background:"#1a1917",border:`1px solid ${color}33`,borderRadius:12,padding:"14px 10px",textAlign:"center"}}>
      <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
      <div style={{fontSize:15,color,marginBottom:2}}>{val}</div>
      <div style={{fontSize:11,color:"#6b6760"}}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// СТИЛИ
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  root:       {minHeight:"100vh",background:"#0a0908",color:"#f0ece4",fontFamily:"Georgia,'Times New Roman',serif",paddingBottom:80},
  header:     {padding:"28px 20px 20px",borderBottom:"1px solid #1e1c1a",display:"flex",justifyContent:"space-between",alignItems:"flex-end"},
  dateSmall:  {fontSize:11,letterSpacing:3,color:"#6b6760",textTransform:"uppercase",marginBottom:6},
  h1:         {fontSize:24,fontWeight:"normal"},
  datePicker: {background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"5px 8px",color:"#888",fontSize:12,fontFamily:"inherit",outline:"none"},
  tabs:       {display:"flex",borderBottom:"1px solid #1e1c1a",position:"sticky",top:0,background:"#0a0908",zIndex:10},
  tab:        {flex:1,padding:"12px 0",background:"none",border:"none",color:"#555",fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  tabOn:      {color:"#f0ece4",borderBottom:"2px solid #e07a5f"},
  body:       {padding:"0 16px"},
  secTitle:   {fontSize:10,letterSpacing:3,color:"#6b6760",textTransform:"uppercase",marginBottom:12},
  statsGrid:  {display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8},
  metricCard: {background:"#1a1917",border:"1px solid #2a2825",borderRadius:12,padding:"14px"},
  bigInput:   {background:"transparent",border:"none",outline:"none",fontSize:24,fontFamily:"inherit"},
  tag:        {padding:"5px 10px",borderRadius:8,border:"1px solid #2a2825",background:"transparent",color:"#555",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"},
  hourRow:    {display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,cursor:"pointer",borderLeft:"3px solid",transition:"background 0.15s"},
  editPanel:  {background:"#1a1917",border:"1px solid #2a2825",borderRadius:10,padding:"12px",margin:"4px 0 6px"},
  clearBtn:   {background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:13,padding:"2px 6px"},
  input:      {width:"100%",background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"10px 12px",color:"#f0ece4",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  authInput:  {width:"100%",background:"#1a1917",border:"1px solid #2a2825",borderRadius:10,padding:"13px 14px",color:"#f0ece4",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  saveBtn:    {padding:"9px 18px",borderRadius:8,border:"1px solid #81b29a",background:"#81b29a18",color:"#81b29a",fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  ta:         {width:"100%",background:"#1a1917",border:"1px solid #2a2825",borderRadius:8,padding:"10px 12px",color:"#f0ece4",fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",lineHeight:1.6},
  progressBg: {height:6,background:"#0f0e0d",borderRadius:3,overflow:"hidden"},
  progressFill:{height:"100%",borderRadius:3,transition:"width 0.4s"},
  txRow:      {display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"#1a1917",borderRadius:8,marginBottom:6,border:"1px solid #2a2825"},
  resultBtn:  {flex:1,padding:"12px",borderRadius:10,border:"1px solid",fontSize:15,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"},
};