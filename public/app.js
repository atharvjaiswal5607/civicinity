const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = { token: localStorage.getItem("civicinity_token"), user: null, authMode: "login", activeTab: "myReports", complaints: [], map: null, miniMap: null };
const categories = ["Pothole / Damaged Road","Garbage Accumulation","Broken Streetlight","Water Leakage","Drainage Problem","Other"];
const statuses = ["Submitted","Assigned","In Progress","Resolved","Rejected"];
const departments = ["Roads & Infrastructure","Sanitation","Electrical","Water Supply","Drainage","General"];
let toastTimer;

function esc(v="") { return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function statusClass(s) { return "status-" + String(s).toLowerCase().replace(/\s+/g,"-"); }
function priorityClass(s) { return "priority-" + String(s).toLowerCase(); }
function toast(message, error=false) { const el=$("#toast"); el.textContent=message; el.className="toast show"+(error?" error":""); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.className="toast",3400); }
async function api(url, options={}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"]="application/json";
  const res = await fetch(url,{...options,headers});
  const data = await res.json().catch(()=>({error:"Unexpected server response."}));
  if (!res.ok) { if(res.status===401 && state.token){logout(false);showAuth("login");} throw new Error(data.error || "Request failed."); }
  return data;
}
function showAuth(mode="login") {
  state.authMode=mode;
  $("#authSection").classList.remove("hidden"); $("#appSection").classList.add("hidden");
  $("#authTitle").textContent=mode==="login"?"Welcome back.":"Join your community.";
  $("#authSubtitle").textContent=mode==="login"?"Log in to report issues and follow your complaints.":"Create an account to report and track civic issues.";
  $("#nameField").classList.toggle("hidden",mode!=="register");
  $("#authName").required=mode==="register";
  $("#authPassword").autocomplete=mode==="login"?"current-password":"new-password";
  $("#authSubmit").innerHTML=mode==="login"?'Log in <span>→</span>':'Create account <span>→</span>';
  $("#authSwitch").innerHTML=mode==="login"?'New here? <button type="button" id="switchAuth">Create an account</button>':'Already have an account? <button type="button" id="switchAuth">Log in</button>';
  $("#switchAuth").onclick=()=>showAuth(mode==="login"?"register":"login");
  $("#authSection").scrollIntoView({behavior:"smooth",block:"start"});
}
function logout(notify=true) {
  state.token=null; state.user=null; localStorage.removeItem("civicinity_token");
  $("#appSection").classList.add("hidden"); $("#authSection").classList.add("hidden");
  $("#mainNav").classList.remove("open");
  if(notify) toast("You have been logged out.");
}
function showPublic() { $("#authSection").classList.add("hidden"); $("#appSection").classList.add("hidden"); $("#hero").scrollIntoView({behavior:"smooth"}); }
function switchTab(tab) {
  state.activeTab=tab;
  $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  $("#citizenView").classList.toggle("hidden",tab!=="myReports");
  $("#newReportView").classList.toggle("hidden",tab!=="newReport");
  $("#trackView").classList.toggle("hidden",tab!=="track");
  if(tab==="myReports") loadCitizenReports();
}
function showApp() {
  $("#authSection").classList.add("hidden"); $("#appSection").classList.remove("hidden"); $("#hero").scrollIntoView({behavior:"smooth",block:"start"});
  $("#mainNav").innerHTML=`<a href="#how">How it works</a><a href="#impact">Our impact</a><button class="btn btn-outline" id="navDashboard">Dashboard</button><button class="btn btn-primary" id="navReport">Report an issue ↗</button>`;
  $("#navDashboard").onclick=()=>$("#appSection").scrollIntoView({behavior:"smooth"});
  $("#navReport").onclick=()=>{ $("#appSection").scrollIntoView({behavior:"smooth"}); if(state.user.role==="citizen")switchTab("newReport"); };
  $("#logoutBtn").onclick=()=>{logout();resetNav();};
  if(state.user.role==="admin") {
    $("#appTitle").textContent="Authority control room."; $("#appDesc").textContent="Prioritize issues, coordinate departments, and keep the city moving.";
    $("#dashboardTabs").classList.add("hidden"); $("#citizenView").classList.add("hidden"); $("#newReportView").classList.add("hidden"); $("#trackView").classList.add("hidden"); $("#adminView").classList.remove("hidden"); loadAdmin();
  } else {
    $("#appTitle").textContent=`Good to see you, ${state.user.name.split(" ")[0]}.`; $("#appDesc").textContent="Every report is a step towards a better neighbourhood.";
    $("#dashboardTabs").classList.remove("hidden"); $("#adminView").classList.add("hidden"); switchTab(state.activeTab||"myReports");
  }
}
function resetNav(){ $("#mainNav").innerHTML='<a href="#how">How it works</a><a href="#impact">Our impact</a><button class="btn btn-outline" id="loginNav">Log in</button><button class="btn btn-primary" id="reportNav">Report an issue ↗</button>'; $("#loginNav").onclick=()=>showAuth("login"); $("#reportNav").onclick=()=>{if(state.user){showApp();switchTab("newReport")}else showAuth("register")}; }
async function boot() {
  resetNav();
  if(state.token) {
    try { const d=await api("/api/auth/me"); state.user=d.user; showApp(); }
    catch { logout(false); }
  }
  initMiniMap();
}
function initMiniMap() {
  if(!window.L || state.miniMap) return;
  state.miniMap=L.map("miniMap",{zoomControl:false,scrollWheelZoom:false,dragging:false}).setView([18.5204,73.8567],12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'© OpenStreetMap contributors'}).addTo(state.miniMap);
  [[18.5204,73.8567,"#dc6258"],[18.5314,73.8446,"#eab04d"],[18.5074,73.8752,"#498ab0"],[18.535,73.872,"#dc6258"],[18.514,73.84,"#eab04d"]].forEach(([lat,lng,color])=>L.circleMarker([lat,lng],{radius:7,color:"#fff",weight:2,fillColor:color,fillOpacity:1}).addTo(state.miniMap));
  setTimeout(()=>state.miniMap.invalidateSize(),250);
}
$("#loginNav").onclick=()=>showAuth("login");
$("#reportNav").onclick=()=>state.user?(showApp(),state.user.role==="citizen"&&switchTab("newReport")):showAuth("register");
$("#heroReport").onclick=$("#ctaReport").onclick=()=>state.user?(showApp(),state.user.role==="citizen"&&switchTab("newReport")):showAuth("register");
$("#trackOpen").onclick=()=>state.user?(showApp(),switchTab("track")):showAuth("login");
$("#homeLink").onclick=(e)=>{e.preventDefault();showPublic();};
$("#menuBtn").onclick=()=>$("#mainNav").classList.toggle("open");
$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault(); const btn=$("#authSubmit"); btn.disabled=true; btn.textContent="Please wait…";
  const body={email:$("#authEmail").value.trim(),password:$("#authPassword").value};
  if(state.authMode==="register")body.name=$("#authName").value.trim();
  try { const d=await api(state.authMode==="login"?"/api/auth/login":"/api/auth/register",{method:"POST",body:JSON.stringify(body)}); state.token=d.token;state.user=d.user;localStorage.setItem("civicinity_token",d.token);$("#authForm").reset();resetNav();showApp();toast("Welcome to Civicinity."); }
  catch(err){toast(err.message,true);}
  finally{btn.disabled=false;btn.innerHTML=state.authMode==="login"?'Log in <span>→</span>':'Create account <span>→</span>';}
});
$$(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$("#myStatusFilter").onchange=loadCitizenReports;
$("#adminStatusFilter").onchange=loadAdminReports;
$("#adminSearch").oninput=()=>{clearTimeout(window.searchTimer);window.searchTimer=setTimeout(loadAdminReports,250);};
$("#gpsBtn").onclick=()=>{
  const status=$("#gpsStatus");
  if(!navigator.geolocation){status.textContent="This browser does not support GPS. Enter location manually.";return;}
  status.textContent="Requesting location permission…";
  navigator.geolocation.getCurrentPosition(async pos=>{
    $("#latitude").value=pos.coords.latitude;$("#longitude").value=pos.coords.longitude;
    status.textContent=`GPS captured: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    try {const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);const d=await r.json();if(d.display_name&&!$("#issueLocation").value)$("#issueLocation").value=d.display_name.split(",").slice(0,4).join(",");}catch{}
  },err=>{status.textContent=err.code===1?"Location permission denied. You can enter the location manually.":"Could not get GPS. Enter the location manually.";},{enableHighAccuracy:true,timeout:10000});
};
$("#issuePhoto").onchange=()=>$("#uploadLabel").textContent=$("#issuePhoto").files[0]?.name||"Choose a photo to attach";
$("#reportForm").onsubmit=async e=>{
  e.preventDefault(); const btn=$("#submitReport");btn.disabled=true;btn.textContent="Submitting…";
  try {
    const fd=new FormData(e.currentTarget);
    const d=await api("/api/complaints",{method:"POST",body:fd});
    e.currentTarget.reset();$("#uploadLabel").textContent="Choose a photo to attach";$("#gpsStatus").textContent="GPS is optional; you can enter the location manually.";
    $("#latitude").value=$("#longitude").value="";
    await loadCitizenReports();switchTab("myReports");
    openComplaint(d.complaint.tracking_id);
    toast("Complaint submitted successfully.");
  }catch(err){toast(err.message,true);}
  finally{btn.disabled=false;btn.innerHTML='Submit complaint <span>↗</span>';}
};
$("#trackForm").onsubmit=async e=>{e.preventDefault();try{await renderTracking($("#trackId").value.trim().toUpperCase(),"#trackResult");}catch(err){$("#trackResult").innerHTML=`<div class="empty-state">${esc(err.message)}</div>`;}};
$("#modalClose").onclick=()=>$("#complaintModal").classList.add("hidden");
$("#complaintModal").onclick=e=>{if(e.target===$("#complaintModal"))$("#complaintModal").classList.add("hidden");};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("#complaintModal").classList.add("hidden");});

function metric(label,value,sub=""){return `<div class="metric-card"><small>${esc(label)}</small><b>${esc(value)}</b><span>${esc(sub)}</span></div>`;}
function reportCard(c,admin=false) {
  const photo=c.photo_url?`<img class="report-thumb" src="${esc(c.photo_url)}" alt="Issue photo">`:`<div class="report-thumb report-thumb-placeholder">⌖</div>`;
  const adminEdit=admin?`<div class="admin-edit"><select data-field="status">${statuses.map(s=>`<option ${s===c.status?"selected":""}>${s}</option>`).join("")}</select><select data-field="priority">${["Low","Medium","High","Critical"].map(s=>`<option ${s===c.priority?"selected":""}>${s}</option>`).join("")}</select><select data-field="department">${["Unassigned",...departments].map(s=>`<option ${s===c.department?"selected":""}>${esc(s)}</option>`).join("")}</select><input data-field="note" placeholder="Update / resolution note"><button class="small-btn" data-save="${c.id}">Save update</button></div>`:"";
  return `<article class="report-item"><div class="report-main">${photo}<div><span class="report-id">${esc(c.tracking_id)} · ${new Date(c.created_at.replace(" ","T")+"Z").toLocaleDateString()}</span><h4>${esc(c.title)}</h4><p>${esc(c.category)} · ${esc(c.location_text)}</p>${admin?`<p>Reported by ${esc(c.citizen_name||"Citizen")} · ${esc(c.citizen_email||"")}</p>`:""}<div class="report-meta"><span class="pill ${statusClass(c.status)}">${esc(c.status)}</span><span class="pill ${priorityClass(c.priority)}">${esc(c.priority)} priority</span><span class="pill">${esc(c.department||"Unassigned")}</span></div></div></div><div class="report-actions">${admin?adminEdit:""}<button class="small-btn" data-open="${esc(c.tracking_id)}">View details →</button></div></article>`;
}
async function loadCitizenReports() {
  if(!state.user||state.user.role!=="citizen")return;
  try{
    const status=$("#myStatusFilter").value;const d=await api("/api/complaints"+(status?"?status="+encodeURIComponent(status):""));state.complaints=d.complaints;
    const all=state.complaints;$("#citizenMetrics").innerHTML=metric("Total reports",all.length,"All submissions")+metric("In progress",all.filter(c=>["Assigned","In Progress"].includes(c.status)).length,"Being handled")+metric("Resolved",all.filter(c=>c.status==="Resolved").length,"Closed successfully")+metric("Awaiting action",all.filter(c=>["Submitted","Assigned"].includes(c.status)).length,"Pending or assigned");
    $("#myReports").innerHTML=all.length?all.map(c=>reportCard(c)).join(""):`<div class="empty-state"><b>No reports yet</b>Your civic activity will appear here. Start by reporting an issue in your neighbourhood.</div>`;
    bindReportButtons($("#myReports"));
  }catch(e){toast(e.message,true);}
}
async function loadAdmin() {
  try{
    const d=await api("/api/analytics");
    $("#adminMetrics").innerHTML=metric("Total complaints",d.total,"All submitted reports")+metric("Open complaints",d.open,"Need follow-up")+metric("Resolved",d.resolved,`${d.resolution_rate}% resolution rate`)+metric("Average feedback",d.avg_rating??"—","Out of 5");
    $("#statusChart").innerHTML=chartRows(d.by_status);$("#categoryChart").innerHTML=chartRows(d.by_category);
    await loadAdminReports();
  }catch(e){toast(e.message,true);}
}
function chartRows(rows) {
  if(!rows.length)return '<div class="empty-state">No data yet. Reports will populate this chart.</div>';
  const max=Math.max(...rows.map(r=>r.value),1);
  return rows.map(r=>`<div class="bar-row"><span>${esc(r.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,r.value/max*100)}%"></div></div><b>${r.value}</b></div>`).join("");
}
async function loadAdminReports() {
  if(!state.user||state.user.role!=="admin")return;
  try{
    const params=new URLSearchParams();if($("#adminStatusFilter").value)params.set("status",$("#adminStatusFilter").value);if($("#adminSearch").value.trim())params.set("q",$("#adminSearch").value.trim());
    const d=await api("/api/complaints?"+params.toString());
    $("#adminReports").innerHTML=d.complaints.length?d.complaints.map(c=>reportCard(c,true)).join(""):`<div class="empty-state"><b>No matching complaints</b>Try a different search or filter.</div>`;
    bindReportButtons($("#adminReports"));
    $$("[data-save]").forEach(btn=>btn.onclick=async()=>{
      const item=btn.closest(".report-item");const get=f=>item.querySelector(`[data-field="${f}"]`).value;
      btn.disabled=true;btn.textContent="Saving…";
      try{await api(`/api/complaints/${btn.dataset.save}`,{method:"PATCH",body:JSON.stringify({status:get("status"),priority:get("priority"),department:get("department"),note:get("note")})});toast("Complaint updated.");await loadAdmin();}
      catch(e){toast(e.message,true);}finally{btn.disabled=false;btn.textContent="Save update";}
    });
  }catch(e){toast(e.message,true);}
}
function bindReportButtons(root) { root.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openComplaint(b.dataset.open)); }
async function openComplaint(id) {
  $("#complaintModal").classList.remove("hidden");$("#modalContent").innerHTML='<div class="empty-state">Loading complaint details…</div>';
  try{await renderTracking(id,"#modalContent",true);}catch(e){$("#modalContent").innerHTML=`<div class="empty-state">${esc(e.message)}</div>`;}
}
async function renderTracking(id,target,modal=false) {
  const d=await api("/api/complaints/track/"+encodeURIComponent(id));const c=d.complaint;const el=$(target);
  const history=d.updates.map(u=>`<div class="timeline-item"><b>${esc(u.status)}</b><small>${esc(u.created_at)} · ${esc(u.actor_name||"System")}</small><p>${esc(u.note||"Status updated.")}</p></div>`).join("");
  const photo=c.photo_url?`<img class="modal-photo" src="${esc(c.photo_url)}" alt="Complaint evidence">`:"";
  const feedback=(c.status==="Resolved"&&state.user.role==="citizen"&&!c.feedback_rating)?`<div class="feedback-box"><h4>How was the resolution?</h4><div class="feedback-row">${[1,2,3,4,5].map(n=>`<button type="button" data-rating="${n}">${"★".repeat(n)}</button>`).join("")}</div><textarea id="feedbackComment" rows="2" placeholder="Optional feedback"></textarea><button class="btn btn-primary" id="feedbackSubmit">Send feedback</button></div>`:"";
  el.innerHTML=`<span class="report-id">${esc(c.tracking_id)}</span><h2 style="font:800 24px Manrope;color:var(--navy);margin:8px 40px 8px 0">${esc(c.title)}</h2><div class="report-meta"><span class="pill ${statusClass(c.status)}">${esc(c.status)}</span><span class="pill ${priorityClass(c.priority)}">${esc(c.priority)} priority</span><span class="pill">${esc(c.department)}</span></div><p style="font-size:12px;color:#5e747d;line-height:1.7">${esc(c.description)}</p><p style="font-size:11px;color:#72878d">⌖ ${esc(c.location_text)}${c.latitude!==null&&c.longitude!==null?` · <a target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}">View map</a>`:""}</p>${photo}<h3 style="font:800 15px Manrope;color:var(--navy);margin-top:25px">Complaint timeline</h3><div class="timeline">${history||'<p>No updates yet.</p>'}</div>${c.resolution_notes?`<div class="panel"><b>Resolution note</b><p>${esc(c.resolution_notes)}</p></div>`:""}${feedback}`;
  if(feedback) {
    let rating=0;el.querySelectorAll("[data-rating]").forEach(b=>b.onclick=()=>{rating=Number(b.dataset.rating);el.querySelectorAll("[data-rating]").forEach(x=>x.classList.toggle("selected",Number(x.dataset.rating)===rating));});
    $("#feedbackSubmit").onclick=async()=>{if(!rating)return toast("Choose a star rating first.",true);try{await api(`/api/complaints/${c.id}/feedback`,{method:"POST",body:JSON.stringify({rating,comment:$("#feedbackComment").value})});toast("Thanks for your feedback.");renderTracking(id,target,modal);}catch(e){toast(e.message,true);}};
  }
}
boot();
