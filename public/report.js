/* RCRNIS — รายงานสรุปข้อมูลโครงข่ายถนน สำหรับผู้บริหารและประกอบการจัดทำแผนพัฒนาถนน
   ใช้ตัวแปร/ฟังก์ชันจาก app.js (S, esc, fmt, landGroup, surfGroup, isPublic, regState, commName, ...) */
'use strict';

const REPORT_SECTIONS = [
  ['summary', 'สรุปสำหรับผู้บริหาร', true],
  ['stats', 'ตารางประเภทที่ดิน × ผิวจราจร', true],
  ['community', 'สรุปรายชุมชน', true],
  ['unpaved', 'ถนนสาธารณะผิวไม่ถาวร (แผนปรับปรุงผิวทาง)', true],
  ['unregistered', 'ถนนสาธารณะที่ยังไม่ขึ้นทะเบียน', true],
  ['gaps', 'ข้อมูลที่ต้องสำรวจเพิ่ม', true],
  ['assets', 'สะพานและสวนสาธารณะ', true],
  ['advice', 'ข้อเสนอแนะ', true],
  ['appendix', 'ภาคผนวก: รายชื่อถนนที่ยังไม่ขึ้นทะเบียนทั้งหมด', false],
  ['sign', 'ช่องลงนาม', true],
];
const UNPAVED_RE = /ลูกรัง|หินคลุก|ดิน|กรวด/;
const isUnpaved = (r) => UNPAVED_RE.test(r.surface || '');
const midW = (a, b) => (a != null && b != null ? (a + b) / 2 : a ?? b ?? null);
const areaSqm = (r) => {
  const w = midW(r.surf_w_min, r.surf_w_max);
  return r.length_km != null && w != null ? r.length_km * 1000 * w : null;
};
const thDate = (d = new Date()) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
const pctTxt = (a, b) => (b ? fmt((a / b) * 100, 1) + '%' : '–');

function reportPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('rcrnis_report') || '{}'); } catch {}
  const sec = {};
  for (const [k, , def] of REPORT_SECTIONS) sec[k] = p.sec?.[k] ?? def;
  return {
    community: '', sec, thaiDigits: !!p.thaiDigits,
    preparer: p.preparer ?? S.me?.name ?? '', position: p.position ?? '', unit: p.unit ?? 'ฝ่ายสาธารณูปโภค ส่วนการโยธา สำนักช่าง',
    note: '',
  };
}
function saveReportPrefs(o) {
  try { localStorage.setItem('rcrnis_report', JSON.stringify({ sec: o.sec, thaiDigits: o.thaiDigits, preparer: o.preparer, position: o.position, unit: o.unit })); } catch {}
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
  const scope = comm ? `ชุมชน${comm.name}` : `ในเขตเทศบาลนครระยอง (${S.communities.length} ชุมชน)`;
  const byComm = (rows) => {
    const m = new Map();
    for (const r of rows) m.set(r.community_id, (m.get(r.community_id) || []).concat(r));
    return [...m.entries()].map(([id, rs]) => ({ name: commName(id), rows: rs })).sort((a, b) => b.rows.length - a.rows.length);
  };
  let secNo = 0;
  const H = (t) => `<h2 class="rp-h2">${++secNo}. ${t}</h2>`;
  const parts = [];

  parts.push(`
    <header class="rp-head">
      <img src="/icons/icon-192.png" alt="" class="rp-logo">
      <div class="rp-org">เทศบาลนครระยอง<br><span>${esc(o.unit)}</span></div>
      <h1 class="rp-title">รายงานสรุปข้อมูลโครงข่ายถนน${comm ? '' : 'ในเขตเทศบาลนครระยอง'}</h1>
      <div class="rp-sub">${comm ? `ชุมชน${esc(comm.name)} · ` : ''}เพื่อประกอบการพิจารณาของผู้บริหารและการจัดทำแผนพัฒนาถนน</div>
      <div class="rp-meta">ข้อมูล ณ วันที่ ${thDate()} · ที่มา: ระบบสารสนเทศภูมิศาสตร์ข้อมูลโครงข่ายถนน (RCRNIS)</div>
    </header>`);

  if (o.sec.summary) {
    const topUnreg = byComm(unreg).slice(0, 3);
    const topUnpaved = byComm(unpaved).slice(0, 3);
    const lenPct = R.length ? (withLen.length / R.length) * 100 : 0;
    const findings = [
      `ถนน${scope} มีทั้งหมด <b>${fmt(R.length)}</b> สายทาง เป็นถนนสาธารณะ <b>${fmt(PUB.length)}</b> สาย ส่วนบุคคล ${fmt(R.filter((r) => landGroup(r.land_type) === 'ส่วนบุคคล').length)} สาย ที่ราชพัสดุ ${fmt(R.filter((r) => landGroup(r.land_type) === 'ราชพัสดุ').length)} สาย และที่วัด ${fmt(R.filter((r) => landGroup(r.land_type) === 'ที่วัด').length)} สาย`,
      `ถนนสาธารณะขึ้นทะเบียนทางแล้ว <b>${fmt(reg.length)}</b> สาย (${pctTxt(reg.length, PUB.length)}) ยังไม่ขึ้นทะเบียน <b>${fmt(unreg.length)}</b> สาย${topUnreg.length ? ` โดยชุมชนที่ยังไม่ขึ้นทะเบียนมากที่สุด ได้แก่ ${topUnreg.map((c) => `${esc(c.name)} (${c.rows.length} สาย)`).join(', ')}` : ''}`,
      `ถนนสาธารณะผิวไม่ถาวร (ลูกรัง/หินคลุก) <b>${fmt(unpaved.length)}</b> สาย${topUnpaved.length ? ` พบมากใน ${topUnpaved.map((c) => `${esc(c.name)} (${c.rows.length} สาย)`).join(', ')}` : ''}`,
      `ระยะทางรวมที่มีข้อมูล ${fmt(km, 2)} กม. จาก ${fmt(withLen.length)} สาย (${fmt(lenPct, 0)}% ของถนนทั้งหมด) จึงยังไม่ใช่ระยะทางรวมทั้งหมดของโครงข่ายถนน`,
    ];
    if (check.length) findings.push(`พบรหัสทะเบียนทางในถนนที่ไม่ใช่ถนนสาธารณะ ${fmt(check.length)} สาย ควรตรวจสอบประเภทที่ดินหรือรหัสทะเบียน`);
    parts.push(`<section>${H('สรุปสำหรับผู้บริหาร')}
      <table class="rp-kpi"><tr>
        <td><div class="v">${fmt(R.length)}</div><div class="l">ถนนทั้งหมด (สาย)</div></td>
        <td><div class="v">${fmt(PUB.length)}</div><div class="l">ถนนสาธารณะ (สาย)</div></td>
        <td><div class="v">${fmt(reg.length)}</div><div class="l">ขึ้นทะเบียนแล้ว (${pctTxt(reg.length, PUB.length)})</div></td>
        <td><div class="v">${fmt(unpaved.length)}</div><div class="l">ถนนสาธารณะผิวไม่ถาวร</div></td>
        ${comm ? '' : `<td><div class="v">${fmt(S.bridges.filter((b) => !b.is_deleted).length)}</div><div class="l">สะพาน (แห่ง)</div></td>`}
      </tr></table>
      <ol class="rp-list">${findings.map((f) => `<li>${f}</li>`).join('')}</ol></section>`);
  }

  if (o.sec.stats) {
    const lands = [...LAND_GROUPS, ...new Set(R.map((r) => landGroup(r.land_type)).filter((g) => !LAND_GROUPS.includes(g)))]
      .filter((l) => R.some((r) => landGroup(r.land_type) === l));
    const cell = (l, g) => R.filter((r) => landGroup(r.land_type) === l && surfGroup(r.surface) === g).length;
    parts.push(`<section>${H('จำนวนสายทาง จำแนกตามประเภทที่ดินและผิวจราจร')}
      <table class="rp-t rp-keep"><thead><tr><th>ประเภทที่ดิน</th>${SURF_GROUPS.map((g) => `<th class="n">${g.key === 'คสล.' ? 'คอนกรีต' : g.key === 'แอสฟัลท์' ? 'แอสฟัลท์ติก' : g.key}</th>`).join('')}<th class="n">รวม</th><th class="n">ร้อยละ</th></tr></thead>
      <tbody>${lands.map((l) => { const t = R.filter((r) => landGroup(r.land_type) === l).length; return `<tr><td>${esc(l)}</td>${SURF_GROUPS.map((g) => `<td class="n">${cell(l, g.key) || '–'}</td>`).join('')}<td class="n"><b>${t}</b></td><td class="n">${pctTxt(t, R.length)}</td></tr>`; }).join('')}</tbody>
      <tbody class="rp-total"><tr><td>รวม</td>${SURF_GROUPS.map((g) => `<td class="n">${R.filter((r) => surfGroup(r.surface) === g.key).length}</td>`).join('')}<td class="n">${R.length}</td><td class="n">100%</td></tr></tbody></table>
      <p class="rp-note">หมายเหตุ: "อื่นๆ" ได้แก่ แสตมป์พิมพ์ลาย หินคลุก ตัวหนอน และผิวผสม</p></section>`);
  }

  if (o.sec.community && !comm) {
    const rows = S.communities.map((c) => {
      const rs = R.filter((r) => r.community_id === c.id);
      const p = rs.filter(isPublic);
      return { c, n: rs.length, p: p.length, reg: p.filter((r) => r.reg_code).length, unp: p.filter(isUnpaved).length, km: sumKm(rs) };
    });
    parts.push(`<section>${H('สรุปข้อมูลถนนรายชุมชน')}
      <table class="rp-t"><thead><tr><th class="n">ที่</th><th>ชุมชน</th><th class="n">ถนนทั้งหมด</th><th class="n">ถนนสาธารณะ</th><th class="n">ขึ้นทะเบียนแล้ว</th><th class="n">ยังไม่ขึ้น</th><th class="n">ผิวไม่ถาวร</th><th class="n">ระยะทาง (กม.)*</th></tr></thead>
      <tbody>${rows.map((x, i) => `<tr><td class="n">${i + 1}</td><td>${esc(x.c.name)}</td><td class="n">${x.n}</td><td class="n">${x.p || '–'}</td><td class="n">${x.reg || '–'}</td><td class="n">${x.p - x.reg || '–'}</td><td class="n">${x.unp || '–'}</td><td class="n">${x.km ? fmt(x.km, 2) : '–'}</td></tr>`).join('')}</tbody>
      <tbody class="rp-total"><tr><td></td><td>รวม</td><td class="n">${R.length}</td><td class="n">${PUB.length}</td><td class="n">${reg.length}</td><td class="n">${unreg.length}</td><td class="n">${unpaved.length}</td><td class="n">${fmt(km, 2)}</td></tr></tbody></table>
      <p class="rp-note">* รวมเฉพาะสายทางที่มีข้อมูลระยะทาง</p></section>`);
  }

  if (o.sec.unpaved) {
    const known = unpaved.filter((r) => areaSqm(r) != null);
    const area = known.reduce((a, r) => a + areaSqm(r), 0);
    parts.push(`<section>${H('ถนนสาธารณะผิวไม่ถาวร ที่ควรพิจารณาปรับปรุงผิวทาง')}
      <p>ถนนสาธารณะที่ผิวจราจรเป็นลูกรังหรือหินคลุก จำนวน <b>${fmt(unpaved.length)}</b> สาย ใช้เป็นข้อมูลตั้งต้นในการคัดเลือกโครงการปรับปรุงเป็นผิวคอนกรีตเสริมเหล็กหรือแอสฟัลท์ติกคอนกรีต</p>
      ${unpaved.length ? `<table class="rp-t rp-fixed"><colgroup><col style="width:6%"><col style="width:24%"><col style="width:15%"><col style="width:11%"><col style="width:9%"><col style="width:10%"><col style="width:12%"><col style="width:13%"></colgroup><thead><tr><th class="n">ที่</th><th>ชื่อถนน</th><th>ชุมชน</th><th>ผิวปัจจุบัน</th><th class="n">ยาว (ม.)</th><th class="n">กว้างผิว (ม.)</th><th class="n">พื้นที่โดยประมาณ (ตร.ม.)</th><th>ทะเบียนทาง</th></tr></thead>
      <tbody>${unpaved.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r.name)}</td><td>${esc(commName(r.community_id))}</td><td>${esc(r.surface)}</td>
        <td class="n">${r.length_km != null ? fmt(r.length_km * 1000, 0) : '<i>สำรวจ</i>'}</td><td class="n">${fmtRange(r.surf_w_min, r.surf_w_max) || '<i>สำรวจ</i>'}</td>
        <td class="n">${areaSqm(r) != null ? fmt(areaSqm(r), 0) : '–'}</td><td>${r.reg_code ? esc(r.reg_code) : 'ยังไม่ขึ้น'}</td></tr>`).join('')}</tbody>
      <tbody class="rp-total"><tr><td></td><td colspan="5">รวมพื้นที่ที่คำนวณได้ (${known.length} จาก ${unpaved.length} สาย)</td><td class="n">${fmt(area, 0)}</td><td></td></tr></tbody></table>
      <p class="rp-note">พื้นที่โดยประมาณ = ความยาว × ความกว้างผิวจราจรเฉลี่ย ใช้สำหรับประมาณการเบื้องต้นเท่านั้น สายทางที่ระบุ "สำรวจ" ยังไม่มีข้อมูลขนาด ต้องสำรวจก่อนประมาณราคา</p>` : '<p>– ไม่พบ –</p>'}</section>`);
  }

  if (o.sec.unregistered) {
    const g = byComm(unreg);
    parts.push(`<section>${H('ถนนสาธารณะที่ยังไม่ขึ้นทะเบียนทาง')}
      <p>ถนนสาธารณะยังไม่ขึ้นทะเบียนทาง <b>${fmt(unreg.length)}</b> สาย จากถนนสาธารณะทั้งหมด ${fmt(PUB.length)} สาย (${pctTxt(unreg.length, PUB.length)}) ควรจัดทำทะเบียนทางให้ครบถ้วน เพื่อใช้ประกอบการขอรับงบประมาณและการบำรุงรักษา</p>
      ${g.length ? `<table class="rp-t"><thead><tr><th class="n">ที่</th><th>ชุมชน</th><th class="n">จำนวน (สาย)</th><th class="n">ร้อยละของถนนสาธารณะในชุมชน</th><th class="n">ผิวไม่ถาวร</th></tr></thead>
      <tbody>${g.map((c, i) => { const p = PUB.filter((r) => commName(r.community_id) === c.name).length; return `<tr><td class="n">${i + 1}</td><td>${esc(c.name)}</td><td class="n">${c.rows.length}</td><td class="n">${pctTxt(c.rows.length, p)}</td><td class="n">${c.rows.filter(isUnpaved).length || '–'}</td></tr>`; }).join('')}</tbody></table>` : ''}
      ${o.sec.appendix ? '<p class="rp-note">รายชื่อทั้งหมดอยู่ในภาคผนวก</p>' : ''}</section>`);
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
    parts.push(`<section>${H('ข้อมูลที่ต้องสำรวจเพิ่มเติม (ถนนสาธารณะ)')}
      <table class="rp-t rp-keep"><thead><tr><th>รายการข้อมูล</th><th class="n">มีข้อมูล (สาย)</th><th class="n">ยังไม่มี (สาย)</th><th class="n">ความครบถ้วน</th></tr></thead>
      <tbody>${items.map(([l, f]) => { const n = PUB.filter(f).length; return `<tr><td>${l}</td><td class="n">${n}</td><td class="n">${PUB.length - n}</td><td class="n">${pctTxt(n, PUB.length)}</td></tr>`; }).join('')}</tbody></table>
      <p class="rp-note">ข้อมูลระยะทางและความกว้างจำเป็นต่อการประมาณราคาโครงการ ข้อมูลระบบระบายน้ำและโคมไฟใช้ประกอบแผนป้องกันน้ำท่วมและแผนไฟฟ้าส่องสว่าง</p></section>`);
  }

  if (o.sec.assets && !comm) {
    const B = S.bridges.filter((b) => !b.is_deleted), P = S.parks.filter((p) => !p.is_deleted);
    const types = [...new Set(B.map((b) => b.bridge_type || 'ไม่ระบุ'))];
    parts.push(`<section>${H('สะพานและสวนสาธารณะ')}
      <table class="rp-t rp-keep"><thead><tr><th>รายการ</th><th class="n">จำนวน</th><th>รายละเอียด</th></tr></thead><tbody>
        <tr><td>สะพาน</td><td class="n">${B.length} แห่ง</td><td>ความยาวรวม ${fmt(B.reduce((a, b) => a + (b.length_m || 0), 0), 1)} ม. · ${types.map((t) => `${esc(t)} ${B.filter((b) => (b.bridge_type || 'ไม่ระบุ') === t).length} แห่ง`).join(', ')}</td></tr>
        <tr><td>สวนสาธารณะ</td><td class="n">${P.length} แห่ง</td><td>พื้นที่รวม ${fmt(P.reduce((a, p) => a + (p.area_sqm || 0), 0), 0)} ตร.ม. (${fmt(P.reduce((a, p) => a + (p.area_sqm || 0), 0) / 1600, 1)} ไร่)</td></tr>
      </tbody></table></section>`);
  }

  if (o.sec.advice) {
    const auto = [];
    if (unreg.length) auto.push(`จัดทำทะเบียนทางสำหรับถนนสาธารณะที่ยังไม่ขึ้นทะเบียน ${fmt(unreg.length)} สาย${byComm(unreg)[0] ? ` โดยเริ่มจากชุมชนที่มีจำนวนมาก เช่น ${esc(byComm(unreg)[0].name)}` : ''}`);
    if (unpaved.length) auto.push(`พิจารณาบรรจุโครงการปรับปรุงถนนสาธารณะผิวไม่ถาวร ${fmt(unpaved.length)} สาย ในแผนพัฒนาท้องถิ่น โดยสำรวจขนาดสายทางที่ยังไม่มีข้อมูลก่อนประมาณราคา`);
    const lenGap = PUB.filter((r) => r.length_km == null).length;
    if (lenGap) auto.push(`สำรวจและบันทึกระยะทาง/ความกว้างของถนนสาธารณะที่ยังไม่มีข้อมูล ${fmt(lenGap)} สาย เพื่อให้ประมาณการงบประมาณได้ครบถ้วน`);
    if (check.length) auto.push(`ตรวจสอบถนน ${fmt(check.length)} สาย ที่มีรหัสทะเบียนแต่ประเภทที่ดินไม่ใช่สาธารณะ`);
    parts.push(`<section>${H('ข้อเสนอแนะ')}
      <ol class="rp-list">${auto.map((a) => `<li>${a}</li>`).join('')}${o.note.trim() ? o.note.trim().split('\n').filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join('') : ''}</ol></section>`);
  }

  if (o.sec.sign) {
    const box = (role, name = '', pos = '') => `<div class="rp-sign"><div>ลงชื่อ ........................................</div>
      <div>( ${name ? esc(name) : '........................................'} )</div><div>${pos ? esc(pos) : '........................................'}</div><div class="r">${role}</div></div>`;
    parts.push(`<section class="rp-signs">${box('ผู้จัดทำ', o.preparer, o.position)}${box('ผู้ตรวจสอบ')}${box('ผู้บริหาร / ผู้อนุมัติ')}</section>`);
  }

  if (o.sec.appendix && unreg.length) {
    parts.push(`<section class="rp-appendix"><h2 class="rp-h2">ภาคผนวก: รายชื่อถนนสาธารณะที่ยังไม่ขึ้นทะเบียนทาง (${fmt(unreg.length)} สาย)</h2>
      <table class="rp-t rp-small rp-fixed"><colgroup><col style="width:6%"><col style="width:28%"><col style="width:17%"><col style="width:13%"><col style="width:9%"><col style="width:10%"><col style="width:17%"></colgroup><thead><tr><th class="n">ที่</th><th>ชื่อถนน</th><th>ชุมชน</th><th>ผิวจราจร</th><th class="n">ยาว (ม.)</th><th class="n">กว้างผิว (ม.)</th><th>พิกัด</th></tr></thead>
      <tbody>${unreg.slice().sort((a, b) => (a.community_id - b.community_id) || (a.seq - b.seq)).map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r.name)}</td><td>${esc(commName(r.community_id))}</td><td>${esc(r.surface)}</td>
        <td class="n">${r.length_km != null ? fmt(r.length_km * 1000, 0) : '–'}</td><td class="n">${fmtRange(r.surf_w_min, r.surf_w_max) || '–'}</td><td>${r.lat ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : '–'}</td></tr>`).join('')}</tbody></table></section>`);
  }

  return parts.join('');
}

// แปลงตัวเลขอารบิกเป็นเลขไทย เฉพาะข้อความ (ไม่แตะ attribute/ลิงก์)
function toThaiDigits(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const map = '๐๑๒๓๔๕๖๗๘๙';
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeValue = n.nodeValue.replace(/\d/g, (d) => map[d]);
}

// ---------------------------------------------------------------- หน้าจอรายงาน
function openReport() {
  const o = reportPrefs();
  let v = $('#report-view');
  if (!v) { v = document.createElement('div'); v.id = 'report-view'; document.body.append(v); }
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
        <div class="field"><label>หน่วยงานผู้จัดทำ</label><input name="unit" value="${esc(o.unit)}"></div>
        <div class="field"><label>ชื่อผู้จัดทำ</label><input name="preparer" value="${esc(o.preparer)}"></div>
        <div class="field"><label>ตำแหน่ง</label><input name="position" value="${esc(o.position)}" placeholder="เช่น นายช่างโยธาชำนาญงาน"></div>
        <fieldset class="rp-secs"><legend>หัวข้อในรายงาน</legend>${REPORT_SECTIONS.map(([k, l]) => `<label><input type="checkbox" name="sec_${k}" ${o.sec[k] ? 'checked' : ''}> ${l}</label>`).join('')}
          <label><input type="checkbox" name="thaiDigits" ${o.thaiDigits ? 'checked' : ''}> ใช้เลขไทย</label></fieldset>
        <div class="field wide"><label>ข้อเสนอแนะเพิ่มเติม (บรรทัดละ 1 ข้อ ต่อท้ายข้อเสนอแนะที่ระบบสรุปให้)</label><textarea name="note" rows="2"></textarea></div>
      </form>
    </div>
    <div class="rp-stage"><article class="rp-paper" id="rp-paper"></article></div>`;
  document.body.classList.add('rp-open');
  history.pushState({ report: true }, '');

  const form = $('#rp-opts', v);
  const read = () => {
    const f = new FormData(form);
    o.community = f.get('community') || '';
    o.unit = f.get('unit') || ''; o.preparer = f.get('preparer') || ''; o.position = f.get('position') || '';
    o.note = f.get('note') || ''; o.thaiDigits = f.get('thaiDigits') === 'on';
    for (const [k] of REPORT_SECTIONS) o.sec[k] = f.get('sec_' + k) === 'on';
  };
  const render = () => {
    read();
    const paper = $('#rp-paper', v);
    paper.innerHTML = buildReport(o);
    if (o.thaiDigits) toThaiDigits(paper);
    fitPaper();
    saveReportPrefs(o);
  };
  // ย่อกระดาษ A4 ให้พอดีจอ (มือถือ/แท็บเล็ต) ตอนดูตัวอย่าง
  const fitPaper = () => {
    const paper = $('#rp-paper', v);
    const avail = $('.rp-stage', v).clientWidth - 16;
    paper.style.zoom = avail < 794 ? String(Math.max(avail / 794, 0.3)) : '';
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
