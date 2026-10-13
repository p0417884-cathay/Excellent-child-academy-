require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const { signSession, verifySession, hashPassword } = require("./auth");
const { sendOtp } = require("./email");

const app = express();
const PORT = Number(process.env.PORT || 3000);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many sign-in attempts. Please wait and try again." } });

const roles = {
  admin: ["students","staff","classes","attendance","fees","results","announcements","messages","users"],
  teacher: ["students","classes","attendance","results","announcements","messages"],
  bursar: ["students","fees","announcements","messages"],
  parent: ["students","attendance","fees","results","announcements","messages"]
};
function safeUser(row) {
  return row && { id: row.id, name: row.name, email: row.email, role: row.role };
}
function auth(req, res, next) {
  try {
    const token = req.cookies.eca_session || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Please sign in to continue." });
    const payload = verifySession(token);
    const user = db.prepare("SELECT id,name,email,role,active FROM users WHERE id=?").get(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: "This account is inactive." });
    req.user = user;
    next();
  } catch (_) { return res.status(401).json({ error: "Your session has expired. Please sign in again." }); }
}
function allow(module) {
  return (req, res, next) => {
    if (!roles[req.user.role]?.includes(module)) return res.status(403).json({ error: "Your account does not have permission for this action." });
    next();
  };
}
function audit(userId, action, entity, entityId, detail = "") {
  db.prepare("INSERT INTO audit_log(user_id,action,entity,entity_id,detail) VALUES(?,?,?,?,?)").run(userId, action, entity, entityId || null, String(detail).slice(0, 300));
}
function text(v, max=180) { return String(v ?? "").trim().slice(0,max); }
function required(v, label) { const s = text(v); if (!s) throw new Error(`${label} is required.`); return s; }
function emailValid(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "")); }
function wrap(fn) { return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next); }

app.post("/api/auth/request-code", authLimiter, wrap(async (req,res) => {
  const email = text(req.body.email, 254).toLowerCase();
  if (!emailValid(email)) return res.status(400).json({ error: "Enter a valid email address." });
  const user = db.prepare("SELECT id,active FROM users WHERE email=? COLLATE NOCASE").get(email);
  // Do not reveal whether an email has an account.
  if (user && user.active) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const codeHash = crypto.createHash("sha256").update(`${email}:${code}:${process.env.JWT_SECRET || "dev"}`).digest("hex");
    db.prepare("UPDATE otp_codes SET used=1 WHERE email=?").run(email);
    db.prepare("INSERT INTO otp_codes(email,code_hash,expires_at,created_at) VALUES(?,?,?,?)").run(email, codeHash, Date.now()+10*60*1000, Date.now());
    await sendOtp(email, code);
  }
  res.json({ message: "If this email belongs to an active account, a sign-in code has been sent." });
}));
app.post("/api/auth/verify-code", authLimiter, wrap(async (req,res) => {
  const email = text(req.body.email,254).toLowerCase();
  const code = text(req.body.code,6);
  if (!emailValid(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the email and six-digit code." });
  const codeHash = crypto.createHash("sha256").update(`${email}:${code}:${process.env.JWT_SECRET || "dev"}`).digest("hex");
  const record = db.prepare("SELECT * FROM otp_codes WHERE email=? AND used=0 ORDER BY id DESC LIMIT 1").get(email);
  if (!record || record.expires_at < Date.now() || record.code_hash !== codeHash) return res.status(400).json({ error: "That code is invalid or expired. Request a new one." });
  const user = db.prepare("SELECT id,name,email,role,active FROM users WHERE email=? COLLATE NOCASE").get(email);
  if (!user || !user.active) return res.status(400).json({ error: "That code is invalid or expired. Request a new one." });
  db.prepare("UPDATE otp_codes SET used=1 WHERE id=?").run(record.id);
  const token = signSession(user);
  res.cookie("eca_session", token, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV==="production", maxAge:8*60*60*1000, path:"/" });
  audit(user.id,"sign_in","user",user.id,"Email OTP");
  res.json({ user:safeUser(user) });
}));
app.post("/api/auth/logout", (req,res) => { res.clearCookie("eca_session",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/"}); res.json({ok:true}); });
app.get("/api/auth/me", auth, (req,res) => res.json({ user:safeUser(req.user), permissions:roles[req.user.role] || [] }));

app.get("/api/dashboard", auth, (req,res) => {
  const count = (table, where="") => db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get().n;
  const today = new Date().toISOString().slice(0,10);
  res.json({
    students: count("students","WHERE status='Active'"),
    staff: count("staff","WHERE status='Active'"),
    classes: count("classes"),
    attendanceToday: db.prepare("SELECT COUNT(*) AS n FROM attendance WHERE attendance_date=? AND status='Present'").get(today).n,
    outstanding: db.prepare("SELECT COALESCE(SUM(amount_due-amount_paid),0) AS n FROM fees").get().n,
    recentAnnouncements: db.prepare("SELECT a.id,a.title,a.body,a.audience,a.created_at,u.name AS author FROM announcements a LEFT JOIN users u ON u.id=a.author_id ORDER BY a.id DESC LIMIT 4").all(),
    recentStudents: db.prepare("SELECT id,admission_no,first_name,last_name,class_name,status FROM students ORDER BY id DESC LIMIT 5").all()
  });
});

const resources = {
  students: { table:"students", columns:["admission_no","first_name","last_name","gender","date_of_birth","class_name","guardian_name","guardian_email","guardian_phone","status"], required:["admission_no","first_name","last_name","class_name"], search:["admission_no","first_name","last_name","class_name","guardian_name"] },
  staff: { table:"staff", columns:["staff_no","name","role_title","email","phone","status"], required:["staff_no","name","role_title"], search:["staff_no","name","role_title","email"] },
  classes: { table:"classes", columns:["name","teacher","room","capacity"], required:["name"], search:["name","teacher","room"] },
  announcements: { table:"announcements", columns:["title","body","audience"], required:["title","body"], search:["title","body","audience"] },
  messages: { table:"messages", columns:["student_id","contact_name","contact_email","subject","body","status"], required:["contact_name","subject","body"], search:["contact_name","subject","body","status"] }
};
function cleanResource(key, body) {
  const r=resources[key]; const data={};
  for (const c of r.columns) {
    let v=body[c];
    if (c==="capacity" || c==="student_id") v=(v==="" || v==null)?null:Number(v);
    if (c==="capacity" && (!Number.isInteger(v) || v<1 || v>500)) throw new Error("Capacity must be between 1 and 500.");
    if (c==="student_id" && v!==null && (!Number.isInteger(v)||v<1)) throw new Error("Select a valid student.");
    if (c==="email" || c==="guardian_email" || c==="contact_email") { v=text(v,254).toLowerCase(); if(v && !emailValid(v)) throw new Error(`Enter a valid ${c.replace("_"," ")}.`); }
    else if (c==="capacity" || c==="student_id") {}
    else v=text(v, c==="body"?4000: c==="admission_no" || c==="staff_no"?50: c==="title"?180: c==="subject"?180:250);
    if (r.required.includes(c)) v=required(v,c.replaceAll("_"," "));
    data[c]=v;
  }
  return data;
}
for (const key of Object.keys(resources)) {
  app.get(`/api/${key}`, auth, allow(key), (req,res) => {
    const r=resources[key]; const q=text(req.query.q,100);
    let rows;
    if(q) {
      const where=r.search.map(c=>`CAST(${c} AS TEXT) LIKE ?`).join(" OR ");
      rows=db.prepare(`SELECT * FROM ${r.table} WHERE ${where} ORDER BY id DESC LIMIT 300`).all(...r.search.map(()=>`%${q}%`));
    } else rows=db.prepare(`SELECT * FROM ${r.table} ORDER BY id DESC LIMIT 300`).all();
    res.json({items:rows});
  });
  app.post(`/api/${key}`, auth, allow(key), wrap(async(req,res)=>{
    const data=cleanResource(key,req.body);
    if(key==="announcements") data.author_id=req.user.id;
    const cols=Object.keys(data);
    const info=db.prepare(`INSERT INTO ${resources[key].table}(${cols.join(",")}) VALUES(${cols.map(()=>"?").join(",")})`).run(...cols.map(c=>data[c]));
    audit(req.user.id,"create",key,info.lastInsertRowid,`${key} record created`);
    res.status(201).json({item:db.prepare(`SELECT * FROM ${resources[key].table} WHERE id=?`).get(info.lastInsertRowid)});
  }));
  app.put(`/api/${key}/:id`, auth, allow(key), wrap(async(req,res)=>{
    const id=Number(req.params.id); if(!Number.isInteger(id)||id<1) return res.status(400).json({error:"Invalid record ID."});
    const data=cleanResource(key,req.body);
    const cols=Object.keys(data);
    const info=db.prepare(`UPDATE ${resources[key].table} SET ${cols.map(c=>`${c}=?`).join(",")} WHERE id=?`).run(...cols.map(c=>data[c]),id);
    if(!info.changes) return res.status(404).json({error:"Record not found."});
    audit(req.user.id,"update",key,id,`${key} record updated`);
    res.json({item:db.prepare(`SELECT * FROM ${resources[key].table} WHERE id=?`).get(id)});
  }));
  app.delete(`/api/${key}/:id`, auth, allow(key), (req,res)=>{
    if(req.user.role!=="admin") return res.status(403).json({error:"Only an administrator can delete records."});
    const id=Number(req.params.id);
    try {
      const info=db.prepare(`DELETE FROM ${resources[key].table} WHERE id=?`).run(id);
      if(!info.changes) return res.status(404).json({error:"Record not found."});
      audit(req.user.id,"delete",key,id,`${key} record deleted`);
      res.json({ok:true});
    } catch(e) { res.status(409).json({error:"This record is connected to other records and cannot be deleted. Archive it instead."}); }
  });
}

app.get("/api/attendance", auth, allow("attendance"), (req,res)=>{
  const date=text(req.query.date,10)||new Date().toISOString().slice(0,10);
  const rows=db.prepare(`SELECT a.id,a.student_id,a.attendance_date,a.status,a.note,s.admission_no,s.first_name,s.last_name,s.class_name
    FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.attendance_date=? ORDER BY s.class_name,s.last_name`).all(date);
  res.json({date,items:rows});
});
app.post("/api/attendance", auth, allow("attendance"), wrap(async(req,res)=>{
  const studentId=Number(req.body.student_id), date=text(req.body.attendance_date,10), status=text(req.body.status,20), note=text(req.body.note,300);
  if(!Number.isInteger(studentId)||!date||!["Present","Absent","Late","Excused"].includes(status)) return res.status(400).json({error:"Choose a student, date and valid attendance status."});
  db.prepare(`INSERT INTO attendance(student_id,attendance_date,status,note,created_by) VALUES(?,?,?,?,?)
    ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status,note=excluded.note,created_by=excluded.created_by`).run(studentId,date,status,note,req.user.id);
  audit(req.user.id,"record","attendance",studentId,`${date}: ${status}`);
  res.json({ok:true});
}));
app.get("/api/fees", auth, allow("fees"), (req,res)=>{
  res.json({items:db.prepare(`SELECT f.*,s.admission_no,s.first_name,s.last_name,s.class_name FROM fees f JOIN students s ON s.id=f.student_id ORDER BY f.id DESC LIMIT 300`).all()});
});
app.post("/api/fees", auth, allow("fees"), wrap(async(req,res)=>{
  const studentId=Number(req.body.student_id), term=required(req.body.term,"term"), amountDue=Number(req.body.amount_due), amountPaid=Number(req.body.amount_paid||0), dueDate=text(req.body.due_date,10), note=text(req.body.note,300);
  if(!Number.isInteger(studentId)||amountDue<0||amountPaid<0||!Number.isFinite(amountDue)||!Number.isFinite(amountPaid)) return res.status(400).json({error:"Choose a student and enter valid fee amounts."});
  const info=db.prepare("INSERT INTO fees(student_id,term,amount_due,amount_paid,due_date,note) VALUES(?,?,?,?,?,?)").run(studentId,term,amountDue,amountPaid,dueDate,note);
  audit(req.user.id,"create","fees",info.lastInsertRowid,"Fee record created");
  res.status(201).json({ok:true});
}));
app.get("/api/results", auth, allow("results"), (req,res)=>{
  res.json({items:db.prepare(`SELECT r.*,s.admission_no,s.first_name,s.last_name,s.class_name FROM results r JOIN students s ON s.id=r.student_id ORDER BY r.id DESC LIMIT 500`).all()});
});
app.post("/api/results", auth, allow("results"), wrap(async(req,res)=>{
  const studentId=Number(req.body.student_id), subject=required(req.body.subject,"subject"), term=required(req.body.term,"term"), score=Number(req.body.score), maxScore=Number(req.body.max_score||100), teacherNote=text(req.body.teacher_note,500);
  if(!Number.isInteger(studentId)||!Number.isFinite(score)||!Number.isFinite(maxScore)||maxScore<=0||score<0||score>maxScore) return res.status(400).json({error:"Choose a student and enter a score within the maximum score."});
  const info=db.prepare("INSERT INTO results(student_id,subject,term,score,max_score,teacher_note) VALUES(?,?,?,?,?,?)").run(studentId,subject,term,score,maxScore,teacherNote);
  audit(req.user.id,"create","results",info.lastInsertRowid,"Result recorded");
  res.status(201).json({ok:true});
}));
app.get("/api/users", auth, allow("users"), (req,res)=>res.json({items:db.prepare("SELECT id,name,email,role,active,created_at FROM users ORDER BY id DESC").all()}));
app.post("/api/users", auth, allow("users"), wrap(async(req,res)=>{
  const name=required(req.body.name,"name"), email=required(req.body.email,"email").toLowerCase(), role=text(req.body.role,20);
  if(!emailValid(email)||!["admin","teacher","bursar","parent"].includes(role)) return res.status(400).json({error:"Enter a valid email and role."});
  const info=db.prepare("INSERT INTO users(name,email,role,active) VALUES(?,?,?,1)").run(name,email,role);
  audit(req.user.id,"create","user",info.lastInsertRowid,`Created ${role} account`);
  res.status(201).json({ok:true});
}));
app.get("/api/audit", auth, allow("users"), (req,res)=>res.json({items:db.prepare("SELECT a.*,u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200").all()}));

app.get("/api/students/:id/summary", auth, allow("students"), (req,res)=>{
  const id=Number(req.params.id);
  const student=db.prepare("SELECT * FROM students WHERE id=?").get(id);
  if(!student) return res.status(404).json({error:"Student not found."});
  res.json({student,fees:db.prepare("SELECT * FROM fees WHERE student_id=? ORDER BY id DESC").all(id),results:db.prepare("SELECT * FROM results WHERE student_id=? ORDER BY id DESC").all(id),attendance:db.prepare("SELECT * FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 30").all(id)});
});

app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"..","public","index.html")));
app.use((err,req,res,next)=>{
  console.error(err);
  const msg = err.code==="SQLITE_CONSTRAINT_UNIQUE" ? "That number or name already exists." :
    err.message==="Email delivery is not configured. Contact the school administrator." ? err.message :
    (err.message && !/SQLITE|constraint|database is locked/i.test(err.message) ? err.message : "Something went wrong. Please try again.");
  res.status(400).json({error:msg});
});

app.listen(PORT,()=>console.log(`Excellent Child Academy running on port ${PORT}`));
