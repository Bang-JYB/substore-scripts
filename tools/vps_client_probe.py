#!/usr/bin/env python3
"""Read-only client probe. Python 3.9+, curl 7.63+. No subscription/API/config access.
DNS: existing mixed SOCKS UDP -> DNS hijack, not OS/browser DNS.
HTTP: fresh curl process; DNS caches and outer proxy connections are NOT reset.
"""
import argparse, collections, datetime, ipaddress, json, math, os, re, secrets
import shutil, socket, struct, subprocess, sys, threading, time
from pathlib import Path
from urllib.parse import urlsplit

MARK='VPSPROBE'
FIELDS=['http_code','time_namelookup','time_connect','time_appconnect',
        'time_pretransfer','time_starttransfer','time_total','size_download','http_version']

def recv_exact(s,n):
 out=b''
 while len(out)<n:
  p=s.recv(n-len(out))
  if not p:raise EOFError('closed')
  out+=p
 return out

def socks_address(s):
 atyp=recv_exact(s,1)[0]
 if atyp==1:host=socket.inet_ntop(socket.AF_INET,recv_exact(s,4))
 elif atyp==4:host=socket.inet_ntop(socket.AF_INET6,recv_exact(s,16))
 else:raise ValueError('unexpected non-IP relay')
 return host,struct.unpack('!H',recv_exact(s,2))[0]

def dns_packet(domain,qt,ident):
 encoded=domain.rstrip('.').encode('idna').decode('ascii')
 if not encoded or len(encoded)>253:raise ValueError('invalid DNS name')
 labels=encoded.split('.')
 if any(not re.fullmatch(r'[A-Za-z0-9_-]{1,63}',p) for p in labels):raise ValueError('invalid DNS label')
 name=b''.join(bytes([len(p)])+p.encode('ascii') for p in labels)+b'\0'
 return struct.pack('!HHHHHH',ident,0x100,1,0,0,0)+name+struct.pack('!HH',qt,1)

def dns_payload(packet):
 if len(packet)<4 or packet[:3]!=b'\0\0\0':raise ValueError('invalid SOCKS UDP header')
 atyp=packet[3]
 offset=10 if atyp==1 else 22 if atyp==4 else 7+packet[4] if atyp==3 and len(packet)>4 else 0
 if not offset or len(packet)<offset+12:raise ValueError('short DNS response')
 return packet[offset:]

def probe_dns(domain,qt,timeout):
 row={'transport':'mixed SOCKS UDP DNS hijack','qtype':'A' if qt==1 else 'AAAA'}
 phase='local_socks_connect';setup=time.perf_counter()
 try:
  ident=secrets.randbelow(65536);query=dns_packet(domain,qt,ident)
  with socket.create_connection(('127.0.0.1',7890),timeout=timeout) as tcp:
   phase='local_socks_setup'
   tcp.settimeout(timeout);tcp.sendall(b'\x05\x01\x00')
   if recv_exact(tcp,2)!=b'\x05\x00':
    return {**row,'status':'socks_auth_unavailable','phase':phase}
   tcp.sendall(b'\x05\x03\x00\x01'+b'\0'*6)
   reply=recv_exact(tcp,3)
   if reply[0]!=5 or reply[2]!=0:raise ValueError('invalid SOCKS response')
   if reply[1]:
    return {**row,'status':'udp_unsupported' if reply[1]==7 else 'udp_association_refused',
            'socks_reply':reply[1],'phase':phase}
   host,port=socks_address(tcp);ip=ipaddress.ip_address(host)
   if ip.is_unspecified:host='127.0.0.1' if ip.version==4 else '::1'
   elif not ip.is_loopback:raise ValueError('non-loopback relay refused')
   row['local_setup_ms']=round((time.perf_counter()-setup)*1000,3)
   family=socket.AF_INET if ip.version==4 else socket.AF_INET6
   with socket.socket(family,socket.SOCK_DGRAM) as udp:
    udp.bind(('127.0.0.1' if family==socket.AF_INET else '::1',0));udp.settimeout(timeout)
    # Reserved address: current templates intercept DNS before it is routed.
    header=b'\0\0\0\x01'+socket.inet_aton('192.0.2.53')+struct.pack('!H',53)
    phase='dns_hijack_exchange';start=time.perf_counter();udp.sendto(header+query,(host,port))
    data=dns_payload(udp.recv(65535));row['dns_ms']=round((time.perf_counter()-start)*1000,3)
    rid,flags,qd,an,ns,ar=struct.unpack('!HHHHHH',data[:12])
    if rid!=ident or not flags&0x8000:raise ValueError('mismatched DNS reply')
    rcode=flags&15
    row.update(status='reply',rcode=rcode,answer_count=an,truncated=bool(flags&0x200),
               dns_result='truncated' if flags&0x200 else 'nxdomain' if rcode==3 else
                          'dns_error' if rcode else 'answers' if an else 'no_answers')
 except (OSError,EOFError,ValueError) as e:
  status='dns_exchange_timeout' if isinstance(e,socket.timeout) and phase=='dns_hijack_exchange' else \
         'local_socks_unavailable' if phase=='local_socks_connect' else \
         'socks_setup_timeout' if isinstance(e,socket.timeout) else 'probe_failed'
  row.update(status=status,phase=phase,error_type=type(e).__name__)
 return row

def summarize_rates(buckets,active_seconds):
 seconds=[]
 for i in range(int(active_seconds)+1):
  duration=min(1.0,max(0.0,active_seconds-i));complete=duration>=1.0
  if not duration and not buckets.get(i):continue
  count=buckets.get(i,0)
  seconds.append({'second':i,'bytes':count,'complete':complete,
                  'mbps':round(count*8/1e6,3) if complete else None})
 windows=[]
 for lo,hi in [(0,5),(5,15),(15,30)]:
  count=sum(n for second,n in buckets.items() if lo<=second<hi);complete=active_seconds>=hi
  windows.append({'from_s':lo,'to_s':hi,'bytes':count,'complete':complete,
                  'mbps':round(count*8/((hi-lo)*1e6),3) if complete else None})
 return seconds,windows

def parse_metrics(stderr):
 line=next((s for s in reversed(stderr.decode('utf-8',errors='replace').splitlines()) if s.startswith(MARK+'\t')),None)
 if line is None:return {}
 values=line.split('\t')[1:]
 if len(values)!=len(FIELDS):return {}
 result={}
 for key,value in zip(FIELDS,values):
  if key=='http_version':result[key]=value if value in ['0','1','1.0','1.1','2','3'] else None
  else:
   try:
    number=float(value);result[key]=number if math.isfinite(number) and number>=0 else None
   except ValueError:result[key]=None
 return result

def validate_url(url,allow_http=False,allow_private=False):
 # Do this outside timed operations. OS DNS preflight may warm caches; remote
 # proxy DNS can differ, so this prevents accidental LAN use, not DNS rebinding.
 if any(ord(c)<33 or ord(c)==127 for c in url) or '\\' in url:
  raise ValueError('URL whitespace, control characters and backslashes refused')
 try:
  p=urlsplit(url);port=p.port
 except ValueError:raise ValueError('invalid test URL') from None
 if p.scheme not in (['http','https'] if allow_http else ['https']) or not p.hostname:
  raise ValueError('use a public HTTPS test URL (HTTP needs --allow-http)')
 if p.username is not None or p.password is not None or p.fragment or any(c in url for c in '\r\n\0'):
  raise ValueError('URL credentials, fragments and control characters refused')
 if not allow_private:
  host=p.hostname.rstrip('.').lower()
  if '%' in host or '.' not in host and ':' not in host or host.endswith(('.localhost','.local','.lan','.home.arpa')):
   raise ValueError('private/local target needs --allow-private')
  try:
   addresses=[ipaddress.ip_address(host)]
  except ValueError:
   try:addresses=[ipaddress.ip_address(r[4][0]) for r in socket.getaddrinfo(host,port or 443,type=socket.SOCK_STREAM)]
   except (OSError,ValueError):raise ValueError('public target preflight failed') from None
  def public(ip):
   ip=getattr(ip,'ipv4_mapped',None) or ip
   return ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_unspecified)
  if not addresses or not all(public(ip) for ip in addresses):
   raise ValueError('private/non-public target needs --allow-private')
 return url

def validate_cache_label(state,runs,has_url,qtype='A'):
 if state=='cold-confirmed' and (runs!=1 or has_url or qtype=='both'):
  raise ValueError('cold-confirmed requires one DNS-only A or AAAA query; HTTP preflight may warm DNS')

def probe_http(url,mode,seconds,curl,family='any',sink='stream'):
 fmt='%{stderr}\n'+MARK+'\t'+'\t'.join('%{'+f+'}' for f in FIELDS)+'\n'
 cmd=[curl,'-q','--silent','--show-error','--globoff','--http1.1','--fail',
      '--connect-timeout','10','--max-time',str(seconds),'--output','-' if sink=='stream' else os.devnull,
      '--write-out',fmt,'--config','-']
 if mode=='http':cmd+=['--proxy','http://127.0.0.1:7890','--noproxy','__probe_no_bypass__.invalid']
 elif mode=='socks':cmd+=['--socks5-hostname','127.0.0.1:7890','--noproxy','__probe_no_bypass__.invalid']
 else:cmd+=['--noproxy','*']
 if family!='any':cmd+=['-'+family]
 env={k:v for k,v in os.environ.items() if k.lower() not in ['http_proxy','https_proxy','all_proxy','no_proxy']}
 env['LC_ALL']='C'
 config='url = "'+url.replace('\\','\\\\').replace('"','\\"')+'"\n'
 stderr=[];buckets=collections.Counter();first=None;end=None;cpu=time.process_time()
 with subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                       bufsize=0,env=env) as p:
  reader=threading.Thread(target=lambda:stderr.append(p.stderr.read()),daemon=True);reader.start()
  try:
   p.stdin.write(config.encode('utf-8'));p.stdin.close()
   while True:
    block=p.stdout.read(256*1024)
    if not block:break
    now=time.perf_counter()
    if first is None:first=now
    buckets[int(now-first)]+=len(block)
   end=time.perf_counter();code=p.wait(timeout=5)
  except BaseException:
   p.kill();p.wait();raise
  finally:reader.join(timeout=5)
 cpu=time.process_time()-cpu
 metrics=parse_metrics(b''.join(stderr));active=0 if first is None else max(0,end-first)
 per_second,windows=summarize_rates(buckets,active)
 http_code=metrics.get('http_code',0) or 0;valid=200<=http_code<300
 downloaded=metrics.get('size_download') or 0
 status='complete' if code==0 and valid else 'time_limit_with_data' if code==28 and valid and downloaded>0 else 'failed'
 return {'mode':mode,'requested_family':family,'curl_exit_code':code,'status':status,
         'failure_kind':None if status!='failed' else
          'local_proxy_connect_failed' if code==7 and mode!='tun' else
          {5:'proxy_name_resolution_failed',6:'target_name_resolution_failed',7:'connect_failed',
           28:'time_limit',35:'tls_failed',60:'certificate_failed'}.get(code,'http_or_transfer_failed'),
         'curl_metrics_cumulative_seconds':metrics,'sink':sink,
         'observer_cpu_seconds':round(cpu,6),
         'body_bytes_observed':sum(buckets.values()) if sink=='stream' else None,
         'body_bytes_match_curl':sum(buckets.values())==downloaded if sink=='stream' and metrics else None,
         'body_active_seconds':round(active,3) if sink=='stream' else None,
         'per_second':per_second if sink=='stream' else [],'windows':windows if sink=='stream' else []}

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--mode',choices=['http','socks','tun'],default='http');p.add_argument('--url')
 p.add_argument('--dns-domain');p.add_argument('--qtype',choices=['A','AAAA','both'],default='both')
 p.add_argument('--label',default='N01');p.add_argument('--runs',type=int,default=1)
 p.add_argument('--seconds',type=int,default=30);p.add_argument('--dns-timeout',type=float,default=12)
 p.add_argument('--cache-state',choices=['unspecified','cold-confirmed','hot'],default='unspecified')
 p.add_argument('--family',choices=['any','4','6'],default='any');p.add_argument('--allow-http',action='store_true')
 p.add_argument('--allow-private',action='store_true',help='explicit authorization for LAN/non-public test targets')
 p.add_argument('--sink',choices=['stream','null'],default='stream',help='null: native curl control without Python body reading')
 p.add_argument('--output-dir',default='probe-results');a=p.parse_args()
 if not re.fullmatch(r'N[0-9]{2,3}',a.label):p.error('label must be an anonymous number such as N01 or N002')
 if not a.url and not a.dns_domain:p.error('provide --url and/or --dns-domain')
 if not 1<=a.runs<=10 or not 1<=a.seconds<=300 or not 1<=a.dns_timeout<=30:p.error('invalid run/duration range')
 if a.mode!='tun' and a.family!='any':p.error('-4/-6 would not fix the proxy target family; use any for mixed')
 try:validate_cache_label(a.cache_state,a.runs,bool(a.url),a.qtype)
 except ValueError as e:p.error(str(e))
 if a.url:
  try:validate_url(a.url,a.allow_http,a.allow_private)
  except ValueError as e:p.error(str(e))
 if a.dns_domain:
  try:dns_packet(a.dns_domain,1,1)
  except (ValueError,UnicodeError):p.error('invalid DNS name')
 curl=shutil.which('curl.exe' if os.name=='nt' else 'curl')
 version='not used'
 if a.url:
  if not curl:p.error('curl executable not found')
  try:version=subprocess.check_output([curl,'-q','--version'],text=True,stderr=subprocess.DEVNULL).splitlines()[0]
  except (OSError,subprocess.SubprocessError,IndexError):p.error('curl version check failed')
  match=re.search(r'curl (\d+)\.(\d+)\.(\d+)',version)
  if not match or tuple(map(int,match.groups()))<(7,63,0):p.error('curl >= 7.63 required')
 report={'schema_version':1,'label':a.label,'platform':sys.platform,'mode':a.mode,'cache_state_label':a.cache_state,
         'cache_state_verified_by_tool':False,'target_preflight':'private-authorized' if a.allow_private else 'public-only',
         'curl_version':match.group(0) if a.url else version,
         'scope':'HTTP/1.1 only. DNS always uses mixed SOCKS UDP, including mode=tun. No URLs, domains, IPs, configs or raw errors saved. Cache labels are user assertions.',
         'http':[],'dns':[]}
 for i in range(a.runs):
  if a.dns_domain:
   for qt in ([1,28] if a.qtype=='both' else [1] if a.qtype=='A' else [28]):
    report['dns'].append({'run':i+1,**probe_dns(a.dns_domain,qt,a.dns_timeout)})
  if a.url:
   try:row=probe_http(a.url,a.mode,a.seconds,curl,a.family,a.sink)
   except (OSError,subprocess.SubprocessError):row={'status':'probe_failed','failure_kind':'curl_process_failed'}
   report['http'].append({'run':i+1,**row})
  if i+1<a.runs:time.sleep(1)
 directory=Path(a.output_dir);directory.mkdir(parents=True,exist_ok=True)
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(3)
 dest=directory/(a.label+'-'+a.mode+'-'+stamp+'.json')
 with dest.open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
 for row in report['dns']:print('DNS',row)
 for row in report['http']:print('HTTP',row['run'],row['status'],row.get('curl_metrics_cumulative_seconds',{}),'windows',row.get('windows',[]))
 print('Saved:',dest.name)

if __name__=='__main__':main()
