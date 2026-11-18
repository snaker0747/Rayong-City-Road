"""
แปลงไฟล์ Excel ทะเบียนถนน -> seed SQL สำหรับ Cloudflare D1
ใช้:  python3 -I scripts/build_from_excel.py <ไฟล์.xlsx> <โฟลเดอร์ผลลัพธ์>

อ่านเฉพาะแท็บต้นฉบับ (รายชื่อถนนใน29ชุมชน, ข้อมูลสะพาน, ข้อมูลสวนสาธารณะ)
แท็บที่กรองย่อยและแท็บสรุป ระบบจะคำนวณให้เองจากข้อมูลหลัก จึงไม่นำเข้า
ไม่แก้ค่าที่น่าสงสัยเอง แต่จะเขียนรายการให้ตรวจไว้ใน data_issues.csv
"""
import csv
import json
import re
import sys

import openpyxl

SRC, OUT = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(SRC, data_only=True)
issues = []
EXTRA_NOTES = {}


def issue(sheet, ref, name, field, value, problem):
    issues.append([sheet, ref, name, field, "" if value is None else str(value), problem])


def clean_text(v):
    if v is None:
        return None
    s = str(v).replace("\xa0", " ").strip()
    s = re.sub(r"\s+", " ", s)
    return s or None


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = clean_text(v)
    if s in (None, "-"):
        return None
    s = s.replace(",", "")
    m = re.match(r"^-?\d+(\.\d+)?", s)
    return float(m.group(0)) if m else None


def width_range(v, sheet, ref, name, field):
    """'4.60-6.00' -> (4.6, 6.0); 4 -> (4, 4); '-' -> (None, None)"""
    if v is None:
        return None, None
    if isinstance(v, (int, float)):
        return float(v), float(v)
    s = clean_text(v)
    if s in (None, "-"):
        return None, None
    m = re.match(r"^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$", s)
    if m:
        a, b = float(m.group(1)), float(m.group(2))
        if a > b:
            issue(sheet, ref, name, field, s, "ค่าต่ำสุดมากกว่าค่าสูงสุด (อาจพิมพ์ผิด) นำเข้าตามเดิม ให้แก้ในระบบ")
        elif b >= 3 * max(a, 0.01) and b >= 10:
            issue(sheet, ref, name, field, s, "ช่วงกว้างผิดปกติ (อาจพิมพ์ผิด) นำเข้าตามเดิม ให้แก้ในระบบ")
        return a, b
    # หลายช่วง เช่น '6.00-7.00/5.00-6.00' -> เก็บต่ำสุด/สูงสุดรวม และจดค่าเดิมไว้ในหมายเหตุ
    parts = re.findall(r"\d+(?:\.\d+)?", s)
    if "/" in s and parts:
        nums = [float(p) for p in parts]
        EXTRA_NOTES.setdefault(ref, []).append(f"{field}: {s}")
        issue(sheet, ref, name, field, s, "มีหลายช่วง เก็บค่าต่ำสุด/สูงสุดรวม และบันทึกค่าเดิมในหมายเหตุ")
        return min(nums), max(nums)
    try:
        f = float(s)
        return f, f
    except ValueError:
        issue(sheet, ref, name, field, s, "อ่านค่าความกว้างไม่ได้")
        return None, None


def norm_code(v, sheet, ref, name):
    s = clean_text(v)
    if not s:
        return None
    m = re.search(r"(\d)\s*-\s*(\d{3,4})$", s)
    if not m:
        issue(sheet, ref, name, "รหัสทะเบียนทาง", s, "รูปแบบรหัสไม่ถูกต้อง")
        return s
    code = f"รย.ถ.{m.group(1)}-{m.group(2).zfill(4)}"
    if code != s:
        issue(sheet, ref, name, "รหัสทะเบียนทาง", s, f"ปรับรูปแบบเป็น {code}")
    return code


def latlng(v, sheet, ref, name):
    s = clean_text(v)
    if not s:
        issue(sheet, ref, name, "พิกัด", v, "ไม่มีพิกัด")
        return None, None
    m = re.match(r"^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$", s)
    if not m:
        issue(sheet, ref, name, "พิกัด", s, "รูปแบบพิกัดไม่ถูกต้อง")
        return None, None
    return float(m.group(1)), float(m.group(2))


def int_or_none(v):
    n = num(v)
    return int(n) if n is not None else None


def q(v):
    """SQL literal"""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(round(v, 6)) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"


# ---------------------------------------------------------------- roads
ws = wb["รายชื่อถนนใน29ชุมชน"]
communities, roads = [], []
current = None
for i, r in enumerate(ws.iter_rows(min_row=4, values_only=True), start=4):
    r = list(r) + [None] * 30
    if r[0] is None and r[2]:
        name = clean_text(r[2])
        name = re.sub(r"^ชุมชน\s*", "", name)
        communities.append(name)
        current = len(communities)
        continue
    if not isinstance(r[0], (int, float)):
        continue
    ref = f"แถว {i}"
    nm = clean_text(r[2])
    if r[2] != nm:
        issue(ws.title, ref, nm, "ชื่อถนน", r[2], "มีช่องว่างเกิน (ตัดออกแล้ว)")
    lat, lng = latlng(r[3], ws.title, ref, nm)
    rw = width_range(r[4], ws.title, ref, nm, "เขตทาง")
    sw = width_range(r[8], ws.title, ref, nm, "กว้างผิวจราจร")
    shl = width_range(r[11], ws.title, ref, nm, "ไหล่ทางซ้าย กว้าง")
    shr = width_range(r[12], ws.title, ref, nm, "ไหล่ทางขวา กว้าง")
    roads.append({
        "community_id": current,
        "seq": int(r[0]),
        "reg_code": norm_code(r[1], ws.title, ref, nm),
        "name": nm,
        "lat": lat, "lng": lng,
        "row_w_min": rw[0], "row_w_max": rw[1],
        "length_km": num(r[5]),
        "land_type": clean_text(r[6]),
        "surface": clean_text(r[7]),
        "surf_w_min": sw[0], "surf_w_max": sw[1],
        "shoulder_type_l": clean_text(r[9]), "shoulder_type_r": clean_text(r[10]),
        "shoulder_w_l_min": shl[0], "shoulder_w_l_max": shl[1],
        "shoulder_w_r_min": shr[0], "shoulder_w_r_max": shr[1],
        "drain_channel_l": clean_text(r[13]), "drain_channel_r": clean_text(r[14]),
        "drain_pipe_l": clean_text(r[15]), "drain_pipe_r": clean_text(r[16]),
        "manhole_l": int_or_none(r[17]), "manhole_r": int_or_none(r[18]),
        "lamp_led": int_or_none(r[19]), "lamp_fluorescent": int_or_none(r[20]),
        "lamp_turtle": int_or_none(r[21]),
        "note": "; ".join(x for x in [clean_text(r[22])] + EXTRA_NOTES.pop(ref, []) if x) or None,
    })

# ชื่อซ้ำในชุมชนเดียวกัน
seen = {}
for rd in roads:
    k = (rd["community_id"], rd["name"])
    if k in seen:
        issue(ws.title, f"ลำดับ {rd['seq']}", rd["name"], "ชื่อถนน", rd["name"],
              f"ชื่อซ้ำกับลำดับ {seen[k]} ในชุมชนเดียวกัน ตรวจว่าเป็นคนละสายหรือซ้ำ")
    seen[k] = rd["seq"]
dup_codes = {}
for rd in roads:
    if rd["reg_code"]:
        dup_codes.setdefault(rd["reg_code"], []).append(rd["seq"])
for c, seqs in dup_codes.items():
    if len(seqs) > 1:
        issue(ws.title, f"ลำดับ {seqs}", "", "รหัสทะเบียนทาง", c, "รหัสซ้ำกันหลายสาย")

# ตรวจแท็บ อื่นๆ5 ที่พบว่าผิด
try:
    w5 = wb["ถนนสาธารณะ.อื่นๆ5"]
    n5 = sum(1 for r in w5.iter_rows(min_row=4, values_only=True) if isinstance(r[0], (int, float)))
    if n5 != 5:
        issue(w5.title, "ทั้งแท็บ", "", "", n5,
              "ชื่อแท็บระบุ 5 สาย แต่มีข้อมูล %d แถว (เป็นสำเนาถนนสาธารณะทั้งหมด) ระบบจะกรองให้เองจากข้อมูลหลัก" % n5)
except KeyError:
    pass

# ---------------------------------------------------------------- bridges
wsb = wb["ข้อมูลสะพาน.26"]
bridges = []
prev = 0
for i, r in enumerate(wsb.iter_rows(values_only=True), start=1):
    r = list(r) + [None] * 10
    if not isinstance(r[0], (int, float)):
        continue
    nm = clean_text(r[1])
    if int(r[0]) != prev + 1:
        issue(wsb.title, f"แถว {i}", nm, "ลำดับ", r[0], f"ลำดับข้ามจาก {prev} ไป {int(r[0])}")
    prev = int(r[0])
    bridges.append({
        "seq": int(r[0]), "name": nm,
        "width_m": num(r[2]), "length_m": num(r[3]), "height_m": num(r[4]),
        "walk_l_m": num(r[5]), "walk_r_m": num(r[6]),
        "bridge_type": clean_text(r[7]),
        "lat": None, "lng": None, "note": None,
    })

# ---------------------------------------------------------------- parks
wsp = wb["ข้อมูลสวนสาธารณะ.4"]
parks = []
for i, r in enumerate(wsp.iter_rows(values_only=True), start=1):
    r = list(r) + [None] * 6
    if not isinstance(r[0], (int, float)):
        continue
    nm = clean_text(r[1])
    lat, lng = latlng(r[2], wsp.title, f"แถว {i}", nm)
    parks.append({"seq": int(r[0]), "name": nm, "lat": lat, "lng": lng,
                  "area_sqm": num(r[3]), "note": clean_text(r[4])})

# ---------------------------------------------------------------- write SQL
def insert(table, rows):
    if not rows:
        return ""
    cols = list(rows[0].keys())
    out = []
    for chunk in range(0, len(rows), 50):
        vals = ",\n".join("(" + ",".join(q(rw[c]) for c in cols) + ")" for rw in rows[chunk:chunk + 50])
        out.append(f"INSERT INTO {table} ({','.join(cols)}) VALUES\n{vals};")
    return "\n".join(out) + "\n"


with open(f"{OUT}/seed.sql", "w", encoding="utf-8") as f:
    f.write("-- ข้อมูลตั้งต้นจากไฟล์ Excel ทะเบียนถนน (สร้างโดย scripts/build_from_excel.py)\n")
    f.write("-- ระหว่างนำเข้าใช้ชื่อ 'นำเข้าจาก Excel' เป็นผู้บันทึก\n")
    f.write(insert("communities", [{"id": i + 1, "name": n, "sort_order": i + 1} for i, n in enumerate(communities)]))
    for rows, t in ((roads, "roads"), (bridges, "bridges"), (parks, "parks")):
        for rw in rows:
            rw["updated_by"] = "นำเข้าจาก Excel"
        f.write(insert(t, rows))

with open(f"{OUT}/data_issues.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["แท็บ", "ตำแหน่ง", "ชื่อ", "ช่อง", "ค่าเดิม", "ปัญหา/การดำเนินการ"])
    w.writerows(issues)

print(json.dumps({"communities": len(communities), "roads": len(roads), "bridges": len(bridges),
                  "parks": len(parks), "issues": len(issues)}, ensure_ascii=False))
