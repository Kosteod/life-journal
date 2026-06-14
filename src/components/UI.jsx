import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// СТИЛИ (общие для всего приложения)
// ─────────────────────────────────────────────────────────────────────────────
export const S = {
  root:        { minHeight:"100vh", background:"#0a0908", color:"#f0ece4", fontFamily:"Georgia,'Times New Roman',serif", paddingBottom:80 },
  secTitle:    { fontSize:10, letterSpacing:3, color:"#6b6760", textTransform:"uppercase", marginBottom:12 },
  card:        { background:"#1a1917", border:"1px solid #2a2825", borderRadius:12, padding:"14px" },
  tag:         { padding:"5px 10px", borderRadius:8, border:"1px solid #2a2825", background:"transparent", color:"#555", fontSize:12, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
  input:       { width:"100%", background:"#1a1917", border:"1px solid #2a2825", borderRadius:8, padding:"10px 12px", color:"#f0ece4", fontSize:14, fontFamily:"inherit", outline:"none", boxSizing:"border-box" },
  bigInput:    { background:"transparent", border:"none", outline:"none", fontSize:24, fontFamily:"inherit", color:"#f0ece4" },
  saveBtn:     { padding:"9px 18px", borderRadius:8, border:"1px solid #81b29a", background:"#81b29a18", color:"#81b29a", fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  cancelBtn:   { padding:"9px 18px", borderRadius:8, border:"1px solid #444", background:"transparent", color:"#555", fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  clearBtn:    { background:"none", border:"none", color:"#444", cursor:"pointer", fontSize:13, padding:"2px 6px" },
  ta:          { width:"100%", background:"#1a1917", border:"1px solid #2a2825", borderRadius:8, padding:"10px 12px", color:"#f0ece4", fontSize:13, fontFamily:"inherit", resize:"none", outline:"none", boxSizing:"border-box", lineHeight:1.6 },
  progressBg:  { height:6, background:"#0f0e0d", borderRadius:3, overflow:"hidden" },
  progressFill:{ height:"100%", borderRadius:3, transition:"width 0.4s" },
  txRow:       { display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:"#1a1917", borderRadius:8, marginBottom:6, border:"1px solid #2a2825" },
  statsGrid:   { display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 },
};

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────
export const shimmer = `@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}`;

export function Sk({ w="100%", h=16, r=6, mb=10 }) {
  return (
    <div style={{
      width:w, height:h, borderRadius:r, marginBottom:mb,
      background:"linear-gradient(90deg,#1a1917 25%,#252220 50%,#1a1917 75%)",
      backgroundSize:"200% 100%", animation:"sh 1.4s infinite",
    }}/>
  );
}

export function SkPage() {
  return (
    <div style={{paddingTop:20}}>
      <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:20}}>
        {[1,2,3,4].map(i=><Sk key={i} h={72} r={12}/>)}
      </div>
      {[1,2,3,4,5].map(i=><Sk key={i} h={40} r={8}/>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// СЕКЦИЯ СО СВОРАЧИВАНИЕМ
// ─────────────────────────────────────────────────────────────────────────────
export function Sec({ id, title, children, defaultOpen=true }) {
  const storageKey = `sec_${id}`;
  const [open, setOpen] = useState(() => {
    try { const v=localStorage.getItem(storageKey); return v===null?defaultOpen:v==="1"; } catch { return defaultOpen; }
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storageKey, next?"1":"0"); } catch {}
  }

  return (
    <div style={{marginTop:20}}>
      <button onClick={toggle} style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        width:"100%", background:"none", border:"none", cursor:"pointer",
        padding:"0 0 10px", fontFamily:"inherit",
      }}>
        <div style={S.secTitle}>{title}</div>
        <div style={{fontSize:12, color:"#3a3835", marginBottom:10}}>
          {open ? "▲" : "▼"}
        </div>
      </button>
      {open && children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// КАРТОЧКА СТАТИСТИКИ
// ─────────────────────────────────────────────────────────────────────────────
export function StatCard({ icon, label, val, color }) {
  return (
    <div style={{background:"#1a1917", border:`1px solid ${color}33`, borderRadius:12, padding:"14px 10px", textAlign:"center"}}>
      <div style={{fontSize:20, marginBottom:4}}>{icon}</div>
      <div style={{fontSize:15, color, marginBottom:2}}>{val}</div>
      <div style={{fontSize:11, color:"#6b6760"}}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ФИНАНСОВАЯ КАРТОЧКА
// ─────────────────────────────────────────────────────────────────────────────
export function FinCard({ label, val, color }) {
  return (
    <div style={{flex:1, background:"#1a1917", border:`1px solid ${color}33`, borderRadius:12, padding:"12px 8px", textAlign:"center"}}>
      <div style={{fontSize:14, color, marginBottom:4}}>{val}</div>
      <div style={{fontSize:11, color:"#6b6760"}}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// БАР-ЧАРТ
// ─────────────────────────────────────────────────────────────────────────────
export function BarChart({ days, field, max, color, today }) {
  return (
    <div style={{display:"flex", alignItems:"flex-end", gap:4, height:80}}>
      {days.map(d => {
        const val = Number(d[field]) || 0;
        const pct = max > 0 ? val/max : 0;
        const isToday = d.key === today;
        return (
          <div key={d.key} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3}}>
            {val > 0 && <div style={{fontSize:9, color:"#888"}}>{val}</div>}
            <div style={{
              width:"100%", borderRadius:4,
              height: Math.max(val ? 4 : 2, pct*60),
              background: val ? color+"cc" : "#2a2825",
              transition:"height 0.3s",
              border: isToday ? `1px solid ${color}` : "none",
            }}/>
            <div style={{fontSize:10, color: isToday ? color : "#555"}}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}
