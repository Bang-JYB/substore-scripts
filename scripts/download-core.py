"""Fetch the exact official core; digests pinned from the v1.14.2 release API."""
import hashlib, os, platform, tarfile, urllib.request, zipfile
from pathlib import Path
VERSION='1.14.2'
DIGESTS={
 'linux-amd64':'a684484d7477d1437282ee411f4d131d0340aaad60a7868841ebd5d87dd8a0c6',
 'windows-amd64':'c2d8bfff918755808781dfdeeb8581b6c91eb3a243d9a7b55483cfc0c0684d32',
 'darwin-amd64':'b0bfb0dc70a5fc708710b9f5ea98b9ee76d40fa4169928d25d73edc4331df2fe',
 'darwin-arm64':'925c5382eca8492b0150f868a6db20b18290a38700e621724b3703fd453e032d',
}
def main():
 system={'Linux':'linux','Windows':'windows','Darwin':'darwin'}[platform.system()]
 arch={'x86_64':'amd64','AMD64':'amd64','arm64':'arm64','aarch64':'arm64'}[platform.machine()]
 target=system+'-'+arch
 if target not in DIGESTS:raise SystemExit('Unsupported validation host: '+target)
 suffix='zip' if system=='windows' else 'tar.gz'
 name=f'sing-box-{VERSION}-{target}';dest=Path('.test-output/core').resolve();dest.mkdir(parents=True,exist_ok=True)
 archive=dest/(name+'.'+suffix)
 if not archive.exists():
  with urllib.request.urlopen(f'https://github.com/SagerNet/sing-box/releases/download/v{VERSION}/{archive.name}',timeout=90) as r:archive.write_bytes(r.read())
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=DIGESTS[target]:raise SystemExit('Official archive SHA256 mismatch; remove cached archive and investigate')
 if suffix=='zip':
  with zipfile.ZipFile(archive) as z:z.extractall(dest)
 else:
  with tarfile.open(archive) as t:t.extractall(dest,filter='data')
 binary=dest/name/('sing-box.exe' if system=='windows' else 'sing-box')
 if system!='windows':binary.chmod(0o755)
 print(binary)
 if os.environ.get('GITHUB_ENV'):
  with open(os.environ['GITHUB_ENV'],'a',encoding='utf-8') as f:f.write('SING_BOX='+str(binary)+'\n')
if __name__=='__main__':main()
