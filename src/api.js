// ─────────────────────────────────────────────────────────────────────────────
// КОНФИГУРАЦИЯ
// ─────────────────────────────────────────────────────────────────────────────
export const SUPABASE_URL = "https://hfnjanaljjxohdkvwyoo.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbmphbmFsamp4b2hka3Z3eW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDIxODQsImV4cCI6MjA5NjU3ODE4NH0.36RQExXDeRQBsHoQphttKiVNC9nte6lLIPs0aRyALJw";

// ─────────────────────────────────────────────────────────────────────────────
// СЕССИЯ
// ─────────────────────────────────────────────────────────────────────────────
export let _token  = null;
export let _userId = null;

export function setSession(token, userId) {
  _token  = token;
  _userId = userId;
}
export function clearSession() {
  _token  = null;
  _userId = null;
  localStorage.removeItem("lj_token");
  localStorage.removeItem("lj_uid");
}

// ─────────────────────────────────────────────────────────────────────────────
// КЭШ
// ─────────────────────────────────────────────────────────────────────────────
const _cache = new Map();
const TTL    = 30_000;

export const cGet   = (k)      => { const e=_cache.get(k); if(!e) return null; if(Date.now()-e.ts>TTL){_cache.delete(k);return null;} return e.d; };
export const cSet   = (k,d)    => _cache.set(k,{d,ts:Date.now()});
export const cDel   = (prefix) => { for(const k of _cache.keys()) if(k.includes(prefix)) _cache.delete(k); };
export const cClear = ()       => _cache.clear();

// ─────────────────────────────────────────────────────────────────────────────
// ЗАГОЛОВКИ
// ─────────────────────────────────────────────────────────────────────────────
export function H() {
  return {
    "Content-Type":  "application/json",
    "apikey":        SUPABASE_KEY,
    "Authorization": `Bearer ${_token || SUPABASE_KEY}`,
    "Prefer":        "return=representation",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
export const auth = {
  async signUp(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { "Content-Type":"application/json","apikey":SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    return await r.json();
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type":"application/json","apikey":SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    return await r.json();
  },
  async signOut() {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { "Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":`Bearer ${_token}` },
    });
    clearSession();
    cClear();
  },
  async getUser() {
    if (!_token) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey":SUPABASE_KEY,"Authorization":`Bearer ${_token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA API
// ─────────────────────────────────────────────────────────────────────────────
async function cfetch(url) {
  const hit = cGet(url);
  if (hit !== null) return hit;
  const r = await fetch(url, { headers: H() });
  const d = await r.json();
  const result = Array.isArray(d) ? d : [];
  cSet(url, result);
  return result;
}

export const api = {
  async get(table, match) {
    const p = Object.entries(match).map(([k,v])=>`${k}=eq.${encodeURIComponent(v)}`).join("&");
    const url = p
      ? `${SUPABASE_URL}/rest/v1/${table}?${p}`
      : `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${_userId}`;
    const data = await cfetch(url);
    return data[0] || null;
  },

  async getMany(table, match={}, order="") {
    let url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${_userId}`;
    const p = Object.entries(match).map(([k,v])=>`${k}=eq.${encodeURIComponent(v)}`);
    if (order) p.push(`order=${order}`);
    if (p.length) url += "&" + p.join("&");
    return await cfetch(url);
  },

  async getRange(table, from, to) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${_userId}&date=gte.${from}&date=lte.${to}&order=date.asc`;
    return await cfetch(url);
  },

  async upsert(table, data, inv) {
    if (inv) cDel(inv);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:  "POST",
      headers: { ...H(), "Prefer":"resolution=merge-duplicates,return=representation" },
      body:    JSON.stringify({ ...data, user_id: _userId }),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },

  async update(table, id, data, inv) {
    if (inv) cDel(inv);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH", headers: H(), body: JSON.stringify(data),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },

  async insert(table, data, inv) {
    if (inv) cDel(inv);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST", headers: H(), body: JSON.stringify({ ...data, user_id: _userId }),
    });
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result || null;
  },

  async delete(table, id, inv) {
    if (inv) cDel(inv);
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE", headers: H(),
    });
  },
};
