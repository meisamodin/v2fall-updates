"""V2D1 patches for small Android updates.
make:  v2delta.py make old.apk new.apk out.v2d   (unchanged zip entries are copied from old.apk)
apply: v2delta.py apply old.apk patch.v2d out.apk
Format (gzip): b'V2D1', then ops: 'C' u64 offset u32 length (copy from old) | 'D' u32 length bytes | 'E'."""
import sys, zipfile, hashlib, struct, gzip


def entries(path):
    """(offset, length) of every entry's stored data in the zip, in file order."""
    z = zipfile.ZipFile(path)
    f = open(path, 'rb')
    out = []
    for i in z.infolist():
        f.seek(i.header_offset)
        h = f.read(30)
        n, e = struct.unpack('<HH', h[26:30])
        out.append((i.header_offset + 30 + n + e, i.compress_size))
    return sorted(out)


def make(old, new, dst):
    ob, nb = open(old, 'rb').read(), open(new, 'rb').read()
    idx = {}
    for off, ln in entries(old):
        if ln >= 512:
            idx.setdefault((ln, hashlib.sha256(ob[off:off + ln]).digest()), off)
    lit, cur, ops = bytearray(), 0, []

    def flush():
        if lit:
            ops.append(b'D' + struct.pack('>I', len(lit)) + bytes(lit))
            lit.clear()

    copied = 0
    for off, ln in entries(new):
        if off < cur:
            continue
        k = (ln, hashlib.sha256(nb[off:off + ln]).digest()) if ln >= 512 else None
        if k not in idx:
            continue
        lit += nb[cur:off]
        flush()
        ops.append(b'C' + struct.pack('>QI', idx[k], ln))
        copied += ln
        cur = off + ln
    lit += nb[cur:]
    flush()
    ops.append(b'E')
    data = gzip.compress(b'V2D1' + b''.join(ops), 9, mtime=0)
    open(dst, 'wb').write(data)
    return len(data), copied, len(nb)


def apply(old, patch, dst):
    ob = open(old, 'rb').read()
    p = gzip.decompress(open(patch, 'rb').read())
    assert p[:4] == b'V2D1'
    i, out = 4, bytearray()
    while True:
        op = p[i:i + 1]; i += 1
        if op == b'C':
            o, n = struct.unpack('>QI', p[i:i + 12]); i += 12
            out += ob[o:o + n]
        elif op == b'D':
            n, = struct.unpack('>I', p[i:i + 4]); i += 4
            out += p[i:i + n]; i += n
        elif op == b'E':
            break
        else:
            raise ValueError('bad op')
    open(dst, 'wb').write(out)


if __name__ == '__main__':
    if sys.argv[1] == 'make':
        print(make(*sys.argv[2:5]))
    else:
        apply(*sys.argv[2:5])
