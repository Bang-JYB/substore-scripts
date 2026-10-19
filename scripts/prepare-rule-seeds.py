"""Optional offline bootstrap. Download the same remote rule URLs to {tag}.srs.
Files are staged and core-validated before replacing any existing seed. No subscriptions
or credentials are read. Re-run before moving the directory to a new device.
"""
import argparse, concurrent.futures, hashlib, json, os, re, subprocess, tempfile, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def prepare(config,output,binary,proxy=None):
 output=Path(output);output.mkdir(parents=True,exist_ok=True)
 rules=[r for r in json.loads(Path(config).read_text(encoding='utf-8'))['route']['rule_set'] if r['type']=='remote']
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({'https':proxy}) if proxy else urllib.request.ProxyHandler())
 with tempfile.TemporaryDirectory(prefix='.seed-stage-',dir=output) as tmp:
  stage=Path(tmp)
  def fetch(r):
   tag=r['tag']
   if not re.fullmatch(r'[A-Za-z0-9_.-]+',tag):raise ValueError('Unsafe rule-set tag')
   if not r['url'].startswith('https://'):raise ValueError('Seed download requires HTTPS')
   with opener.open(r['url'],timeout=45) as response:data=response.read()
   p=stage/(tag+'.srs');p.write_bytes(data)
   subprocess.run([str(binary),'rule-set','decompile',str(p),'-o',str(stage/(tag+'.json'))],check=True,capture_output=True)
   return tag,{'url':r['url'],'sha256':hashlib.sha256(data).hexdigest()}
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:manifest=dict(pool.map(fetch,rules))
  # All downloads/decodes succeeded before publication; each individual replace is atomic.
  for tag in manifest:os.replace(stage/(tag+'.srs'),output/(tag+'.srs'))
  (stage/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
  os.replace(stage/'manifest.json',output/'manifest.json')
 return manifest
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',default=str(ROOT/'config_tun.json'));p.add_argument('--output',required=True);p.add_argument('--core',required=True);p.add_argument('--proxy')
 args=p.parse_args();result=prepare(args.config,args.output,args.core,args.proxy);print(f'Prepared {len(result)} validated rule seeds in {args.output}')
