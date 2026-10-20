"""Official-core loopback route and HY2/TUIC transport regressions.

No OS TUN, real VPS, Internet endpoint or credentials. UDP/443 listeners bind
loopback only; Linux CI grants bind permission with sudo, without changing any
firewall, sysctl, routing table or server parameter. No runtime skips.
"""
import contextlib, hashlib, http.client, http.server, io, json, os, re, socket, socketserver
import ssl, struct, subprocess, tempfile, threading, time, unittest
from pathlib import Path
from runtime import BIN, ROOT, Core, World, address, recv_exact

NAMES = ['config_pc.json', 'config_tun.json', 'config_android.json',
         'config_vps_notun.json', 'config_vps_standalone.json', 'config_vps_android.json']
BODY = b'fixture-download-' * (1024 * 128)
UUID = '11111111-1111-4111-8111-111111111111'


class PacketReader(io.BytesIO):
    recv = io.BytesIO.read


def destination(host, port):
    try:
        packed = socket.inet_pton(socket.AF_INET, host)
        encoded = b'\1' + packed
    except OSError:
        try: encoded = b'\4' + socket.inet_pton(socket.AF_INET6, host)
        except OSError: encoded = b'\3' + bytes([len(host)]) + host.encode()
    return encoded + struct.pack('!H', port)


@contextlib.contextmanager
def association(core):
    with socket.create_connection(('127.0.0.1', core.port), timeout=5) as tcp:
        tcp.settimeout(5);tcp.sendall(b'\5\1\0');assert recv_exact(tcp, 2) == b'\5\0'
        tcp.sendall(b'\5\3\0\1' + b'\0'*6)
        assert recv_exact(tcp, 3) == b'\5\0\0'
        relay = address(tcp)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
            udp.settimeout(1)
            yield udp, relay


def packet(core, host, port):
    with association(core) as (udp, relay):
        udp.sendto(b'\0\0\0' + destination(host, port) + b'\x01compatibility-probe', relay)
        try:
            raw = PacketReader(udp.recv(8192));assert raw.read(3) == b'\0\0\0'
            address(raw);return raw.read()
        except socket.timeout: return None


class MockWorld(World):
    """Echo all destinations locally, including 'direct', without public packets."""
    def __init__(self):
        super().__init__();owner = self
        class SOCKS(socketserver.BaseRequestHandler):
            def handle(self):
                stream = self.request;stream.settimeout(5)
                try:
                    _, n = recv_exact(stream, 2);recv_exact(stream, n);stream.sendall(b'\5\0')
                    _, cmd, _ = recv_exact(stream, 3);host, port = address(stream)
                    if cmd == 1:
                        stream.sendall(b'\5\0\0\1' + b'\x7f\0\0\1' + b'\0\0')
                        owner.nodes.append((host, port))
                        if stream.recv(8192).startswith(b'GET '):
                            stream.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nproxy-ok')
                    elif cmd == 3:
                        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                            udp.bind(('127.0.0.1', 0));udp.settimeout(.1)
                            stream.sendall(b'\5\0\0' + destination('127.0.0.1', udp.getsockname()[1]))
                            while owner.available:
                                try: data, peer = udp.recvfrom(65535)
                                except socket.timeout: continue
                                raw = PacketReader(data);assert raw.read(3) == b'\0\0\0'
                                host, port = address(raw);prefix = data[:raw.tell()];body = raw.read()
                                role = next((r for r, p in owner.dns_ports.items() if p == port), None)
                                response = owner.answer(role, body) if role else body
                                if response is not None: udp.sendto(prefix + response, peer)
                except (OSError, EOFError, ValueError): pass
        server = socketserver.ThreadingTCPServer(('127.0.0.1', 0), SOCKS)
        server.daemon_threads = True;self.proxy_port = server.server_address[1];self.start(server)


def write_core(core):
    core.path.write_text(json.dumps(core.config))
    subprocess.run([BIN, 'check', '-c', str(core.path)], check=True, capture_output=True)


def https_download(core, cert, path):
    with socket.create_connection(('127.0.0.1', core.port), timeout=10) as stream:
        stream.settimeout(10);stream.sendall(b'\5\1\0');assert recv_exact(stream, 2) == b'\5\0'
        stream.sendall(b'\5\1\0'+destination('github.com', 443))
        assert recv_exact(stream, 3) == b'\5\0\0';address(stream)
        context = ssl.create_default_context(cafile=str(cert))
        with context.wrap_socket(stream, server_hostname='github.com') as secure:
            secure.sendall(('GET '+path+' HTTP/1.1\r\nHost: github.com\r\nConnection: close\r\n\r\n').encode())
            response = http.client.HTTPResponse(secure);response.begin()
            assert response.status == 200
            return response.read()


class UDP443Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='udp443-')
        self.tmp = Path(self.temp.name);self.world = MockWorld();self.cores = []
        self.servers = [];self.processes = [];self.logs = []

    def tearDown(self):
        for core in self.cores: core.stop()
        for process in self.processes:
            if process.poll() is None: process.terminate();process.wait(timeout=5)
        for log in self.logs: log.close()
        for server in self.servers: server.shutdown();server.server_close()
        self.world.close();self.temp.cleanup()

    def core(self, name):
        core = Core(self.world, name, self.tmp);self.cores.append(core)
        return core

    def test_all_six_real_core_route_and_mode_boundaries(self):
        for name in NAMES:
            with self.subTest(template=name):
                core = self.core(name)
                # Only the transport implementation of 'direct' is mocked; its
                # route tag and all production rule order/matches are retained.
                direct = next(o for o in core.config['outbounds'] if o['tag'] == 'direct')
                direct.clear();direct.update(type='socks', tag='direct', server='127.0.0.1',
                                             server_port=self.world.proxy_port, version='5')
                write_core(core);core.start()
                for host in ['github.com', 'copilot.microsoft.com', 'google.com', 'foreign.example', '8.8.8.8']:
                    before = len(core.logpath.read_text())
                    self.assertIsNone(packet(core, host, 443), host)
                    log = core.logpath.read_text()[before:]
                    self.assertRegex(log, r'match\[\d+\].*=> reject', host)
                    before = len(core.logpath.read_text())
                    self.assertEqual(packet(core, host, 8443), b'\x01compatibility-probe', host)
                    self.assertNotIn('outbound/socks[direct]', core.logpath.read_text()[before:], host)
                    # SOCKS TCP CONNECT to the same requested target port 443.
                    with socket.create_connection(('127.0.0.1', core.port), timeout=5) as stream:
                        stream.settimeout(5);stream.sendall(b'\5\1\0');recv_exact(stream, 2)
                        stream.sendall(b'\5\1\0' + destination(host, 443));self.assertEqual(recv_exact(stream, 3), b'\5\0\0')
                        address(stream);stream.sendall(('GET / HTTP/1.1\r\nHost: '+host+'\r\n\r\n').encode())
                        self.assertIn(b'proxy-ok', stream.recv(8192))
                    self.assertNotIn('outbound/socks[direct]', core.logpath.read_text()[before:], host)
                for host in ['baidu.com', 'office.com', 'apple.com', 'nas.lan', '127.0.0.9', '223.5.5.5']:
                    before = len(core.logpath.read_text())
                    self.assertEqual(packet(core, host, 443), b'\x01compatibility-probe', host)
                    self.assertIn('outbound/socks[direct]', core.logpath.read_text()[before:], host)
                self.assertEqual(core.dns('dns.baidu.com'), (0, '127.0.0.1'))
                for mode in ['Direct', 'Global']:
                    core.mode(mode)
                    for host in ['github.com', 'copilot.microsoft.com', '8.8.8.8', 'nas.lan']:
                        before = len(core.logpath.read_text())
                        self.assertEqual(packet(core, host, 443), b'\x01compatibility-probe', mode+' '+host)
                        if mode == 'Direct' or host == 'nas.lan':
                            self.assertIn('outbound/socks[direct]', core.logpath.read_text()[before:])
                        else: self.assertNotIn('outbound/socks[direct]', core.logpath.read_text()[before:])
                core.stop()

    def make_tls(self):
        pair = subprocess.check_output([BIN, 'generate', 'tls-keypair', 'github.com'], text=True)
        cert = re.search(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', pair, re.S).group()
        key = re.search(r'-----BEGIN .*?PRIVATE KEY-----.*?-----END .*?PRIVATE KEY-----', pair, re.S).group()
        cert_path = self.tmp/'cert.pem';key_path = self.tmp/'key.pem'
        cert_path.write_text(cert+'\n');key_path.write_text(key+'\n');key_path.chmod(0o600)
        return cert_path, key_path

    def start_server(self, config, label):
        path = self.tmp/(label+'.json');path.write_text(json.dumps(config))
        subprocess.run([BIN, 'check', '-c', str(path)], check=True, capture_output=True)
        log_path = self.tmp/(label+'.log');log = log_path.open('w');self.logs.append(log)
        process = subprocess.Popen([BIN, 'run', '-c', str(path)], stdout=log, stderr=log)
        self.processes.append(process)
        for _ in range(100):
            if process.poll() is not None: self.fail(log_path.read_text())
            if 'sing-box started' in log_path.read_text(): return process, log_path
            time.sleep(.05)
        self.fail('local protocol server startup timed out: '+log_path.read_text())

    def test_real_hy2_tuic_outer_udp443_https_download_and_udp(self):
        cert, key = self.make_tls()
        class HTTPS(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                body = b'website-ok' if self.path == '/small' else BODY
                self.send_response(200);self.send_header('Content-Length', str(len(body)))
                self.end_headers();self.wfile.write(body)
            def log_message(self, *args): pass
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), HTTPS)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(cert, key)
        server.socket = tls.wrap_socket(server.socket, server_side=True)
        self.servers.append(server);threading.Thread(target=server.serve_forever, daemon=True).start()
        class Echo(socketserver.BaseRequestHandler):
            def handle(self): data, udp = self.request;udp.sendto(data, self.client_address)
        echo = socketserver.ThreadingUDPServer(('127.0.0.1', 0), Echo)
        self.servers.append(echo);threading.Thread(target=echo.serve_forever, daemon=True).start()
        for protocol in ['hysteria2', 'tuic']:
            inbound = {'type':protocol, 'tag':'fixture-quic', 'listen':'127.0.0.1', 'listen_port':443,
                       'users':[{'password':'fixture-only', **({'uuid':UUID} if protocol=='tuic' else {})}],
                       'tls':{'enabled':True, 'certificate_path':str(cert), 'key_path':str(key)}}
            server_config = {'log':{'level':'debug'}, 'inbounds':[inbound], 'outbounds':[{'type':'direct','tag':'direct'}],
                'route':{'auto_detect_interface':False,'rules':[
                    {'network':'tcp','action':'route-options','override_address':'127.0.0.1','override_port':server.server_port},
                    {'network':'udp','action':'route-options','override_address':'127.0.0.1','override_port':echo.server_address[1]}], 'final':'direct'}}
            process, server_log = self.start_server(server_config, protocol)
            for name in NAMES:
                with self.subTest(protocol=protocol, template=name):
                    core = self.core(name);node_tags = []
                    for node in core.config['outbounds']:
                        if 'server' not in node: continue
                        tag = node['tag'];node.clear();node.update(type=protocol, tag=tag,
                            server='127.0.0.1', server_port=443, password='fixture-only',
                            tls={'enabled':True,'server_name':'github.com','certificate_path':str(cert)})
                        if protocol == 'tuic': node['uuid'] = UUID
                        node_tags.append(tag)
                    for group in core.config['outbounds']:
                        if group['type']=='selector':
                            manual = next((t for t in group['outbounds'] if t in node_tags), None)
                            if manual: group['default'] = manual
                    write_core(core);core.start()
                    for path in ['/small', '/download']:
                        body = https_download(core, cert, path)
                        expected = b'website-ok' if path=='/small' else BODY
                        self.assertEqual(hashlib.sha256(body).digest(), hashlib.sha256(expected).digest())
                    self.assertEqual(packet(core, 'github.com', 8443), b'\x01compatibility-probe')
                    self.assertIsNone(packet(core, 'github.com', 443))
                    self.assertIn('inbound/'+protocol+'[fixture-quic]', server_log.read_text())
                    print('OFFICIAL_QUIC_OK '+json.dumps({'core':os.environ['SING_BOX_VERSION'], 'template':name,
                        'protocol':protocol,'outer_udp_port':443,'https_download_bytes':len(BODY),
                        'scope':'loopback official client+server; no OS TUN or real VPS'}), flush=True)
                    core.stop()
            # Test-only negative guard before LAN: prevents a false pass merely
            # because the real protocol server happens to be a private IP.
            core = self.core('config_vps_standalone.json')
            for node in core.config['outbounds']:
                if 'server' not in node: continue
                tag = node['tag'];node.clear();node.update(type=protocol, tag=tag, server='127.0.0.1',
                    server_port=443, password='fixture-only',
                    tls={'enabled':True, 'server_name':'github.com','certificate_path':str(cert)})
                if protocol == 'tuic': node['uuid'] = UUID
            core.config['route']['rules'].insert(2, {'network':'udp','port':443,'action':'reject'})
            write_core(core);core.start()
            self.assertIsNone(packet(core, '127.0.0.1', 443))
            self.assertEqual(https_download(core, cert, '/small'), b'website-ok')
            core.stop()
            process.terminate();process.wait(timeout=5)


if __name__ == '__main__':
    if not BIN: raise SystemExit('SING_BOX must name the pinned official core')
    actual = subprocess.check_output([BIN, 'version'], text=True).splitlines()[0]
    assert actual == 'sing-box version '+os.environ['SING_BOX_VERSION'], actual
    if not all((ROOT/'.test-output/generated'/n).exists() for n in NAMES):
        raise SystemExit('Run npm run generate first, before granting UDP/443 bind permission')
    unittest.main(verbosity=2)
