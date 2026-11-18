/* RCRNIS – ระบบสารสนเทศภูมิศาสตร์ข้อมูลโครงข่ายถนนในเขตเทศบาลนครระยอง — หน้าเว็บ */
'use strict';

// ---------------------------------------------------------------- config
const LAND_GROUPS = ['สาธารณะ', 'ส่วนบุคคล', 'ราชพัสดุ', 'ที่วัด'];
const SURF_GROUPS = [
  { key: 'คสล.', color: 'var(--s-con)', hex: '#4f6d7a' },
  { key: 'แอสฟัลท์', color: 'var(--s-ac)', hex: '#22303a' },
  { key: 'ลูกรัง', color: 'var(--s-lat)', hex: '#c0713a' },
  { key: 'อื่นๆ', color: 'var(--s-oth)', hex: '#8d6cab' },
];
const LAND_OPTIONS = ['สาธารณะ', 'ส่วนบุคคล', 'ราชพัสดุ', 'ที่วัด', 'สาธารณะ/ส่วนบุคคล'];
const SURF_OPTIONS = ['คอนกรีต', 'แอสฟัลท์ติกคอนกรีต', 'ลูกรัง', 'หินคลุก', 'แสตมป์พิมพ์ลาย', 'ตัวหนอน'];

// จัดกลุ่มให้ตรงกับแท็บสรุปใน Excel เดิม
const landGroup = (t) => (!t ? 'ไม่ระบุ' : LAND_GROUPS.find((g) => t.startsWith(g)) || 'อื่นๆ');
const surfGroup = (s) => {
  if (!s) return 'อื่นๆ';
  if (s.startsWith('คอนกรีต') || s.startsWith('ค.ส.ล')) return 'คสล.';
  if (s.startsWith('แอสฟัลท์')) return 'แอสฟัลท์';
  if (s.startsWith('ลูกรัง')) return 'ลูกรัง';
  return 'อื่นๆ';
};
const surfColor = (s) => SURF_GROUPS.find((g) => g.key === surfGroup(s)).hex;

// นิยามฟอร์ม: type = text | num | int | range | community | textarea | latlng
const FORMS = {
  roads: {
    title: 'ถนน',
    sections: [
      ['ข้อมูลทั่วไป', [
        { k: 'name', label: 'ชื่อถนน', type: 'text', req: true, wide: true },
        { k: 'community_id', label: 'ชุมชน', type: 'community' },
        { k: 'seq', label: 'ลำดับที่', type: 'int' },
        { k: 'reg_code', label: 'รหัสทะเบียนทาง', type: 'text', placeholder: 'รย.ถ.2-0000', adminOnly: true },
        { k: 'land_type', label: 'ประเภทที่ดิน', type: 'text', list: 'land' },
        { k: 'surface', label: 'ผิวจราจร', type: 'text', list: 'surf' },
        { k: 'length_km', label: 'ระยะทาง (กม.)', type: 'num' },
      ]],
      ['ตำแหน่ง', [{ k: 'latlng', type: 'latlng' }]],
      ['ขนาด (ม.)', [
        { k: 'row_w', label: 'เขตทาง', type: 'range' },
        { k: 'surf_w', label: 'ผิวจราจร กว้าง', type: 'range' },
      ]],
      ['ไหล่ทาง / ทางเท้า', [
        { k: 'shoulder_type_l', label: 'ประเภท ซ้าย', type: 'text', list: 'shoulder' },
        { k: 'shoulder_type_r', label: 'ประเภท ขวา', type: 'text', list: 'shoulder' },
        { k: 'shoulder_w_l', label: 'กว้าง ซ้าย (ม.)', type: 'range' },
        { k: 'shoulder_w_r', label: 'กว้าง ขวา (ม.)', type: 'range' },
      ]],
      ['ระบบระบายน้ำ', [
        { k: 'drain_channel_l', label: 'รางระบายน้ำ ซ้าย', type: 'text' },
        { k: 'drain_channel_r', label: 'รางระบายน้ำ ขวา', type: 'text' },
        { k: 'drain_pipe_l', label: 'ท่อระบายน้ำ ซ้าย', type: 'text' },
        { k: 'drain_pipe_r', label: 'ท่อระบายน้ำ ขวา', type: 'text' },
        { k: 'manhole_l', label: 'จำนวนฝา ซ้าย', type: 'int' },
        { k: 'manhole_r', label: 'จำนวนฝา ขวา', type: 'int' },
      ]],
      ['โคมไฟ (จำนวนดวง)', [
        { k: 'lamp_led', label: 'LED', type: 'int' },
        { k: 'lamp_fluorescent', label: 'ฟลูออเรสเซนต์', type: 'int' },
        { k: 'lamp_turtle', label: 'หลังเต่า', type: 'int' },
      ]],
      ['หมายเหตุ', [{ k: 'note', label: 'หมายเหตุ', type: 'textarea', wide: true }]],
    ],
  },
  bridges: {
    title: 'สะพาน',
    sections: [
      ['ข้อมูลสะพาน', [
        { k: 'name', label: 'ชื่อสะพาน', type: 'text', req: true, wide: true },
        { k: 'seq', label: 'ลำดับ', type: 'int' },
        { k: 'bridge_type', label: 'ประเภท', type: 'text', list: 'btype' },
        { k: 'width_m', label: 'กว้าง (ม.)', type: 'num' },
        { k: 'length_m', label: 'ยาว (ม.)', type: 'num' },
        { k: 'height_m', label: 'สูง (ม.)', type: 'num' },
        { k: 'walk_l_m', label: 'ทางเท้า ซ้าย (ม.)', type: 'num' },
        { k: 'walk_r_m', label: 'ทางเท้า ขวา (ม.)', type: 'num' },
      ]],
      ['ตำแหน่ง', [{ k: 'latlng', type: 'latlng' }]],
      ['หมายเหตุ', [{ k: 'note', label: 'หมายเหตุ', type: 'textarea', wide: true }]],
    ],
  },
  parks: {
    title: 'สวนสาธารณะ',
    sections: [
      ['ข้อมูลสวน', [
        { k: 'name', label: 'ชื่อสวนสาธารณะ', type: 'text', req: true, wide: true },
        { k: 'seq', label: 'ลำดับ', type: 'int' },
        { k: 'area_sqm', label: 'พื้นที่ (ตร.ม.)', type: 'num' },
      ]],
      ['ตำแหน่ง', [{ k: 'latlng', type: 'latlng' }]],
      ['หมายเหตุ', [{ k: 'note', label: 'หมายเหตุ', type: 'textarea', wide: true }]],
    ],
  },
};

// ป้ายชื่อทุกคอลัมน์ (ใช้ในหน้าประวัติและส่งออก)
const LABELS = {
  password: 'รหัสผ่าน',
  community_id: 'ชุมชน', seq: 'ลำดับ', reg_code: 'รหัสทะเบียนทาง', name: 'ชื่อ', lat: 'ละติจูด', lng: 'ลองจิจูด',
  row_w_min: 'เขตทาง ต่ำสุด', row_w_max: 'เขตทาง สูงสุด', length_km: 'ระยะทาง (กม.)', land_type: 'ประเภทที่ดิน',
  surface: 'ผิวจราจร', surf_w_min: 'ผิวจราจรกว้าง ต่ำสุด', surf_w_max: 'ผิวจราจรกว้าง สูงสุด',
  shoulder_type_l: 'ไหล่ทาง ประเภท ซ้าย', shoulder_type_r: 'ไหล่ทาง ประเภท ขวา',
  shoulder_w_l_min: 'ไหล่ทางซ้าย กว้าง ต่ำสุด', shoulder_w_l_max: 'ไหล่ทางซ้าย กว้าง สูงสุด',
  shoulder_w_r_min: 'ไหล่ทางขวา กว้าง ต่ำสุด', shoulder_w_r_max: 'ไหล่ทางขวา กว้าง สูงสุด',
  drain_channel_l: 'รางระบายน้ำ ซ้าย', drain_channel_r: 'รางระบายน้ำ ขวา', drain_pipe_l: 'ท่อระบายน้ำ ซ้าย',
  drain_pipe_r: 'ท่อระบายน้ำ ขวา', manhole_l: 'จำนวนฝา ซ้าย', manhole_r: 'จำนวนฝา ขวา', lamp_led: 'โคม LED',
  lamp_fluorescent: 'โคมฟลูออเรสเซนต์', lamp_turtle: 'โคมหลังเต่า', note: 'หมายเหตุ', is_deleted: 'ซ่อน',
  width_m: 'กว้าง (ม.)', length_m: 'ยาว (ม.)', height_m: 'สูง (ม.)', walk_l_m: 'ทางเท้า ซ้าย', walk_r_m: 'ทางเท้า ขวา',
  bridge_type: 'ประเภท', area_sqm: 'พื้นที่ (ตร.ม.)', role: 'บทบาท', active: 'ใช้งาน', display_name: 'ชื่อ',
};
const ROLE_TH = { user: 'ผู้ใช้งาน', admin: 'ผู้ดูแลระบบ' };
const ACTION_TH = { create: 'เพิ่ม', update: 'แก้ไข', delete: 'ซ่อน', restore: 'กู้คืน', import: 'นำเข้าข้อมูลตั้งต้นจาก Excel' };
const TABLE_TH = { roads: 'ถนน', bridges: 'สะพาน', parks: 'สวนสาธารณะ', users: 'ผู้ใช้', system: 'ระบบ' };

// ---------------------------------------------------------------- state & helpers
const S = {
  me: null, communities: [], roads: [], bridges: [], parks: [], etags: {},
  showDeleted: false,
  filter: { q: '', community: '', land: '', surf: '', reg: '' },
};
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 2) => (n == null || n === '' ? '' : Number(n).toLocaleString('th-TH', { maximumFractionDigits: d }));
const fmtRange = (a, b) => (a == null && b == null ? '' : a === b || b == null ? fmt(a) : a == null ? fmt(b) : `${fmt(a)}–${fmt(b)}`);
const isAdmin = () => S.me?.role === 'admin';
const canEdit = () => !!S.me;
const commName = (id) => S.communities.find((c) => c.id === id)?.name || '';
const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = 'toast'), isError ? 5000 : 2500);
}

async function api(path, opts = {}) {
  const headers = { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(opts.headers || {}) };
  const res = await fetch('/api/' + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 304) return { notModified: true };
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.status === 401 && !path.startsWith('auth/') && S.me) {
    S.me = null;
    showLogin('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง');
  }
  if (!res.ok) {
    const err = new Error(data?.error || `เกิดข้อผิดพลาด (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { data, etag: res.headers.get('etag') };
}

// โหลดรายการ ใช้ ETag เพื่อไม่ต้องอ่านทั้งตารางซ้ำถ้าไม่มีอะไรเปลี่ยน (ประหยัดโควตา D1)
async function loadTable(table) {
  const key = table + (S.showDeleted ? ':all' : '');
  const q = S.showDeleted ? '?include_deleted=1' : '';
  const r = await api(table + q, { headers: S.etags[key] ? { 'if-none-match': S.etags[key] } : {} });
  if (r.notModified) return;
  S[table] = r.data;
  S.etags[key] = r.etag;
}

async function refreshAll() {
  await Promise.all(['roads', 'bridges', 'parks'].map(loadTable));
}

// ---------------------------------------------------------------- router
const VIEWS = { dashboard: renderDashboard, roads: renderRoads, map: renderMap, bridges: () => renderSimple('bridges'), parks: () => renderSimple('parks'), history: renderHistory, users: renderUsers };

function route() {
  let v = location.hash.replace('#', '') || 'dashboard';
  if (!VIEWS[v]) v = 'dashboard';
  const link = $(`#tabs a[data-view="${v}"]`);
  if (link?.hidden) v = 'dashboard';
  $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
  $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
  VIEWS[v]();
}

// ---------------------------------------------------------------- dashboard
function renderDashboard() {
  const el = $('#view-dashboard');
  const R = S.roads.filter((r) => !r.is_deleted);
  const reg = R.filter((r) => r.reg_code).length;
  const withLen = R.filter((r) => r.length_km != null);
  const km = withLen.reduce((a, r) => a + r.length_km, 0);

  // ตารางไขว้ ประเภทที่ดิน × ผิวจราจร
  const lands = [...LAND_GROUPS, ...new Set(R.map((r) => landGroup(r.land_type)).filter((g) => !LAND_GROUPS.includes(g)))];
  const mtx = lands.map((l) => {
    const rows = R.filter((r) => landGroup(r.land_type) === l);
    return { l, cells: SURF_GROUPS.map((g) => rows.filter((r) => surfGroup(r.surface) === g.key).length), total: rows.length };
  });

  // รายชุมชน
  const byComm = S.communities.map((c) => {
    const rows = R.filter((r) => r.community_id === c.id);
    return {
      c, total: rows.length, reg: rows.filter((r) => r.reg_code).length,
      lands: LAND_GROUPS.map((l) => rows.filter((r) => landGroup(r.land_type) === l).length),
      km: rows.reduce((a, r) => a + (r.length_km || 0), 0),
    };
  });

  // ความครบถ้วนของข้อมูล
  const has = (r, ...ks) => ks.some((k) => r[k] != null && r[k] !== '');
  const comp = [
    ['พิกัด', (r) => has(r, 'lat') && has(r, 'lng')],
    ['รหัสทะเบียนทาง', (r) => has(r, 'reg_code')],
    ['ระยะทาง', (r) => has(r, 'length_km')],
    ['เขตทาง', (r) => has(r, 'row_w_min', 'row_w_max')],
    ['ความกว้างผิวจราจร', (r) => has(r, 'surf_w_min', 'surf_w_max')],
    ['ไหล่ทาง/ทางเท้า', (r) => has(r, 'shoulder_type_l', 'shoulder_type_r', 'shoulder_w_l_min', 'shoulder_w_r_min')],
    ['ระบบระบายน้ำ', (r) => has(r, 'drain_channel_l', 'drain_channel_r', 'drain_pipe_l', 'drain_pipe_r', 'manhole_l', 'manhole_r')],
    ['โคมไฟ', (r) => has(r, 'lamp_led', 'lamp_fluorescent', 'lamp_turtle')],
  ].map(([label, f]) => ({ label, pct: R.length ? (R.filter(f).length / R.length) * 100 : 0 }));

  const pct = R.length ? (reg / R.length) * 100 : 0;
  if (isAdmin() && !S.roads.length && !S.communities.length) {
    el.innerHTML = `<div class="card" style="max-width:640px;margin:40px auto;text-align:center">
      <h2>ฐานข้อมูลยังว่าง</h2>
      <p class="muted">กดปุ่มด้านล่างเพื่อนำเข้าข้อมูลตั้งต้นจากไฟล์ Excel ทะเบียนถนน (ทำได้ครั้งเดียว)</p>
      <p id="seed-info" class="small muted"></p>
      <button class="primary" id="btn-seed">นำเข้าข้อมูลตั้งต้น</button></div>`;
    api('admin/seed').then(({ data }) => {
      $('#seed-info').textContent = `ถนน ${data.seed.roads} สาย · ${data.seed.communities} ชุมชน · สะพาน ${data.seed.bridges} แห่ง · สวน ${data.seed.parks} แห่ง`;
    }).catch(() => {});
    $('#btn-seed').addEventListener('click', async (e) => {
      if (!confirm('ยืนยันนำเข้าข้อมูลตั้งต้นจาก Excel?')) return;
      e.target.disabled = true; e.target.textContent = 'กำลังนำเข้า…';
      try {
        const { data } = await api('admin/seed', { method: 'POST', body: {} });
        S.communities = (await api('communities')).data;
        await refreshAll();
        toast(`นำเข้าแล้ว ถนน ${data.imported.roads} สาย`);
        route();
      } catch (err) { toast(err.message, true); e.target.disabled = false; e.target.textContent = 'นำเข้าข้อมูลตั้งต้น'; }
    });
    return;
  }
  el.innerHTML = `
    <div class="page-head"><div><h2>ภาพรวมข้อมูลถนน สะพาน และสวนสาธารณะ</h2>
      <div class="muted small">ตัวเลขทั้งหมดคำนวณจากข้อมูลจริงในระบบ อัปเดตทันทีเมื่อมีการแก้ไข</div></div>
      <button id="btn-backup" ${isAdmin() ? '' : 'hidden'}>ดาวน์โหลดสำรองข้อมูลทั้งหมด (.xlsx)</button></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="label">ถนนทั้งหมด</div><div class="value">${fmt(R.length)}</div><div class="sub">สายทาง ใน ${S.communities.length} ชุมชน</div></div>
      <div class="card kpi"><div class="label">ขึ้นทะเบียนทางแล้ว</div><div class="value">${fmt(reg)}</div>
        <div class="sub">${fmt(pct, 1)}% · ยังไม่ขึ้น ${fmt(R.length - reg)} สาย</div><div class="bar"><span style="width:${pct}%"></span></div></div>
      <div class="card kpi"><div class="label">ระยะทางรวม</div><div class="value">${fmt(km, 1)} <span class="small">กม.</span></div><div class="sub">จาก ${fmt(withLen.length)} สายที่มีข้อมูลระยะทาง</div></div>
      <div class="card kpi"><div class="label">สะพาน</div><div class="value">${fmt(S.bridges.filter((b) => !b.is_deleted).length)}</div><div class="sub">แห่ง</div></div>
      <div class="card kpi"><div class="label">สวนสาธารณะ</div><div class="value">${fmt(S.parks.filter((b) => !b.is_deleted).length)}</div>
        <div class="sub">${fmt(S.parks.filter((b) => !b.is_deleted).reduce((a, p) => a + (p.area_sqm || 0), 0) / 1600, 1)} ไร่ รวม</div></div>
    </div>
    <div class="grid two" style="margin-bottom:16px">
      <div class="card"><h3>จำนวนสายทาง แยกประเภทที่ดิน × ผิวจราจร</h3>
        <table class="matrix"><thead><tr><th>ประเภทที่ดิน</th>${SURF_GROUPS.map((g) => `<th><span class="dot" style="background:${g.color}"></span>${g.key}</th>`).join('')}<th>รวม</th></tr></thead>
        <tbody>${mtx.map((m) => `<tr><td>${esc(m.l)}</td>${m.cells.map((n, i) => `<td class="num"><a href="#roads" data-go-land="${esc(m.l)}" data-go-surf="${SURF_GROUPS[i].key}">${n || '–'}</a></td>`).join('')}<td class="num"><b>${m.total}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>รวม</td>${SURF_GROUPS.map((g, i) => `<td class="num">${mtx.reduce((a, m) => a + m.cells[i], 0)}</td>`).join('')}<td class="num">${R.length}</td></tr></tfoot></table>
      </div>
      <div class="card"><h3>ความครบถ้วนของข้อมูลถนน</h3>
        ${comp.map((c) => `<div class="comp-row ${c.pct < 50 ? 'low' : ''}"><span>${c.label}</span><div class="bar"><span style="width:${c.pct}%"></span></div><span class="pct">${fmt(c.pct, 0)}%</span></div>`).join('')}
        <div class="muted small" style="margin-top:8px">แถบสีส้ม = มีข้อมูลน้อยกว่าครึ่ง ควรเร่งสำรวจเพิ่ม</div>
      </div>
    </div>
    <div class="card"><h3>สรุปจำนวนถนนรายชุมชน</h3>
      <div class="table-wrap" style="max-height:none;border:none">
      <table><thead><tr><th>ชุมชน</th><th class="num">จำนวนสายทาง</th><th class="num">ขึ้นทะเบียนแล้ว</th><th class="num">ยังไม่ขึ้น</th>
        ${LAND_GROUPS.map((l) => `<th class="num">${l}</th>`).join('')}<th class="num">ระยะทาง (กม.)</th></tr></thead>
      <tbody>${byComm.map((b) => `<tr class="click" data-go-comm="${b.c.id}"><td>${esc(b.c.name)}</td><td class="num">${b.total}</td><td class="num">${b.reg || '–'}</td><td class="num">${b.total - b.reg || '–'}</td>
        ${b.lands.map((n) => `<td class="num">${n || '–'}</td>`).join('')}<td class="num">${b.km ? fmt(b.km, 2) : '–'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>รวม</td><td class="num">${R.length}</td><td class="num">${reg}</td><td class="num">${R.length - reg}</td>
        ${LAND_GROUPS.map((_, i) => `<td class="num">${byComm.reduce((a, b) => a + b.lands[i], 0)}</td>`).join('')}<td class="num">${fmt(km, 2)}</td></tr></tfoot></table></div>
    </div>`;

  $$('[data-go-comm]', el).forEach((tr) => tr.addEventListener('click', () => {
    S.filter = { q: '', community: tr.dataset.goComm, land: '', surf: '', reg: '' };
    location.hash = 'roads';
  }));
  $$('[data-go-land]', el).forEach((a) => a.addEventListener('click', () => {
    S.filter = { q: '', community: '', land: a.dataset.goLand, surf: a.dataset.goSurf, reg: '' };
  }));
  $('#btn-backup', el)?.addEventListener('click', exportBackup);
}

// ---------------------------------------------------------------- roads list
function filteredRoads() {
  const f = S.filter;
  const q = f.q.trim().toLowerCase();
  return S.roads.filter((r) => {
    if (f.community && String(r.community_id) !== String(f.community)) return false;
    if (f.land && landGroup(r.land_type) !== f.land) return false;
    if (f.surf && surfGroup(r.surface) !== f.surf) return false;
    if (f.reg === 'yes' && !r.reg_code) return false;
    if (f.reg === 'no' && r.reg_code) return false;
    if (q && !`${r.name} ${r.reg_code || ''} ${r.note || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function filterBar(prefix) {
  const f = S.filter;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  return `
    <input type="search" id="${prefix}-q" placeholder="ค้นหาชื่อถนน / รหัสทะเบียน / หมายเหตุ" value="${esc(f.q)}">
    <select id="${prefix}-community">${opt('', 'ทุกชุมชน', f.community)}${S.communities.map((c) => opt(c.id, c.name, f.community)).join('')}</select>
    <select id="${prefix}-land">${opt('', 'ทุกประเภทที่ดิน', f.land)}${[...LAND_GROUPS, 'อื่นๆ'].map((l) => opt(l, l, f.land)).join('')}</select>
    <select id="${prefix}-surf">${opt('', 'ทุกผิวจราจร', f.surf)}${SURF_GROUPS.map((g) => opt(g.key, g.key, f.surf)).join('')}</select>
    <select id="${prefix}-reg">${opt('', 'สถานะทะเบียน: ทั้งหมด', f.reg)}${opt('yes', 'ขึ้นทะเบียนแล้ว', f.reg)}${opt('no', 'ยังไม่ขึ้นทะเบียน', f.reg)}</select>`;
}

function bindFilters(prefix, onChange) {
  const map = { q: 'q', community: 'community', land: 'land', surf: 'surf', reg: 'reg' };
  for (const [id, k] of Object.entries(map)) {
    const el = $(`#${prefix}-${id}`);
    el?.addEventListener(id === 'q' ? 'input' : 'change', () => { S.filter[k] = el.value; onChange(); });
  }
}

function renderRoads() {
  const el = $('#view-roads');
  el.innerHTML = `
    <div class="page-head"><div><h2>รายชื่อถนน</h2><div class="muted small">คลิกแถวเพื่อดูรายละเอียด แก้ไข หรือดูประวัติ</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isAdmin() ? `<label class="btn"><input type="checkbox" id="show-del" style="width:auto" ${S.showDeleted ? 'checked' : ''}> แสดงรายการที่ซ่อน</label>` : ''}
        <button id="btn-export">ส่งออก Excel</button>
        ${canEdit() ? '<button class="primary" id="btn-add">+ เพิ่มถนน</button>' : ''}
      </div></div>
    <div class="filters">${filterBar('rf')}<span class="count" id="rf-count"></span></div>
    <div class="table-wrap"><table><thead><tr>
      <th class="num">ลำดับ</th><th>รหัสทะเบียน</th><th>ชื่อถนน</th><th>ชุมชน</th><th>ประเภทที่ดิน</th><th>ผิวจราจร</th>
      <th class="num">เขตทาง (ม.)</th><th class="num">กว้าง (ม.)</th><th class="num">ระยะ (กม.)</th><th class="num">โคม LED</th>
    </tr></thead><tbody id="rf-body"></tbody></table></div>`;
  const draw = () => {
    const rows = filteredRoads();
    $('#rf-count').textContent = `${fmt(rows.length)} สาย · ${fmt(rows.reduce((a, r) => a + (r.length_km || 0), 0), 2)} กม.`;
    $('#rf-body').innerHTML = rows.map((r) => `<tr class="click ${r.is_deleted ? 'deleted' : ''}" data-id="${r.id}">
      <td class="num">${r.seq ?? ''}</td><td class="code">${r.reg_code ? esc(r.reg_code) : '<span class="pill no">ยังไม่ขึ้น</span>'}</td>
      <td>${esc(r.name)}</td><td>${esc(commName(r.community_id))}</td><td>${esc(r.land_type)}</td>
      <td><span class="dot" style="background:${surfColor(r.surface)}"></span>${esc(r.surface)}</td>
      <td class="num">${fmtRange(r.row_w_min, r.row_w_max)}</td><td class="num">${fmtRange(r.surf_w_min, r.surf_w_max)}</td>
      <td class="num">${fmt(r.length_km, 3)}</td><td class="num">${r.lamp_led ?? ''}</td></tr>`).join('')
      || '<tr><td colspan="10" class="muted" style="text-align:center;padding:30px">ไม่พบข้อมูลตามเงื่อนไข</td></tr>';
  };
  bindFilters('rf', draw);
  draw();
  $('#rf-body').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openDetail('roads', +tr.dataset.id); });
  $('#btn-export').addEventListener('click', () => exportRoads(filteredRoads()));
  $('#btn-add')?.addEventListener('click', () => openEdit('roads', null));
  $('#show-del')?.addEventListener('change', async (e) => {
    S.showDeleted = e.target.checked;
    await refreshAll();
    renderRoads();
  });
}

// ---------------------------------------------------------------- bridges / parks
function renderSimple(table) {
  const el = $('#view-' + table);
  const cfg = {
    bridges: {
      head: ['ลำดับ', 'ชื่อสะพาน', 'ประเภท', 'กว้าง (ม.)', 'ยาว (ม.)', 'สูง (ม.)', 'ทางเท้า ซ้าย/ขวา (ม.)', 'พิกัด'],
      row: (b) => [b.seq, esc(b.name), esc(b.bridge_type), fmt(b.width_m), fmt(b.length_m), fmt(b.height_m),
        `${fmt(b.walk_l_m) || '–'} / ${fmt(b.walk_r_m) || '–'}`, b.lat ? '<span class="pill yes">มี</span>' : '<span class="pill no">ยังไม่มี</span>'],
      num: [0, 3, 4, 5, 6],
    },
    parks: {
      head: ['ลำดับ', 'ชื่อสวนสาธารณะ', 'พื้นที่ (ตร.ม.)', 'พื้นที่ (ไร่)', 'พิกัด', 'หมายเหตุ'],
      row: (p) => [p.seq, esc(p.name), fmt(p.area_sqm), fmt((p.area_sqm || 0) / 1600, 2),
        p.lat ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : '<span class="pill no">ยังไม่มี</span>', esc(p.note)],
      num: [0, 2, 3],
    },
  }[table];
  const rows = S[table];
  el.innerHTML = `
    <div class="page-head"><div><h2>${FORMS[table].title}</h2><div class="muted small">${fmt(rows.filter((r) => !r.is_deleted).length)} รายการ · คลิกแถวเพื่อดูรายละเอียด</div></div>
      <div style="display:flex;gap:8px">${canEdit() ? `<button class="primary" id="add-${table}">+ เพิ่ม${FORMS[table].title}</button>` : ''}</div></div>
    <div class="table-wrap"><table><thead><tr>${cfg.head.map((h, i) => `<th class="${cfg.num.includes(i) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr class="click ${r.is_deleted ? 'deleted' : ''}" data-id="${r.id}">${cfg.row(r).map((c, i) => `<td class="${cfg.num.includes(i) ? 'num' : ''}">${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  $('tbody', el).addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openDetail(table, +tr.dataset.id); });
  $(`#add-${table}`)?.addEventListener('click', () => openEdit(table, null));
}

// ---------------------------------------------------------------- map
let MAP = null, roadLayer = null, parkLayer = null, bridgeLayer = null;

function baseLayer() {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  });
}

function renderMap() {
  $('#map-tools').innerHTML = `${filterBar('mf')}<span class="count" id="mf-count"></span>`;
  bindFilters('mf', drawMarkers);
  if (!MAP) {
    MAP = L.map('map', { preferCanvas: true }).setView([12.68, 101.27], 14);
    const street = baseLayer().addTo(MAP);
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery &copy; Esri',
    });
    roadLayer = L.layerGroup().addTo(MAP);
    parkLayer = L.layerGroup().addTo(MAP);
    bridgeLayer = L.layerGroup().addTo(MAP);
    L.control.layers({ 'แผนที่ถนน': street, 'ภาพดาวเทียม': sat }, { 'ถนน': roadLayer, 'สวนสาธารณะ': parkLayer, 'สะพาน': bridgeLayer }).addTo(MAP);
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const d = L.DomUtil.create('div', 'legend');
      d.innerHTML = SURF_GROUPS.map((g) => `<div><span class="dot" style="background:${g.hex}"></span>${g.key}</div>`).join('')
        + '<div><span class="dot" style="background:#fff;border:2px solid #d62828"></span>ยังไม่ขึ้นทะเบียน</div>'
        + '<div><span class="dot" style="background:#2b7a4b"></span>สวนสาธารณะ</div>';
      return d;
    };
    legend.addTo(MAP);
    MAP.on('popupopen', (e) => {
      const b = e.popup.getElement().querySelector('[data-open]');
      if (b) b.addEventListener('click', () => { const [t, id] = b.dataset.open.split(':'); openDetail(t, +id); });
    });
  }
  setTimeout(() => MAP.invalidateSize(), 50);
  drawMarkers();
}

function drawMarkers() {
  if (!MAP) return;
  roadLayer.clearLayers(); parkLayer.clearLayers(); bridgeLayer.clearLayers();
  const rows = filteredRoads().filter((r) => r.lat && r.lng && !r.is_deleted);
  $('#mf-count').textContent = `แสดง ${fmt(rows.length)} สาย`;
  for (const r of rows) {
    L.circleMarker([r.lat, r.lng], {
      radius: 7, weight: r.reg_code ? 1 : 2.5, color: r.reg_code ? '#fff' : '#d62828',
      fillColor: surfColor(r.surface), fillOpacity: 0.9,
    }).bindPopup(`<b>${esc(r.name)}</b><br>${r.reg_code ? esc(r.reg_code) : '<span class="pill no">ยังไม่ขึ้นทะเบียน</span>'}<br>
      ชุมชน${esc(commName(r.community_id))} · ${esc(r.land_type)}<br>ผิว${esc(r.surface)} ${r.length_km ? '· ' + fmt(r.length_km, 3) + ' กม.' : ''}<br>
      <button data-open="roads:${r.id}" style="margin-top:6px">ดูรายละเอียด</button>`).addTo(roadLayer);
  }
  for (const p of S.parks.filter((p) => p.lat && !p.is_deleted)) {
    L.circleMarker([p.lat, p.lng], { radius: 12, color: '#fff', weight: 2, fillColor: '#2b7a4b', fillOpacity: 0.85 })
      .bindPopup(`<b>${esc(p.name)}</b><br>พื้นที่ ${fmt(p.area_sqm)} ตร.ม.<br><button data-open="parks:${p.id}" style="margin-top:6px">ดูรายละเอียด</button>`).addTo(parkLayer);
  }
  for (const b of S.bridges.filter((b) => b.lat && !b.is_deleted)) {
    L.circleMarker([b.lat, b.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#1d5fa8', fillOpacity: 0.9 })
      .bindPopup(`<b>${esc(b.name)}</b><br>ยาว ${fmt(b.length_m)} ม. · กว้าง ${fmt(b.width_m)} ม.<br><button data-open="bridges:${b.id}" style="margin-top:6px">ดูรายละเอียด</button>`).addTo(bridgeLayer);
  }
}

// ---------------------------------------------------------------- detail modal
function modal(html) {
  const d = $('#modal');
  d.innerHTML = html;
  if (!d.open) d.showModal();
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
  return d;
}

function openDetail(table, id) {
  const rec = S[table].find((r) => r.id === id);
  if (!rec) return;
  const val = (f) => {
    if (f.type === 'range') return fmtRange(rec[f.k + '_min'], rec[f.k + '_max']);
    if (f.type === 'community') return esc(commName(rec.community_id));
    if (f.type === 'latlng') return rec.lat ? `${rec.lat}, ${rec.lng} · <a href="https://www.google.com/maps?q=${rec.lat},${rec.lng}" target="_blank" rel="noopener">เปิด Google Maps</a>` : '<span class="pill no">ยังไม่มีพิกัด</span>';
    if (f.type === 'num' || f.type === 'int') return fmt(rec[f.k], 3);
    return esc(rec[f.k]);
  };
  const body = FORMS[table].sections.map(([title, fields]) => `<div class="sec-title">${title}</div><dl class="detail">${
    fields.map((f) => `<dt>${f.label || 'พิกัด'}</dt><dd>${val(f) || '<span class="muted">–</span>'}</dd>`).join('')}</dl>`).join('');
  const d = modal(`
    <div class="m-head"><h2>${esc(rec.name)} ${rec.is_deleted ? '<span class="pill no">ซ่อนอยู่</span>' : ''}</h2><button class="ghost" data-close aria-label="ปิด">✕</button></div>
    <div class="m-body">${body}
      <div class="muted small" style="margin-top:12px">แก้ไขล่าสุด ${fmtTime(rec.updated_at)} โดย ${esc(rec.updated_by || '-')}</div></div>
    <div class="m-foot">
      <div class="left">${isAdmin() ? (rec.is_deleted ? '<button id="d-restore">กู้คืน</button>' : '<button class="danger" id="d-del">ซ่อนรายการ</button>') : ''}
        ${canEdit() ? '<button id="d-hist">ประวัติการแก้ไข</button>' : ''}
        ${rec.lat ? '<button id="d-map">ดูบนแผนที่</button>' : ''}</div>
      <button data-close>ปิด</button>
      ${canEdit() && !rec.is_deleted ? '<button class="primary" id="d-edit">แก้ไข</button>' : ''}
    </div>`);
  $('#d-edit', d)?.addEventListener('click', () => openEdit(table, rec));
  $('#d-hist', d)?.addEventListener('click', () => openHistory(table, rec));
  $('#d-map', d)?.addEventListener('click', () => {
    d.close();
    location.hash = 'map';
    setTimeout(() => { MAP.setView([rec.lat, rec.lng], 18); }, 120);
  });
  $('#d-del', d)?.addEventListener('click', async () => {
    if (!confirm(`ยืนยันซ่อน "${rec.name}"?\nข้อมูลไม่ถูกลบจริง ผู้ดูแลกู้คืนได้ภายหลัง`)) return;
    await mutate(() => api(`${table}/${rec.id}`, { method: 'DELETE' }), 'ซ่อนรายการแล้ว');
    d.close();
  });
  $('#d-restore', d)?.addEventListener('click', async () => {
    await mutate(() => api(`${table}/${rec.id}/restore`, { method: 'POST', body: {} }), 'กู้คืนแล้ว');
    d.close();
  });
}

async function mutate(fn, okMsg) {
  try {
    const r = await fn();
    toast(okMsg);
    await refreshAll();
    route();
    return r;
  } catch (e) {
    toast(e.message, true);
    throw e;
  }
}

// ---------------------------------------------------------------- edit form
function datalists() {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  const lists = {
    land: uniq([...LAND_OPTIONS, ...S.roads.map((r) => r.land_type)]),
    surf: uniq([...SURF_OPTIONS, ...S.roads.map((r) => r.surface)]),
    shoulder: uniq(S.roads.flatMap((r) => [r.shoulder_type_l, r.shoulder_type_r])),
    btype: uniq(['คอนกรีต', ...S.bridges.map((b) => b.bridge_type)]),
  };
  return Object.entries(lists).map(([id, vals]) => `<datalist id="dl-${id}">${vals.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`).join('');
}

function fieldHtml(f, rec) {
  const v = (k) => esc(rec?.[k] ?? '');
  const lab = `<label for="f-${f.k}">${esc(f.label)}${f.req ? ' <span class="req">*</span>' : ''}</label>`;
  const step = f.type === 'int' ? '1' : 'any';
  switch (f.type) {
    case 'range':
      return `<div class="field">${lab}<div class="range">
        <input type="number" step="any" min="0" id="f-${f.k}" name="${f.k}_min" value="${v(f.k + '_min')}" placeholder="ต่ำสุด"><span>–</span>
        <input type="number" step="any" min="0" name="${f.k}_max" value="${v(f.k + '_max')}" placeholder="สูงสุด"></div></div>`;
    case 'community':
      return `<div class="field">${lab}<select id="f-${f.k}" name="${f.k}"><option value="">– เลือก –</option>${
        S.communities.map((c) => `<option value="${c.id}" ${rec?.community_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
    case 'textarea':
      return `<div class="field wide">${lab}<textarea id="f-${f.k}" name="${f.k}">${v(f.k)}</textarea></div>`;
    case 'latlng':
      return `<div class="field"><label for="f-lat">ละติจูด</label><input type="number" step="any" id="f-lat" name="lat" value="${v('lat')}" placeholder="12.68xxxx"></div>
        <div class="field"><label for="f-lng">ลองจิจูด</label><input type="number" step="any" id="f-lng" name="lng" value="${v('lng')}" placeholder="101.2xxxxx"></div>
        <div class="field"><label>&nbsp;</label><button type="button" id="btn-gps">ใช้ตำแหน่งปัจจุบัน (GPS)</button></div>
        <div class="field wide"><div class="muted small">หรือคลิก/ลากหมุดบนแผนที่ด้านล่าง · วางพิกัดแบบ "12.68, 101.27" ในช่องละติจูดได้</div><div class="minimap" id="minimap"></div></div>`;
    default: {
      const locked = f.adminOnly && !isAdmin();
      return `<div class="field ${f.wide ? 'wide' : ''}">${lab}<input id="f-${f.k}" name="${f.k}" value="${v(f.k)}"
        type="${f.type === 'num' || f.type === 'int' ? 'number' : 'text'}" ${f.type === 'num' || f.type === 'int' ? `step="${step}" min="0"` : ''}
        ${f.list ? `list="dl-${f.list}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.req ? 'required' : ''}
        ${locked ? 'disabled title="แก้ได้เฉพาะผู้ดูแล"' : ''}>${locked ? '<div class="muted small">แก้ได้เฉพาะผู้ดูแล</div>' : ''}</div>`;
    }
  }
}

function openEdit(table, rec) {
  const F = FORMS[table];
  const d = modal(`
    <form id="edit-form" novalidate>
      <div class="m-head"><h2>${rec ? 'แก้ไข' : 'เพิ่ม'}${F.title}${rec ? ': ' + esc(rec.name) : ''}</h2><button type="button" class="ghost" data-close aria-label="ปิด">✕</button></div>
      <div class="m-body"><div id="form-err"></div>${datalists()}
        ${F.sections.map(([title, fields]) => `<fieldset><legend>${title}</legend><div class="fields">${fields.map((f) => fieldHtml(f, rec)).join('')}</div></fieldset>`).join('')}
      </div>
      <div class="m-foot"><button type="button" data-close>ยกเลิก</button><button class="primary" type="submit" id="btn-save">บันทึก</button></div>
    </form>`);
  const form = $('#edit-form', d);

  // แผนที่ย่อยสำหรับเลือกพิกัด
  const latEl = $('#f-lat', d), lngEl = $('#f-lng', d);
  let mini = null, pin = null;
  const setPin = (lat, lng, pan = true) => {
    if (!mini) return;
    if (!pin) {
      pin = L.marker([lat, lng], { draggable: true }).addTo(mini);
      pin.on('dragend', () => { const p = pin.getLatLng(); latEl.value = p.lat.toFixed(6); lngEl.value = p.lng.toFixed(6); });
    } else pin.setLatLng([lat, lng]);
    if (pan) mini.setView([lat, lng], Math.max(mini.getZoom(), 17));
  };
  if ($('#minimap', d)) {
    mini = L.map($('#minimap', d)).setView(rec?.lat ? [rec.lat, rec.lng] : [12.68, 101.27], rec?.lat ? 17 : 14);
    baseLayer().addTo(mini);
    if (rec?.lat) setPin(rec.lat, rec.lng, false);
    mini.on('click', (e) => { latEl.value = e.latlng.lat.toFixed(6); lngEl.value = e.latlng.lng.toFixed(6); setPin(e.latlng.lat, e.latlng.lng, false); });
    setTimeout(() => mini.invalidateSize(), 100);
    const sync = () => { const a = parseFloat(latEl.value), b = parseFloat(lngEl.value); if (a && b) setPin(a, b); };
    latEl.addEventListener('change', sync); lngEl.addEventListener('change', sync);
    latEl.addEventListener('paste', (e) => {
      const t = (e.clipboardData || window.clipboardData).getData('text');
      const m = t.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (m) { e.preventDefault(); latEl.value = m[1]; lngEl.value = m[2]; sync(); }
    });
    $('#btn-gps', d).addEventListener('click', () => {
      if (!navigator.geolocation) return toast('อุปกรณ์นี้ไม่รองรับ GPS', true);
      toast('กำลังหาตำแหน่ง…');
      navigator.geolocation.getCurrentPosition(
        (p) => { latEl.value = p.coords.latitude.toFixed(6); lngEl.value = p.coords.longitude.toFixed(6); sync(); toast(`ได้ตำแหน่งแล้ว (คลาดเคลื่อน ±${Math.round(p.coords.accuracy)} ม.)`); },
        (err) => toast('หาตำแหน่งไม่ได้: ' + err.message, true),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      body[el.name] = el.value.trim() === '' ? null : el.value.trim();
    }
    if (!body.name) { $('#form-err', d).innerHTML = '<div class="err">กรุณาระบุชื่อ</div>'; return; }
    if (rec) body.updated_at = rec.updated_at;
    const btn = $('#btn-save', d);
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      const r = await api(rec ? `${table}/${rec.id}` : table, { method: rec ? 'PUT' : 'POST', body });
      toast('บันทึกเรียบร้อย');
      await refreshAll();
      route();
      openDetail(table, r.data.id);
    } catch (err) {
      $('#form-err', d).innerHTML = `<div class="err">${esc(err.message)}</div>`;
      $('.m-body', d).scrollTop = 0;
      if (err.status === 409 && err.data?.current) {
        await refreshAll();
        $('#form-err', d).innerHTML += '<div class="muted small">ระบบโหลดข้อมูลล่าสุดแล้ว ปิดหน้าต่างนี้แล้วกดแก้ไขใหม่อีกครั้ง</div>';
      }
    } finally {
      btn.disabled = false; btn.textContent = 'บันทึก';
    }
  });
}

// ---------------------------------------------------------------- history
function diffList(h) {
  const o = h.old_json ? JSON.parse(h.old_json) : {};
  const n = h.new_json ? JSON.parse(h.new_json) : {};
  const show = (k, v) => (v == null || v === '' ? '(ว่าง)' : k === 'community_id' ? commName(v) || v : k === 'role' ? ROLE_TH[v] || v : v);
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => k !== 'is_deleted' && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  if (h.action === 'create') return '<ul class="diff"><li>เพิ่มรายการใหม่</li></ul>';
  if (h.action === 'import') return `<ul class="diff"><li>ถนน ${n.roads} สาย · สะพาน ${n.bridges} แห่ง · สวน ${n.parks} แห่ง</li></ul>`;
  if (!keys.length) return '';
  return `<ul class="diff">${keys.map((k) => `<li>${esc(LABELS[k] || k)}: <del>${esc(show(k, o[k]))}</del> → <ins>${esc(show(k, n[k]))}</ins></li>`).join('')}</ul>`;
}

function histItem(h, withTitle) {
  let title = '';
  if (withTitle) {
    const nm = h.new_json ? JSON.parse(h.new_json).name : null;
    title = h.table_name === 'system' ? '<b>ระบบ</b> · ' : `<b>${esc(TABLE_TH[h.table_name] || h.table_name)}: ${esc(nm || h.record_id)}</b> · `;
  }
  return `<div class="hist-item ${h.action}"><div class="hist-meta">${title}${ACTION_TH[h.action] || h.action} · ${fmtTime(h.changed_at)} · ${esc(h.changed_by || '-')}</div>${diffList(h)}</div>`;
}

async function openHistory(table, rec) {
  const d = modal(`<div class="m-head"><h2>ประวัติการแก้ไข: ${esc(rec.name)}</h2><button class="ghost" data-close aria-label="ปิด">✕</button></div>
    <div class="m-body" id="hist-body">กำลังโหลด…</div><div class="m-foot"><button id="h-back">กลับ</button></div>`);
  $('#h-back', d).addEventListener('click', () => openDetail(table, rec.id));
  try {
    const { data } = await api(`history?table=${table}&id=${rec.id}`);
    $('#hist-body', d).innerHTML = data.length ? data.map((h) => histItem(h, false)).join('')
      : '<div class="muted">ยังไม่มีการแก้ไขในระบบ (ข้อมูลยังเป็นค่าที่นำเข้าจาก Excel)</div>';
  } catch (e) { $('#hist-body', d).innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

async function renderHistory() {
  const el = $('#view-history');
  el.innerHTML = '<div class="page-head"><div><h2>ประวัติการแก้ไขล่าสุด</h2><div class="muted small">200 รายการล่าสุดจากทุกตาราง · ประวัติลบหรือแก้ไขไม่ได้</div></div></div><div class="card" id="hist-all">กำลังโหลด…</div>';
  try {
    const { data } = await api('history?limit=200');
    $('#hist-all').innerHTML = data.length ? data.map((h) => histItem(h, true)).join('') : '<div class="muted">ยังไม่มีการแก้ไข</div>';
  } catch (e) { $('#hist-all').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------------------------------------------------------- users
async function renderUsers() {
  const el = $('#view-users');
  el.innerHTML = `<div class="page-head"><div><h2>จัดการผู้ใช้งาน</h2>
    <div class="muted small">ผู้ใช้งาน = ดูและแก้ไขข้อมูล · ผู้ดูแลระบบ = ทุกอย่าง รวมถึงแก้รหัสทะเบียนทาง ซ่อน/กู้คืน ดูประวัติทั้งหมด และจัดการผู้ใช้</div></div>
    <button class="primary" id="u-add">+ เพิ่มผู้ใช้</button></div><div class="table-wrap" id="u-list">กำลังโหลด…</div>`;
  const load = async () => {
    const { data } = await api('users');
    const locked = (u) => u.locked_until && new Date(u.locked_until) > new Date();
    $('#u-list').innerHTML = `<table><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อที่แสดง</th><th>สิทธิ์</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th><th></th></tr></thead><tbody>${
      data.map((u) => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.display_name)}</td><td><span class="role ${u.role}">${ROLE_TH[u.role] || u.role}</span></td>
        <td>${!u.active ? '<span class="pill no">ระงับ</span>' : locked(u) ? '<span class="pill no">ล็อกชั่วคราว</span>' : u.must_change_pw ? '<span class="pill">รอตั้งรหัสใหม่</span>' : '<span class="pill yes">ใช้งาน</span>'}</td>
        <td class="small">${u.last_login_at ? fmtTime(u.last_login_at) : '<span class="muted">ยังไม่เคยเข้า</span>'}</td>
        <td><button data-u="${esc(JSON.stringify(u))}">แก้ไข</button></td></tr>`).join('')}</tbody></table>`;
    $$('[data-u]', el).forEach((b) => b.addEventListener('click', () => userForm(JSON.parse(b.dataset.u))));
  };
  const userForm = (u) => {
    const d = modal(`<form id="u-form" autocomplete="off"><div class="m-head"><h2>${u ? 'แก้ไขผู้ใช้: ' + esc(u.username) : 'เพิ่มผู้ใช้'}</h2><button type="button" class="ghost" data-close aria-label="ปิด">✕</button></div>
      <div class="m-body"><div id="u-err"></div><div class="fields">
        <div class="field"><label>ชื่อผู้ใช้ (ภาษาอังกฤษ ใช้เข้าสู่ระบบ)</label><input name="username" required pattern="[a-zA-Z0-9._-]{3,32}" value="${esc(u?.username || '')}" ${u ? 'disabled' : ''} placeholder="เช่น somchai.k"></div>
        <div class="field"><label>ชื่อที่แสดง</label><input name="display_name" value="${esc(u?.display_name || '')}" placeholder="เช่น นายสมชาย ก."></div>
        <div class="field"><label>สิทธิ์</label><select name="role">${Object.entries(ROLE_TH).map(([k, v]) => `<option value="${k}" ${(u?.role || 'user') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>สถานะ</label><select name="active"><option value="1">ใช้งาน</option><option value="0" ${u && !u.active ? 'selected' : ''}>ระงับ</option></select></div>
        <div class="field wide"><label>${u ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่านชั่วคราว'}</label>
          <div class="range"><input name="password" type="text" ${u ? '' : 'required'} minlength="8" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข">
          <button type="button" id="u-gen">สุ่มรหัส</button></div>
          <div class="muted small">ผู้ใช้จะถูกบังคับให้ตั้งรหัสของตัวเองตอนเข้าครั้งแรก ส่งรหัสนี้ให้ผู้ใช้ทางช่องทางที่ปลอดภัย</div></div>
      </div></div>
      <div class="m-foot">${u && u.locked_until ? '<div class="left"><button type="button" id="u-unlock">ปลดล็อกบัญชี</button></div>' : ''}<button type="button" data-close>ยกเลิก</button><button class="primary" type="submit">บันทึก</button></div></form>`);
    const f = $('#u-form', d);
    $('#u-gen', d).addEventListener('click', () => {
      const cs = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', ds = '23456789';
      const r = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => set[x % set.length]).join('');
      f.password.value = r(cs, 6) + r(ds, 4);
    });
    const save = async (extra = {}) => {
      const body = { display_name: f.display_name.value.trim(), role: f.role.value, active: f.active.value === '1', ...extra };
      if (f.password.value) body.password = f.password.value;
      try {
        if (u) await api('users/' + encodeURIComponent(u.username), { method: 'PUT', body });
        else await api('users', { method: 'POST', body: { ...body, username: f.username.value.trim() } });
        const uname = u?.username || f.username.value.trim().toLowerCase();
        load();
        if (!body.password) { d.close(); toast('บันทึกผู้ใช้แล้ว'); return; }
        // แสดงรหัสชั่วคราวค้างไว้ให้ผู้ดูแลคัดลอก (ระบบไม่เก็บรหัสจริง ดูซ้ำภายหลังไม่ได้)
        modal(`<div class="m-head"><h2>บันทึกแล้ว</h2></div><div class="m-body">
          <p>ส่งข้อมูลนี้ให้ผู้ใช้ ผู้ใช้จะต้องตั้งรหัสใหม่เองตอนเข้าครั้งแรก</p>
          <dl class="detail"><dt>ที่อยู่เว็บ</dt><dd>${esc(location.origin)}</dd><dt>ชื่อผู้ใช้</dt><dd><b>${esc(uname)}</b></dd>
          <dt>รหัสผ่านชั่วคราว</dt><dd><b style="font-family:monospace;font-size:17px">${esc(body.password)}</b></dd></dl>
          <p class="muted small">ปิดหน้าต่างนี้แล้วจะดูรหัสนี้อีกไม่ได้ ถ้าลืมให้รีเซ็ตใหม่</p></div>
          <div class="m-foot"><button id="cp-pw">คัดลอก</button><button class="primary" data-close>เสร็จ</button></div>`);
        $('#cp-pw').addEventListener('click', () => navigator.clipboard.writeText(`RCRNIS ${location.origin}\nชื่อผู้ใช้: ${uname}\nรหัสผ่านชั่วคราว: ${body.password}`).then(() => toast('คัดลอกแล้ว')));
      } catch (err) { $('#u-err', d).innerHTML = `<div class="err">${esc(err.message)}</div>`; }
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    $('#u-unlock', d)?.addEventListener('click', () => save({ unlock: true }));
  };
  $('#u-add').addEventListener('click', () => userForm(null));
  try { await load(); } catch (e) { $('#u-list').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------------------------------------------------------- login / password
function showLogin(msg = '') {
  $('#tabs').hidden = true;
  $('#me').innerHTML = '';
  $$('.view').forEach((v) => v.classList.remove('active'));
  if ($('#modal').open) $('#modal').close();
  let box = $('#login');
  if (!box) { box = document.createElement('section'); box.id = 'login'; $('main').prepend(box); }
  $('#loading')?.remove();
  box.innerHTML = `<form class="card login-card" id="login-form">
    <h2>เข้าสู่ระบบ</h2>
    <div class="muted small" style="margin-bottom:16px">ระบบสารสนเทศภูมิศาสตร์ข้อมูลโครงข่ายถนนในเขตเทศบาลนครระยอง</div>
    <div id="login-err">${msg ? `<div class="err">${esc(msg)}</div>` : ''}</div>
    <div class="field"><label for="lg-user">ชื่อผู้ใช้</label><input id="lg-user" name="username" autocomplete="username" required autofocus></div>
    <div class="field" style="margin-top:10px"><label for="lg-pass">รหัสผ่าน</label><input id="lg-pass" name="password" type="password" autocomplete="current-password" required></div>
    <label class="remember"><input type="checkbox" name="remember" id="lg-remember"> จดจำการเข้าสู่ระบบ</label>
    <button class="primary" type="submit" style="width:100%;justify-content:center;margin-top:16px">เข้าสู่ระบบ</button></form>`;
  // จำชื่อผู้ใช้ไว้ในเครื่องเมื่อเลือกจดจำ (ไม่เก็บรหัสผ่าน)
  try {
    const saved = localStorage.getItem('rcrnis_user');
    if (saved) { $('#lg-user').value = saved; $('#lg-remember').checked = true; $('#lg-pass').focus(); }
  } catch {}
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', e.target);
    btn.disabled = true;
    const remember = e.target.remember.checked;
    try {
      await api('auth/login', { method: 'POST', body: { username: e.target.username.value, password: e.target.password.value, remember } });
      try {
        if (remember) localStorage.setItem('rcrnis_user', e.target.username.value.trim());
        else localStorage.removeItem('rcrnis_user');
      } catch {}
      box.remove();
      start();
    } catch (err) {
      $('#login-err').innerHTML = `<div class="err">${esc(err.message)}</div>`;
      e.target.password.value = '';
      btn.disabled = false;
    }
  });
}

function showChangePassword(forced) {
  const d = modal(`<form id="pw-form"><div class="m-head"><h2>${forced ? 'ตั้งรหัสผ่านของคุณ' : 'เปลี่ยนรหัสผ่าน'}</h2>${forced ? '' : '<button type="button" class="ghost" data-close aria-label="ปิด">✕</button>'}</div>
    <div class="m-body">${forced ? '<p class="muted">บัญชีนี้ใช้รหัสผ่านชั่วคราวอยู่ กรุณาตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน</p>' : ''}<div id="pw-err"></div>
      <div class="fields" style="grid-template-columns:1fr">
        <div class="field"><label>รหัสผ่านปัจจุบัน</label><input name="current" type="password" autocomplete="current-password" required></div>
        <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข)</label><input name="new" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input name="confirm" type="password" autocomplete="new-password" required></div>
      </div></div>
    <div class="m-foot">${forced ? '<button type="button" id="pw-logout">ออกจากระบบ</button>' : '<button type="button" data-close>ยกเลิก</button>'}<button class="primary" type="submit">บันทึกรหัสผ่าน</button></div></form>`);
  if (forced) d.addEventListener('cancel', (e) => e.preventDefault(), { once: false });
  $('#pw-logout', d)?.addEventListener('click', logout);
  $('#pw-form', d).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.new.value !== f.confirm.value) { $('#pw-err', d).innerHTML = '<div class="err">ยืนยันรหัสผ่านไม่ตรงกัน</div>'; return; }
    try {
      await api('auth/password', { method: 'POST', body: { current: f.current.value, new: f.new.value } });
      d.close(); toast('เปลี่ยนรหัสผ่านแล้ว');
      if (forced) start();
    } catch (err) { $('#pw-err', d).innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  });
}

async function logout() {
  await api('auth/logout', { method: 'POST', body: {} }).catch(() => {});
  S.me = null;
  S.etags = {};
  showLogin('ออกจากระบบแล้ว');
}

// ---------------------------------------------------------------- export
function roadSheetRows(rows) {
  return rows.map((r) => ({
    'ลำดับที่': r.seq, 'รหัสทะเบียนทาง': r.reg_code || '', 'รายชื่อถนน': r.name, 'ชุมชน': commName(r.community_id),
    'พิกัด': r.lat ? `${r.lat}, ${r.lng}` : '', 'เขตทาง (ม.)': fmtRange(r.row_w_min, r.row_w_max), 'ระยะทาง (กม.)': r.length_km ?? '',
    'ประเภท': r.land_type || '', 'ผิวจราจร': r.surface || '', 'กว้าง (ม.)': fmtRange(r.surf_w_min, r.surf_w_max),
    'ไหล่ทาง ประเภท ซ้าย': r.shoulder_type_l || '', 'ไหล่ทาง ประเภท ขวา': r.shoulder_type_r || '',
    'ไหล่ทาง กว้าง ซ้าย (ม.)': fmtRange(r.shoulder_w_l_min, r.shoulder_w_l_max), 'ไหล่ทาง กว้าง ขวา (ม.)': fmtRange(r.shoulder_w_r_min, r.shoulder_w_r_max),
    'รางระบายน้ำ ซ้าย': r.drain_channel_l || '', 'รางระบายน้ำ ขวา': r.drain_channel_r || '', 'ท่อระบายน้ำ ซ้าย': r.drain_pipe_l || '',
    'ท่อระบายน้ำ ขวา': r.drain_pipe_r || '', 'จำนวนฝา ซ้าย': r.manhole_l ?? '', 'จำนวนฝา ขวา': r.manhole_r ?? '',
    'โคม LED': r.lamp_led ?? '', 'โคมฟลูออเรสเซนต์': r.lamp_fluorescent ?? '', 'โคมหลังเต่า': r.lamp_turtle ?? '', 'หมายเหตุ': r.note || '',
  }));
}

function saveBook(sheets, filename) {
  if (!window.XLSX) return toast('กำลังโหลดตัวส่งออก ลองอีกครั้ง', true);
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.min(Math.max(k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? '').length + 1)), 50) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

const today = () => new Date().toISOString().slice(0, 10);

function exportRoads(rows) {
  saveBook([['ถนน', roadSheetRows(rows)]], `RCRNIS_ข้อมูลถนน_${today()}.xlsx`);
}

async function exportBackup() {
  S.showDeleted = true;
  await refreshAll();
  const strip = (rows) => rows.map((r) => ({ ...r }));
  saveBook([
    ['ถนน', roadSheetRows(S.roads.filter((r) => !r.is_deleted))],
    ['roads_raw', strip(S.roads)], ['bridges_raw', strip(S.bridges)], ['parks_raw', strip(S.parks)],
    ['communities', S.communities],
  ], `RCRNIS_สำรองข้อมูล_${today()}.xlsx`);
  S.showDeleted = false;
  await refreshAll();
}

// ---------------------------------------------------------------- boot
let booted = false;
async function start() {
  try {
    S.me = (await api('me')).data;
  } catch (e) {
    if (e.status === 401) return showLogin();
    $('#loading').innerHTML = `<div class="err" style="display:inline-block">${esc(e.message)}</div>`;
    return;
  }
  $('#me').innerHTML = `<span>${esc(S.me.name)}</span><span class="role ${S.me.role}">${ROLE_TH[S.me.role]}</span>
    <button class="ghost me-btn" id="btn-pw" title="เปลี่ยนรหัสผ่าน">เปลี่ยนรหัส</button><button class="ghost me-btn" id="btn-logout">ออกจากระบบ</button>`;
  $('#btn-pw').addEventListener('click', () => showChangePassword(false));
  $('#btn-logout').addEventListener('click', logout);
  if (S.me.must_change_pw) { $('#loading')?.remove(); return showChangePassword(true); }
  try {
    S.communities = (await api('communities')).data;
    await refreshAll();
  } catch (e) {
    toast(e.message, true);
    return;
  }
  $('#loading')?.remove();
  $('#tabs').hidden = false;
  $$('#tabs a[data-role]').forEach((a) => { a.hidden = !isAdmin(); });
  if (!booted) {
    booted = true;
    window.addEventListener('hashchange', () => S.me && route());
    // ดึงข้อมูลใหม่เมื่อกลับมาที่แท็บ (ถ้าไม่มีการเปลี่ยนแปลง เซิร์ฟเวอร์ตอบ 304 ไม่เปลือง)
    document.addEventListener('visibilitychange', async () => {
      if (!S.me || document.visibilityState !== 'visible' || $('#modal').open) return;
      const before = S.roads;
      await refreshAll().catch(() => {});
      if (S.roads !== before) route();
    });
  }
  route();
}

start();
