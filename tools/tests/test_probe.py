import ast
import contextlib
import http.server
import importlib.util
import io
import json
import math
import shutil
import socket
import socketserver
import struct
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'vps_client_probe.py'
spec = importlib.util.spec_from_file_location('probe', SCRIPT)
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class ProbeTests(unittest.TestCase):
    def test_python39_syntax(self):
        ast.parse(SCRIPT.read_text(encoding='utf-8'), feature_version=(3, 9))

    def test_private_literals_refused(self):
        for host in ['127.0.0.1', '127.1', '2130706433', '0x7f000001',
                     '10.0.0.1', '100.64.0.1', '169.254.169.254',
                     '[::1]', '[::ffff:127.0.0.1]', '[fe80::1%25en0]']:
            with self.subTest(host=host), self.assertRaises(ValueError):
                p.validate_url('https://' + host + '/')

    def test_public_dns_preflight(self):
        for address in ['127.0.0.1', '192.168.1.1', '198.18.0.1', '::1']:
            with patch.object(p.socket, 'getaddrinfo', return_value=[(0, 0, 0, '', (address, 443))]):
                with self.subTest(address=address), self.assertRaises(ValueError):
                    p.validate_url('https://public-looking.example/')
        with patch.object(p.socket, 'getaddrinfo', return_value=[(0, 0, 0, '', ('8.8.8.8', 443))]):
            self.assertEqual(p.validate_url('https://public.example/'), 'https://public.example/')
        with patch.object(p.socket, 'getaddrinfo', side_effect=socket.gaierror('private hostname')):
            with self.assertRaisesRegex(ValueError, '^public target preflight failed$'):
                p.validate_url('https://unresolved.example/')

    def test_lan_needs_separate_opt_in(self):
        self.assertEqual(p.validate_url('http://127.0.0.1/', True, True), 'http://127.0.0.1/')
        with self.assertRaises(ValueError):
            p.validate_url('http://127.0.0.1/', True)
        with self.assertRaises(ValueError):
            p.validate_url('http://127.0.0.1/', allow_private=True)

    def test_url_syntax_and_privacy(self):
        for url in ['https://u:secret@example.com/', 'ftp://example.com/',
                    'https://example.com/#token', 'https://example.com/\n',
                    'https://example.com:invalid/', 'https://example.com/\t',
                    'https://example.com\\@127.0.0.1/', 'https://localhost/']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                p.validate_url(url)

    def test_cache_claim_guard(self):
        p.validate_cache_label('cold-confirmed', 1, False)
        p.validate_cache_label('hot', 3, True)
        for runs, url in [(3, False), (1, True)]:
            with self.assertRaises(ValueError):
                p.validate_cache_label('cold-confirmed', runs, url)
        with self.assertRaises(ValueError):
            p.validate_cache_label('cold-confirmed', 1, False, 'both')

    def test_dns_packets_and_qtypes(self):
        for qt in [1, 28]:
            packet = p.dns_packet('www.example.com', qt, 17)
            self.assertEqual(struct.unpack('!H', packet[-4:-2])[0], qt)
            self.assertEqual(p.dns_payload(b'\0\0\0\1'+b'\x7f\0\0\1'+b'\0\x35'+packet), packet)
        for name in ['bad/name', 'x\ny', 'a..b', 'a'*64+'.com']:
            with self.assertRaises(ValueError):
                p.dns_packet(name, 1, 1)

    def test_local_entry_failure_distinct(self):
        with patch.object(p.socket, 'create_connection', side_effect=ConnectionRefusedError('secret address')):
            row = p.probe_dns('example.com', 1, 1)
        self.assertEqual(row['status'], 'local_socks_unavailable')
        self.assertNotIn('secret', json.dumps(row))

    def test_udp_unsupported_distinct(self):
        stream = unittest.mock.MagicMock()
        stream.__enter__.return_value = stream
        with patch.object(p.socket, 'create_connection', return_value=stream), \
             patch.object(p, 'recv_exact', side_effect=[b'\5\0', b'\5\7\0']):
            self.assertEqual(p.probe_dns('example.com', 1, 1)['status'], 'udp_unsupported')

    def test_dns_exchange_timeout_distinct(self):
        stream = unittest.mock.MagicMock()
        stream.__enter__.return_value = stream
        udp = unittest.mock.MagicMock()
        udp.__enter__.return_value = udp
        udp.recv.side_effect = socket.timeout('upstream not proven')
        with patch.object(p.socket, 'create_connection', return_value=stream), \
             patch.object(p, 'recv_exact', side_effect=[b'\5\0', b'\5\0\0']), \
             patch.object(p, 'socks_address', return_value=('127.0.0.1', 12345)), \
             patch.object(p.socket, 'socket', return_value=udp):
            self.assertEqual(p.probe_dns('example.com', 28, 1)['status'], 'dns_exchange_timeout')

    def test_same_flow_windows_and_zero_stall(self):
        seconds, windows = p.summarize_rates({i:1000000 for i in range(30)}, 30.1)
        self.assertEqual([r['mbps'] for r in windows], [8, 8, 8])
        seconds, windows = p.summarize_rates({0:1000000}, 5.1)
        self.assertEqual(windows[0]['mbps'], 1.6)
        self.assertIsNone(windows[1]['mbps'])
        self.assertEqual(seconds[2]['bytes'], 0)
        self.assertIsNone(seconds[-1]['mbps'])

    def test_incomplete_second_not_rounded_to_complete(self):
        seconds, _ = p.summarize_rates({0:1000000}, .9995)
        self.assertIsNone(seconds[0]['mbps'])

    def test_metric_allowlist_and_nonfinite(self):
        raw = ('raw secret\nVPSPROBE\t'+'\t'.join(
            '1.1' if key=='http_version' else 'nan' for key in p.FIELDS)+'\n').encode()
        result = p.parse_metrics(raw)
        self.assertNotIn('secret', json.dumps(result))
        self.assertTrue(all(v is None or isinstance(v, str) or math.isfinite(v) for v in result.values()))

    def test_dns_reply_outcomes_and_no_answers_saved(self):
        for flags, count, expected in [(0x8180, 0, 'no_answers'), (0x8180, 1, 'answers'),
                                       (0x8183, 0, 'nxdomain'), (0x8182, 0, 'dns_error'),
                                       (0x8380, 1, 'truncated')]:
            stream=unittest.mock.MagicMock();stream.__enter__.return_value=stream
            udp=unittest.mock.MagicMock();udp.__enter__.return_value=udp
            udp.recv.return_value=b'\0\0\0\1'+b'\x7f\0\0\1'+b'\0\x35'+struct.pack('!HHHHHH', 17, flags, 1, count, 0, 0)
            with patch.object(p.socket, 'create_connection', return_value=stream), \
                 patch.object(p, 'recv_exact', side_effect=[b'\5\0', b'\5\0\0']), \
                 patch.object(p, 'socks_address', return_value=('127.0.0.1', 12345)), \
                 patch.object(p.socket, 'socket', return_value=udp), \
                 patch.object(p.secrets, 'randbelow', return_value=17):
                row=p.probe_dns('private-input.example', 1, 1)
            self.assertEqual(row['dns_result'], expected)
            self.assertNotIn('private-input', json.dumps(row))
            self.assertNotIn('127.0.0.1', json.dumps(row))

    def test_loopback_socks_udp_wire_exchange(self):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
            udp.bind(('127.0.0.1', 0));udp.settimeout(3)
            relay_port=udp.getsockname()[1]
            class SOCKS(socketserver.BaseRequestHandler):
                def handle(self):
                    p.recv_exact(self.request, 3);self.request.sendall(b'\5\0')
                    p.recv_exact(self.request, 10)
                    self.request.sendall(b'\5\0\0\1'+socket.inet_aton('127.0.0.1')+struct.pack('!H', relay_port))
                    self.request.recv(1)
            server=socketserver.ThreadingTCPServer(('127.0.0.1', 0), SOCKS);server.daemon_threads=True
            threading.Thread(target=server.serve_forever, daemon=True).start()
            def reply():
                for _ in range(2):
                    packet, peer=udp.recvfrom(8192)
                    query=packet[10:]
                    response=query[:2]+struct.pack('!HHHHH', 0x8180, 1, 0, 0, 0)+query[12:]
                    udp.sendto(packet[:10]+response, peer)
            worker=threading.Thread(target=reply, daemon=True);worker.start()
            original=socket.create_connection
            try:
                with patch.object(p.socket, 'create_connection', side_effect=lambda address, **kw:
                                  original(('127.0.0.1', server.server_address[1]), **kw)):
                    for qt in [1, 28]:
                        row=p.probe_dns('example.com', qt, 2)
                        self.assertEqual(row['status'], 'reply')
                        self.assertEqual(row['dns_result'], 'no_answers')
                worker.join(3);self.assertFalse(worker.is_alive())
            finally:
                server.shutdown();server.server_close()

    def test_entry_commands_and_time_limit(self):
        for mode in ['http', 'socks', 'tun']:
            child=unittest.mock.MagicMock();child.__enter__.return_value=child
            child.stdout.read.side_effect=[b'x'*100, b''];child.wait.return_value=28
            metrics={'http_code':'200', 'size_download':'100', 'http_version':'1.1'}
            child.stderr.read.return_value=('VPSPROBE\t'+'\t'.join(metrics.get(k,'0') for k in p.FIELDS)+'\n').encode()
            with patch.object(p.subprocess, 'Popen', return_value=child) as popen, \
                 patch.dict(p.os.environ, {'HTTPS_PROXY':'http://private-proxy.invalid'}):
                row=p.probe_http('https://private-input.example/secret?token=dummy', mode, 5, 'curl')
            command=popen.call_args.args[0];env=popen.call_args.kwargs['env']
            self.assertEqual(command[:2], ['curl', '-q'])
            self.assertIn('--http1.1', command)
            self.assertNotIn('--location', command)
            self.assertFalse(any('private-input' in arg for arg in command))
            self.assertNotIn('HTTPS_PROXY', env)
            self.assertEqual('--proxy' in command, mode=='http')
            self.assertEqual('--socks5-hostname' in command, mode=='socks')
            self.assertEqual(row['status'], 'time_limit_with_data')
            self.assertNotIn('private-input', json.dumps(row))

    def test_cli_json_privacy_and_sanitized_process_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            args=['probe', '--url', 'http://127.0.0.1/private?secret=dummy',
                  '--allow-http', '--allow-private', '--label', 'N01', '--output-dir', temp]
            with patch.object(sys, 'argv', args), patch.object(p.shutil, 'which', return_value='curl'), \
                 patch.object(p.subprocess, 'check_output', return_value='curl 8.0.0 private-build-host\n'), \
                 patch.object(p, 'probe_http', side_effect=OSError('secret URL')), \
                 contextlib.redirect_stdout(io.StringIO()) as out:
                p.main()
            report=json.loads(next(Path(temp).glob('*.json')).read_text())
            combined=json.dumps(report)+out.getvalue()
            for value in ['127.0.0.1', 'private-build-host', 'secret URL', '?secret=']:
                self.assertNotIn(value, combined)
            self.assertFalse(report['cache_state_verified_by_tool'])
            self.assertEqual(report['http'][0]['failure_kind'], 'curl_process_failed')

    def test_cli_rejects_real_node_labels_and_mixed_family(self):
        for extra in [['--label', 'Real-Node-Name'], ['--mode', 'socks', '--family', '6']]:
            with patch.object(sys, 'argv', ['probe', '--dns-domain', 'example.com']+extra), \
                 contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                p.main()

    @unittest.skipUnless(shutil.which('curl.exe' if sys.platform=='win32' else 'curl'), 'system curl required')
    def test_loopback_stream_null_and_no_redirect(self):
        class HTTP(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path=='/redirect':
                    self.send_response(302);self.send_header('Location', '/secret');self.end_headers();return
                self.send_response(200);self.send_header('Content-Length', '65536');self.end_headers()
                self.wfile.write(b'x'*32768);self.wfile.flush();time.sleep(.05);self.wfile.write(b'x'*32768)
            def log_message(self, *args): pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1', 0), HTTP)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        curl=shutil.which('curl.exe' if sys.platform=='win32' else 'curl')
        try:
            url='http://127.0.0.1:'+str(server.server_port)+'/'
            row=p.probe_http(url, 'tun', 5, curl)
            self.assertEqual(row['status'], 'complete')
            self.assertEqual(row['body_bytes_observed'], 65536)
            self.assertTrue(row['body_bytes_match_curl'])
            self.assertNotIn('127.0.0.1', json.dumps(row))
            row=p.probe_http(url, 'tun', 5, curl, sink='null')
            self.assertEqual(row['status'], 'complete')
            self.assertIsNone(row['body_bytes_observed'])
            self.assertEqual(row['per_second'], [])
            self.assertEqual(p.probe_http(url+'redirect', 'tun', 5, curl)['status'], 'failed')
        finally:
            server.shutdown();server.server_close()


if __name__=='__main__': unittest.main()
