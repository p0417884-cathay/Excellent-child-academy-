require("dotenv").config();
const db = require("./db");
const { hashPassword } = require("./auth");

const name = process.env.ADMIN_NAME || "School Administrator";
const email = (process.env.ADMIN_EMAIL || "admin@excellentchildacademy.edu").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "ChangeThisPassword123!";
const existing = db.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE").get(email);
if (existing) {
  console.log(`Admin account already exists for ${email}. No changes made.`);
} else {
  const info = db.prepare("INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,'admin',1)").run(name,email,hashPassword(password));
  console.log(`Created administrator account ${email} (user ID ${info.lastInsertRowid}).`);
  console.log("Sign in with email OTP. Configure SMTP or read the development code from the server terminal.");
}
const classes = db.prepare("SELECT COUNT(*) AS n FROM classes").get().n;
if (!classes) {
  const insert = db.prepare("INSERT INTO classes(name,teacher,room,capacity) VALUES(?,?,?,?)");
  const tx = db.transaction(() => {
    [["Nursery 1","", "Room 1",25],["Nursery 2","", "Room 2",25],["Primary 1","", "Room 3",30],["Primary 2","", "Room 4",30]].forEach(row=>insert.run(...row));
  });
  tx();
  console.log("Added a few starter class groups. You can edit them in the portal.");
}
