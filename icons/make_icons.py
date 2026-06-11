"""Generate Arc90 app icons (pure stdlib PNG writer, no Pillow needed).
Obsidian mark: cobalt→violet→magenta gradient arc on near-black, with a soft inner glow."""
import struct, zlib, math, os

def write_png(path, w, h, get_px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter: none
        for x in range(w):
            raw.extend(get_px(x, y))
    def chunk(tag, data):
        out = struct.pack('>I', len(data)) + tag + data
        return out + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

COBALT  = (62, 109, 240)    # #3E6DF0
VIOLET  = (139, 92, 246)    # #8B5CF6
MAGENTA = (217, 70, 239)    # #D946EF
TRACK   = (32, 36, 48)
WHITE   = (244, 246, 252)

def grad3(t):
    """cobalt -> violet -> magenta along t in [0,1]"""
    if t < 0.5:
        return lerp(COBALT, VIOLET, t / 0.5)
    return lerp(VIOLET, MAGENTA, (t - 0.5) / 0.5)

def icon_px(size):
    cx, cy = size / 2, size / 2
    ring_r = size * 0.31
    ring_w = size * 0.092
    def px(x, y):
        # obsidian background: near-black with a subtle cool top-light + vignette
        ny = y / size
        base = lerp((16, 19, 28), (7, 8, 12), ny)
        d = math.hypot(x - cx, y - cy)
        # inner glow behind the arc (violet)
        glow = max(0.0, 1.0 - abs(d - ring_r) / (size * 0.34))
        gcol = grad3((math.degrees(math.atan2(y - cy, x - cx)) + 180) / 360)
        r = base[0] + gcol[0] * 0.16 * glow * glow
        g = base[1] + gcol[1] * 0.16 * glow * glow
        b = base[2] + gcol[2] * 0.16 * glow * glow
        # the gradient arc (300deg sweep, like the progress ring)
        on_ring = abs(d - ring_r) <= ring_w / 2
        if on_ring:
            edge = 1.0 - max(0.0, (abs(d - ring_r) - (ring_w / 2 - 1.6)) / 1.6)
            edge = max(0.0, min(1.0, edge))
            ang = (math.degrees(math.atan2(y - cy, x - cx)) + 90) % 360
            if ang <= 300:
                col = grad3(ang / 300)
            else:
                col = TRACK
            r += (col[0] - r) * edge
            g += (col[1] - g) * edge
            b += (col[2] - b) * edge
        # bright tip dot at arc end
        tip = math.radians(300 - 90)
        tx, ty = cx + ring_r * math.cos(tip), cy + ring_r * math.sin(tip)
        dd = math.hypot(x - tx, y - ty)
        if dd < ring_w * 0.6:
            k = 1.0 if dd < ring_w * 0.42 else 0.55
            r += (WHITE[0] - r) * k
            g += (WHITE[1] - g) * k
            b += (WHITE[2] - b) * k
        return bytes((max(0, min(255, int(r))), max(0, min(255, int(g))), max(0, min(255, int(b))), 255))
    return px

here = os.path.dirname(os.path.abspath(__file__))
for size, name in [(180, 'icon-180.png'), (512, 'icon-512.png')]:
    write_png(os.path.join(here, name), size, size, icon_px(size))
    print('wrote', name)
