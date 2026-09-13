async function api(url, options = {}) { const res = await fetch(url,{headers:{"Content-Type":"application/json",...(options.headers||{})},...options}); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.message||"Request failed"); return data; }
function money(n){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0)}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
