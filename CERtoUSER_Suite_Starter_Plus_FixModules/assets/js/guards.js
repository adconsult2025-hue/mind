import { getAuth, onAuthStateChanged, getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

let ready = false;
let cachedUser = null;

function resolveAuth(){
  if (typeof window === "undefined") return null;
  if (window.firebaseAuth) return window.firebaseAuth;
  try {
    return getAuth();
  } catch (error) {
    console.warn("[guards] impossibile ottenere Firebase Auth:", error);
    return null;
  }
}

export function waitUser(){
  return new Promise(res=>{
    if (ready) return res(cachedUser);
    const auth = resolveAuth();
    if (!auth) {
      ready = true;
      cachedUser = null;
      return res(null);
    }
    const stop = onAuthStateChanged(auth, async (user)=>{
      if (!user){ cachedUser=null; window.currentUser=null; ready=true; stop(); return res(null); }
      const tok = await getIdTokenResult(user, true);
      cachedUser = {
        uid: user.uid,
        email: user.email,
        role: tok.claims.role || "guest",
        territories: tok.claims.territories || [],
        cerIds: tok.claims.cerIds || []
      };
      window.currentUser = cachedUser;
      ready = true; stop(); res(cachedUser);
    });
  });
}

export async function requireRoles(allowed){
  const u = await waitUser();
  if (!u || !allowed.includes(u.role)) {
    location.href = "/login/index.html?redirect=" + encodeURIComponent(location.pathname + location.search);
    return false;
  }
  return true;
}

export async function requireCerAccess(cerId){
  const u = await waitUser();
  if (!u) return deny();
  if (["superadmin","admin"].includes(u.role)) return true;
  if (["resp_cer","prosumer","produttore","consumer"].includes(u.role) && (u.cerIds||[]).includes(cerId)) return true;
  return deny();
}
function deny(){ alert("Accesso negato"); history.back(); return false; }
