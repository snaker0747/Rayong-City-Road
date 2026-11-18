// สร้างคำสั่ง SQL สำหรับเพิ่มผู้ใช้ (ใช้ตั้ง admin คนแรก หรือกู้บัญชีเมื่อลืมรหัส admin ทุกคน)
// ใช้:  node scripts/create-user.mjs <ชื่อผู้ใช้> <รหัสผ่านชั่วคราว> [admin|user] [ชื่อที่แสดง]
// แล้วนำ SQL ที่ได้ไปรัน:  npx wrangler d1 execute roadsdata-db --remote --command "<SQL>"
// ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านตอนเข้าระบบครั้งแรก
const [username, password, role = 'admin', name = ''] = process.argv.slice(2);
if (!username || !password) {
  console.error('ใช้: node scripts/create-user.mjs <ชื่อผู้ใช้> <รหัสผ่าน> [admin|user] [ชื่อที่แสดง]');
  process.exit(1);
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
const hash = `pbkdf2$100000$${b64u(salt)}$${b64u(bits)}`;
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
console.log(`INSERT INTO users (username, display_name, password_hash, role, must_change_pw, updated_by) VALUES (${q(username.toLowerCase())}, ${name ? q(name) : 'NULL'}, ${q(hash)}, ${q(role)}, 1, 'setup') ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role, active = 1, must_change_pw = 1, failed_count = 0, locked_until = NULL, updated_by = 'setup';`);
