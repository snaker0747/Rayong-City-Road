// RCRNIS – ระบบสารสนเทศภูมิศาสตร์ข้อมูลโครงข่ายถนนในเขตเทศบาลนครระยอง — Cloudflare Worker (API) + Static Assets (หน้าเว็บ)
// ฝ่ายสาธารณูปโภค ส่วนการโยธา สำนักช่าง เทศบาลนครระยอง

const R = 'REAL', I = 'INTEGER', T = 'TEXT';

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

const ROLE_LEVEL = { viewer: 1, editor: 2, admin: 3 };
const REG_CODE_RE = /^รย\.ถ\.\d-\d{4}$/;

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

// ---------------------------------------------------------------- auth
let certCache = { at: 0, keys: null };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function accessKeys(team) {
  if (certCache.keys && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new HttpError(503, 'ดึงกุญแจ Cloudflare Access ไม่สำเร็จ');
  const { keys } = await res.json();
  certCache = { at: Date.now(), keys };
  return keys;
}

// ตรวจ JWT ที่ Cloudflare Access แนบมา (ป้องกันการปลอม header อีเมล)
async function verifyAccessJwt(token, env) {
  const [h, p, s] = token.split('.');
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch {
    throw new HttpError(401, 'โทเคนไม่ถูกต้อง');
  }
  if (!s) throw new HttpError(401, 'โทเคนไม่ถูกต้อง');
  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'ไม่พบกุญแจของโทเคน');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new HttpError(401, 'ลายเซ็นโทเคนไม่ถูกต้อง');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) throw new HttpError(401, 'โทเคนไม่ใช่ของแอปนี้');
  if (payload.exp && payload.exp * 1000 < Date.now()) throw new HttpError(401, 'โทเคนหมดอายุ');
  if (!payload.email) throw new HttpError(401, 'โทเคนไม่มีอีเมล');
  return payload.email.toLowerCase();
}

async function getUser(request, env) {
  let email;
  if (env.DEV_USER_EMAIL) {
    email = env.DEV_USER_EMAIL.toLowerCase(); // ใช้เฉพาะตอนพัฒนาในเครื่อง (.dev.vars)
  } else {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      throw new HttpError(500, 'ยังไม่ได้ตั้งค่า Cloudflare Access (ACCESS_TEAM_DOMAIN / ACCESS_AUD)');
    }
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token) throw new HttpError(401, 'กรุณาเข้าสู่ระบบผ่าน Cloudflare Access');
    email = await verifyAccessJwt(token, env);
  }
  const admins = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  const row = await env.DB.prepare('SELECT display_name, role, active FROM users WHERE email = ?').bind(email).first();
  if (row && !row.active && !admins.includes(email)) throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
  let role = row?.role || env.DEFAULT_ROLE || 'viewer';
  if (admins.includes(email)) role = 'admin';
  return { email, role, name: row?.display_name || email };
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

  if (res === 'me' && method === 'GET') return json(user);

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
      need(user, 'editor');
      const rec = cleanRecord(table, await readJson(request), { partial: false });
      if (rec.reg_code && user.role !== 'admin') throw new HttpError(403, 'กำหนดรหัสทะเบียนทางได้เฉพาะผู้ดูแล');
      rec.updated_by = user.email;
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
        need(user, 'editor');
        const body = await readJson(request);
        if (!body.updated_at) throw new HttpError(400, 'ต้องส่ง updated_at ของข้อมูลที่เปิดแก้ไข');
        if (body.updated_at !== current.updated_at) {
          return json({ error: 'ข้อมูลนี้ถูกแก้ไขโดยผู้อื่นหลังจากที่คุณเปิด กรุณาโหลดใหม่แล้วแก้อีกครั้ง', current }, 409);
        }
        const rec = cleanRecord(table, body, { partial: true });
        if ('reg_code' in rec && rec.reg_code !== current.reg_code && user.role !== 'admin') {
          throw new HttpError(403, 'แก้รหัสทะเบียนทางได้เฉพาะผู้ดูแล');
        }
        const changed = Object.keys(rec).filter((k) => rec[k] !== current[k]);
        if (!changed.length) return json(current);
        const sets = changed.map((k) => `${k} = ?`).join(', ');
        try {
          const row = await env.DB.prepare(
            `UPDATE ${table} SET ${sets}, updated_at = ?, updated_by = ? WHERE id = ? AND updated_at = ? RETURNING *`,
          ).bind(...changed.map((k) => rec[k]), nowIso(), user.email, rid, current.updated_at).first();
          if (!row) return json({ error: 'ข้อมูลนี้ถูกแก้ไขพร้อมกัน กรุณาโหลดใหม่' }, 409);
          return json(row);
        } catch (e) { throw mapConstraintError(e); }
      }

      if (method === 'DELETE') {
        need(user, 'admin');
        const row = await env.DB.prepare(
          `UPDATE ${table} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id = ? RETURNING *`,
        ).bind(nowIso(), user.email, rid).first();
        return json(row);
      }
    }

    if (id && sub === 'restore' && method === 'POST') {
      need(user, 'admin');
      try {
        const row = await env.DB.prepare(
          `UPDATE ${table} SET is_deleted = 0, updated_at = ?, updated_by = ? WHERE id = ? RETURNING *`,
        ).bind(nowIso(), user.email, Number(id)).first();
        if (!row) throw new HttpError(404, 'ไม่พบรายการ');
        return json(row);
      } catch (e) { throw mapConstraintError(e); }
    }
  }

  if (res === 'history' && method === 'GET') {
    need(user, 'editor');
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
    if (method === 'GET' && !id) {
      const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY role DESC, email').all();
      return json(results);
    }
    if (method === 'PUT' && id) {
      const email = id.toLowerCase().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
      const body = await readJson(request);
      const role = body.role || 'viewer';
      if (!ROLE_LEVEL[role]) throw new HttpError(400, 'บทบาทไม่ถูกต้อง');
      const active = body.active === false || body.active === 0 ? 0 : 1;
      if (email === user.email && (role !== 'admin' || !active)) throw new HttpError(400, 'ลดสิทธิ์หรือระงับบัญชีตัวเองไม่ได้');
      const row = await env.DB.prepare(
        `INSERT INTO users (email, display_name, role, active, updated_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, role = excluded.role,
           active = excluded.active, updated_by = excluded.updated_by
         RETURNING *`,
      ).bind(email, body.display_name || null, role, active, user.email).first();
      return json(row);
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
