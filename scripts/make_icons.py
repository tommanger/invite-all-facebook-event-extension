"""Generates icons/icon{16,32,48,128}.png (gradient rounded square with a white +). No dependencies."""
import struct, zlib, os

A, B = (0x6d, 0x4a, 0xff), (0xe8, 0x45, 0x7c)
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')

def inside_rounded(x, y, r):  # unit square, corner radius r
    cx = min(max(x, r), 1 - r); cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def inside_plus(x, y, arm=0.30, w=0.075):
    return (abs(x - .5) <= w and abs(y - .5) <= arm) or (abs(y - .5) <= w and abs(x - .5) <= arm)

def pixel(px, py, n, ss=4):
    acc = [0, 0, 0, 0]
    for i in range(ss):
        for j in range(ss):
            x = (px + (i + .5) / ss) / n; y = (py + (j + .5) / ss) / n
            if not inside_rounded(x, y, .22): continue
            if inside_plus(x, y): c = (255, 255, 255)
            else:
                t = (x + y) / 2
                c = tuple(round(a + (b - a) * t) for a, b in zip(A, B))
            for k in range(3): acc[k] += c[k]
            acc[3] += 255
    hits = acc[3] / 255
    if not hits: return (0, 0, 0, 0)
    return (round(acc[0] / hits), round(acc[1] / hits), round(acc[2] / hits), round(acc[3] / ss / ss))

def png(n):
    raw = b''.join(b'\0' + b''.join(bytes(pixel(x, y, n)) for x in range(n)) for y in range(n))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

for n in (16, 32, 48, 128):
    with open(os.path.join(OUT, f'icon{n}.png'), 'wb') as f: f.write(png(n))
print('ok')
