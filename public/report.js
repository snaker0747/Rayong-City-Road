/* RCRNIS — รายงานสรุปข้อมูลโครงข่ายถนนในเขตเทศบาลนครระยอง (A4 แนวนอน, TH Sarabun New 16 pt, เลขอารบิก)
   ใช้ตัวแปร/ฟังก์ชันจาก app.js (S, esc, fmt, landGroup, surfGroup, isPublic, regState, commName, ...) */
'use strict';

const REPORT_SECTIONS = [
  ['summary', 'ภาพรวมข้อมูลในระบบ', true],
  ['stats', 'ประเภทที่ดิน × ผิวจราจร', true],
  ['community', 'ข้อมูลถนนรายชุมชน', true],
  ['unregistered', 'ถนนสาธารณะที่ยังไม่ขึ้นทะเบียน', true],
  ['unpaved', 'ถนนสาธารณะผิวไม่ถาวร', true],
  ['gaps', 'ความครบถ้วนของข้อมูล', true],
  ['bridges', 'ข้อมูลสะพาน', true],
  ['parks', 'ข้อมูลสวนสาธารณะ', true],
  ['allroads', 'รายชื่อถนนทั้งหมดในระบบ', true],
];
const REPORT_TITLE = 'รายงานสรุปข้อมูลโครงข่ายถนนในเขตเทศบาลนครระยอง';
const REPORT_BY = 'โดย ส่วนการโยธา สำนักช่าง';
const UNPAVED_RE = /ลูกรัง|หินคลุก|ดิน|กรวด/;
const isUnpaved = (r) => UNPAVED_RE.test(r.surface || '');
const midW = (a, b) => (a != null && b != null ? (a + b) / 2 : a ?? b ?? null);
const areaSqm = (r) => {
  const w = midW(r.surf_w_min, r.surf_w_max);
  return r.length_km != null && w != null ? r.length_km * 1000 * w : null;
};
const thDate = (d = new Date()) => d.toLocaleDateString('th-TH-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const pctTxt = (a, b) => (b ? fmt((a / b) * 100, 1) + '%' : '–');
const n0 = (v) => (v ? fmt(v) : '–');
// รหัส/ช่วงตัวเลข ห้ามตัดขึ้นบรรทัดใหม่กลางค่า
const nb = (s) => `<span class="nw">${s}</span>`;
// แถวสุดท้ายของข้อมูล + แถวรวม อยู่ใน tbody เดียวที่ห้ามตัดหน้า (กันแถวรวมตกไปอยู่หน้าใหม่ลำพัง)
const tbodyWithTotal = (rows, total) => rows.length
  ? `<tbody>${rows.slice(0, -1).join('')}</tbody><tbody class="rp-tail">${rows[rows.length - 1]}${total}</tbody>`
  : `<tbody class="rp-tail">${total}</tbody>`;

function reportPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('rcrnis_report2') || '{}'); } catch {}
  const sec = {};
  for (const [k, , def] of REPORT_SECTIONS) sec[k] = p.sec?.[k] ?? def;
  return { community: '', sec };
}
function saveReportPrefs(o) {
  try { localStorage.setItem('rcrnis_report2', JSON.stringify({ sec: o.sec })); } catch {}
}

// ---------------------------------------------------------------- เนื้อหารายงาน
function buildReport(o) {
  const comm = o.community ? S.communities.find((c) => String(c.id) === String(o.community)) : null;
  const R = S.roads.filter((r) => !r.is_deleted && (!comm || r.community_id === comm.id));
  const PUB = R.filter(isPublic);
  const reg = PUB.filter((r) => r.reg_code);
  const unreg = PUB.filter((r) => !r.reg_code);
  const check = R.filter((r) => regState(r) === 'check');
  const unpaved = PUB.filter(isUnpaved).sort((a, b) => (a.community_id - b.community_id) || (a.seq - b.seq));
  const withLen = R.filter((r) => r.length_km != null);
  const km = withLen.reduce((a, r) => a + r.length_km, 0);
  const sumKm = (rows) => rows.reduce((a, r) => a + (r.length_km || 0), 0);
  const byComm = (rows) => {
    const m = new Map();
    for (const r of rows) m.set(r.community_id, (m.get(r.community_id) || []).concat(r));
    return [...m.entries()].map(([id, rs]) => ({ id, name: commName(id), rows: rs })).sort((a, b) => b.rows.length - a.rows.length);
  };
  const landCount = (g) => R.filter((r) => landGroup(r.land_type) === g).length;
  let secNo = 0;
  const H = (t) => `<h2 class="rp-h2">${++secNo}. ${t}</h2>`;
  const parts = [];

  parts.push(`<header class="rp-head"><h1 class="rp-title">${REPORT_TITLE}</h1><div class="rp-by">${REPORT_BY}</div></header>`);
  const B = S.bridges.filter((x) => !x.is_deleted), P = S.parks.filter((x) => !x.is_deleted);
  const bLen = B.reduce((a, x) => a + (x.length_m || 0), 0);
  const pArea = P.reduce((a, x) => a + (x.area_sqm || 0), 0);

  if (o.sec.summary) {
    const grp = (t) => `<tr class="rp-grp"><td colspan="4">${t}</td></tr>`;
    // A4 แนวนอน: แบ่งภาพรวมเป็น 2 ตารางคู่กัน ให้จบในหน้าแรก
    const tbl = (rows) => `<table class="rp-t"><colgroup><col style="width:49%"><col style="width:18%"><col style="width:15%"><col style="width:18%"></colgroup>
      <thead><tr><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ร้อยละ</th></tr></thead><tbody>${rows}</tbody></table>`;
    const row = (l, v, u, p = '') => `<tr><td class="ind">${l}</td><td class="n">${v}</td><td class="c">${u}</td><td class="n">${p}</td></tr>`;
    parts.push(`<section>${H('ภาพรวมข้อมูลในระบบ')}
      ${comm ? `<p class="rp-note">ขอบเขตข้อมูล ชุมชน${esc(comm.name)}</p>` : ''}
      <div class="rp-cols">
      ${tbl(`${grp('ถนน')}
      ${comm ? '' : row('ชุมชน', fmt(S.communities.length), 'ชุมชน')}
      ${row('ถนนทั้งหมด', fmt(R.length), 'สาย')}
      ${row(`ระยะทางรวม (${fmt(withLen.length)} สายที่มีข้อมูล)`, fmt(km, 2), 'กม.')}
      ${row('ถนนสาธารณะ', fmt(PUB.length), 'สาย', pctTxt(PUB.length, R.length))}
      ${row('ถนนส่วนบุคคล', fmt(landCount('ส่วนบุคคล')), 'สาย', pctTxt(landCount('ส่วนบุคคล'), R.length))}
      ${row('ถนนในที่ราชพัสดุ', fmt(landCount('ราชพัสดุ')), 'สาย', pctTxt(landCount('ราชพัสดุ'), R.length))}
      ${row('ถนนในที่วัด', fmt(landCount('ที่วัด')), 'สาย', pctTxt(landCount('ที่วัด'), R.length))}
      ${check.length ? row('ถนนไม่ใช่สาธารณะที่มีรหัสทะเบียน', fmt(check.length), 'สาย') : ''}`)}
      ${tbl(`${grp('ถนนสาธารณะ (ร้อยละของถนนสาธารณะ)')}
      ${row('ขึ้นทะเบียนทางแล้ว', fmt(reg.length), 'สาย', pctTxt(reg.length, PUB.length))}
      ${row('ยังไม่ขึ้นทะเบียนทาง', fmt(unreg.length), 'สาย', pctTxt(unreg.length, PUB.length))}
      ${row('ผิวไม่ถาวร (ลูกรัง/หินคลุก)', fmt(unpaved.length), 'สาย', pctTxt(unpaved.length, PUB.length))}
      ${comm ? '' : `${grp('สะพาน')}${row('สะพานทั้งหมด', fmt(B.length), 'แห่ง')}${row('ความยาวรวม', fmt(bLen, 1), 'เมตร')}
      ${grp('สวนสาธารณะ')}${row('สวนสาธารณะทั้งหมด', fmt(P.length), 'แห่ง')}${row('พื้นที่รวม', fmt(pArea, 0), 'ตร.ม.')}${row('พื้นที่รวม', fmt(pArea / 1600, 1), 'ไร่')}`}`)}
      </div></section>`);
  }

  if (o.sec.stats) {
    const lands = [...LAND_GROUPS, ...new Set(R.map((r) => landGroup(r.land_type)).filter((g) => !LAND_GROUPS.includes(g)))]
      .filter((l) => R.some((r) => landGroup(r.land_type) === l));
    const cell = (l, g) => R.filter((r) => landGroup(r.land_type) === l && surfGroup(r.surface) === g).length;
    const head = { 'คสล.': 'คอนกรีต', 'แอสฟัลท์': 'แอสฟัลท์ติก', 'ลูกรัง': 'ลูกรัง', 'อื่นๆ': 'อื่นๆ' };
    parts.push(`<section>${H('จำนวนสายทาง จำแนกตามประเภทที่ดินและผิวจราจร')}
      <div class="rp-keep"><table class="rp-t"><colgroup><col style="width:21%"><col style="width:14%"><col style="width:19%"><col style="width:11%"><col style="width:10%"><col style="width:11%"><col style="width:14%"></colgroup>
      <thead><tr><th>ประเภทที่ดิน</th>${SURF_GROUPS.map((g) => `<th>${head[g.key]}</th>`).join('')}<th>รวม</th><th>ร้อยละ</th></tr></thead>
      <tbody>${lands.map((l) => { const t = landCount(l); return `<tr><td>${esc(l)}</td>${SURF_GROUPS.map((g) => `<td class="n">${n0(cell(l, g.key))}</td>`).join('')}<td class="n b">${t}</td><td class="n">${pctTxt(t, R.length)}</td></tr>`; }).join('')}
      <tr class="rp-total"><td>รวม</td>${SURF_GROUPS.map((g) => `<td class="n">${R.filter((r) => surfGroup(r.surface) === g.key).length}</td>`).join('')}<td class="n">${R.length}</td><td class="n">100%</td></tr></tbody></table>
      <p class="rp-note">หมายเหตุ "อื่นๆ" ได้แก่ แสตมป์พิมพ์ลาย หินคลุก ตัวหนอน และผิวผสม</p></div></section>`);
  }

  if (o.sec.community && !comm) {
    const rows = S.communities.map((c) => {
      const rs = R.filter((r) => r.community_id === c.id);
      const p = rs.filter(isPublic);
      return { c, n: rs.length, p: p.length, reg: p.filter((r) => r.reg_code).length, unp: p.filter(isUnpaved).length, km: sumKm(rs) };
    });
    parts.push(`<section>${H('ข้อมูลถนนรายชุมชน')}
      <table class="rp-t"><colgroup><col style="width:5%"><col style="width:21%"><col style="width:12.5%"><col style="width:16%"><col style="width:13.5%"><col style="width:10.5%"><col style="width:10.5%"><col style="width:11%"></colgroup>
      <thead><tr><th rowspan="2">ที่</th><th rowspan="2">ชุมชน</th><th colspan="2">จำนวนถนน (สาย)</th><th colspan="3">ถนนสาธารณะ (สาย)</th><th rowspan="2">ระยะ<br>ทาง<br>(กม.)</th></tr>
      <tr><th>ทั้งหมด</th><th>สาธารณะ</th><th>ขึ้น<br>ทะเบียน</th><th>ยังไม่<br>ขึ้น</th><th>ผิวไม่<br>ถาวร</th></tr></thead>
      ${tbodyWithTotal(rows.map((x, i) => `<tr><td class="n">${i + 1}</td><td>${esc(x.c.name)}</td><td class="n">${x.n}</td><td class="n">${n0(x.p)}</td><td class="n">${n0(x.reg)}</td><td class="n">${n0(x.p - x.reg)}</td><td class="n">${n0(x.unp)}</td><td class="n">${x.km ? fmt(x.km, 2) : '–'}</td></tr>`),
        `<tr class="rp-total"><td></td><td>รวม</td><td class="n">${R.length}</td><td class="n">${PUB.length}</td><td class="n">${reg.length}</td><td class="n">${unreg.length}</td><td class="n">${unpaved.length}</td><td class="n">${fmt(km, 2)}</td></tr>`)}</table>
      <p class="rp-note">หมายเหตุ ระยะทางรวมเฉพาะสายทางที่มีข้อมูลระยะทาง</p></section>`);
  }

  if (o.sec.unregistered) {
    const g = byComm(unreg);
    parts.push(`<section>${H(`ถนนสาธารณะที่ยังไม่ขึ้นทะเบียนทาง จำแนกตามชุมชน (${fmt(unreg.length)} สาย)`)}
      ${g.length ? `<table class="rp-t"><colgroup><col style="width:7%"><col style="width:41%"><col style="width:15%"><col style="width:22%"><col style="width:15%"></colgroup>
      <thead><tr><th>ที่</th><th>ชุมชน</th><th>จำนวน<br>(สาย)</th><th>ร้อยละของ<br>ถนนสาธารณะ<br>ในชุมชน</th><th>ผิว<br>ไม่ถาวร</th></tr></thead>
      ${tbodyWithTotal(g.map((c, i) => { const p = PUB.filter((r) => r.community_id === c.id).length; return `<tr><td class="n">${i + 1}</td><td>${esc(c.name)}</td><td class="n">${c.rows.length}</td><td class="n">${pctTxt(c.rows.length, p)}</td><td class="n">${n0(c.rows.filter(isUnpaved).length)}</td></tr>`; }),
        `<tr class="rp-total"><td></td><td>รวม</td><td class="n">${unreg.length}</td><td class="n">${pctTxt(unreg.length, PUB.length)}</td><td class="n">${n0(unreg.filter(isUnpaved).length)}</td></tr>`)}</table>` : '<p class="rp-note">ไม่มีข้อมูล</p>'}</section>`);
  }

  if (o.sec.unpaved) {
    const known = unpaved.filter((r) => areaSqm(r) != null);
    const area = known.reduce((a, r) => a + areaSqm(r), 0);
    parts.push(`<section>${H(`ถนนสาธารณะผิวไม่ถาวร (ลูกรัง/หินคลุก) (${fmt(unpaved.length)} สาย)`)}
      ${unpaved.length ? `<table class="rp-t"><colgroup><col style="width:5%"><col style="width:36%"><col style="width:19%"><col style="width:12%"><col style="width:7%"><col style="width:10%"><col style="width:11%"></colgroup>
      <thead><tr><th>ที่</th><th>ชื่อถนน</th><th>ชุมชน</th><th>ผิว<br>จราจร</th><th>ยาว<br>(ม.)</th><th>กว้าง<br>ผิว (ม.)</th><th>พื้นที่<br>(ตร.ม.)</th></tr></thead>
      ${tbodyWithTotal(unpaved.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r.name)}${r.reg_code ? `<br><span class="sub">${nb(esc(r.reg_code))}</span>` : ''}</td><td>${esc(commName(r.community_id))}</td><td>${esc(r.surface)}</td>
        <td class="n">${r.length_km != null ? fmt(r.length_km * 1000, 0) : '–'}</td><td class="n">${nb(fmtRange(r.surf_w_min, r.surf_w_max) || '–')}</td>
        <td class="n">${areaSqm(r) != null ? fmt(areaSqm(r), 0) : '–'}</td></tr>`),
        `<tr class="rp-total"><td></td><td colspan="5">รวมพื้นที่ (คำนวณได้ ${known.length} สาย จาก ${unpaved.length} สาย)</td><td class="n">${fmt(area, 0)}</td></tr>`)}</table>
      <p class="rp-note">หมายเหตุ พื้นที่ = ความยาว × ความกว้างผิวจราจรเฉลี่ย เครื่องหมาย "–" คือไม่มีข้อมูลในระบบ ตัวเลขใต้ชื่อถนนคือรหัสทะเบียนทาง</p>` : '<p class="rp-note">ไม่มีข้อมูล</p>'}</section>`);
  }

  if (o.sec.gaps) {
    const has = (r, ...ks) => ks.some((k) => r[k] != null && r[k] !== '');
    const items = [
      ['ระยะทาง', (r) => has(r, 'length_km')],
      ['ความกว้างผิวจราจร', (r) => has(r, 'surf_w_min', 'surf_w_max')],
      ['เขตทาง', (r) => has(r, 'row_w_min', 'row_w_max')],
      ['ไหล่ทาง/ทางเท้า', (r) => has(r, 'shoulder_type_l', 'shoulder_type_r', 'shoulder_w_l_min', 'shoulder_w_r_min')],
      ['ระบบระบายน้ำ', (r) => has(r, 'drain_channel_l', 'drain_channel_r', 'drain_pipe_l', 'drain_pipe_r', 'manhole_l', 'manhole_r')],
      ['โคมไฟฟ้าส่องสว่าง', (r) => has(r, 'lamp_led', 'lamp_fluorescent', 'lamp_turtle')],
      ['พิกัด', (r) => has(r, 'lat') && has(r, 'lng')],
    ];
    parts.push(`<section class="rp-keep">${H(`ความครบถ้วนของข้อมูลถนนสาธารณะ (${fmt(PUB.length)} สาย)`)}
      <table class="rp-t"><colgroup><col style="width:40%"><col style="width:20%"><col style="width:20%"><col style="width:20%"></colgroup>
      <thead><tr><th>รายการข้อมูล</th><th>มีข้อมูล<br>(สาย)</th><th>ไม่มีข้อมูล<br>(สาย)</th><th>ร้อยละ<br>ที่มีข้อมูล</th></tr></thead>
      <tbody>${items.map(([l, f]) => { const n = PUB.filter(f).length; return `<tr><td>${l}</td><td class="n">${n}</td><td class="n">${PUB.length - n}</td><td class="n">${pctTxt(n, PUB.length)}</td></tr>`; }).join('')}</tbody></table></section>`);
  }

  if (o.sec.bridges && !comm) {
    const v1 = (x) => (x != null ? fmt(x, 1) : '–');
    parts.push(`<section>${H(`ข้อมูลสะพาน (${fmt(B.length)} แห่ง)`)}
      ${B.length ? `<table class="rp-t"><colgroup><col style="width:5%"><col style="width:46%"><col style="width:14%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"></colgroup>
      <thead><tr><th rowspan="2">ที่</th><th rowspan="2">ชื่อสะพาน</th><th rowspan="2">ประเภท</th><th colspan="3">ขนาด (ม.)</th><th colspan="2">ทางเท้า (ม.)</th></tr>
      <tr><th>กว้าง</th><th>ยาว</th><th>สูง</th><th>ซ้าย</th><th>ขวา</th></tr></thead>
      ${tbodyWithTotal(B.slice().sort((a, b) => a.seq - b.seq).map((x, i) => `<tr><td class="n">${i + 1}</td><td>${esc(x.name)}</td><td>${esc(x.bridge_type || '–')}</td><td class="n">${v1(x.width_m)}</td><td class="n">${v1(x.length_m)}</td><td class="n">${v1(x.height_m)}</td><td class="n">${v1(x.walk_l_m)}</td><td class="n">${v1(x.walk_r_m)}</td></tr>`),
        `<tr class="rp-total"><td></td><td colspan="7">ความยาวรวม ${fmt(bLen, 1)} เมตร</td></tr>`)}</table>` : '<p class="rp-note">ไม่มีข้อมูล</p>'}</section>`);
  }

  if (o.sec.parks && !comm) {
    parts.push(`<section class="rp-keep">${H(`ข้อมูลสวนสาธารณะ (${fmt(P.length)} แห่ง)`)}
      ${P.length ? `<table class="rp-t"><colgroup><col style="width:7%"><col style="width:51%"><col style="width:24%"><col style="width:18%"></colgroup>
      <thead><tr><th>ที่</th><th>ชื่อสวนสาธารณะ</th><th>พื้นที่ (ตร.ม.)</th><th>พื้นที่ (ไร่)</th></tr></thead>
      <tbody>${P.slice().sort((a, b) => a.seq - b.seq).map((x, i) => `<tr><td class="n">${i + 1}</td><td>${esc(x.name)}</td><td class="n">${x.area_sqm != null ? fmt(x.area_sqm, 0) : '–'}</td><td class="n">${x.area_sqm != null ? fmt(x.area_sqm / 1600, 1) : '–'}</td></tr>`).join('')}
      <tr class="rp-total"><td></td><td>รวม</td><td class="n">${fmt(pArea, 0)}</td><td class="n">${fmt(pArea / 1600, 1)}</td></tr></tbody></table>` : '<p class="rp-note">ไม่มีข้อมูล</p>'}</section>`);
  }

  if (o.sec.allroads && R.length) {
    const comms = (comm ? [comm] : S.communities).filter((c) => R.some((r) => r.community_id === c.id));
    let n = 0;
    const body = comms.map((c) => {
      const rs = R.filter((r) => r.community_id === c.id).sort((a, b) => a.seq - b.seq);
      const rows = rs.map((r) => `<tr><td class="n">${++n}</td><td>${esc(r.name)}${r.reg_code ? `<br><span class="sub">${nb(esc(r.reg_code))}</span>` : ''}</td><td>${esc(r.land_type || '–')}</td><td>${esc(r.surface || '–')}</td>
        <td class="n">${r.length_km != null ? fmt(r.length_km * 1000, 0) : '–'}</td><td class="n">${nb(fmtRange(r.surf_w_min, r.surf_w_max) || '–')}</td></tr>`);
      // หัวชุมชน + แถวแรก ห้ามแยกหน้ากัน
      return `<tbody class="rp-tail"><tr class="rp-grp"><td colspan="6">ชุมชน${esc(c.name)} (${rs.length} สาย)</td></tr>${rows[0]}</tbody><tbody>${rows.slice(1).join('')}</tbody>`;
    }).join('');
    parts.push(`<section class="rp-appendix">${H(`รายชื่อถนนทั้งหมดในระบบ (${fmt(R.length)} สาย)`)}
      <table class="rp-t"><colgroup><col style="width:5%"><col style="width:42%"><col style="width:16%"><col style="width:19%"><col style="width:8%"><col style="width:10%"></colgroup>
      <thead><tr><th>ที่</th><th>ชื่อถนน</th><th>ที่ดิน</th><th>ผิวจราจร</th><th>ยาว<br>(ม.)</th><th>กว้าง<br>ผิว (ม.)</th></tr></thead>
      ${body}</table>
      <p class="rp-note">หมายเหตุ ตัวเลขใต้ชื่อถนนคือรหัสทะเบียนทาง เครื่องหมาย "–" คือไม่มีข้อมูลในระบบ</p></section>`);
  }

  return parts.join('');
}

// ---------------------------------------------------------------- หน้าจอรายงาน
function openReport() {
  const o = reportPrefs();
  let v = $('#report-view');
  if (!v) { v = document.createElement('div'); v.id = 'report-view'; document.body.append(v); }
  // วันที่ข้อมูล แสดงที่ท้ายกระดาษทุกหน้า (ไม่อยู่ในหัวรายงาน)
  document.documentElement.style.setProperty('--rp-date', JSON.stringify(`ข้อมูล ณ วันที่ ${thDate()}`));
  v.innerHTML = `
    <div class="rp-bar">
      <div class="rp-bar-row">
        <b class="rp-bar-title">พิมพ์รายงานสรุปข้อมูลถนน</b>
        <button type="button" class="ghost rp-opt-toggle" id="rp-opt-toggle">ตั้งค่ารายงาน</button>
        <span class="rp-spacer"></span>
        <button type="button" id="rp-close">ปิด</button>
        <button type="button" class="primary" id="rp-print">พิมพ์ / บันทึก PDF</button>
      </div>
      <form class="rp-opts" id="rp-opts">
        <div class="field"><label>ขอบเขตรายงาน</label><select name="community"><option value="">ทั้งเขตเทศบาล (ทุกชุมชน)</option>${S.communities.map((c) => `<option value="${c.id}">ชุมชน${esc(c.name)}</option>`).join('')}</select></div>
        <fieldset class="rp-secs"><legend>หัวข้อในรายงาน</legend>${REPORT_SECTIONS.map(([k, l]) => `<label><input type="checkbox" name="sec_${k}" ${o.sec[k] ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
      </form>
    </div>
    <div class="rp-stage"><article class="rp-paper" id="rp-paper"></article></div>`;
  document.body.classList.add('rp-open');
  history.pushState({ report: true }, '');

  const form = $('#rp-opts', v);
  const read = () => {
    const f = new FormData(form);
    o.community = f.get('community') || '';
    for (const [k] of REPORT_SECTIONS) o.sec[k] = f.get('sec_' + k) === 'on';
  };
  // ย่อกระดาษ A4 ให้พอดีจอ (มือถือ/แท็บเล็ต) ตอนดูตัวอย่าง
  const fitPaper = () => {
    const paper = $('#rp-paper', v);
    const avail = $('.rp-stage', v).clientWidth - 16;
    paper.style.zoom = avail < 1123 ? String(Math.max(avail / 1123, 0.25)) : ''; // A4 แนวนอน = 297 มม. ≈ 1123 px
  };
  const render = () => {
    read();
    $('#rp-paper', v).innerHTML = buildReport(o);
    fitPaper();
    saveReportPrefs(o);
  };
  form.addEventListener('input', () => { clearTimeout(render.t); render.t = setTimeout(render, 250); });
  form.addEventListener('change', render);
  window.addEventListener('resize', fitPaper);
  $('#rp-opt-toggle', v).addEventListener('click', () => form.classList.toggle('open'));
  $('#rp-print', v).addEventListener('click', () => {
    render();
    const old = document.title;
    const comm = o.community ? commName(Number(o.community)) : '';
    document.title = `รายงานข้อมูลถนน${comm ? '_' + comm : ''}_${new Date().toISOString().slice(0, 10)}`; // ชื่อไฟล์ตอนบันทึก PDF
    window.print();
    setTimeout(() => { document.title = old; }, 1000);
  });
  const close = () => {
    window.removeEventListener('resize', fitPaper);
    document.body.classList.remove('rp-open');
    v.remove();
  };
  $('#rp-close', v).addEventListener('click', () => { if (history.state?.report) history.back(); else close(); });
  window.addEventListener('popstate', function onPop() {
    if ($('#report-view')) close();
    window.removeEventListener('popstate', onPop);
  });
  render();
}
