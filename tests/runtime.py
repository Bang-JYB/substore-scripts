"""Official core, real sockets, no TUN/admin: test DNS/routing and remote cache lifecycle.
Only fixture nodes, DNS endpoints, rule-set contents, listeners and short test timeouts
are substituted. Business rule order, fallback actions and remote HTTP detours are retained.
This does NOT validate an OS VPN driver's behavior. Runtime may only be skipped by an
explicit ALLOW_CORE_RUNTIME_SKIP=1 on a restricted developer machine; CI never sets it.
"""
import contextlib, copy, http.server, ipaddress, json, os, re, socket, socketserver
import struct, subprocess, tempfile, threading, time, unittest, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BIN=os.environ.get('SING_BOX')

def free_ports(count):
 # Hold all sockets until the pair is allocated; sequential close/rebind may reuse a port.
 with contextlib.ExitStack() as stack:
  sockets=[stack.enter_context(socket.socket()) for _ in range(count)]
  for s in sockets:s.bind(('127.0.0.1',0))
  return tuple(s.getsockname()[1] for s in sockets)

def recv_exact(s,n):
 data=b''
 while len(data)<n:
  p=s.recv(n-len(data))
  if not p:raise EOFError()
  data+=p
 return data

def address(s):
 atyp=recv_exact(s,1)[0]
 if atyp==1:host=socket.inet_ntoa(recv_exact(s,4))
 elif atyp==3:host=recv_exact(s,recv_exact(s,1)[0]).decode()
 elif atyp==4:host=socket.inet_ntop(socket.AF_INET6,recv_exact(s,16))
 else:raise ValueError(atyp)
 return host,struct.unpack('!H',recv_exact(s,2))[0]

class World:
 def __init__(self):
  self.available=True;self.failure={};self.calls=[];self.nodes=[];self.rule_bytes={};self.unknown_ip='223.5.5.5';self.servers=[]
  self.dns_ports={}
  for role in ['primary','backup','local','proxy','proxy-backup']:
   owner=self
   class DNS(socketserver.BaseRequestHandler):
    def handle(self):
     data,s=self.request;r=owner.answer(self.server.role,data)
     if r is not None:s.sendto(r,self.client_address)
   server=socketserver.ThreadingUDPServer(('127.0.0.1',0),DNS);server.daemon_threads=True;server.role=role
   self.dns_ports[role]=server.server_address[1];self.start(server)
  owner=self
  class HTTP(http.server.BaseHTTPRequestHandler):
   def do_GET(self):
    body=owner.rule_bytes.get(self.path.rsplit('/',1)[-1],b'direct-ok')
    self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
   def log_message(self,*args):pass
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),HTTP);self.http_port=server.server_address[1];self.start(server)
  class SOCKS(socketserver.BaseRequestHandler):
   def handle(self):
    t=self.request;t.settimeout(3)
    try:
     if not owner.available:return
     version,n=recv_exact(t,2);recv_exact(t,n);t.sendall(b'\x05\x00')
     version,cmd,_=recv_exact(t,3);host,port=address(t);owner.nodes.append((host,port))
     if cmd==3:
      u=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);u.bind(('127.0.0.1',0));u.settimeout(.2)
      t.sendall(b'\x05\x00\x00\x01'+socket.inet_aton('127.0.0.1')+struct.pack('!H',u.getsockname()[1]))
      try:
       while owner.available:
        try:p,peer=u.recvfrom(8192)
        except socket.timeout:continue
        if p[3]!=1:continue
        target_port=struct.unpack('!H',p[8:10])[0]
        role=next((k for k,v in owner.dns_ports.items() if v==target_port),None)
        if role:
         r=owner.answer(role,p[10:])
         if r is not None:u.sendto(p[:10]+r,peer)
      finally:u.close()
     elif cmd==1:
      t.sendall(b'\x05\x00\x00\x01'+socket.inet_aton('127.0.0.1')+b'\x00\x00')
      data=t.recv(8192)
      if not data.startswith((b'GET ',b'HEAD ')):return  # urltest HTTPS is intentionally not a network dependency
      path=data.split(b' ',2)[1].decode();body=owner.rule_bytes.get(path.rsplit('/',1)[-1],b'proxy-ok')
      t.sendall(b'HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: '+str(len(body)).encode()+b'\r\n\r\n'+body)
    except (OSError,EOFError,ValueError):pass
  server=socketserver.ThreadingTCPServer(('127.0.0.1',0),SOCKS);server.daemon_threads=True;self.proxy_port=server.server_address[1];self.start(server)
 def start(self,s):
  self.servers.append(s);threading.Thread(target=s.serve_forever,daemon=True).start()
 def answer(self,role,p):
  i=12;labels=[]
  while p[i]:n=p[i];labels.append(p[i+1:i+1+n].decode());i+=n+1
  i+=1;name='.'.join(labels);qt=struct.unpack('!H',p[i:i+2])[0];end=i+4;self.calls.append((role,name,qt))
  failure=self.failure.get(role)
  if failure=='timeout':return None
  rc={'servfail':2,'nxdomain':3,'nodata':0}.get(failure,0)
  answer=b''
  if not failure and qt in [1,28]:
   if role in ['proxy','proxy-backup']:ip='8.8.8.8' if qt==1 else '2001:4860:4860::8888'
   elif name=='node.bootstrap.invalid' or name.endswith(('.qq.com','.lan')) or name in ['office.com','apple.com','baidu.com']:ip='127.0.0.1' if qt==1 else '::1'
   else:ip=self.unknown_ip if qt==1 else '2400:3200::1'
   packed=ipaddress.ip_address(ip).packed
   answer=b'\xc0\x0c'+struct.pack('!HHIH',qt,1,30,len(packed))+packed
  return p[:2]+struct.pack('!HHHHH',0x8180|rc,1,int(bool(answer)),0,0)+p[12:end]+answer
 def close(self):
  self.available=False
  for s in self.servers:s.shutdown();s.server_close()

FIXTURES={
 'geoip-cn':[{'ip_cidr':['223.0.0.0/8','2400:3200::/32']}],
 'geosite-cn':[{'domain_suffix':['baidu.com']}],
 'geosite-private':[{'domain_suffix':['lan','home.arpa']}],
 'geosite-github':[{'domain_suffix':['github.com','githubusercontent.com']}],
 'geosite-ai':[{'domain':['chatgpt.com','copilot.microsoft.com','gemini.google.com']}],
 'geosite-microsoft':[{'domain_suffix':['office.com','github.com','copilot.microsoft.com']}],
 'geosite-apple':[{'domain_suffix':['apple.com']}],
 'geosite-foreign':[{'domain':['foreign.example','github.com','chatgpt.com','google.com']}],
 'geosite-google':[{'domain_suffix':['google.com']}],
}

class Core:
 def __init__(self,world,name,tmp,remote=False,seeds=False,cache=False,node_domain=False):
  self.w=world;self.name=name;self.tmp=tmp;self.port,self.api_port=free_ports(2)
  c=json.loads((ROOT/'.test-output/generated'/name).read_text());self.config=c
  c['inbounds']=[{'type':'mixed','tag':'mixed-in','listen':'127.0.0.1','listen_port':self.port}]
  c['route']['auto_detect_interface']=False
  c['log']={'level':'debug','timestamp':True};c['dns'].pop('optimistic',None);c['dns']['disable_cache']=not cache
  c['experimental']['cache_file']={'enabled':cache,'path':str(tmp/(name+'.db')),'store_dns':True,'store_fakeip':not name.startswith('config_vps_')}
  c['experimental']['clash_api']={'external_controller':f'127.0.0.1:{self.api_port}','default_mode':'Rule'}
  for o in c['outbounds']:
   if 'server' in o:o.update(type='socks',server='node.bootstrap.invalid' if node_domain else '127.0.0.1',server_port=world.proxy_port,version='5')
  for s in c['dns']['servers']:
   role={'ali':'primary','vps-dns':'primary','tx':'backup','local':'local','google':'proxy','proxy-dns':'proxy','proxy-backup':'proxy-backup'}.get(s['tag'])
   if role:
    tag=s['tag'];detour=s.get('detour');s.clear();s.update(type='udp',tag=tag,server='127.0.0.1',server_port=world.dns_ports[role])
    if detour:s['detour']=detour
  for r in c['route']['rule_set']:
   tag=r['tag'];rules=FIXTURES.get(tag,[{'domain':['fixture-never-match.invalid']}])
   if remote:
    source=tmp/(tag+'.json');source.write_text(json.dumps({'version':4,'rules':rules}))
    seed=tmp/(tag+'.srs');subprocess.run([BIN,'rule-set','compile',str(source),'-o',str(seed)],check=True,capture_output=True)
    world.rule_bytes[tag+'.srs']=seed.read_bytes();r['url']=f'http://rules.fixture.invalid:{world.http_port}/rules/{tag}.srs';r['update_interval']='1s'
    if seeds:r['initial_path']=str(seed)
   else:r.clear();r.update(type='inline',tag=tag,rules=rules)
  self.path=tmp/('runtime-'+name);self.path.write_text(json.dumps(c));self.logpath=tmp/('runtime-'+name+'.log')
 def start(self,expect_failure=False):
  self.log=self.logpath.open('w');self.p=subprocess.Popen([BIN,'run','-c',str(self.path)],stdout=self.log,stderr=self.log)
  for _ in range(120):
   if self.p.poll() is not None:
    detail=self.logpath.read_text()
    if 'netlink socket: operation not permitted' in detail and os.getenv('ALLOW_CORE_RUNTIME_SKIP')=='1':raise unittest.SkipTest('Host prohibits netlink; official runtime tests must run in CI')
    if expect_failure:return
    raise AssertionError(detail)
   try:
    with socket.create_connection(('127.0.0.1',self.port),timeout=.05):pass
    if expect_failure:raise AssertionError('unexpected startup success without rules/cache/node')
    return
   except OSError:time.sleep(.05)
  raise AssertionError('startup timed out: '+self.logpath.read_text())
 def stop(self):
  if hasattr(self,'p') and self.p.poll() is None:self.p.terminate();self.p.wait(timeout=5)
  if hasattr(self,'log'):self.log.close()
 def mode(self,mode):
  req=urllib.request.Request(f'http://127.0.0.1:{self.api_port}/configs',data=json.dumps({'mode':mode}).encode(),method='PATCH',headers={'Content-Type':'application/json'})
  urllib.request.urlopen(req,timeout=2).close()
 def dns(self,name,qt=1):
  with socket.create_connection(('127.0.0.1',self.port),timeout=7) as t:
   t.settimeout(7);t.sendall(b'\x05\x01\x00');assert recv_exact(t,2)==b'\x05\x00'
   t.sendall(b'\x05\x03\x00\x01'+b'\x00'*6);assert recv_exact(t,3)==b'\x05\x00\x00';host,port=address(t)
   with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as u:
    u.settimeout(7);qname=b''.join(bytes([len(x)])+x.encode() for x in name.split('.'))+b'\x00'
    q=struct.pack('!HHHHHH',55,0x100,1,0,0,0)+qname+struct.pack('!HH',qt,1)
    u.sendto(b'\x00\x00\x00\x01'+socket.inet_aton('8.8.4.4')+struct.pack('!H',53)+q,(host,port))
    try:r=u.recv(8192)[10:]
    except socket.timeout:return -1,None
    count=struct.unpack('!H',r[6:8])[0]
    ip=str(ipaddress.ip_address(r[-(4 if qt==1 else 16):])) if count else None
    return r[3]&15,ip
 def http(self,host):
  with socket.create_connection(('127.0.0.1',self.port),timeout=6) as s:
   s.settimeout(6);s.sendall(f'GET http://{host}:{self.w.http_port}/ HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n'.encode());data=b''
   while True:
    p=s.recv(8192)
    if not p:break
    data+=p
   return data.decode(errors='replace')

@unittest.skipUnless(BIN,'Set SING_BOX to official 1.14.2')
class RuntimeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  subprocess.run(['node','tests/generate.mjs'],cwd=ROOT,check=True)
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='ybs-runtime-');self.tmp=Path(self.temp.name);self.w=World();self.cores=[]
 def tearDown(self):
  for c in self.cores:c.stop()
  self.w.close();self.temp.cleanup()
 def core(self,name,**kw):
  c=Core(self.w,name,self.tmp,**kw);self.cores.append(c);c.start();return c
 def count(self,role,name):return sum(r==role and n==name for r,n,_ in self.w.calls)
 def test_all_six_domestic_dns_failover_and_proxy_isolation(self):
  for name in sorted(p.name for p in (ROOT/'.test-output/generated').glob('*.json')):
   with self.subTest(template=name):
    c=self.core(name);self.w.available=False
    self.assertEqual(c.dns('healthy.qq.com'),(0,'127.0.0.1'));self.assertEqual(self.count('backup','healthy.qq.com'),0)
    self.assertEqual(c.dns('ipv6.qq.com',28),(0,'::1') if name.startswith('config_vps_') else (0,None))
    self.w.failure['primary']='servfail';self.assertEqual(c.dns('fallback.qq.com'),(0,'127.0.0.1'))
    self.assertGreater(self.count('backup','fallback.qq.com'),0)
    self.assertIn('direct-ok',c.http('http-fallback.qq.com'))
    self.w.failure['primary']='timeout';self.assertEqual(c.dns('timeout.qq.com'),(0,'127.0.0.1'))
    self.w.failure['primary']='nxdomain';self.assertEqual(c.dns('negative.qq.com'),(3,None));self.assertEqual(self.count('backup','negative.qq.com'),0)
    self.w.failure['primary']='nodata';self.assertEqual(c.dns('nodata.qq.com'),(0,None));self.assertEqual(self.count('backup','nodata.qq.com'),0)
    self.w.failure.update(primary='servfail',backup='servfail');self.assertNotEqual(c.dns('both-down.qq.com'),(0,'127.0.0.1'))
    self.assertEqual(self.count('proxy','both-down.qq.com'),0);self.assertEqual(self.count('proxy-backup','both-down.qq.com'),0)
    self.w.failure.clear();self.assertEqual(c.dns('not-listed.example'),(0,'223.5.5.5'))
    self.w.failure['primary']='servfail';self.assertEqual(c.dns('not-listed-backup.example'),(0,'223.5.5.5'))
    c.mode('Global');self.assertEqual(c.dns('nas.lan'),(0,'127.0.0.1'));self.assertIn('direct-ok',c.http('nas.lan'))
    c.stop();self.w.failure.clear();self.w.available=True
 def test_proxy_dns_backup_and_ai_precedence(self):
  for name in ['config_tun.json','config_vps_standalone.json']:
   with self.subTest(template=name):
    c=self.core(name);self.w.failure['proxy']='servfail'
    for domain in ['github.com','copilot.microsoft.com']:
     self.assertEqual(c.dns(domain),(0,'8.8.8.8'));self.assertGreater(self.count('proxy-backup',domain),0);self.assertEqual(self.count('primary',domain),0)
     self.assertIn('proxy-ok',c.http(domain))
    if name.startswith('config_vps_'):
     c.mode('Global');self.assertEqual(c.dns('global.qq.com'),(0,'8.8.8.8'));self.assertGreater(self.count('proxy-backup','global.qq.com'),0);c.mode('Rule')
    self.w.available=False;self.w.failure.clear();self.assertIn('direct-ok',c.http('outage.qq.com'));c.stop();self.w.available=True
 def test_fakeip_is_resolved_before_direct_fallback(self):
  c=self.core('config_tun.json');self.w.available=False;self.w.unknown_ip='8.8.8.8'
  rc,fake=c.dns('dynamic-unknown.example');self.assertEqual(rc,0);self.assertIn(ipaddress.ip_address(fake),ipaddress.ip_network('198.19.0.0/16'))
  self.w.unknown_ip='127.0.0.1'
  self.assertIn('direct-ok',c.http(fake))
  self.assertNotIn('missing fakeip record',c.logpath.read_text())
 def test_explicit_node_bootstrap_failure_is_isolated_and_recovers(self):
  for name in sorted(p.name for p in (ROOT/'.test-output/generated').glob('*.json')):
   with self.subTest(template=name):
    self.w.calls.clear();self.w.nodes.clear();self.w.failure['primary']='servfail'
    c=self.core(name,node_domain=True)
    # Primary failure blocks domain-based nodes even though application DNS has a backup.
    try:response=c.http('github.com')
    except OSError:response=''
    self.assertNotIn('proxy-ok',response)
    self.assertGreater(self.count('primary','node.bootstrap.invalid'),0)
    self.assertEqual(self.count('backup','node.bootstrap.invalid'),0)
    self.assertEqual(self.count('proxy','node.bootstrap.invalid'),0)
    self.assertEqual(self.count('proxy-backup','node.bootstrap.invalid'),0)
    self.assertFalse(self.w.nodes)
    self.assertIn('direct-ok',c.http('bootstrap-outage.qq.com'))
    self.assertGreater(self.count('backup','bootstrap-outage.qq.com'),0)
    # Recovery is in-process; no DNS loop, restart or persistent cache deletion.
    self.w.failure.clear();self.assertIn('proxy-ok',c.http('github.com'));c.stop()
    # An IP-literal node does not need this bootstrap resolver.
    self.w.calls.clear();self.w.failure['primary']='servfail'
    c=self.core(name);self.assertIn('proxy-ok',c.http('github.com'))
    self.assertEqual(self.count('primary','node.bootstrap.invalid'),0);c.stop();self.w.failure.clear()

 def test_rule_seed_warm_cache_and_failed_updates(self):
  for name in ['config_tun.json','config_vps_standalone.json']:
   with self.subTest(template=name):
    # No cache, no initial seeds, no proxy must fail explicitly.
    self.w.available=False;c=Core(self.w,name,self.tmp,remote=True,cache=True);self.cores.append(c);c.start(expect_failure=True)
    self.assertIsNotNone(c.p.poll());self.assertIn('initial rule-set',c.logpath.read_text());c.stop()
    # Initial files keep the full remote rule definitions and allow offline startup.
    c=self.core(name,remote=True,seeds=True,cache=True);self.assertIn('direct-ok',c.http('seed.qq.com'));time.sleep(1.3)
    self.assertIsNone(c.p.poll());self.assertIn('fetch rule-set',c.logpath.read_text());c.stop()
    # Fetch remote rules successfully to populate the actual persistent cache.
    self.w.available=True;c=self.core(name,remote=True,cache=True);time.sleep(.2);self.assertEqual(self.count('primary','rules.fixture.invalid'),0);c.stop()
    # With cache, a failed proxy/update must not discard rules or stop direct traffic.
    self.w.available=False;c=self.core(name,remote=True,cache=True);time.sleep(1.3)
    self.assertIsNone(c.p.poll());self.assertIn('direct-ok',c.http('cached.qq.com'));c.stop();self.w.available=True

if __name__=='__main__':
 if not BIN:raise SystemExit('Set SING_BOX to the official 1.14.2 executable')
 unittest.main(verbosity=2)
