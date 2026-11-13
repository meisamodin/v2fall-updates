#!/usr/bin/env python3
"""Publish a stable V2Fall build: sign APKs from the newest draft build-N release, replace download/,
split into parts, commit, then write latest.json + experimental/latest.json (copy, stable:true).
usage: publish_all.py VERSION NOTES_FA NOTES_EN"""
import sys, os, json, subprocess, hashlib, glob, shutil, datetime
sys.path.insert(0, '/tmp/claude-0/key')
import apksign

V, FA, EN = sys.argv[1], sys.argv[2], sys.argv[3]
REPO = 'meisamodin/v2fall-updates'
U = '/home/claude/v2fall-updates'
W = f'/tmp/claude-0/pub-{V}'
KEY = '/tmp/claude-0/key/V2Fall-signing-key'
os.makedirs(W, exist_ok=True)

def sh(*a, cwd=None, out=False):
    print('+', ' '.join(a)[:200], flush=True)
    r = subprocess.run(a, cwd=cwd, check=True, capture_output=out, text=True)
    return r.stdout if out else None

rels = json.loads(sh('gh', 'api', f'repos/{REPO}/releases?per_page=100', out=True))
rel = max((r for r in rels if r['tag_name'].startswith('build-') and any(V in a['name'] for a in r['assets'])), key=lambda r: r['created_at'])
print('release', rel['tag_name'], [a['name'] for a in rel['assets']])
for a in rel['assets']:
    if not a['name'].endswith(('.apk', '.exe', '.dmg', '.deb', '.tar.gz', '-portable.zip')): continue
    p = os.path.join(W, a['name'])
    if not os.path.exists(p) or os.path.getsize(p) != a['size']:
        print('get', a['name'], flush=True)
        with open(p, 'wb') as fh:
            subprocess.run(['gh', 'api', '-H', 'Accept: application/octet-stream', f'repos/{REPO}/releases/assets/{a["id"]}'], stdout=fh, check=True)
        assert os.path.getsize(p) == a['size'], a['name']

out = os.path.join(W, 'out'); os.makedirs(out, exist_ok=True)
names = {}
for p in sorted(glob.glob(os.path.join(W, '*'))):
    n = os.path.basename(p)
    if os.path.isdir(p): continue
    if n.endswith('.apk'):
        clean = n.replace('-unsigned', '')
        al = os.path.join(W, 'al-' + clean)
        apksign.zipalign(p, al)
        dst = os.path.join(out, clean)
        sh('python3', '/tmp/claude-0/key/apksign.py', 'sign', al, dst, f'{KEY}/key.pem', f'{KEY}/cert.pem')
        os.remove(al)
    elif n.endswith(('.exe', '.dmg', '.deb', '.tar.gz')):
        shutil.copy(p, os.path.join(out, n))
files = sorted(os.listdir(out)); print('files', files)

def find(pred):
    m = [f for f in files if pred(f)]
    return m[0] if m else None
K = {
    'android': find(lambda f: f == f'V2Fall-{V}.apk'),
    'android_arm64': find(lambda f: f.endswith('-arm64.apk')),
    'android_armv7': find(lambda f: f.endswith('-armv7.apk')),
    'android6': find(lambda f: f.endswith('-android6.apk')),  # Android 6 build (minSdk 23), optional
    'windows': find(lambda f: f.endswith('.exe')),
    'macos': find(lambda f: 'Apple-Silicon' in f),
    'macos_intel': find(lambda f: 'Intel' in f),
    'linux': find(lambda f: f.endswith('.deb')),
    'linux_tar': find(lambda f: f.endswith('.tar.gz')),
}
assert K['android'] and K['android_arm64'] and K['windows'] and K['linux'], K
vcode = int(sh('python3', '/tmp/claude-0/key/apksign.py', 'vcode', os.path.join(out, K['android']), out=True).strip().split()[-1])
old = json.load(open(f'{U}/latest.json'))
assert vcode > old['vcode'], (vcode, old['vcode'])
for k in ('experimental/latest.json',):
    try:
        ov = json.load(open(f'{U}/{k}')).get('vcode', 0); assert vcode > ov, (vcode, ov)
    except FileNotFoundError: pass

# replace download/ (keep browser extensions); universal APK only as parts
for f in glob.glob(f'{U}/download/*'):
    if os.path.isfile(f) and 'Chrome' not in f and 'Firefox' not in f: os.remove(f)
for f in glob.glob(f'{U}/download/parts/*'): os.remove(f)
for k, f in K.items():
    if not f: continue
    if k not in ('android', 'android6'): shutil.copy(os.path.join(out, f), f'{U}/download/{f}')
    sh('split', '-b', '19922944', '-d', '-a', '2', os.path.join(out, f), f'{U}/download/parts/{f}.p')
# small updates: V2D1 patch from the previous release's APK of the same variant (unchanged files copied
# from the installed APK on the phone). Only kept when it really is small.
sys.path.insert(0, f'{U}/tools'); import v2delta
os.makedirs(f'{U}/download/delta', exist_ok=True)
for f in glob.glob(f'{U}/download/delta/*'): os.remove(f)
DELTA = {}
oldrel = None
try: oldrel = json.loads(sh('gh', 'api', f'repos/{REPO}/releases/tags/v{old["version"]}', out=True))
except Exception as e: print('no previous release', e)
for k in ('android', 'android_arm64', 'android_armv7', 'android6'):
    if not (oldrel and K[k] and k in old): continue
    on = os.path.basename(old[k]['url'])
    a = next((x for x in oldrel['assets'] if x['name'] == on), None)
    if not a: print('no old asset', on); continue
    op = os.path.join(W, 'old-' + on)
    if not os.path.exists(op):
        with open(op, 'wb') as fh: subprocess.run(['gh', 'api', '-H', 'Accept: application/octet-stream', f'repos/{REPO}/releases/assets/{a["id"]}'], stdout=fh, check=True)
    if hashlib.sha256(open(op, 'rb').read()).hexdigest() != old[k]['sha256']: print('old sha mismatch', on); continue
    dn = f'{k}-{old["version"]}-{V}.v2d'; dp = f'{U}/download/delta/{dn}'
    size, copied, full = v2delta.make(op, os.path.join(out, K[k]), dp)
    tmp = dp + '.chk'; v2delta.apply(op, dp, tmp)
    okc = open(tmp, 'rb').read() == open(os.path.join(out, K[k]), 'rb').read(); os.remove(tmp)
    print('delta', k, size, 'of', full, 'ok' if okc else 'BAD')
    if not okc or size > min(15_000_000, full * 0.6): os.remove(dp); continue
    DELTA[k] = {'from': old[k]['sha256'], 'fromv': old['version'], 'file': dn, 'sha256': hashlib.sha256(open(dp, 'rb').read()).hexdigest(), 'size': size}
# desktop small updates (V2DD): only the changed files of the app folder, for Windows (per-user install /
# portable) and the Linux tar.gz; the app checks the rest of its folder against the list before patching
import zipfile, tarfile, io
def files_of(path):
    out = {}
    if path.endswith('.zip'):
        z = zipfile.ZipFile(path)
        for i in z.infolist():
            if not i.is_dir(): out[i.filename.replace('\\', '/')] = z.read(i)
    else:
        t = tarfile.open(path)
        for m in t.getmembers():
            if m.isfile(): out[m.name.split('/', 1)[1] if '/' in m.name else m.name] = t.extractfile(m).read()
    return out
def old_asset(name):
    for rr in json.loads(sh('gh', 'api', f'repos/{REPO}/releases?per_page=100', out=True)):
        for a in rr['assets']:
            if a['name'] == name: return a
    return None
for k, newname, oldname in (('windows', f'V2Fall-{V}-Windows-x64-portable.zip', f"V2Fall-{old['version']}-Windows-x64-portable.zip"),
                            ('linux_tar', K['linux_tar'], os.path.basename(old.get('linux_tar', {}).get('url', '')))):
    try:
        npth = os.path.join(W, newname)
        if not newname or not os.path.exists(npth): print('no new', newname); continue
        a = old_asset(oldname)
        if not a: print('no old', oldname); continue
        opth = os.path.join(W, 'old-' + oldname)
        if not os.path.exists(opth):
            with open(opth, 'wb') as fh: subprocess.run(['gh', 'api', '-H', 'Accept: application/octet-stream', f'repos/{REPO}/releases/assets/{a["id"]}'], stdout=fh, check=True)
        of, nf = files_of(opth), files_of(npth)
        changed = {p: b for p, b in nf.items() if of.get(p) != b}
        man = {'from': old['version'], 'to': V, 'files': {p: hashlib.sha256(b).hexdigest() for p, b in nf.items()}, 'remove': [p for p in of if p not in nf]}
        dn = f'{k}-{old["version"]}-{V}.v2dd.zip'; dp = f'{U}/download/delta/{dn}'
        with zipfile.ZipFile(dp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            z.writestr('v2dd.json', json.dumps(man))
            for p, b in changed.items():
                zi = zipfile.ZipInfo(p, (2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o755 << 16
                z.writestr(zi, b)
        size = os.path.getsize(dp); full = os.path.getsize(os.path.join(out, K[k]))
        print('desktop delta', k, size, 'of', full, 'changed', len(changed), 'of', len(nf))
        if size > min(15_000_000, full * 0.6): os.remove(dp); continue
        DELTA[k] = {'from': '', 'fromv': old['version'], 'file': dn, 'sha256': hashlib.sha256(open(dp, 'rb').read()).hexdigest(), 'size': size}
    except Exception as e: print('desktop delta', k, 'skipped:', e)
sh('git', 'add', '-A', 'download', cwd=U)
sh('git', '-c', 'user.name=Claude', '-c', 'user.email=noreply@anthropic.com', 'commit', '-qm',
   f'V2Fall {V}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_014VLmUmwrxWR4EsJPQ9VJe1', cwd=U)
sh('git', 'pull', '-q', '--rebase', cwd=U); sh('git', 'push', '-q', cwd=U)
sha = sh('git', 'rev-parse', 'HEAD', cwd=U, out=True).strip()

def ent(k, f):
    p = os.path.join(out, f)
    parts = sorted(os.path.basename(x) for x in glob.glob(f'{U}/download/parts/{f}.p*'))
    url = (f'https://github.com/{REPO}/releases/download/v{V}/{f}' if k in ('android', 'android6')
           else f'https://github.com/{REPO}/raw/main/download/{f}')
    return {'url': url, 'sha256': hashlib.sha256(open(p, 'rb').read()).hexdigest(), 'size': os.path.getsize(p),
            'parts': [f'https://cdn.jsdelivr.net/gh/{REPO}@{sha}/download/parts/{x}' for x in parts]}
m = {'app': 'V2Fall', 'version': V, 'date': datetime.date.today().isoformat(), 'notes': FA, 'notes_en': EN}
for k in ('android', 'windows'):
    m[k] = ent(k, K[k])
def addd(k):
    if k in DELTA and k in m:
        d = DELTA[k]; m[k]['delta'] = [{'from': d['from'], 'fromv': d['fromv'], 'url': f'https://cdn.jsdelivr.net/gh/{REPO}@{sha}/download/delta/{d["file"]}', 'sha256': d['sha256'], 'size': d['size']}]
m['page'] = f'https://github.com/{REPO}'
if K['android6']: m['android6'] = ent('android6', K['android6'])  # never carried over from an older version
for k in ('macos', 'macos_intel', 'linux', 'linux_tar', 'android_arm64', 'android_armv7'):
    if K[k]: m[k] = ent(k, K[k])
    elif k in old: m[k] = old[k]; print('kept old', k)
for k in ('android', 'android_arm64', 'android_armv7', 'android6', 'windows', 'linux_tar'): addd(k)
m['vcode'] = vcode; m['min'] = os.environ.get('V2F_MIN', '')
json.dump(m, open(f'{U}/latest.json', 'w'), ensure_ascii=False, indent=2)
e = dict(m); e['stable'] = True
os.makedirs(f'{U}/experimental', exist_ok=True)
json.dump(e, open(f'{U}/experimental/latest.json', 'w'), ensure_ascii=False, indent=2)
sh('git', 'add', 'latest.json', 'experimental/latest.json', cwd=U)
sh('git', '-c', 'user.name=Claude', '-c', 'user.email=noreply@anthropic.com', 'commit', '-qm',
   f'V2Fall {V}: manifest (stable and experimental)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_014VLmUmwrxWR4EsJPQ9VJe1', cwd=U)
sh('git', 'pull', '-q', '--rebase', cwd=U); sh('git', 'push', '-q', cwd=U)
print('DONE', V, vcode, sha)
