"""Official-core policy A/B with real loopback sockets and artificial DNS delays.

Not a Guangzhou ISP, real VPS, TLS/DoH throughput or OS TUN benchmark.
No timing thresholds: query counts, routing and recovery are correctness gates.
The rejected resolve-removal candidate exists in memory only, never production.
"""
import collections, ipaddress, json, os, platform, socket, socketserver, statistics, struct
import subprocess, tempfile, threading, time
from pathlib import Path
from runtime import BIN, Core, ROOT, World, address, recv_exact

BASELINE=ROOT/'tests/fixtures/vps-7a72e9f-policy.json'
DELAYS={'primary':.040,'backup':.040,'proxy':.080,'proxy-backup':.080,'local':.005}
VARIANTS=['7a72e9f-policy','0325468-policy','candidate-without-direct-resolve']

def question(packet):
 i=12;labels=[]
 while packet[i]:
  n=packet[i];labels.append(packet[i+1:i+1+n].decode());i+=n+1
 return '.'.join(labels),struct.unpack('!H',packet[i+1:i+3])[0]

class TimedWorld(World):
 def __init__(self):
  self.events=[]
  super().__init__()
  owner=self
  class ParallelSOCKS(socketserver.BaseRequestHandler):
   def handle(self):
    stream=self.request;stream.settimeout(3)
    try:
     _,n=recv_exact(stream,2);recv_exact(stream,n);stream.sendall(b'\x05\x00')
     _,cmd,_=recv_exact(stream,3);host,port=address(stream);owner.nodes.append((host,port))
     if cmd==3:
      # The functional fixture intentionally has a simple serial UDP loop.
      # Use independent mock DNS replies here so its artificial sleeps do
      # not serialize A and AAAA on the same SOCKS association.
      with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as udp:
       udp.bind(('127.0.0.1',0));udp.settimeout(.1)
       stream.sendall(b'\x05\x00\x00\x01'+socket.inet_aton('127.0.0.1')+struct.pack('!H',udp.getsockname()[1]))
       def reply(packet,peer):
        try:
         if len(packet)<10 or packet[3]!=1:return
         target_port=struct.unpack('!H',packet[8:10])[0]
         role=next((k for k,v in owner.dns_ports.items() if v==target_port),None)
         if role:
          response=owner.answer(role,packet[10:])
          if response is not None:udp.sendto(packet[:10]+response,peer)
        except OSError:pass
       while owner.available:
        try:packet,peer=udp.recvfrom(8192)
        except socket.timeout:continue
        threading.Thread(target=reply,args=(packet,peer),daemon=True).start()
     elif cmd==1:
      stream.sendall(b'\x05\x00\x00\x01'+socket.inet_aton('127.0.0.1')+b'\x00\x00')
      if stream.recv(8192).startswith((b'GET ',b'HEAD ')):
       stream.sendall(b'HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 8\r\n\r\nproxy-ok')
    except (OSError,EOFError,ValueError):pass
  server=socketserver.ThreadingTCPServer(('127.0.0.1',0),ParallelSOCKS);server.daemon_threads=True
  self.proxy_port=server.server_address[1];self.start(server)
 def answer(self,role,packet):
  name,qt=question(packet);start=time.perf_counter()
  time.sleep(DELAYS[role])
  response=super().answer(role,packet)
  if response and not self.failure.get(role) and role in ['primary','backup']:
   replacement=None
   if name=='copilot.microsoft.com':replacement='127.0.0.1' if qt==1 else '::1'
   elif qt==28 and name.endswith('foreign.example'):replacement='2001:4860:4860::8888'
   if replacement:
    packed=ipaddress.ip_address(replacement).packed;response=response[:-len(packed)]+packed
  self.events.append({'role':role,'name':name,'qtype':qt,'start':start,'end':time.perf_counter()})
  return response

def policy(config,variant):
 if variant=='7a72e9f-policy':
  old=json.loads(BASELINE.read_text())
  config['dns']['rules']=old['dns_rules'];config['route']['rules']=old['route_rules']
  config['experimental']['cache_file'].pop('store_dns',None)
 elif variant=='candidate-without-direct-resolve':
  # Only delete resolve actions immediately preceding a matching direct rule.
  rules=config['route']['rules'];keep=[]
  for i,r in enumerate(rules):
   following=rules[i+1] if i+1<len(rules) else {}
   if r.get('action')=='resolve' and following.get('outbound')=='direct':
    if {k:v for k,v in r.items() if k!='action'}=={k:v for k,v in following.items() if k!='outbound'}:continue
   keep.append(r)
  config['route']['rules']=keep

def request_first_byte(core,host):
 start=time.perf_counter();data=b'';first=None;error=None
 try:
  with socket.create_connection(('127.0.0.1',core.port),timeout=6) as s:
   s.settimeout(6)
   s.sendall(f'GET http://{host}:{core.w.http_port}/ HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n'.encode())
   while True:
    chunk=s.recv(8192)
    if not chunk:break
    if first is None:first=time.perf_counter()
    data+=chunk
 except OSError as e:error=type(e).__name__
 return {'ttfb_ms':None if first is None else round((first-start)*1000,3),
         'elapsed_ms':round((time.perf_counter()-start)*1000,3),
         'result':'direct' if b'direct-ok' in data else 'proxy' if b'proxy-ok' in data else 'failed',
         'error':error}

def measure(world,variant,case,phase,sample,host,operation):
 offset=len(world.events);start=time.perf_counter();result=operation()
 elapsed=(time.perf_counter()-start)*1000
 time.sleep(.100)  # drain any already launched mock requests outside the timed interval
 events=[e for e in world.events[offset:] if e['name']==host]
 row={'variant':variant,'case':case,'phase':phase,'sample':sample,'host':host,
      'elapsed_ms':round(elapsed,3),'queries':dict(collections.Counter(e['role'] for e in events))}
 row.update(result)
 row['events']=[{**{k:e[k] for k in ['role','qtype']},
                 'start_ms':round((e['start']-start)*1000,3),
                 'end_ms':round((e['end']-start)*1000,3)} for e in sorted(events,key=lambda e:e['start'])]
 return row

def run(samples):
 if not BIN:raise SystemExit('Set SING_BOX to the pinned official executable')
 version=subprocess.check_output([BIN,'version'],text=True).splitlines()[0]
 assert version=='sing-box version '+os.environ.get('SING_BOX_VERSION','1.14.2'),version
 subprocess.run(['node','tests/generate.mjs'],cwd=ROOT,check=True)
 rows=[];world=TimedWorld()
 try:
  with tempfile.TemporaryDirectory(prefix='vps-performance-') as tmp:
   tmp=Path(tmp)
   for variant in VARIANTS:
    directory=tmp/variant;directory.mkdir()
    core=Core(world,'config_vps_standalone.json',directory,cache=True)
    config=core.config;policy(config,variant)
    # Expand mock sets to cover fresh subdomains without flushing real caches.
    for r in config['route']['rule_set']:
     if r['tag']=='geosite-foreign':r['rules']=[{'domain_suffix':['foreign.example','github.com','copilot.microsoft.com']}]
    core.path.write_text(json.dumps(config))
    subprocess.run([BIN,'check','-c',str(core.path)],check=True,capture_output=True)
    try:
     core.start()
     for case,domain,answer in [('domestic','baidu.com','127.0.0.1'),
                                ('known-foreign','foreign.example','8.8.8.8'),
                                ('unknown-cn','unknown-cn.example','223.5.5.5'),
                                ('unknown-foreign','unknown-foreign.example','8.8.8.8')]:
      world.unknown_ip=answer
      for qt in [1,28]:
       for sample in range(samples):
        host=f'd{qt}s{sample}.{domain}'
        for phase in ['cold','hot']:
         def query():
          rc,ip=core.dns(host,qt)
          return {'rcode':rc,'ip':ip,'result':'dns'}
         row=measure(world,variant,case+'-dns-'+str(qt),phase,sample,host,query)
         assert row['rcode']==0 and row['ip'],row
         rows.append(row);time.sleep(.020)  # allow asynchronous cache publication, outside measurement
     world.unknown_ip='8.8.8.8'
     for case,domain,expected in [('domestic','baidu.com','direct'),
                                   ('known-foreign','foreign.example','proxy'),
                                   ('unknown-foreign','unknown-foreign.example','proxy'),
                                   ('lan','nas.lan','direct'),
                                   ('github','github.com','proxy'),
                                   ('ai','copilot.microsoft.com','proxy')]:
      for sample in range(samples):
       host=f'hs{sample}.{domain}'
       if case=='ai':
        # AI and Microsoft fixtures both contain this exact host. Use it only
        # once so later repetitions are not falsely labelled cold.
        if sample:continue
        host=domain
       if case=='github':
        # Match the fixture's exact GitHub domain for this priority probe.
        if sample:continue
        host=domain
       for phase in ['cold','hot']:
        row=measure(world,variant,case+'-http',phase,sample,host,lambda:request_first_byte(core,host))
        # Historical AI direct routing is a known fixed defect, not a performance win.
        target='direct' if variant=='7a72e9f-policy' and case=='ai' else expected
        assert row['result']==target,row
        rows.append(row);time.sleep(.020)
     world.failure['primary']='servfail'
     host='failure.baidu.com'
     row=measure(world,variant,'primary-failure-http','cold',0,host,lambda:request_first_byte(core,host))
     assert row['result']==('failed' if variant!='0325468-policy' else 'direct'),row
     if variant=='0325468-policy':assert row['queries'].get('backup',0)>0,row
     if variant=='candidate-without-direct-resolve':assert not row['queries'].get('backup',0),row
     rows.append(row);world.failure.clear()
    finally:core.stop();world.failure.clear()
 finally:world.close()
 # Stable correctness gates, independent of machine speed and injected delays.
 for row in rows:
  if row['phase']=='hot':assert not row['queries'],row
  if row['phase']=='cold' and row['case']=='known-foreign-dns-1':
   assert row['queries']==({'primary':1,'proxy':1} if row['variant']=='7a72e9f-policy' else {'proxy':1}),row
  if row['phase']=='cold' and row['case']=='domestic-http':assert row['queries']=={'primary':2},row  # A + AAAA, not duplicate resolves
 report={'core':version,'host':platform.system(),'samples':samples,
         'measurement':'real official core and loopback sockets; synthetic DNS delays; no OS TUN or real VPS',
         'dns_delay_ms':{k:v*1000 for k,v in DELAYS.items()},'rows':rows,'summary':[]}
 keys=sorted({(r['variant'],r['case'],r['phase']) for r in rows})
 for variant,case,phase in keys:
  group=[r for r in rows if (r['variant'],r['case'],r['phase'])==(variant,case,phase)]
  times=[r.get('ttfb_ms',r['elapsed_ms']) for r in group];times=[t for t in times if t is not None]
  report['summary'].append({'variant':variant,'case':case,'phase':phase,'n':len(group),
     'median_ms':round(statistics.median(times),3) if times else None,
     'queries_per_sample':{role:round(sum(r['queries'].get(role,0) for r in group)/len(group),3) for role in DELAYS},
     'results':dict(collections.Counter(r['result'] for r in group))})
 return report

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--samples',type=int,default=3)
 p.add_argument('--output',default='.test-output/vps-performance.json');args=p.parse_args()
 if not 1<=args.samples<=20:raise SystemExit('samples must be 1..20')
 report=run(args.samples)
 output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
 print('VPS_PERFORMANCE_SUMMARY '+json.dumps({k:v for k,v in report.items() if k!='rows'},separators=(',',':')))
 print('VPS_PERFORMANCE_RAW '+json.dumps(report,separators=(',',':')))
