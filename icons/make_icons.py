"""Generate the graphite, sage, and cool-blue Arc90 app icon."""
import math
import os
import struct
import zlib


def write_png(path, width, height, get_pixel):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(get_pixel(x, y))

    def chunk(tag, data):
        body = struct.pack('>I', len(data)) + tag + data
        return body + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as output:
        output.write(png)


BACKGROUND = (17, 19, 21)
TRACK = (37, 41, 45)
SAGE = (179, 223, 189)
WHITE = (242, 244, 246)
BLUE = (154, 201, 237)


def clamp(value):
    return max(0.0, min(1.0, value))


def blend(base, overlay, amount):
    amount = clamp(amount)
    return tuple(int(base[i] + (overlay[i] - base[i]) * amount) for i in range(3))


def rounded_box_distance(px, py, cx, cy, half_size, radius):
    qx = abs(px - cx) - (half_size - radius)
    qy = abs(py - cy) - (half_size - radius)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - radius


def icon_pixel(size):
    center = size / 2.0
    ring_radius = size * 0.330
    ring_width = size * 0.094
    half_width = ring_width / 2.0
    core_radius = size * 0.053
    marker_half = size * 0.046
    marker_radius = size * 0.027
    marker_angle = math.radians(-45)
    marker_x = center + ring_radius * math.cos(marker_angle)
    marker_y = center + ring_radius * math.sin(marker_angle)
    end_points = [
        (center + ring_radius * math.cos(math.radians(-45)), center + ring_radius * math.sin(math.radians(-45))),
        (center + ring_radius * math.cos(math.radians(45)), center + ring_radius * math.sin(math.radians(45))),
    ]

    def pixel(x, y):
        px, py = x + 0.5, y + 0.5
        distance = math.hypot(px - center, py - center)
        ring_coverage = clamp(0.5 - (abs(distance - ring_radius) - half_width))
        color = blend(BACKGROUND, TRACK, ring_coverage)

        angle = math.degrees(math.atan2(py - center, px - center))
        arc_coverage = ring_coverage if abs(angle) >= 45 else 0.0
        for end_x, end_y in end_points:
            end_coverage = clamp(0.5 - (math.hypot(px - end_x, py - end_y) - half_width))
            arc_coverage = max(arc_coverage, end_coverage)
        color = blend(color, SAGE, arc_coverage)

        marker_distance = rounded_box_distance(
            px, py, marker_x, marker_y, marker_half, marker_radius
        )
        color = blend(color, WHITE, clamp(0.5 - marker_distance))
        color = blend(color, BLUE, clamp(0.5 - (distance - core_radius)))
        return bytes(color)

    return pixel


here = os.path.dirname(os.path.abspath(__file__))
outputs = [
    (180, os.path.join(here, 'icon-180.png')),
    (192, os.path.join(here, 'icon-192.png')),
    (512, os.path.join(here, 'icon-512.png')),
    (1024, os.path.join(here, '..', 'ios', 'App', 'App', 'Assets.xcassets',
                        'AppIcon.appiconset', 'AppIcon-512@2x.png')),
]

for size, path in outputs:
    write_png(path, size, size, icon_pixel(size))
    print('wrote', os.path.relpath(path, here))
