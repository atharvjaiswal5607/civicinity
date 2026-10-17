require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
for (const dir of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true });

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
  console.warn("WARNING: Set a long JWT_SECRET in your .env file before using this beyond a local demo.");
}
const JWT_SECRET = process.env.JWT_SECRET || "local-demo-only-secret-change-this-please";
const db = new Database(path.join(DATA_DIR, "civicinity.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'citizen' CHECK(role IN ('citizen','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  location_text TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  photo_filename TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High','Critical')),
  department TEXT NOT NULL DEFAULT 'Unassigned',
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted','Assigned','In Progress','Resolved','Rejected')),
  resolution_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS complaint_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
`);

function safeUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, created_at: row.created_at };
}
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in to continue." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id,name,email,role,created_at FROM users WHERE id=?").get(payload.id);
    if (!user) return res.status(401).json({ error: "Account no longer exists." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Your session expired. Please log in again." });
  }
}
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  next();
}
function makeTrackingId() {
  return "CIV-" + new Date().getFullYear() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, crypto.randomUUID() + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
    cb(null, true);
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use("/uploads", express.static(UPLOAD_DIR, { fallthrough: false, maxAge: "1h" }));
app.use(express.static(path.join(ROOT, "public")));

const registerAdmin = async () => {
  const email = (process.env.ADMIN_EMAIL || "admin@civicinity.local").toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (!existing) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "ChangeMe123!", 12);
    db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')")
      .run(process.env.ADMIN_NAME || "Civicinity Administrator", email, hash);
    console.log(`Seeded admin account: ${email}`);
  }
};

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "Civicinity API" }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be 2–80 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'citizen')").run(name, email, hash);
    const user = db.prepare("SELECT id,name,email,role,created_at FROM users WHERE id=?").get(info.lastInsertRowid);
    res.status(201).json({ token: signToken(user), user: safeUser(user) });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "An account with this email already exists." });
    console.error(e); res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const row = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return res.status(401).json({ error: "Incorrect email or password." });
  const user = safeUser(row);
  res.json({ token: signToken(user), user });
});
app.get("/api/auth/me", auth, (req, res) => res.json({ user: safeUser(req.user) }));

app.post("/api/complaints", auth, upload.single("photo"), (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const category = String(req.body.category || "");
    const locationText = String(req.body.location_text || "").trim();
    const lat = req.body.latitude === "" || req.body.latitude == null ? null : Number(req.body.latitude);
    const lng = req.body.longitude === "" || req.body.longitude == null ? null : Number(req.body.longitude);
    const allowed = ["Pothole / Damaged Road", "Garbage Accumulation", "Broken Streetlight", "Water Leakage", "Drainage Problem", "Other"];
    if (title.length < 5 || title.length > 120) return res.status(400).json({ error: "Title must be 5–120 characters." });
    if (description.length < 10 || description.length > 2000) return res.status(400).json({ error: "Description must be 10–2,000 characters." });
    if (!allowed.includes(category)) return res.status(400).json({ error: "Choose a valid issue category." });
    if (!locationText || locationText.length > 250) return res.status(400).json({ error: "Enter a location or use GPS." });
    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) return res.status(400).json({ error: "Invalid GPS coordinates." });
    let trackingId;
    do { trackingId = makeTrackingId(); } while (db.prepare("SELECT id FROM complaints WHERE tracking_id=?").get(trackingId));
    const priority = req.body.priority === "High" ? "High" : "Medium";
    const info = db.prepare(`INSERT INTO complaints
      (tracking_id,user_id,title,description,category,location_text,latitude,longitude,photo_filename,priority)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(trackingId, req.user.id, title, description, category, locationText, lat, lng, req.file ? req.file.filename : null, priority);
    const complaint = db.prepare("SELECT * FROM complaints WHERE id=?").get(info.lastInsertRowid);
    db.prepare("INSERT INTO complaint_updates(complaint_id,actor_id,status,note) VALUES(?,?,?,?)")
      .run(complaint.id, req.user.id, "Submitted", "Complaint submitted by citizen.");
    res.status(201).json({ complaint: formatComplaint(complaint) });
  } catch (e) {
    console.error(e); res.status(500).json({ error: "Could not submit complaint." });
  }
});

function formatComplaint(c) {
  return { ...c, photo_url: c.photo_filename ? `/uploads/${encodeURIComponent(c.photo_filename)}` : null };
}
function complaintQuery() {
  return `SELECT c.*, u.name AS citizen_name, u.email AS citizen_email,
    (SELECT rating FROM feedback f WHERE f.complaint_id=c.id) AS feedback_rating
    FROM complaints c JOIN users u ON u.id=c.user_id`;
}
app.get("/api/complaints", auth, (req, res) => {
  const { status, category, q } = req.query;
  let sql = complaintQuery();
  const where = [], args = [];
  if (req.user.role !== "admin") { where.push("c.user_id=?"); args.push(req.user.id); }
  if (status && ["Submitted","Assigned","In Progress","Resolved","Rejected"].includes(status)) { where.push("c.status=?"); args.push(status); }
  if (category) { where.push("c.category=?"); args.push(String(category)); }
  if (q) { where.push("(c.tracking_id LIKE ? OR c.title LIKE ? OR c.location_text LIKE ?)"); args.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY c.created_at DESC";
  res.json({ complaints: db.prepare(sql).all(...args).map(formatComplaint) });
});
app.get("/api/complaints/track/:trackingId", auth, (req, res) => {
  const c = db.prepare(complaintQuery() + " WHERE c.tracking_id=?").get(req.params.trackingId.toUpperCase());
  if (!c || (req.user.role !== "admin" && c.user_id !== req.user.id)) return res.status(404).json({ error: "Complaint not found for your account." });
  const updates = db.prepare(`SELECT cu.*, u.name AS actor_name FROM complaint_updates cu LEFT JOIN users u ON u.id=cu.actor_id WHERE cu.complaint_id=? ORDER BY cu.created_at ASC`).all(c.id);
  res.json({ complaint: formatComplaint(c), updates });
});
app.patch("/api/complaints/:id", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM complaints WHERE id=?").get(id);
  if (!current) return res.status(404).json({ error: "Complaint not found." });
  const statuses = ["Submitted","Assigned","In Progress","Resolved","Rejected"];
  const priorities = ["Low","Medium","High","Critical"];
  const departments = ["Roads & Infrastructure","Sanitation","Electrical","Water Supply","Drainage","General"];
  const status = req.body.status || current.status;
  const priority = req.body.priority || current.priority;
  const department = req.body.department || current.department;
  const note = String(req.body.note || "").trim().slice(0, 1000);
  if (!statuses.includes(status)) return res.status(400).json({ error: "Invalid status." });
  if (!priorities.includes(priority)) return res.status(400).json({ error: "Invalid priority." });
  if (!departments.includes(department) && department !== "Unassigned") return res.status(400).json({ error: "Invalid department." });
  const resolvedAt = status === "Resolved" ? (current.resolved_at || new Date().toISOString().replace("T"," ").slice(0,19)) : null;
  db.prepare(`UPDATE complaints SET status=?,priority=?,department=?,resolution_notes=?,updated_at=datetime('now'),resolved_at=? WHERE id=?`)
    .run(status, priority, department, note || current.resolution_notes, resolvedAt, id);
  db.prepare("INSERT INTO complaint_updates(complaint_id,actor_id,status,note) VALUES(?,?,?,?)")
    .run(id, req.user.id, status, note || `Status updated to ${status}.`);
  res.json({ complaint: formatComplaint(db.prepare("SELECT * FROM complaints WHERE id=?").get(id)) });
});
app.post("/api/complaints/:id/feedback", auth, (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare("SELECT * FROM complaints WHERE id=?").get(id);
  if (!c || c.user_id !== req.user.id) return res.status(404).json({ error: "Complaint not found." });
  if (c.status !== "Resolved") return res.status(400).json({ error: "Feedback is available after a complaint is resolved." });
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || "").trim().slice(0, 500);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Choose a rating from 1 to 5." });
  try {
    db.prepare("INSERT INTO feedback(complaint_id,user_id,rating,comment) VALUES(?,?,?,?)").run(id, req.user.id, rating, comment);
    res.status(201).json({ message: "Thank you for your feedback." });
  } catch { res.status(409).json({ error: "Feedback has already been submitted." }); }
});
app.get("/api/analytics", auth, adminOnly, (_req, res) => {
  const total = db.prepare("SELECT COUNT(*) n FROM complaints").get().n;
  const byStatus = db.prepare("SELECT status label, COUNT(*) value FROM complaints GROUP BY status").all();
  const byCategory = db.prepare("SELECT category label, COUNT(*) value FROM complaints GROUP BY category ORDER BY value DESC").all();
  const byDepartment = db.prepare("SELECT department label, COUNT(*) value FROM complaints GROUP BY department ORDER BY value DESC").all();
  const resolved = db.prepare("SELECT COUNT(*) n FROM complaints WHERE status='Resolved'").get().n;
  const avgRating = db.prepare("SELECT ROUND(AVG(rating),1) n FROM feedback").get().n;
  res.json({ total, resolved, open: total - resolved, resolution_rate: total ? Math.round(resolved / total * 100) : 0, avg_rating: avgRating || null, by_status: byStatus, by_category: byCategory, by_department: byDepartment });
});
app.get("/api/updates", auth, (req, res) => {
  const rows = db.prepare(`SELECT cu.*, c.tracking_id,c.title FROM complaint_updates cu JOIN complaints c ON c.id=cu.complaint_id WHERE ${req.user.role === "admin" ? "1=1" : "c.user_id=?"} ORDER BY cu.created_at DESC LIMIT 30`)
    .all(...(req.user.role === "admin" ? [] : [req.user.id]));
  res.json({ updates: rows });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller." : "Image upload failed." });
  if (err) {
    if (String(err.message).includes("Only JPG")) return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
  res.status(404).json({ error: "Not found." });
});

registerAdmin().then(() => {
  app.listen(PORT, () => console.log(`Civicinity running at http://localhost:${PORT}`));
}).catch(err => { console.error("Could not initialize admin account", err); process.exit(1); });
