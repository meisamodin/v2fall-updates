"""Adapter for tools/publish_all.py: zipalign / sign / vcode on top of apksign_core.build (v1 + v2, 4-byte alignment)."""
import sys, os, shutil, zipfile, struct, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apksign_core as core

def zipalign(src, dst):  # build() writes an aligned zip itself
    shutil.copy(src, dst)

def sign(src, dst, keyf, certf):
    # the same re-compression as 18.9.48 (deterministic): unchanged files come out byte-identical to the
    # installed APK, so small updates stay small. Do not switch signers between releases.
    with tempfile.TemporaryDirectory() as t:
        h = os.path.join(t, 'index.html')
        open(h, 'wb').write(zipfile.ZipFile(src).read('assets/index.html'))
        core.build(src, h, keyf, certf, dst)
    assert core.verify_v2(dst), 'v2 verify failed'

def vcode(apk):
    d = zipfile.ZipFile(apk).read('AndroidManifest.xml'); i = 8; rm = []
    while i < len(d):
        t, h, sz = struct.unpack('<HHI', d[i:i+8])
        if t == 0x0180: rm = list(struct.unpack('<%dI' % ((sz-8)//4), d[i+8:i+sz]))
        if t == 0x0102:
            ac = struct.unpack('<H', d[i+28:i+30])[0]; ai = i+36
            for k in range(ac):
                ns, name, raw, s2, _, dt, val = struct.unpack('<IIIHBBI', d[ai+k*20:ai+k*20+20])
                if name < len(rm) and rm[name] == 0x0101021b: return val
        i += sz
    return 0

if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'sign': sign(*sys.argv[2:6])
    elif c == 'vcode': print('vcode', vcode(sys.argv[2]))
    elif c == 'verify': sys.exit(0 if core.verify_v2(sys.argv[2]) else 1)
