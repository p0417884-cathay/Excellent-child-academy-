const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

function secret() {
  const value = process.env.JWT_SECRET || "";
  if (process.env.NODE_ENV === "production" && value.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production.");
  }
  return value || "development-only-secret-change-before-deploy-123456789";
}

function signSession(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, secret(), { expiresIn: "8h" });
}
function verifySession(token) {
  return jwt.verify(token, secret());
}
function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}
function checkPassword(password, hash) {
  return !!hash && bcrypt.compareSync(password, hash);
}
module.exports = { signSession, verifySession, hashPassword, checkPassword };
