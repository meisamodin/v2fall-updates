#!/usr/bin/env python3
"""Publish an EXPERIMENTAL V2Fall build (only apps with Settings → About → «نسخه‌های آزمایشی» get it).

Takes the newest draft build-N of VERSION after sign-test.yml signed its APKs (V2Fall-V-TEST-signed.apk and
V2Fall-V-arm64-TEST-signed.apk), plus the Windows installer of the same draft. The files go to a public
pre-release v<V>-beta (never "latest") and, split into parts, to experimental/parts/ so jsDelivr and
dl.v2fall.com serve them inside Iran. Only experimental/latest.json is written (stable:false); latest.json,
download/, the site and the bot are not touched. Android 6 and other platforms are left out: those apps simply
see no experimental update.

usage: publish_exp.py VERSION NOTES_FA NOTES_EN   (run from the v2fall-updates checkout, gh logged in)"""
import sys, os, json, subprocess, hashlib, glob, datetime, shutil

V, FA, EN = sys.argv[1], sys.argv[2], sys.argv[3]
REPO = 'meisamodin/v2fall-updates'
U = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(os.environ.get('TMPDIR', '/tmp'), f'exp-{V}')
os.makedirs(W, exist_ok=True)
sys.path.insert(0, os.path.join(U, 'tools'))


def sh(*a, cwd=None, out=False):
    print('+', ' '.join(a)[:200], flush=True)
    r = subprocess.run(a, cwd=cwd or U, check=True, capture_output=out, text=True)
    return r.stdout if out else None


rels = json.loads(sh('gh', 'api', f'repos/{REPO}/releases?per_page=50', out=True))
rel = max((r for r in rels if r['draft'] and r['tag_name'].startswith('build-') and any(V in a['name'] for a in r['assets'])), key=lambda r: r['created_at'])
want = {'android': f'V2Fall-{V}-TEST-signed.apk', 'android_arm64': f'V2Fall-{V}-arm64-TEST-signed.apk', 'windows': f'V2Fall-Setup-{V}.exe'}
files = {}
for k, n in want.items():
    a = next((x for x in rel['assets'] if x['name'] == n), None)
    if not a:
        assert k == 'windows', f'{n} missing in {rel["tag_name"]} — run sign-test.yml -f version={V} first'
        print('no', n); continue
    out = n.replace('-TEST-signed', '-beta').replace(f'Setup-{V}.exe', f'Setup-{V}-beta.exe')
    p = os.path.join(W, out)
    if not os.path.exists(p) or os.path.getsize(p) != a['size']:
        with open(p, 'wb') as fh:
            subprocess.run(['gh', 'api', '-H', 'Accept: application/octet-stream', f'repos/{REPO}/releases/assets/{a["id"]}'], stdout=fh, check=True)
    assert os.path.getsize(p) == a['size'], n
    files[k] = p

import apksign  # noqa: E402
vcode = int(sh('python3', os.path.join(U, 'tools', 'apksign.py'), 'vcode', files['android'], out=True).strip().split()[-1])
stable = json.load(open(os.path.join(U, 'latest.json')))
assert vcode > stable['vcode'], ('experimental must be newer than stable', vcode, stable['vcode'])

# no GitHub release (this session may not create releases): files under 95 MB are committed whole in
# experimental/files/ (raw link as the fallback), every file also as parts for jsDelivr / dl.v2fall.com
fd = os.path.join(U, 'experimental', 'files')
shutil.rmtree(fd, ignore_errors=True); os.makedirs(fd)
for p in files.values():
    if os.path.getsize(p) < 95 * 1048576: shutil.copy(p, fd)
# parts for Iran (jsDelivr / dl.v2fall.com); the previous experimental parts are removed
pd = os.path.join(U, 'experimental', 'parts')
shutil.rmtree(pd, ignore_errors=True); os.makedirs(pd)
for p in files.values():
    sh('split', '-b', '19922944', '-d', '-a', '2', p, os.path.join(pd, os.path.basename(p) + '.p'))
sh('git', 'add', '-A', 'experimental/parts', 'experimental/files')
sh('git', '-c', 'user.name=Claude', '-c', 'user.email=noreply@anthropic.com', 'commit', '-qm', f'V2Fall {V} experimental: files\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')
sh('git', 'pull', '-q', '--rebase'); sh('git', 'push', '-q')
sha = sh('git', 'rev-parse', 'HEAD', out=True).strip()

m = {'app': 'V2Fall', 'version': V, 'date': datetime.date.today().isoformat(), 'notes': FA, 'notes_en': EN, 'page': f'https://github.com/{REPO}'}
for k, p in files.items():
    f = os.path.basename(p)
    parts = sorted(os.path.basename(x) for x in glob.glob(os.path.join(pd, f + '.p*')))
    m[k] = {'url': f'https://github.com/{REPO}/raw/main/experimental/files/{f}' if os.path.exists(os.path.join(fd, f)) else '', 'sha256': hashlib.sha256(open(p, 'rb').read()).hexdigest(), 'size': os.path.getsize(p),
            'parts': [f'https://cdn.jsdelivr.net/gh/{REPO}@{sha}/experimental/parts/{x}' for x in parts]}
# small updates from the previous experimental build of the same variant (V2D1, like publish_all.py); only kept
# under 15 MB (one jsDelivr file). The old files come from that publish's work folder, checked against its manifest.
import v2delta  # noqa: E402
prev = json.load(open(os.path.join(U, 'experimental', 'latest.json')))
dd = os.path.join(U, 'experimental', 'delta'); shutil.rmtree(dd, ignore_errors=True); os.makedirs(dd)
pw = os.path.join(os.path.dirname(W), f'exp-{prev.get("version", "")}')
for k in ('android', 'android_arm64'):
    if k not in m or k not in prev or prev.get('stable'): continue
    op = os.path.join(pw, os.path.basename(prev[k]['url']) or f'V2Fall-{prev["version"]}-beta.apk')
    if not os.path.exists(op) or hashlib.sha256(open(op, 'rb').read()).hexdigest() != prev[k]['sha256']: print('no old file for', k); continue
    dn = f'{k}-{prev["version"]}-{V}.v2d'; dp = os.path.join(dd, dn)
    size, copied, full = v2delta.make(op, files[k], dp)
    tmp = dp + '.chk'; v2delta.apply(op, dp, tmp); ok = open(tmp, 'rb').read() == open(files[k], 'rb').read(); os.remove(tmp)
    print('delta', k, size, 'of', full, ok)
    if not ok or size > min(15_000_000, full * 0.6): os.remove(dp); continue
    m[k]['_delta'] = {'from': prev[k]['sha256'], 'fromv': prev['version'], 'file': dn, 'sha256': hashlib.sha256(open(dp, 'rb').read()).hexdigest(), 'size': size}
if os.listdir(dd):
    sh('git', 'add', '-A', 'experimental/delta')
    sh('git', '-c', 'user.name=Claude', '-c', 'user.email=noreply@anthropic.com', 'commit', '-qm', f'V2Fall {V} experimental: small updates\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')
    sh('git', 'pull', '-q', '--rebase'); sh('git', 'push', '-q')
    dsha = sh('git', 'rev-parse', 'HEAD', out=True).strip()
    for k in list(m):
        if isinstance(m[k], dict) and '_delta' in m[k]:
            d = m[k].pop('_delta'); m[k]['delta'] = [{'from': d['from'], 'fromv': d['fromv'], 'url': f'https://cdn.jsdelivr.net/gh/{REPO}@{dsha}/experimental/delta/{d["file"]}', 'sha256': d['sha256'], 'size': d['size']}]
m['vcode'] = vcode; m['min'] = ''; m['stable'] = False
json.dump(m, open(os.path.join(U, 'experimental', 'latest.json'), 'w'), ensure_ascii=False, indent=2)
sh('git', 'add', 'experimental/latest.json')
sh('git', '-c', 'user.name=Claude', '-c', 'user.email=noreply@anthropic.com', 'commit', '-qm', f'V2Fall {V} experimental: manifest\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')
sh('git', 'pull', '-q', '--rebase'); sh('git', 'push', '-q')
print('published experimental', V, 'vcode', vcode)
