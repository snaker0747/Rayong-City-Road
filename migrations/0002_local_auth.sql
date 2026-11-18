-- RCRNIS : เปลี่ยนจาก Cloudflare Access เป็นระบบผู้ใช้ของตัวเอง (ชื่อผู้ใช้ + รหัสผ่าน)
-- บทบาท: admin = ผู้ดูแล (ทุกอย่าง), user = ผู้ใช้งาน (ดูและแก้ไขข้อมูล)

DROP TRIGGER IF EXISTS trg_users_upd;
DROP TRIGGER IF EXISTS trg_users_ins;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  username       TEXT PRIMARY KEY COLLATE NOCASE,
  display_name   TEXT,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  active         INTEGER NOT NULL DEFAULT 1,
  must_change_pw INTEGER NOT NULL DEFAULT 1,
  failed_count   INTEGER NOT NULL DEFAULT 0,
  locked_until   TEXT,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by     TEXT
);

-- เก็บเฉพาะค่า hash ของโทเคน ถ้าฐานข้อมูลรั่วก็เอาไปใช้ล็อกอินแทนไม่ได้
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (username);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions (expires_at);

-- บันทึกประวัติเฉพาะการเปลี่ยนสิทธิ์/สถานะ/ชื่อ/รหัสผ่าน (ไม่เก็บรหัสผ่าน และไม่บันทึกตอนล็อกอิน)
CREATE TRIGGER trg_users_ins AFTER INSERT ON users
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, changed_by, new_json)
  VALUES ('users', NEW.username, 'create', NEW.updated_by,
    json_object('role', NEW.role, 'active', NEW.active, 'display_name', NEW.display_name));
END;
CREATE TRIGGER trg_users_upd AFTER UPDATE OF role, active, display_name, password_hash ON users
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_json, new_json)
  VALUES ('users', NEW.username, 'update', NEW.updated_by,
    json_object('role', OLD.role, 'active', OLD.active, 'display_name', OLD.display_name,
                'password', CASE WHEN OLD.password_hash = NEW.password_hash THEN 'เดิม' ELSE '(เดิม)' END),
    json_object('role', NEW.role, 'active', NEW.active, 'display_name', NEW.display_name,
                'password', CASE WHEN OLD.password_hash = NEW.password_hash THEN 'เดิม' ELSE '(เปลี่ยนใหม่)' END));
END;
