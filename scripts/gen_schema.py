"""สร้าง migrations/0001_init.sql จากนิยามคอลัมน์ชุดเดียว (ใช้ร่วมกับ trigger บันทึกประวัติ)
ใช้:  python3 -I scripts/gen_schema.py > migrations/0001_init.sql
"""

TABLES = {
    "roads": [
        ("community_id", "INTEGER REFERENCES communities(id)"),
        ("seq", "INTEGER"),
        ("reg_code", "TEXT"),
        ("name", "TEXT NOT NULL"),
        ("lat", "REAL"), ("lng", "REAL"),
        ("row_w_min", "REAL"), ("row_w_max", "REAL"),
        ("length_km", "REAL"),
        ("land_type", "TEXT"),
        ("surface", "TEXT"),
        ("surf_w_min", "REAL"), ("surf_w_max", "REAL"),
        ("shoulder_type_l", "TEXT"), ("shoulder_type_r", "TEXT"),
        ("shoulder_w_l_min", "REAL"), ("shoulder_w_l_max", "REAL"),
        ("shoulder_w_r_min", "REAL"), ("shoulder_w_r_max", "REAL"),
        ("drain_channel_l", "TEXT"), ("drain_channel_r", "TEXT"),
        ("drain_pipe_l", "TEXT"), ("drain_pipe_r", "TEXT"),
        ("manhole_l", "INTEGER"), ("manhole_r", "INTEGER"),
        ("lamp_led", "INTEGER"), ("lamp_fluorescent", "INTEGER"), ("lamp_turtle", "INTEGER"),
        ("note", "TEXT"),
    ],
    "bridges": [
        ("seq", "INTEGER"),
        ("name", "TEXT NOT NULL"),
        ("width_m", "REAL"), ("length_m", "REAL"), ("height_m", "REAL"),
        ("walk_l_m", "REAL"), ("walk_r_m", "REAL"),
        ("bridge_type", "TEXT"),
        ("lat", "REAL"), ("lng", "REAL"),
        ("note", "TEXT"),
    ],
    "parks": [
        ("seq", "INTEGER"),
        ("name", "TEXT NOT NULL"),
        ("lat", "REAL"), ("lng", "REAL"),
        ("area_sqm", "REAL"),
        ("note", "TEXT"),
    ],
}
SEED_USER = "นำเข้าจาก Excel"

out = ["""-- RCRNIS : schema สำหรับ Cloudflare D1 (SQLite)
-- สร้างโดย scripts/gen_schema.py  อย่าแก้ไฟล์นี้ด้วยมือ ให้แก้ที่สคริปต์แล้วสร้างใหม่

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('data_version', 1);

CREATE TABLE IF NOT EXISTS communities (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  email        TEXT PRIMARY KEY COLLATE NOCASE,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor','admin')),
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by   TEXT
);

-- ประวัติการแก้ไข: แก้หรือลบไม่ได้ (มี trigger ป้องกันด้านล่าง)
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  changed_by  TEXT,
  changed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  old_json    TEXT,
  new_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_log (changed_at);
CREATE TRIGGER IF NOT EXISTS trg_audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log แก้ไขไม่ได้'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log ลบไม่ได้'); END;
"""]

for t, cols in TABLES.items():
    body = ",\n".join(f"  {c:<18} {d}" for c, d in cols)
    out.append(f"""
CREATE TABLE IF NOT EXISTS {t} (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
{body},
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by         TEXT
);""")
    names = [c for c, _ in cols] + ["is_deleted"]
    jo = lambda p: "json_object(" + ", ".join(f"'{c}', {p}.{c}" for c in names) + ")"
    out.append(f"""
CREATE TRIGGER IF NOT EXISTS trg_{t}_ins AFTER INSERT ON {t}
BEGIN
  UPDATE meta SET value = value + 1 WHERE key = 'data_version';
  INSERT INTO audit_log (table_name, record_id, action, changed_by, new_json)
  SELECT '{t}', NEW.id, 'create', NEW.updated_by, {jo('NEW')}
  WHERE COALESCE(NEW.updated_by,'') <> '{SEED_USER}';
END;
CREATE TRIGGER IF NOT EXISTS trg_{t}_upd AFTER UPDATE ON {t}
BEGIN
  UPDATE meta SET value = value + 1 WHERE key = 'data_version';
  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_json, new_json)
  VALUES ('{t}', NEW.id,
    CASE WHEN OLD.is_deleted = 0 AND NEW.is_deleted = 1 THEN 'delete'
         WHEN OLD.is_deleted = 1 AND NEW.is_deleted = 0 THEN 'restore'
         ELSE 'update' END,
    NEW.updated_by, {jo('OLD')}, {jo('NEW')});
END;
CREATE TRIGGER IF NOT EXISTS trg_{t}_no_delete BEFORE DELETE ON {t}
BEGIN SELECT RAISE(ABORT, 'ห้ามลบถาวร ให้ใช้การซ่อน (is_deleted = 1)'); END;""")

out.append("""
CREATE INDEX IF NOT EXISTS idx_roads_community ON roads (community_id);
CREATE INDEX IF NOT EXISTS idx_roads_type      ON roads (land_type, surface);
CREATE UNIQUE INDEX IF NOT EXISTS uq_roads_reg_code ON roads (reg_code)
  WHERE reg_code IS NOT NULL AND is_deleted = 0;

CREATE TRIGGER IF NOT EXISTS trg_users_upd AFTER UPDATE ON users
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_json, new_json)
  VALUES ('users', NEW.email, 'update', NEW.updated_by,
    json_object('role', OLD.role, 'active', OLD.active, 'display_name', OLD.display_name),
    json_object('role', NEW.role, 'active', NEW.active, 'display_name', NEW.display_name));
END;
CREATE TRIGGER IF NOT EXISTS trg_users_ins AFTER INSERT ON users
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, changed_by, new_json)
  VALUES ('users', NEW.email, 'create', NEW.updated_by,
    json_object('role', NEW.role, 'active', NEW.active, 'display_name', NEW.display_name));
END;
""")
print("\n".join(out))
