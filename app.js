const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let currentUser = null, currentPage = "dashboard", currentItems = [], editId = null, toastTimer;
const today = new Date();
$("#year").textContent = today.getFullYear();
$("#footer-year").textContent = today.getFullYear();
$("#today-label").textContent = today.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});

const pageMeta = {
 dashboard:{title:"Your school at a glance",crumb:"Overview",desc:"A clear view of what's happening across Excellent Child Academy."},
 students:{title:"Student directory",crumb:"Students",desc:"Keep student profiles and guardian details up to date.",add:"Add student"},
 staff:{title:"Staff directory",crumb:"Staff directory",desc:"Your people are at the heart of every great school day.",add:"Add staff member"},
 classes:{title:"Class management",crumb:"Classes",desc:"Organise classes, class teachers and room capacity.",add:"Add class"},
 attendance:{title:"Daily attendance",crumb:"Attendance",desc:"Record attendance and keep an eye on daily participation.",add:"Record attendance"},
 fees:{title:"Fees & payments",crumb:"Fees & payments",desc:"Track tuition, balances and payment records.",add:"Add fee record"},
 results:{title:"Exam results",crumb:"Exam results",desc:"Record assessment scores and follow learner progress.",add:"Add result"},
 announcements:{title:"School announcements",crumb:"Announcements",desc:"Share important updates with the school community.",add:"New announcement"},
 messages:{title:"Contact notes",crumb:"Contact notes",desc:"Keep parent and guardian communication organised.",add:"Add contact note"},
 users:{title:"Portal access",crumb:"User accounts",desc:"Manage who can access the school management portal.",add:"Invite user"},
 audit:{title:"Activity log",crumb:"Activity log",desc:"Review recent administrative activity in the portal."}
};
const configs = {
 students:{endpoint:"students",columns:[["admission_no","Admission no."],["first_name","First name"],["last_name","Last name"],["gender","Gender"],["date_of_birth","Date of birth"],["class_name","Class"],["guardian_name","Guardian name"],["guardian_email","Guardian email"],["guardian_phone","Guardian phone"],["status","Status"]],fields:[["admission_no","Admission number","text",true],["first_name","First name","text",true],["last_name","Last name","text",true],["gender","Gender","select",false,["","Female","Male","Prefer not to say"]],["date_of_birth","Date of birth","date"],["class_name","Class","text",true],["guardian_name","Guardian name","text"],["guardian_email","Guardian email","email"],["guardian_phone","Guardian phone","tel"],["status","Status","select",true,["Active","Inactive","Graduated"]]]},
 staff:{endpoint:"staff",columns:[["staff_no","Staff no."],["name","Name"],["role_title","Position"],["email","Email"],["phone","Phone"],["status","Status"]],fields:[["staff_no","Staff number","text",true],["name","Full name","text",true],["role_title","Position","text",true],["email","Email","email"],["phone","Phone","tel"],["status","Status","select",true,["Active","Inactive"]]]},
 classes:{endpoint:"classes",columns:[["name","Class name"],["teacher","Class teacher"],["room","Room"],["capacity","Capacity"]],fields:[["name","Class name","text",true],["teacher","Class teacher","text"],["room","Room","text"],["capacity","Capacity","number",true]]},
 announcements:{endpoint:"announcements",columns:[["title","Title"],["audience","Audience"],["author_id","Author ID"],["created_at","Published"]],fields:[["title","Announcement title","text",true],["audience","Audience","select",true,["Everyone","Parents","Students","Staff"]],["body","Message","textarea",true]]},
 messages:{endpoint:"messages",columns:[["contact_name","Contact"],["contact_email","Email"],["subject","Subject"],["status","Status"],["created_at","Created"]],fields:[["student_id","Related student ID (optional)","number"],["contact_name","Contact name","text",true],["contact_email","Contact email","email"],["subject","Subject","text",true],["body","Contact note","textarea",true],["status","Status","select",true,["Open","In progress","Resolved"]]]}
};
async function api(url, options={}) {
 const res=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(data.error||"Request failed. Please try again.");
 return data;
}
function toast(msg,error=false){const el=$("#toast");el.textContent=msg;el.classList.toggle("error",error);el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3200)}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmtDate(v){if(!v)return "—";const d=new Date(v);return isNaN(d)?esc(v):d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}
function money(v){return new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(v||0))}
function badge(v){let cls="";if(["Inactive","Absent","Open","Overdue"].includes(v))cls="danger";else if(["Late","In progress","Part-paid"].includes(v))cls="warning";else if(["Resolved","Graduated","Excused"].includes(v))cls="neutral";return `<span class="badge ${cls}">${esc(v||"—")}</span>`}
function initials(v){return String(v||"?").split(/\s+/).slice(0,2).map(s=>s[0]||"").join("").toUpperCase()}
function empty(title="Nothing here yet",detail="Records you add will appear here."){return `<div class="empty-state"><strong>${esc(title)}</strong>${esc(detail)}</div>`}
function pageHeader(page,actions=""){const m=pageMeta[page];return `<div class="page-heading"><div><div class="eyebrow">EXCELLENT CHILD ACADEMY</div><h1>${esc(m.title)}</h1><p>${esc(m.desc)}</p></div><div class="heading-actions">${actions}</div></div>`}
function btn(label,action,secondary=false){return `<button class="btn ${secondary?"btn-secondary":"btn-primary"}" data-action="${action}">${esc(label)}${secondary?"":" <span>＋</span>"}</button>`}
function setPage(page){if(!pageMeta[page])return;currentPage=page;$("#current-crumb").textContent=pageMeta[page].crumb;$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("#sidebar").classList.remove("open");renderPage().catch(e=>toast(e.message,true))}
async function renderPage(){
 const root=$("#page-content");root.innerHTML='<div class="loading"><div class="spinner"></div>Loading school records…</div>';
 if(currentPage==="dashboard"){root.innerHTML=await dashboard();bindDashboard();return}
 if(currentPage==="attendance"){root.innerHTML=await attendancePage();bindAttendance();return}
 if(currentPage==="fees"){root.innerHTML=await feesPage();bindFinance("fees");return}
 if(currentPage==="results"){root.innerHTML=await resultsPage();bindFinance("results");return}
 if(currentPage==="users"){root.innerHTML=await usersPage();bindUsers();return}
 if(currentPage==="audit"){root.innerHTML=await auditPage();return}
 const cfg=configs[currentPage];if(!cfg){root.innerHTML=empty();return}
 const data=await api(`/api/${cfg.endpoint}`);currentItems=data.items||[];
 const rows=currentItems.map(item=>`<tr>${cfg.columns.map(([key,label])=>`<td>${renderCell(key,item[key],item)}</td>`).join("")}<td><div class="row-actions"><button class="small-action" data-edit="${item.id}">Edit</button>${currentUser.role==="admin"?`<button class="small-action" data-delete="${item.id}">Archive</button>`:""}</div></td></tr>`).join("");
 root.innerHTML=pageHeader(currentPage,pageMeta[currentPage].add?btn(pageMeta[currentPage].add,"add"):"")+`<div class="toolbar"><div class="search-wrap"><span>⌕</span><input id="table-search" placeholder="Search ${esc(currentPage)}..." aria-label="Search records"></div><span class="subtext">${currentItems.length} record${currentItems.length===1?"":"s"} shown</span></div><div class="table-panel"><div class="table-wrap"><table><thead><tr>${cfg.columns.map(c=>`<th>${esc(c[1])}</th>`).join("")}<th>Actions</th></tr></thead><tbody id="records-body">${rows||`<tr><td colspan="${cfg.columns.length+1}">${empty("No records yet","Use the button above to add your first record.")}</td></tr>`}</tbody></table></div></div>`;
 $("#table-search").addEventListener("input",e=>{const q=e.target.value.toLowerCase();$$("#records-body tr").forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(q)?"":"none")});
 $$("[data-action='add']").forEach(b=>b.addEventListener("click",()=>openForm(currentPage)));
 $$("[data-edit]").forEach(b=>b.addEventListener("click",()=>{const item=currentItems.find(x=>x.id===Number(b.dataset.edit));if(item)openForm(currentPage,item)}));
 $$("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteRecord(currentPage,b.dataset.delete)));
}
function renderCell(key,val,item){
 if(key==="first_name")return `<div class="student-cell"><div class="mini-avatar">${esc(initials(item.first_name+" "+item.last_name))}</div><div><strong>${esc(item.first_name)} ${esc(item.last_name)}</strong><span class="subtext">${esc(item.admission_no||"")}</span></div></div>`;
 if(key==="last_name"&&item.first_name)return "";
 if(key==="status")return badge(val);
 if(key==="created_at")return fmtDate(val);
 if(key==="body")return esc(String(val||"").slice(0,90))+(String(val||"").length>90?"…":"");
 if(key==="capacity")return esc(val||"—");
 if(key==="amount_due"||key==="amount_paid")return money(val);
 return esc(val||"—");
}
async function dashboard(){
 const d=await api("/api/dashboard");
 const stats=[["Active students",d.students,"♙","Current enrolment"],["Active staff",d.staff,"♧","Teachers and team"],["Classes",d.classes,"▤","Learning groups"],["Present today",d.attendanceToday,"✓","Attendance recorded"]];
 const announcements=(d.recentAnnouncements||[]).map(a=>`<div class="announcement-item"><div class="announcement-meta"><span>${esc(a.audience)}</span><span>${fmtDate(a.created_at)}</span></div><h4>${esc(a.title)}</h4><p>${esc(a.body)}</p></div>`).join("");
 const students=(d.recentStudents||[]).map(s=>`<tr><td><div class="student-cell"><div class="mini-avatar">${esc(initials(s.first_name+" "+s.last_name))}</div><div><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong><span class="subtext">${esc(s.admission_no)}</span></div></div></td><td>${esc(s.class_name)}</td><td>${badge(s.status)}</td></tr>`).join("");
 return pageHeader("dashboard",btn("Add student","add-student"))+`<div class="stat-grid">${stats.map(([label,value,icon,foot])=>`<div class="stat-card"><div class="stat-top">${label}<span class="stat-icon">${icon}</span></div><div class="stat-value">${Number(value||0).toLocaleString()}</div><div class="stat-foot">${foot}</div></div>`).join("")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>Recently added students</h3><p>A quick look at the latest student records</p></div><button class="panel-link" data-go="students">View all →</button></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Status</th></tr></thead><tbody>${students||`<tr><td colspan="3">${empty("No students added","Your student records will show here.")}</td></tr>`}</tbody></table></div></section><section class="panel"><div class="panel-head"><div><h3>School bulletin</h3><p>Updates from your community</p></div><button class="panel-link" data-go="announcements">All updates →</button></div><div class="announcement-list">${announcements||empty("It's quiet for now","New announcements will appear here.")}</div></section></div><div class="panel" style="margin-top:18px"><div class="panel-head"><div><h3>Outstanding fees overview</h3><p>Combined balance across fee records</p></div><button class="panel-link" data-go="fees">Open finance →</button></div><div style="padding:22px"><div class="stat-value">${money(d.outstanding)}</div><div class="stat-foot">Balance remaining across recorded fees. Currency display can be changed in public/app.js.</div></div></div>`;
}
function bindDashboard(){$$("[data-go]").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.go)));$("[data-action='add-student']")?.addEventListener("click",()=>openForm("students"))}
function fieldsHtml(fields,item={}){return fields.map(f=>{const [key,label,type="text",required=false,options=[]]=f;let val=item[key]??"";const full=type==="textarea"||key==="body";let control;if(type==="select")control=`<select name="${key}" ${required?"required":""}>${options.map(o=>`<option value="${esc(o)}" ${String(o)===String(val)?"selected":""}>${esc(o||"Choose…")}</option>`).join("")}</select>`;else if(type==="textarea")control=`<textarea name="${key}" ${required?"required":""} placeholder="Write details here…">${esc(val)}</textarea>`;else control=`<input name="${key}" type="${type}" value="${esc(val)}" ${required?"required":""} ${type==="number"?'min="0"':''}>`;return `<div class="field ${full?"full":""}"><label>${esc(label)}${required?" *":""}</label>${control}</div>`}).join("")}
function openForm(page,item=null){
 editId=item?.id||null;const cfg=configs[page];if(!cfg)return;
 $("#modal-title").textContent=(item?"Edit ":"Add ")+page.slice(0,-1).replace(/^staff$/,"staff member").replace(/^classe$/,"class");
 $("#modal-fields").innerHTML=fieldsHtml(cfg.fields,item||{});
 $("#modal").classList.remove("hidden");
 $("#record-form").onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());try{await api(`/api/${cfg.endpoint}${editId?"/"+editId:""}`,{method:editId?"PUT":"POST",body:JSON.stringify(data)});$("#modal").classList.add("hidden");toast(editId?"Record updated":"Record saved");renderPage()}catch(err){toast(err.message,true)}};
}
async function deleteRecord(page,id){if(!confirm("Archive/delete this record? Related records may prevent deletion."))return;try{await api(`/api/${configs[page].endpoint}/${id}`,{method:"DELETE"});toast("Record deleted");renderPage()}catch(e){toast(e.message,true)}}
function bindAttendance(){
 $("#attendance-date").addEventListener("change",()=>renderPage());
 $("#attendance-form").addEventListener("submit",async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());try{await api("/api/attendance",{method:"POST",body:JSON.stringify(data)});toast("Attendance saved");renderPage()}catch(err){toast(err.message,true)}});
}
async function attendancePage(){
 const date=$("#attendance-date")?.value||new Date().toISOString().slice(0,10);
 const [studentsData,attendanceData]=await Promise.all([api("/api/students"),api(`/api/attendance?date=${date}`)]);
 const students=studentsData.items||[], items=attendanceData.items||[];
 return pageHeader("attendance")+`<div class="panel" style="margin-bottom:18px"><div class="panel-head"><div><h3>Mark a learner's attendance</h3><p>One record per learner per day; saving again updates the status.</p></div></div><form id="attendance-form" style="padding:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:13px;align-items:end"><div class="field"><label>Student *</label><select name="student_id" required><option value="">Choose student</option>${students.map(s=>`<option value="${s.id}">${esc(s.first_name+" "+s.last_name)} — ${esc(s.class_name)}</option>`).join("")}</select></div><div class="field"><label>Date *</label><input id="attendance-date" name="attendance_date" type="date" value="${date}" required></div><div class="field"><label>Status *</label><select name="status"><option>Present</option><option>Absent</option><option>Late</option><option>Excused</option></select></div><div class="field"><label>Note</label><input name="note" placeholder="Optional note"></div><button class="btn btn-primary" type="submit">Save attendance →</button></form></div><div class="table-panel"><div class="panel-head"><div><h3>Attendance for ${fmtDate(date)}</h3><p>${items.length} learners marked</p></div></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Status</th><th>Note</th></tr></thead><tbody>${items.map(i=>`<tr><td><strong>${esc(i.first_name+" "+i.last_name)}</strong><span class="subtext">${esc(i.admission_no)}</span></td><td>${esc(i.class_name)}</td><td>${badge(i.status)}</td><td>${esc(i.note||"—")}</td></tr>`).join("")||`<tr><td colspan="4">${empty("No attendance recorded","Choose a learner above to get started.")}</td></tr>`}</tbody></table></div></div>`;
}
async function feesPage(){
 const [data,sd]=await Promise.all([api("/api/fees"),api("/api/students")]);currentItems=data.items||[];
 return pageHeader("fees",btn("Add fee record","add"))+`<div class="toolbar"><div class="search-wrap"><span>⌕</span><input id="finance-search" placeholder="Search student, term or class"></div><span class="subtext">${currentItems.length} fee records</span></div><div class="table-panel"><div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Term</th><th>Amount due</th><th>Paid</th><th>Balance</th><th>Due date</th><th>Status</th></tr></thead><tbody>${currentItems.map(i=>{let balance=Number(i.amount_due)-Number(i.amount_paid);return `<tr><td><strong>${esc(i.first_name+" "+i.last_name)}</strong><span class="subtext">${esc(i.admission_no)}</span></td><td>${esc(i.class_name)}</td><td>${esc(i.term)}</td><td>${money(i.amount_due)}</td><td>${money(i.amount_paid)}</td><td><strong>${money(balance)}</strong></td><td>${fmtDate(i.due_date)}</td><td>${badge(balance<=0?"Paid":Number(i.amount_paid)>0?"Part-paid":"Outstanding")}</td></tr>`}).join("")||`<tr><td colspan="8">${empty("No fee records yet","Add a fee record to begin tracking balances.")}</td></tr>`}</tbody></table></div></div>`;
}
async function resultsPage(){
 const [data,sd]=await Promise.all([api("/api/results"),api("/api/students")]);currentItems=data.items||[];
 return pageHeader("results",btn("Add result","add"))+`<div class="toolbar"><div class="search-wrap"><span>⌕</span><input id="finance-search" placeholder="Search student or subject"></div><span class="subtext">${currentItems.length} results recorded</span></div><div class="table-panel"><div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Subject</th><th>Term</th><th>Score</th><th>Grade</th><th>Teacher note</th></tr></thead><tbody>${currentItems.map(i=>{let pct=Number(i.score)/Number(i.max_score)*100;let grade=pct>=80?"A":pct>=70?"B":pct>=60?"C":pct>=50?"D":"Needs support";return `<tr><td><strong>${esc(i.first_name+" "+i.last_name)}</strong><span class="subtext">${esc(i.admission_no)}</span></td><td>${esc(i.class_name)}</td><td>${esc(i.subject)}</td><td>${esc(i.term)}</td><td><strong>${i.score}/${i.max_score}</strong><span class="subtext">${pct.toFixed(0)}%</span></td><td>${badge(grade)}</td><td>${esc(i.teacher_note||"—")}</td></tr>`}).join("")||`<tr><td colspan="7">${empty("No results recorded","Add an assessment result to begin.")}</td></tr>`}</tbody></table></div></div>`;
}
function bindFinance(page){
 const add=$("[data-action='add']");if(add)add.addEventListener("click",()=>openFinanceForm(page));
 $("#finance-search")?.addEventListener("input",e=>$$("tbody tr").forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(e.target.value.toLowerCase())?"":"none"));
}
async function openFinanceForm(page){
 const sd=await api("/api/students");const opts=(sd.items||[]).map(s=>[s.id,`${s.first_name} ${s.last_name} — ${s.class_name}`]);
 const fields=page==="fees"?[
 ["student_id","Student","select",true,opts],["term","Term / session","text",true],["amount_due","Amount due","number",true],["amount_paid","Amount paid","number"],["due_date","Due date","date"],["note","Note","textarea"]
 ]:[
 ["student_id","Student","select",true,opts],["subject","Subject","text",true],["term","Term / session","text",true],["score","Score","number",true],["max_score","Maximum score","number",true],["teacher_note","Teacher note","textarea"]
 ];
 $("#modal-title").textContent=page==="fees"?"Add fee record":"Add exam result";$("#modal-fields").innerHTML=fieldsHtml(fields,{max_score:100,amount_paid:0});$("#modal").classList.remove("hidden");
 $("#record-form").onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());try{await api(`/api/${page}`,{method:"POST",body:JSON.stringify(data)});$("#modal").classList.add("hidden");toast("Record saved");renderPage()}catch(err){toast(err.message,true)}};
}
async function usersPage(){const d=await api("/api/users");currentItems=d.items||[];return pageHeader("users",btn("Invite user","add"))+`<div class="table-panel"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>${currentItems.map(u=>`<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td>${badge(u.role)}</td><td>${badge(u.active?"Active":"Inactive")}</td><td>${fmtDate(u.created_at)}</td></tr>`).join("")||`<tr><td colspan="5">${empty()}</td></tr>`}</tbody></table></div></div>`}
function bindUsers(){$("[data-action='add']")?.addEventListener("click",()=>{const fields=[["name","Full name","text",true],["email","School email","email",true],["role","Access role","select",true,["teacher","bursar","parent","admin"]]];$("#modal-title").textContent="Invite a portal user";$("#modal-fields").innerHTML=fieldsHtml(fields);$("#modal").classList.remove("hidden");$("#record-form").onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());try{await api("/api/users",{method:"POST",body:JSON.stringify(data)});$("#modal").classList.add("hidden");toast("User account created. They can request an email code to sign in.");renderPage()}catch(err){toast(err.message,true)}}})}
async function auditPage(){const d=await api("/api/audit");return pageHeader("audit")+`<div class="table-panel"><div class="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Area</th><th>Details</th></tr></thead><tbody>${(d.items||[]).map(a=>`<tr><td>${fmtDate(a.created_at)}</td><td>${esc(a.user_name||"System")}</td><td>${badge(a.action)}</td><td>${esc(a.entity)}</td><td>${esc(a.detail)}</td></tr>`).join("")||`<tr><td colspan="5">${empty("No activity yet")}</td></tr>`}</tbody></table></div></div>`}
function bindNav(){$$(".nav-item").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.page)));$("#mobile-menu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"))}
async function boot(){
 try{const d=await api("/api/auth/me");showApp(d.user,d.permissions)}catch(_){showLogin()}
}
function showLogin(){$("#login-screen").classList.remove("hidden");$("#app-shell").classList.add("hidden")}
function showApp(user,permissions=[]){currentUser=user;$("#login-screen").classList.add("hidden");$("#app-shell").classList.remove("hidden");$("#top-user-name").textContent=user.name;$("#top-user-role").textContent=user.role;$("#top-avatar").textContent=initials(user.name);$$(".admin-only").forEach(b=>b.style.display=user.role==="admin"?"flex":"none");$$(".nav-item").forEach(b=>{const allowed=["dashboard",...(permissions||[])];b.style.display=allowed.includes(b.dataset.page)?"flex":"none"});bindNav();setPage("dashboard")}
let loginEmail="";
$("#request-code-form").addEventListener("submit",async e=>{e.preventDefault();loginEmail=$("#login-email").value.trim();const b=e.submitter;b.disabled=true;b.textContent="Sending code…";try{await api("/api/auth/request-code",{method:"POST",body:JSON.stringify({email:loginEmail})});$("#request-code-form").classList.add("hidden");$("#verify-code-form").classList.remove("hidden");toast("Check your email for a sign-in code. If testing locally, check the server terminal.");$("#otp-code").focus()}catch(err){toast(err.message,true)}finally{b.disabled=false;b.innerHTML='Send sign-in code <span>→</span>'}});
$("#verify-code-form").addEventListener("submit",async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;b.textContent="Checking code…";try{const d=await api("/api/auth/verify-code",{method:"POST",body:JSON.stringify({email:loginEmail,code:$("#otp-code").value.trim()})});showApp(d.user);toast("Welcome to your school workspace.")}catch(err){toast(err.message,true)}finally{b.disabled=false;b.innerHTML='Verify and continue <span>→</span>'}});
$("#change-email").addEventListener("click",()=>{$("#verify-code-form").classList.add("hidden");$("#request-code-form").classList.remove("hidden");$("#otp-code").value=""});
$("#logout-btn").addEventListener("click",async()=>{try{await api("/api/auth/logout",{method:"POST"})}catch(_){}showLogin();$("#request-code-form").classList.remove("hidden");$("#verify-code-form").classList.add("hidden");$("#otp-code").value="";toast("You have signed out.")});
$("#modal-close").addEventListener("click",()=>$("#modal").classList.add("hidden"));$("#modal-cancel").addEventListener("click",()=>$("#modal").classList.add("hidden"));$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")$("#modal").classList.add("hidden")});
boot();
