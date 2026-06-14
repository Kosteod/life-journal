import { useState } from "react";
import { auth, setSession } from "../api.js";
import { shimmer } from "./UI.jsx";

export default function AuthScreen({ onAuth }) {
  const [mode,    setMode]    = useState("signin");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit() {
    if (!email || !pass)  { setError("Заполни email и пароль"); return; }
    if (pass.length < 6)  { setError("Пароль минимум 6 символов"); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      if (mode === "signup") {
        const res = await auth.signUp(email, pass);
        if (res.error) setError(res.error.message || "Ошибка регистрации");
        else { setSuccess("Аккаунт создан! Теперь войди."); setMode("signin"); }
      } else {
        const res = await auth.signIn(email, pass);
        if (res.error || !res.access_token) { setError("Неверный email или пароль"); }
        else {
          setSession(res.access_token, res.user.id);
          localStorage.setItem("lj_token", res.access_token);
          localStorage.setItem("lj_uid",   res.user.id);
          onAuth(res.user);
        }
      }
    } catch { setError("Нет соединения"); }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh", background:"#0a0908", display:"flex", alignItems:"center", justifyContent:"center", padding:20}}>
      <style>{shimmer}</style>
      <div style={{width:"100%", maxWidth:360}}>
        <div style={{fontSize:11, letterSpacing:3, color:"#6b6760", textTransform:"uppercase", marginBottom:8}}>
          Дневник жизни
        </div>
        <div style={{fontSize:26, color:"#f0ece4", marginBottom:32, fontFamily:"Georgia,serif"}}>
          {mode==="signin" ? "Вход" : "Регистрация"}
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:12, marginBottom:20}}>
          <input type="email" placeholder="Email" value={email}
            onChange={e=>{setEmail(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            style={authInput}/>
          <input type="password" placeholder="Пароль (мин. 6 символов)" value={pass}
            onChange={e=>{setPass(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            style={authInput}/>
        </div>

        {error   && <div style={authError}>{error}</div>}
        {success && <div style={authSuccess}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading}
          style={{...authBtn, opacity:loading?0.6:1}}>
          {loading ? "..." : mode==="signin" ? "Войти" : "Зарегистрироваться"}
        </button>

        <div style={{textAlign:"center", marginTop:16}}>
          <button onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("");setSuccess("");}}
            style={{background:"none", border:"none", color:"#6b6760", fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>
            {mode==="signin" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}

const authInput   = { width:"100%", background:"#1a1917", border:"1px solid #2a2825", borderRadius:10, padding:"14px 16px", color:"#f0ece4", fontSize:15, fontFamily:"Georgia,serif", outline:"none", boxSizing:"border-box" };
const authBtn     = { width:"100%", padding:"14px", borderRadius:10, border:"none", background:"#e07a5f", color:"#0a0908", fontSize:15, cursor:"pointer", fontFamily:"Georgia,serif" };
const authError   = { padding:"10px 14px", background:"#e07a5f15", border:"1px solid #e07a5f44", borderRadius:8, fontSize:13, color:"#e07a5f", marginBottom:12 };
const authSuccess = { padding:"10px 14px", background:"#81b29a15", border:"1px solid #81b29a44", borderRadius:8, fontSize:13, color:"#81b29a", marginBottom:12 };
