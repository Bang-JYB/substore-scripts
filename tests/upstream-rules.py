"""Check actual downloaded upstream binaries using the pinned official core."""
import argparse,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--seeds',required=True);p.add_argument('--core',required=True);a=p.parse_args()
cases=[('geosite-github','github.com',True),('geosite-github','raw.githubusercontent.com',True),('geosite-ai','copilot.microsoft.com',True),('geosite-ai','chatgpt.com',True),('geosite-cn','y.qq.com',True),('geosite-cn','ws6.stream.qqmusic.qq.com',True),('geoip-cn','223.5.5.5',True),('geoip-cn','8.8.8.8',False)]
for tag,value,expected in cases:
 r=subprocess.run([a.core,'rule-set','match','-f','binary',str(Path(a.seeds)/(tag+'.srs')),value],capture_output=True,text=True,check=True)
 matched='match rules.' in r.stdout+r.stderr
 assert matched==expected,(tag,value,r.stdout,r.stderr)
 print('PASS',tag,value,'match='+str(matched))
