"""สร้างไอคอนแอป (PWA) จากโลโก้ถนน  ใช้: python3 scripts/make_icons.py"""
from PIL import Image, ImageDraw

TEAL, DARK, WHITE, YELLOW = (15, 94, 110), (11, 71, 82), (255, 255, 255), (255, 209, 102)

def logo(size, maskable=False):
    S = size * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, S, S], fill=TEAL)
        pad = S * 0.18           # เนื้อหาอยู่ใน safe zone
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=TEAL)
        pad = S * 0.08
    u = (S - 2 * pad) / 32       # พิกัดโลโก้เดิม 32x32
    P = lambda x, y: (pad + x * u, pad + y * u)
    w = int(2.6 * u)
    d.line([P(12, 4), P(9, 28)], fill=WHITE, width=w)
    d.line([P(20, 4), P(23, 28)], fill=WHITE, width=w)
    for y in (6, 14, 22):
        d.line([P(16, y), P(16, y + 4)], fill=YELLOW, width=w)
    return im.resize((size, size), Image.LANCZOS)

out = "public/icons"
for s in (192, 512):
    logo(s).save(f"{out}/icon-{s}.png")
logo(512, maskable=True).save(f"{out}/maskable-512.png")
logo(180, maskable=True).convert("RGB").save(f"{out}/apple-touch-icon.png")
logo(32).save(f"{out}/favicon-32.png")
print("ok")
