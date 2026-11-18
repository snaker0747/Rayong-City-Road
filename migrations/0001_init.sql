-- RCRNIS : schema สำหรับ Cloudflare D1 (SQLite)
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


CREATE TABLE IF NOT EXISTS roads (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id       INTEGER REFERENCES communities(id),
  seq                INTEGER,
  reg_code           TEXT,
  name               TEXT NOT NULL,
  lat                REAL,
  lng                REAL,
  row_w_min          REAL,
  row_w_max          REAL,
  length_km          REAL,
  land_type          TEXT,
  surface            TEXT,
  surf_w_min         REAL,
  surf_w_max         REAL,
  shoulder_type_l    TEXT,
  shoulder_type_r    TEXT,
  shoulder_w_l_min   REAL,
  shoulder_w_l_max   REAL,
  shoulder_w_r_min   REAL,
  shoulder_w_r_max   REAL,
  drain_channel_l    TEXT,
  drain_channel_r    TEXT,
  drain_pipe_l       TEXT,
  drain_pipe_r       TEXT,
  manhole_l          INTEGER,
  manhole_r          INTEGER,
  lamp_led           INTEGER,
  lamp_fluorescent   INTEGER,
  lamp_turtle        INTEGER,
  note               TEXT,
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by         TEXT
);

CREATE TRIGGER IF NOT EXISTS trg_roads_ins AFTER INSERT ON roads
BEGIN
  UPDATE meta SET value = value + 1 WHERE key = 'data_version';
  INSERT INTO audit_log (table_name, record_id, action, changed_by, new_json)
  SELECT 'roads', NEW.id, 'create', NEW.updated_by, json_object('community_id', NEW.community_id, 'seq', NEW.seq, 'reg_code', NEW.reg_code, 'name', NEW.name, 'lat', NEW.lat, 'lng', NEW.lng, 'row_w_min', NEW.row_w_min, 'row_w_max', NEW.row_w_max, 'length_km', NEW.length_km, 'land_type', NEW.land_type, 'surface', NEW.surface, 'surf_w_min', NEW.surf_w_min, 'surf_w_max', NEW.surf_w_max, 'shoulder_type_l', NEW.shoulder_type_l, 'shoulder_type_r', NEW.shoulder_type_r, 'shoulder_w_l_min', NEW.shoulder_w_l_min, 'shoulder_w_l_max', NEW.shoulder_w_l_max, 'shoulder_w_r_min', NEW.shoulder_w_r_min, 'shoulder_w_r_max', NEW.shoulder_w_r_max, 'drain_channel_l', NEW.drain_channel_l, 'drain_channel_r', NEW.drain_channel_r, 'drain_pipe_l', NEW.drain_pipe_l, 'drain_pipe_r', NEW.drain_pipe_r, 'manhole_l', NEW.manhole_l, 'manhole_r', NEW.manhole_r, 'lamp_led', NEW.lamp_led, 'lamp_fluorescent', NEW.lamp_fluorescent, 'lamp_turtle', NEW.lamp_turtle, 'note', NEW.note, 'is_deleted', NEW.is_deleted)
  WHERE COALESCE(NEW.updated_by,'') <> 'นำเข้าจาก Excel';
END;
CREATE TRIGGER IF NOT EXISTS trg_roads_upd AFTER UPDATE ON roads
BEGIN
  UPDATE meta SET value = value + 1 WHERE key = 'data_version';
  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_json, new_json)
  VALUES ('roads', NEW.id,
    CASE WHEN OLD.is_deleted = 0 AND NEW.is_deleted = 1 THEN 'delete'
         WHEN OLD.is_deleted = 1 AND NEW.is_deleted = 0 THEN 'restore'
         ELSE 'update' END,
    NEW.updated_by, json_object('community_id', OLD.community_id, 'seq', OLD.seq, 'reg_code', OLD.reg_code, 'name', OLD.name, 'lat', OLD.lat, 'lng', OLD.lng, 'row_w_min', OLD.row_w_min, 'row_w_max', OLD.row_w_max, 'length_km', OLD.length_km, 'land_type', OLD.land_type, 'surface', OLD.surface, 'surf_w_min', OLD.surf_w_min, 'surf_w_max', OLD.surf_w_max, 'shoulder_type_l', OLD.shoulder_type_l, 'shoulder_type_r', OLD.shoulder_type_r, 'shoulder_w_l_min', OLD.shoulder_w_l_min, 'shoulder_w_l_max', OLD.shoulder_w_l_max, 'shoulder_w_r_min', OLD.shoulder_w_r_min, 'shoulder_w_r_max', OLD.shoulder_w_r_max, 'drain_channel_l', OLD.drain_channel_l, 'drain_channel_r', OLD.drain_channel_r, 'drain_pipe_l', OLD.drain_pipe_l, 'drain_pipe_r', OLD.drain_pipe_r, 'manhole_l', OLD.manhole_l, 'manhole_r', OLD.manhole_r, 'lamp_led', OLD.lamp_led, 'lamp_fluorescent', OLD.lamp_fluorescent, 'lamp_turtle', OLD.lamp_turtle, 'note', OLD.note, 'is_deleted', OLD.is_deleted), json_object('community_id', NEW.community_id, 'seq', NEW.seq, 'reg_code', NEW.reg_code, 'name', NEW.name, 'lat', NEW.lat, 'lng', NEW.lng, 'row_w_min', NEW.row_w_min, 'row_w_max', NEW.row_w_max, 'length_km', NEW.length_km, 'land_type', NEW.land_type, 'surface', NEW.surface, 'surf_w_min', NEW.surf_w_min, 'surf_w_max', NEW.surf_w_max, 'shoulder_type_l', NEW.shoulder_type_l, 'shoulder_type_r', NEW.shoulder_type_r, 'shoulder_w_l_min', NEW.shoulder_w_l_min, 'shoulder_w_l_max', NEW.shoulder_w_l_max, 'shoulder_w_r_min', NEW.shoulder_w_r_min, 'shoulder_w_r_max', NEW.shoulder_w_r_max, 'drain_channel_l', NEW.drain_channel_l, 'drain_channel_r', NEW.drain_channel_r, 'drain_pipe_l', NEW.drain_pipe_l, 'drain_pipe_r', NEW.drain_pipe_r, 'manhole_l', NEW.manhole_l, 'manhole_r', NEW.manhole_r, 'lamp_led', NEW.lamp_led, 'lamp_fluorescent', NEW.lamp_fluorescent, 'lamp_turtle', NEW.lamp_turtle, 'note', NEW.note, 'is_deleted', NEW.is_deleted));
END;
CREATE TRIGGER IF NOT EXISTS trg_roads_no_delete BEFORE DELETE ON roads
BEGIN SELECT RAISE(ABORT, 'ห้ามลบถาวร ให้ใช้การซ่อน (is_deleted = 1)'); END;

CREATE TABLE IF NOT EXISTS bridges (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  seq                INTEGER,
  name               TEXT NOT NULL,
  width_m            REAL,
  length_m           REAL,
  height_m           REAL,
  walk_l_m           REAL,
  walk_r_m           REAL,
  bridge_type        TEXT,
  lat                REAL,
  lng                REAL,
  note               TEXT,
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by         TEXT
);

CREATE TRIGGER IF NOT EXISTS trg_bridges_ins AFTER INSERT ON bridges
BEGIN
  UPDATE meta SET value = value + 1 WHERE key = 'data_version';
  INSERT INTO audit_log (table_name, record_id, action, changed_by, new_json)
  SELECT 'bridges', NEW.id, 'create', NEW.updated_by, json_object('seq', NEW.seq, 'name', NEW.name, 'width_m', NEW.width_m, 'length_m', NEW.length_m, 'height_m', NEW.height_m, 'walk_l_m', NEW.walk_l_m, 'walk_r_m', NEW.walk_r_m, 'bridge_type', NEW.bridge_type, 'lat', NEW.lat, 'lng', NEW.lng, 'note', NEW.note, 'is_deleted', NEW.is_deleted)
  WHERE COALESCE(NEW.updated_by,'') <> 'นำเข้าจาก Excel';
END;
CREATE TRIGGER IF NOT EXISTS trg_bridges_upd AFTER UPDATE ON bridges
BEGIN
  UPDATE meta SET value = value + 1 WHERE key = 'data_version';
  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_json, new_json)
  VALUES ('bridges', NEW.id,
    CASE WHEN OLD.is_deleted = 0 AND NEW.is_deleted = 1 THEN 'delete'
         WHEN OLD.is_deleted = 1 AND NEW.is_deleted = 0 THEN 'restore'
         ELSE 'update' END,
    NEW.updated_by, json_object('seq', OLD.seq, 'name', OLD.name, 'width_m', OLD.width_m, 'length_m', OLD.length_m, 'height_m', OLD.height_m, 'walk_l_m', OLD.walk_l_m, 'walk_r_m', OLD.walk_r_m, 'bridge_type', OLD.bridge_type, 'lat', OLD.lat, 'lng', OLD.lng, 'note', OLD.note, 'is_deleted', OLD.is_deleted), json_object('seq', NEW.seq, 'name', NEW.name, 'width_m', NEW.width_m, 'length_m', NEW.length_m, 'height_m', NEW.height_m, 'walk_l_m', NEW.walk_l_m, 'walk_r_m', NEW.walk_r_m, 'bridge_type', NEW.bridge_type, 'lat', NEW.lat, 'lng', NEW.lng, 'note', NEW.note, 'is_deleted', NEW.is_deleted));
END;
CREATE TRIGGER IF NOT EXISTS trg_bridges_no_delete BEFORE DELETE ON bridges
BEGIN SELECT RAISE(ABORT, 'ห้ามลบถาวร ให้ใช้การซ่อน (is_deleted = 1)'); END;

CREATE TABLE IF NOT EXISTS parks (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  seq                INTEGER,
  name               TEXT NOT NULL,
  lat                REAL,
  lng                REAL,
  area_sqm           REAL,
  note               TEXT,
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by         TEXT
);

CREATE TRIGGER IF NOT EXISTS trg_parks_ins AFTER INSERT ON parks
BEGIN
  UPDATE meta SET value = value + 1 WHERE key = 'data_version';
  INSERT INTO audit_log (table_name, record_id, action, changed_by, new_json)
  SELECT 'parks', NEW.id, 'create', NEW.updated_by, json_object('seq', NEW.seq, 'name', NEW.name, 'lat', NEW.lat, 'lng', NEW.lng, 'area_sqm', NEW.area_sqm, 'note', NEW.note, 'is_deleted', NEW.is_deleted)
  WHERE COALESCE(NEW.updated_by,'') <> 'นำเข้าจาก Excel';
END;
CREATE TRIGGER IF NOT EXISTS trg_parks_upd AFTER UPDATE ON parks
BEGIN
  UPDATE meta SET value = value + 1 WHERE key = 'data_version';
  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_json, new_json)
  VALUES ('parks', NEW.id,
    CASE WHEN OLD.is_deleted = 0 AND NEW.is_deleted = 1 THEN 'delete'
         WHEN OLD.is_deleted = 1 AND NEW.is_deleted = 0 THEN 'restore'
         ELSE 'update' END,
    NEW.updated_by, json_object('seq', OLD.seq, 'name', OLD.name, 'lat', OLD.lat, 'lng', OLD.lng, 'area_sqm', OLD.area_sqm, 'note', OLD.note, 'is_deleted', OLD.is_deleted), json_object('seq', NEW.seq, 'name', NEW.name, 'lat', NEW.lat, 'lng', NEW.lng, 'area_sqm', NEW.area_sqm, 'note', NEW.note, 'is_deleted', NEW.is_deleted));
END;
CREATE TRIGGER IF NOT EXISTS trg_parks_no_delete BEFORE DELETE ON parks
BEGIN SELECT RAISE(ABORT, 'ห้ามลบถาวร ให้ใช้การซ่อน (is_deleted = 1)'); END;

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

