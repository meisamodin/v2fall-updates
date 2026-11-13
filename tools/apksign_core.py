"""Minimal APK re-packer + signer (JAR v1 + APK Signature Scheme v2) and a v2 verifier.
usage:
  apksign.py verify <apk>
  apksign.py build <orig.apk> <new_index.html> <key.pem> <cert.pem> <out.apk>
"""
import sys, struct, hashlib, base64, zipfile, io, subprocess, os, tempfile, zlib
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography import x509

MAGIC = b'APK Sig Block 42'
V2_ID = 0x7109871a
ALG_RSA_PKCS1_SHA256 = 0x0103

def eocd_pos(d):
    i = d.rfind(b'PK\x05\x06')
    assert i >= 0, 'no EOCD'
    return i

def lp(b):  # uint32 length-prefixed
    return struct.pack('<I', len(b)) + b

def read_lp(b, o):
    n = struct.unpack('<I', b[o:o + 4])[0]
    return b[o + 4:o + 4 + n], o + 4 + n

def chunk_digest(sections):
    chunks = []
    for s in sections:
        for i in range(0, len(s), 1 << 20):
            c = s[i:i + (1 << 20)]
            chunks.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(c)) + c).digest())
    return hashlib.sha256(b'\x5a' + struct.pack('<I', len(chunks)) + b''.join(chunks)).digest()

def find_sig_block(d):
    e = eocd_pos(d)
    cd_off = struct.unpack('<I', d[e + 16:e + 20])[0]
    if d[cd_off - 16:cd_off] != MAGIC: return None
    size = struct.unpack('<Q', d[cd_off - 24:cd_off - 16])[0]
    start = cd_off - size - 8
    assert struct.unpack('<Q', d[start:start + 8])[0] == size
    return start, cd_off, e

def verify_v2(path):
    d = open(path, 'rb').read()
    sb = find_sig_block(d)
    if not sb: print('no v2 block'); return False
    start, cd_off, e = sb
    pairs = d[start + 8:cd_off - 24]; o = 0; v2 = None
    while o < len(pairs):
        ln = struct.unpack('<Q', pairs[o:o + 8])[0]; pid = struct.unpack('<I', pairs[o + 8:o + 12])[0]
        if pid == V2_ID: v2 = pairs[o + 12:o + 8 + ln]
        o += 8 + ln
    if v2 is None: print('no v2 pair'); return False
    signers, _ = read_lp(v2, 0)
    signer, _ = read_lp(signers, 0)
    sdata, o2 = read_lp(signer, 0); sigs, o2 = read_lp(signer, o2); pub, _ = read_lp(signer, o2)
    digests, o3 = read_lp(sdata, 0); certs, _ = read_lp(sdata, o3)
    dg, _ = read_lp(digests, 0); alg = struct.unpack('<I', dg[:4])[0]; want, _ = read_lp(dg, 4)
    sg, _ = read_lp(sigs, 0); salg = struct.unpack('<I', sg[:4])[0]; sig, _ = read_lp(sg, 4)
    cert, _ = read_lp(certs, 0)
    if alg != ALG_RSA_PKCS1_SHA256: print('digest alg 0x%x (only RSA-SHA256 checked)' % alg); return None
    key = serialization.load_der_public_key(pub)
    key.verify(sig, sdata, padding.PKCS1v15(), hashes.SHA256())
    eocd = bytearray(d[e:]); struct.pack_into('<I', eocd, 16, start)  # CD offset as if no signing block
    got = chunk_digest([d[:start], d[cd_off:e], bytes(eocd)])
    c = x509.load_der_x509_certificate(cert)
    ok = got == want
    print('v2 signature valid; content digest', 'MATCH' if ok else 'MISMATCH', '| cert:', c.subject.rfc4514_string())
    return ok

def mf_wrap(line):
    b = line.encode(); out = [b[:72]]; b = b[72:]
    while b: out.append(b' ' + b[:71]); b = b[71:]
    return b'\r\n'.join(out) + b'\r\n'

def build(orig, html, keyf, certf, out):
    zin = zipfile.ZipFile(orig)
    entries = []
    for info in zin.infolist():
        if info.filename.startswith('META-INF/') and info.filename.split('/')[-1].split('.')[-1].upper() in ('SF', 'RSA', 'DSA', 'EC', 'MF'):
            continue
        data = open(html, 'rb').read() if info.filename == 'assets/index.html' else zin.read(info.filename)
        entries.append((info.filename, data, info.compress_type))
    # ---- v1 (JAR) ----
    mf = b'Manifest-Version: 1.0\r\nCreated-By: 1.0 (V2Fall signer)\r\n\r\n'
    sf_entries = b''
    for name, data, _ in entries:
        sec = mf_wrap('Name: ' + name) + mf_wrap('SHA-256-Digest: ' + base64.b64encode(hashlib.sha256(data).digest()).decode()) + b'\r\n'
        mf += sec
        sf_entries += mf_wrap('Name: ' + name) + mf_wrap('SHA-256-Digest: ' + base64.b64encode(hashlib.sha256(sec).digest()).decode()) + b'\r\n'
    sf = (b'Signature-Version: 1.0\r\nCreated-By: 1.0 (V2Fall signer)\r\n'
          + mf_wrap('SHA-256-Digest-Manifest: ' + base64.b64encode(hashlib.sha256(mf).digest()).decode())
          + b'X-Android-APK-Signed: 2\r\n\r\n' + sf_entries)
    with tempfile.TemporaryDirectory() as t:
        open(t + '/C.SF', 'wb').write(sf)
        subprocess.check_call(['openssl', 'cms', '-sign', '-binary', '-noattr', '-outform', 'DER', '-md', 'sha256',
                               '-signer', certf, '-inkey', keyf, '-in', t + '/C.SF', '-out', t + '/C.RSA', '-nosmimecap'])
        rsa = open(t + '/C.RSA', 'rb').read()
    entries += [('META-INF/MANIFEST.MF', mf, zipfile.ZIP_DEFLATED), ('META-INF/V2FALL.SF', sf, zipfile.ZIP_DEFLATED), ('META-INF/V2FALL.RSA', rsa, zipfile.ZIP_DEFLATED)]
    # ---- zip with 4-byte alignment of stored entries (zipalign-equivalent) ----
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        for name, data, ct in entries:
            zi = zipfile.ZipInfo(name, date_time=(1981, 1, 1, 1, 1, 2)); zi.compress_type = ct; zi.create_system = 0
            if ct == zipfile.ZIP_STORED:
                off = buf.tell() + 30 + len(name.encode())
                pad = (4 - (off + 6) % 4) % 4   # 0xD935 extra: id, size, alignment(u16) + zero padding
                zi.extra = struct.pack('<HHH', 0xD935, 2 + pad, 4) + b'\0' * pad
            z.writestr(zi, data)
    d = buf.getvalue()
    # ---- v2 block ----
    e = eocd_pos(d); cd_off = struct.unpack('<I', d[e + 16:e + 20])[0]
    digest = chunk_digest([d[:cd_off], d[cd_off:e], d[e:]])
    key = serialization.load_pem_private_key(open(keyf, 'rb').read(), None)
    cert_der = x509.load_pem_x509_certificate(open(certf, 'rb').read()).public_bytes(serialization.Encoding.DER)
    pub_der = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signed = lp(lp(struct.pack('<I', ALG_RSA_PKCS1_SHA256) + lp(digest))) + lp(lp(cert_der)) + lp(b'')
    sig = key.sign(signed, padding.PKCS1v15(), hashes.SHA256())
    signer = lp(signed) + lp(lp(struct.pack('<I', ALG_RSA_PKCS1_SHA256) + lp(sig))) + lp(pub_der)
    v2 = lp(lp(signer))
    pair = struct.pack('<QI', len(v2) + 4, V2_ID) + v2
    size = len(pair) + 8 + 16
    block = struct.pack('<Q', size) + pair + struct.pack('<Q', size) + MAGIC
    eocd = bytearray(d[e:]); struct.pack_into('<I', eocd, 16, cd_off + len(block))
    open(out, 'wb').write(d[:cd_off] + block + d[cd_off:e] + bytes(eocd))
    print('built', out, os.path.getsize(out), 'bytes')

if __name__ == '__main__':
    if sys.argv[1] == 'verify': sys.exit(0 if verify_v2(sys.argv[2]) else 1)
    build(*sys.argv[2:7])

def build_raw(orig, keyf, certf, out):
    """Sign without touching the entries: compressed bytes are copied as they are (same bytes every release
    for unchanged files, so small updates stay small). v1 + v2, stored entries 4-byte aligned."""
    zin = zipfile.ZipFile(orig); src = open(orig, 'rb')
    keep = [i for i in zin.infolist() if not (i.filename.startswith('META-INF/') and i.filename.split('/')[-1].split('.')[-1].upper() in ('SF', 'RSA', 'DSA', 'EC', 'MF'))]
    mf = b'Manifest-Version: 1.0\r\nCreated-By: 1.0 (V2Fall signer)\r\n\r\n'; sf_entries = b''
    for i in keep:
        sec = mf_wrap('Name: ' + i.filename) + mf_wrap('SHA-256-Digest: ' + base64.b64encode(hashlib.sha256(zin.read(i)).digest()).decode()) + b'\r\n'
        mf += sec
        sf_entries += mf_wrap('Name: ' + i.filename) + mf_wrap('SHA-256-Digest: ' + base64.b64encode(hashlib.sha256(sec).digest()).decode()) + b'\r\n'
    sf = (b'Signature-Version: 1.0\r\nCreated-By: 1.0 (V2Fall signer)\r\n'
          + mf_wrap('SHA-256-Digest-Manifest: ' + base64.b64encode(hashlib.sha256(mf).digest()).decode())
          + b'X-Android-APK-Signed: 2\r\n\r\n' + sf_entries)
    with tempfile.TemporaryDirectory() as t:
        open(t + '/C.SF', 'wb').write(sf)
        subprocess.check_call(['openssl', 'cms', '-sign', '-binary', '-noattr', '-outform', 'DER', '-md', 'sha256',
                               '-signer', certf, '-inkey', keyf, '-in', t + '/C.SF', '-out', t + '/C.RSA', '-nosmimecap'])
        rsa = open(t + '/C.RSA', 'rb').read()
    buf = io.BytesIO(); cdir = []
    def put(name, method, crc, csize, usize, raw):
        nb = name.encode(); off = buf.tell(); extra = b''
        if method == 0:
            pad = (4 - (off + 30 + len(nb) + 6) % 4) % 4
            extra = struct.pack('<HHH', 0xD935, 2 + pad, 4) + b'\0' * pad
        buf.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0x0800 if not nb.isascii() else 0, method, 0x0821, 0x0221, crc, csize, usize, len(nb), len(extra)) + nb + extra + raw)
        cdir.append(struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 20, 0x0800 if not nb.isascii() else 0, method, 0x0821, 0x0221, crc, csize, usize, len(nb), 0, 0, 0, 0, 0, off) + nb)
    for i in keep:
        src.seek(i.header_offset); h = src.read(30); n, e = struct.unpack('<HH', h[26:30])
        src.seek(i.header_offset + 30 + n + e); raw = src.read(i.compress_size)
        put(i.filename, i.compress_type, i.CRC, i.compress_size, i.file_size, raw)
    for name, data in (('META-INF/MANIFEST.MF', mf), ('META-INF/V2FALL.SF', sf), ('META-INF/V2FALL.RSA', rsa)):
        c = zlib.compressobj(9, zlib.DEFLATED, -15); raw = c.compress(data) + c.flush()
        put(name, 8, zlib.crc32(data), len(raw), len(data), raw)
    cd_off = buf.tell(); cdb = b''.join(cdir)
    buf.write(cdb + struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(cdir), len(cdir), len(cdb), cd_off, 0))
    d = buf.getvalue(); e = eocd_pos(d)
    digest = chunk_digest([d[:cd_off], d[cd_off:e], d[e:]])
    key = serialization.load_pem_private_key(open(keyf, 'rb').read(), None)
    cert_der = x509.load_pem_x509_certificate(open(certf, 'rb').read()).public_bytes(serialization.Encoding.DER)
    pub_der = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signed = lp(lp(struct.pack('<I', ALG_RSA_PKCS1_SHA256) + lp(digest))) + lp(lp(cert_der)) + lp(b'')
    sig = key.sign(signed, padding.PKCS1v15(), hashes.SHA256())
    signer = lp(signed) + lp(lp(struct.pack('<I', ALG_RSA_PKCS1_SHA256) + lp(sig))) + lp(pub_der)
    v2 = lp(lp(signer)); pair = struct.pack('<QI', len(v2) + 4, V2_ID) + v2; size = len(pair) + 8 + 16
    block = struct.pack('<Q', size) + pair + struct.pack('<Q', size) + MAGIC
    eocd = bytearray(d[e:]); struct.pack_into('<I', eocd, 16, cd_off + len(block))
    open(out, 'wb').write(d[:cd_off] + block + d[cd_off:e] + bytes(eocd))
    print('built', out, os.path.getsize(out), 'bytes')
