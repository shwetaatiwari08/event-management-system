const BASE=import.meta.env.VITE_API_URL||"http://localhost:5000/api";
export async function api(path,options={}){
  const token=localStorage.getItem("token");
  const res=await fetch(BASE+path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message||"Request failed"); return data;
}