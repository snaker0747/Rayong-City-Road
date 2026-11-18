// RCRNIS – ระบบข้อมูลโครงข่ายถนนในเขตเทศบาลนครระยอง — Cloudflare Worker (API) + Static Assets (หน้าเว็บ)
// ฝ่ายสาธารณูปโภค ส่วนการโยธา สำนักช่าง เทศบาลนครระยอง

import SEED from '../seed/seed.json';

const R = 'REAL', I = 'INTEGER', T = 'TEXT';
const SEED_USER = 'นำเข้าจาก Excel';

// คอลัมน์ที่อนุญาตให้แก้ไขผ่าน API (ต้องตรงกับ scripts/gen_schema.py)
const TABLES = {
  roads: {
    community_id: I, seq: I, reg_code: T, name: T, lat: R, lng: R,
    row_w_min: R, row_w_max: R, length_km: R, land_type: T, surface: T,
    surf_w_min: R, surf_w_max: R, shoulder_type_l: T, shoulder_type_r: T,
    shoulder_w_l_min: R, shoulder_w_l_max: R, shoulder_w_r_min: R, shoulder_w_r_max: R,
    drain_channel_l: T, drain_channel_r: T, drain_pipe_l: T, drain_pipe_r: T,
    manhole_l: I, manhole_r: I, lamp_led: I, lamp_fluorescent: I, lamp_turtle: I, note: T,
  },
  bridges: {
    seq: I, name: T, width_m: R, length_m: R, height_m: R, walk_l_m: R, walk_r_m: R,
    bridge_type: T, lat: R, lng: R, note: T,
  },
  parks: { seq: I, name: T, lat: R, lng: R, area_sqm: R, note: T },
};

const ROLE_LEVEL = { user: 2, admin: 3 };
const REG_CODE_RE = /^รย\.ถ\.\d-\d{4}$/;
// การขึ้นทะเบียนทาง ใช้กับถนนประเภทที่ดินสาธารณะเท่านั้น (รวม "สาธารณะ/ส่วนบุคคล" ตามแท็บสรุปเดิม)
const isPublicLand = (t) => typeof t === 'string' && t.trim().startsWith('สาธารณะ');
const REG_PUBLIC_ONLY = 'ขึ้นทะเบียนทางได้เฉพาะถนนประเภทที่ดินสาธารณะ';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-cache',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });

// ---------------------------------------------------------------- auth (ชื่อผู้ใช้ + รหัสผ่าน)
const SESSION_COOKIE = 'rcrnis_session';
const SESSION_HOURS = 12;   // ไม่ติ๊ก "จดจำการเข้าสู่ระบบ"
const REMEMBER_DAYS = 30;   // ติ๊ก "จดจำการเข้าสู่ระบบ"
const MAX_FAILS = 5;          // ใส่รหัสผิดเกินนี้ ล็อกบัญชีชั่วคราว
const LOCK_MINUTES = 15;
const PBKDF2_ITER = 100000;   // ค่าสูงสุดที่ Workers รองรับ

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const sha256 = async (text) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(text)));

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64u(salt)}$${b64u(await pbkdf2(password, salt, PBKDF2_ITER))}`;
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(a, b);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored || '').split('$');
  if (alg !== 'pbkdf2') return false;
  return sameBytes(await pbkdf2(password, fromB64u(salt), Number(iter)), fromB64u(hash));
}

// ใช้เปรียบเทียบตอนไม่พบผู้ใช้ เพื่อให้เวลาตอบใกล้เคียงกัน (เดาไม่ได้ว่าชื่อผู้ใช้มีจริงไหม)
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function checkPasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  if (pw.length > 128) throw new HttpError(400, 'รหัสผ่านยาวเกินไป');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข');
}

function normUsername(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(s)) throw new HttpError(400, 'ชื่อผู้ใช้ต้องเป็น a-z, 0-9, . _ - ยาว 3–32 ตัว');
  return s;
}

function readCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// maxAge = null -> cookie หมดเมื่อปิดเบราว์เซอร์
const sessionCookie = (token, url, maxAge) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${maxAge == null ? '' : `; Max-Age=${maxAge}`}${url.protocol === 'https:' ? '; Secure' : ''}`;

async function getUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.username, u.display_name, u.role, u.active, u.must_change_pw
       FROM sessions s JOIN users u ON u.username = s.username
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), nowIso()).first();
  if (!row || !row.active) return null;
  return { username: row.username, email: row.username, role: row.role, name: row.display_name || row.username, must_change_pw: !!row.must_change_pw, token };
}

async function handleAuth(request, env, url, action, user) {
  if (action === 'login' && request.method === 'POST') {
    const body = await readJson(request);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const u = username ? await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first() : null;
    const ok = await verifyPassword(password, u?.password_hash || DUMMY_HASH);
    if (u?.locked_until && u.locked_until > nowIso()) {
      throw new HttpError(429, `บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผิดหลายครั้ง ลองใหม่หลัง ${new Date(u.locked_until).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })} น.`);
    }
    if (!u || !ok) {
      if (u) {
        const fails = u.failed_count + 1;
        const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
        await env.DB.prepare('UPDATE users SET failed_count = ?, locked_until = ? WHERE username = ?').bind(lock ? 0 : fails, lock, u.username).run();
      }
      throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    if (!u.active) throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน ติดต่อผู้ดูแลระบบ');
    const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const now = nowIso();
    const remember = body.remember === true;
    const ttlSec = remember ? REMEMBER_DAYS * 86400 : SESSION_HOURS * 3600;
    const exp = new Date(Date.now() + ttlSec * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('INSERT INTO sessions (token_hash, username, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
        .bind(await sha256(token), u.username, now, exp, (request.headers.get('user-agent') || '').slice(0, 200)),
      env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL, last_login_at = ? WHERE username = ?').bind(now, u.username),
    ]);
    return json({ username: u.username, role: u.role, name: u.display_name || u.username, must_change_pw: !!u.must_change_pw }, 200,
      { 'set-cookie': sessionCookie(token, url, remember ? ttlSec : null) });
  }

  if (action === 'logout' && request.method === 'POST') {
    if (user) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(user.token)).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', url, 0) });
  }

  if (action === 'password' && request.method === 'POST') {
    if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
    const body = await readJson(request);
    const u = await env.DB.prepare('SELECT password_hash FROM users WHERE username = ?').bind(user.username).first();
    if (!(await verifyPassword(String(body.current || ''), u.password_hash))) throw new HttpError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    checkPasswordPolicy(body.new);
    if (body.new === body.current) throw new HttpError(400, 'รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม');
    const keep = await sha256(user.token);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ?, must_change_pw = 0, updated_by = ? WHERE username = ?')
        .bind(await hashPassword(body.new), user.username, user.username),
      // ออกจากระบบทุกเครื่องยกเว้นเครื่องนี้
      env.DB.prepare('DELETE FROM sessions WHERE username = ? AND token_hash <> ?').bind(user.username, keep),
    ]);
    return json({ ok: true });
  }
  throw new HttpError(404, 'ไม่พบ API นี้');
}

function need(user, role) {
  if (ROLE_LEVEL[user.role] < ROLE_LEVEL[role]) throw new HttpError(403, 'ไม่มีสิทธิ์ทำรายการนี้');
}

// ---------------------------------------------------------------- validation
function cleanRecord(table, body, { partial }) {
  const cols = TABLES[table];
  const out = {};
  for (const [k, type] of Object.entries(cols)) {
    if (!(k in body)) continue;
    let v = body[k];
    if (v === '' || v === undefined) v = null;
    if (v !== null) {
      if (type === T) {
        v = String(v).replace(/\s+/g, ' ').trim();
        if (v.length > 1000) throw new HttpError(400, `ข้อความในช่อง ${k} ยาวเกินไป`);
        if (v === '') v = null;
      } else {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new HttpError(400, `ช่อง ${k} ต้องเป็นตัวเลข`);
        if (n < 0 && k !== 'lat' && k !== 'lng') throw new HttpError(400, `ช่อง ${k} ต้องไม่ติดลบ`);
        v = type === I ? Math.round(n) : n;
      }
    }
    out[k] = v;
  }
  if (!partial && !out.name) throw new HttpError(400, 'ต้องระบุชื่อ');
  if ('name' in out && !out.name) throw new HttpError(400, 'ชื่อต้องไม่ว่าง');
  if (out.lat != null && (out.lat < 5 || out.lat > 21)) throw new HttpError(400, 'ละติจูดไม่อยู่ในประเทศไทย (ตรวจว่าสลับกับลองจิจูดหรือไม่)');
  if (out.lng != null && (out.lng < 97 || out.lng > 106)) throw new HttpError(400, 'ลองจิจูดไม่อยู่ในประเทศไทย');
  if (out.reg_code != null) {
    out.reg_code = out.reg_code.replace(/^ร\.?ย\.?\s*ถ\.?\s*(\d)\s*-\s*(\d{1,4})$/, (_, a, b) => `รย.ถ.${a}-${b.padStart(4, '0')}`);
    if (!REG_CODE_RE.test(out.reg_code)) throw new HttpError(400, 'รหัสทะเบียนทางต้องอยู่ในรูปแบบ รย.ถ.2-0000');
  }
  for (const [a, b] of [['row_w_min', 'row_w_max'], ['surf_w_min', 'surf_w_max'], ['shoulder_w_l_min', 'shoulder_w_l_max'], ['shoulder_w_r_min', 'shoulder_w_r_max']]) {
    if (out[a] != null && out[b] != null && out[a] > out[b]) throw new HttpError(400, 'ค่าต่ำสุดต้องไม่มากกว่าค่าสูงสุด');
  }
  return out;
}

async function readJson(request) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'ต้องส่งข้อมูลเป็น JSON');
  try { return await request.json(); } catch { throw new HttpError(400, 'JSON ไม่ถูกต้อง'); }
}

const nowIso = () => new Date().toISOString();

async function dataVersion(env) {
  const r = await env.DB.prepare("SELECT value FROM meta WHERE key = 'data_version'").first();
  return r?.value ?? 0;
}

function mapConstraintError(e) {
  const m = String(e?.message || e);
  if (m.includes('uq_roads_reg_code') || m.includes('UNIQUE')) return new HttpError(409, 'รหัสทะเบียนทางนี้ถูกใช้แล้วกับถนนสายอื่น');
  if (m.includes('ห้ามลบถาวร')) return new HttpError(400, 'ห้ามลบถาวร');
  return e;
}

// ---------------------------------------------------------------- routes
async function handleApi(request, env, url) {
  const user = await getUser(request, env);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const method = request.method;

  if (method !== 'GET' && method !== 'HEAD') {
    // กัน CSRF: ต้องมาจากโดเมนเดียวกัน
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'คำขอข้ามโดเมนไม่ได้รับอนุญาต');
  }

  const [res, id, sub] = parts;

  if (res === 'auth') return handleAuth(request, env, url, id, user);
  if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  if (res === 'me' && method === 'GET') {
    const { token, ...me } = user;
    return json(me);
  }
  // ผู้ที่ได้รหัสชั่วคราว ต้องตั้งรหัสใหม่ก่อนใช้งาน
  if (user.must_change_pw) throw new HttpError(403, 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน');

  if (res === 'version' && method === 'GET') return json({ version: await dataVersion(env) });

  if (res === 'communities') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, name, sort_order FROM communities ORDER BY sort_order, id').all();
      return json(results);
    }
    if (method === 'POST') {
      need(user, 'admin');
      const body = await readJson(request);
      const name = String(body.name || '').trim().replace(/^ชุมชน\s*/, '');
      if (!name) throw new HttpError(400, 'ต้องระบุชื่อชุมชน');
      const r = await env.DB.prepare('INSERT INTO communities (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM communities)) RETURNING *').bind(name).first()
        .catch((e) => { throw new HttpError(409, 'มีชุมชนชื่อนี้แล้ว'); });
      return json(r, 201);
    }
  }

  if (res in TABLES) {
    const table = res;
    const cols = Object.keys(TABLES[table]);

    if (!id && method === 'GET') {
      const includeDeleted = url.searchParams.get('include_deleted') === '1' && ROLE_LEVEL[user.role] >= 3;
      const ver = await dataVersion(env);
      const etag = `W/"${table}-${ver}-${includeDeleted ? 1 : 0}"`;
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
      const { results } = await env.DB.prepare(
        `SELECT * FROM ${table} ${includeDeleted ? '' : 'WHERE is_deleted = 0'} ORDER BY seq, id`,
      ).all();
      return json(results, 200, { etag });
    }

    if (!id && method === 'POST') {
      need(user, 'user');
      const rec = cleanRecord(table, await readJson(request), { partial: false });
      if (rec.reg_code && user.role !== 'admin') throw new HttpError(403, 'กำหนดรหัสทะเบียนทางได้เฉพาะผู้ดูแล');
      if (table === 'roads' && rec.reg_code && !isPublicLand(rec.land_type)) throw new HttpError(400, REG_PUBLIC_ONLY);
      rec.updated_by = user.username;
      rec.created_at = rec.updated_at = nowIso();
      if (rec.seq == null) {
        const r = await env.DB.prepare(`SELECT COALESCE(MAX(seq),0)+1 AS n FROM ${table}`).first();
        rec.seq = r.n;
      }
      const keys = Object.keys(rec);
      try {
        const row = await env.DB.prepare(
          `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING *`,
        ).bind(...keys.map((k) => rec[k])).first();
        return json(row, 201);
      } catch (e) { throw mapConstraintError(e); }
    }

    if (id && !sub) {
      const rid = Number(id);
      if (!Number.isInteger(rid)) throw new HttpError(400, 'รหัสรายการไม่ถูกต้อง');
      const current = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(rid).first();
      if (!current || (current.is_deleted && ROLE_LEVEL[user.role] < 3)) throw new HttpError(404, 'ไม่พบรายการ');

      if (method === 'GET') return json(current);

      if (method === 'PUT') {
        need(user, 'user');
        const body = await readJson(request);
        if (!body.updated_at) throw new HttpError(400, 'ต้องส่ง updated_at ของข้อมูลที่เปิดแก้ไข');
        if (body.updated_at !== current.updated_at) {
          return json({ error: 'ข้อมูลนี้ถูกแก้ไขโดยผู้อื่นหลังจากที่คุณเปิด กรุณาโหลดใหม่แล้วแก้อีกครั้ง', current }, 409);
        }
        const rec = cleanRecord(table, body, { partial: true });
        if ('reg_code' in rec && rec.reg_code !== current.reg_code && user.role !== 'admin') {
          throw new HttpError(403, 'แก้รหัสทะเบียนทางได้เฉพาะผู้ดูแล');
        }
        if (table === 'roads') {
          const nextLand = 'land_type' in rec ? rec.land_type : current.land_type;
          const nextCode = 'reg_code' in rec ? rec.reg_code : current.reg_code;
          // ตรวจเมื่อมีการตั้ง/เปลี่ยนรหัส หรือเปลี่ยนประเภทที่ดินของถนนที่มีรหัสอยู่ (ข้อมูลเดิมที่ไม่ตรงยังแก้ช่องอื่นได้)
          const codeChanged = 'reg_code' in rec && rec.reg_code !== current.reg_code;
          const landChanged = 'land_type' in rec && rec.land_type !== current.land_type;
          if (nextCode && !isPublicLand(nextLand) && (codeChanged || landChanged)) {
            throw new HttpError(400, landChanged && !codeChanged
              ? `${REG_PUBLIC_ONLY} ถ้าเปลี่ยนเป็นประเภทอื่น ต้องลบรหัสทะเบียนออกก่อน (ผู้ดูแล)` : REG_PUBLIC_ONLY);
          }
        }
        const changed = Object.keys(rec).filter((k) => rec[k] !== current[k]);
        if (!changed.length) return json(current);
        const sets = changed.map((k) => `${k} = ?`).join(', ');
        try {
          const row = await env.DB.prepare(
            `UPDATE ${table} SET ${sets}, updated_at = ?, updated_by = ? WHERE id = ? AND updated_at = ? RETURNING *`,
          ).bind(...changed.map((k) => rec[k]), nowIso(), user.username, rid, current.updated_at).first();
          if (!row) return json({ error: 'ข้อมูลนี้ถูกแก้ไขพร้อมกัน กรุณาโหลดใหม่' }, 409);
          return json(row);
        } catch (e) { throw mapConstraintError(e); }
      }

      if (method === 'DELETE') {
        need(user, 'admin');
        const row = await env.DB.prepare(
          `UPDATE ${table} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id = ? RETURNING *`,
        ).bind(nowIso(), user.username, rid).first();
        return json(row);
      }
    }

    if (id && sub === 'restore' && method === 'POST') {
      need(user, 'admin');
      try {
        const row = await env.DB.prepare(
          `UPDATE ${table} SET is_deleted = 0, updated_at = ?, updated_by = ? WHERE id = ? RETURNING *`,
        ).bind(nowIso(), user.username, Number(id)).first();
        if (!row) throw new HttpError(404, 'ไม่พบรายการ');
        return json(row);
      } catch (e) { throw mapConstraintError(e); }
    }
  }

  // นำเข้าข้อมูลตั้งต้นจาก Excel (seed/seed.json) — ทำได้ครั้งเดียวตอนฐานข้อมูลยังว่าง
  if (res === 'admin' && id === 'seed') {
    need(user, 'admin');
    const counts = await env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM communities) c, (SELECT COUNT(*) FROM roads) r, (SELECT COUNT(*) FROM bridges) b, (SELECT COUNT(*) FROM parks) p',
    ).first();
    const empty = !counts.c && !counts.r && !counts.b && !counts.p;
    if (method === 'GET') {
      return json({ empty, counts, seed: { communities: SEED.communities.length, roads: SEED.roads.length, bridges: SEED.bridges.length, parks: SEED.parks.length } });
    }
    if (method === 'POST') {
      if (!empty) throw new HttpError(409, 'ฐานข้อมูลมีข้อมูลอยู่แล้ว นำเข้าซ้ำไม่ได้');
      const stmts = [];
      const ins = (table, rows, extra = {}) => {
        for (const row of rows) {
          const rec = { ...row, ...extra };
          const keys = Object.keys(rec);
          stmts.push(env.DB.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
            .bind(...keys.map((k) => rec[k])));
        }
      };
      ins('communities', SEED.communities);
      ins('roads', SEED.roads, { updated_by: SEED_USER });
      ins('bridges', SEED.bridges, { updated_by: SEED_USER });
      ins('parks', SEED.parks, { updated_by: SEED_USER });
      stmts.push(env.DB.prepare(
        "INSERT INTO audit_log (table_name, record_id, action, changed_by, new_json) VALUES ('system', 'seed', 'import', ?, ?)",
      ).bind(user.username, JSON.stringify({ roads: SEED.roads.length, bridges: SEED.bridges.length, parks: SEED.parks.length })));
      // batch เดียว = transaction เดียว ถ้าพลาดจะไม่มีข้อมูลค้างครึ่งๆ กลางๆ
      await env.DB.batch(stmts);
      return json({ ok: true, imported: { communities: SEED.communities.length, roads: SEED.roads.length, bridges: SEED.bridges.length, parks: SEED.parks.length } });
    }
  }

  if (res === 'history' && method === 'GET') {
    need(user, 'user');
    const table = url.searchParams.get('table');
    const rid = url.searchParams.get('id');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
    if (table && rid) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM audit_log WHERE table_name = ? AND record_id = ? ORDER BY id DESC LIMIT ?',
      ).bind(table, String(rid), limit).all();
      return json(results);
    }
    need(user, 'admin');
    const { results } = await env.DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').bind(limit).all();
    return json(results);
  }

  if (res === 'users') {
    need(user, 'admin');
    const cols = 'username, display_name, role, active, must_change_pw, locked_until, last_login_at, created_at, updated_by';
    if (method === 'GET' && !id) {
      const { results } = await env.DB.prepare(`SELECT ${cols} FROM users ORDER BY role, username`).all();
      return json(results);
    }
    const body = method === 'GET' ? {} : await readJson(request);
    if ('role' in body && !ROLE_LEVEL[body.role]) throw new HttpError(400, 'บทบาทไม่ถูกต้อง');
    const role = body.role || 'user';
    const active = body.active === false || body.active === 0 || body.active === '0' ? 0 : 1;
    const display = body.display_name ? String(body.display_name).trim().slice(0, 100) : null;

    if (method === 'POST' && !id) {
      const username = normUsername(body.username);
      checkPasswordPolicy(body.password);
      const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
      if (exists) throw new HttpError(409, 'มีชื่อผู้ใช้นี้แล้ว');
      const row = await env.DB.prepare(
        `INSERT INTO users (username, display_name, password_hash, role, active, must_change_pw, updated_by)
         VALUES (?, ?, ?, ?, ?, 1, ?) RETURNING ${cols}`,
      ).bind(username, display, await hashPassword(body.password), role, active, user.username).first();
      return json(row, 201);
    }

    if (method === 'PUT' && id) {
      const username = normUsername(id);
      const cur = await env.DB.prepare('SELECT username, role, active, display_name FROM users WHERE username = ?').bind(username).first();
      if (!cur) throw new HttpError(404, 'ไม่พบผู้ใช้');
      // ช่องที่ไม่ได้ส่งมา ให้คงค่าเดิม
      const nRole = 'role' in body ? role : cur.role;
      const nActive = 'active' in body ? active : cur.active;
      const nDisplay = 'display_name' in body ? display : cur.display_name;
      if (username === user.username && (nRole !== 'admin' || !nActive)) throw new HttpError(400, 'ลดสิทธิ์หรือระงับบัญชีตัวเองไม่ได้');
      const stmts = [];
      if (body.password) {
        checkPasswordPolicy(body.password);
        // รีเซ็ตรหัส: ผู้ใช้ต้องเปลี่ยนเองตอนเข้าครั้งถัดไป และถูกออกจากระบบทุกเครื่อง
        stmts.push(env.DB.prepare('UPDATE users SET password_hash = ?, must_change_pw = 1, failed_count = 0, locked_until = NULL, updated_by = ? WHERE username = ?')
          .bind(await hashPassword(body.password), user.username, username));
        stmts.push(env.DB.prepare('DELETE FROM sessions WHERE username = ?').bind(username));
      }
      stmts.push(env.DB.prepare('UPDATE users SET display_name = ?, role = ?, active = ?, updated_by = ? WHERE username = ?')
        .bind(nDisplay, nRole, nActive, user.username, username));
      if (!nActive) stmts.push(env.DB.prepare('DELETE FROM sessions WHERE username = ?').bind(username));
      if (body.unlock) stmts.push(env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL WHERE username = ?').bind(username));
      await env.DB.batch(stmts);
      return json(await env.DB.prepare(`SELECT ${cols} FROM users WHERE username = ?`).bind(username).first());
    }
  }

  throw new HttpError(404, 'ไม่พบ API นี้');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status === 500) console.error(e);
        return json({ error: status === 500 && !(e instanceof HttpError) ? 'เกิดข้อผิดพลาดในระบบ' : e.message }, status);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
