"""Optional loopback observer A/B, not a VPS/TUN/core or Internet benchmark.

--baseline is the original uploaded vps_client_probe.py. The server runs in a
separate process so its CPU is not counted as observer CPU. No timing gate.
"""
import argparse
import hashlib
import http.server
import importlib.util
import json
import multiprocessing
import os
import platform
import shutil
import time
from pathlib import Path

ORIGINAL_SHA256 = '77d58de2f38e8193784edf01225a91594d31eaafaad7e6ec365d7fb2cb7e7ca3'
SIZE = 64 * 1024 * 1024


def serve(pipe):
    class HTTP(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-Length', str(SIZE))
            self.send_header('Connection', 'close')
            self.end_headers()
            block = b'x' * (1024 * 1024)
            for _ in range(64): self.wfile.write(block)
        def log_message(self, *args): pass
    server = http.server.HTTPServer(('127.0.0.1', 0), HTTP)
    pipe.send(server.server_port)
    pipe.close()
    server.serve_forever()


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('.test-output/observer-ab.json'))
    args = parser.parse_args()
    if hashlib.sha256(args.baseline.read_bytes()).hexdigest() != ORIGINAL_SHA256:
        parser.error('baseline must match the original uploaded attachment SHA256')
    baseline = module(args.baseline, 'original_probe')
    current_path = Path(__file__).resolve().parents[1] / 'vps_client_probe.py'
    current = module(current_path, 'reviewed_probe')
    curl = shutil.which('curl.exe' if os.name == 'nt' else 'curl')
    if not curl: parser.error('system curl required')
    ctx = multiprocessing.get_context('spawn')
    read, write = ctx.Pipe(duplex=False)
    server = ctx.Process(target=serve, args=(write,), daemon=True)
    server.start();write.close()
    rows = []
    try:
        if not read.poll(10): raise RuntimeError('loopback fixture startup failed')
        url = 'http://127.0.0.1:' + str(read.recv()) + '/fixture'
        # Direct loopback sockets; "tun" only disables explicit proxies here.
        for repeat in range(3):
            variants = [('original', baseline, {}), ('reviewed', current, {}),
                        ('native-null-control', current, {'sink': 'null'})]
            if repeat % 2: variants.reverse()
            for name, probe, options in variants:
                cpu = time.process_time();start = time.perf_counter()
                row = probe.probe_http(url, 'tun', 15, curl, **options)
                elapsed = time.perf_counter() - start;cpu = time.process_time() - cpu
                assert row['status'] == 'complete', row
                metrics = row['curl_metrics_cumulative_seconds']
                assert metrics['size_download'] == SIZE
                if name != 'native-null-control': assert row['body_bytes_observed'] == SIZE
                rows.append({'variant': name, 'repeat': repeat + 1, 'bytes': SIZE,
                             'curl_total_s': metrics['time_total'], 'wall_s': round(elapsed, 6),
                             'observer_cpu_s': round(cpu, 6),
                             'curl_mean_mbps': round(SIZE * 8 / metrics['time_total'] / 1e6, 3)})
    finally:
        read.close();server.terminate();server.join(5)
    report = {'scope': 'actual Linux loopback observer A/B; no sing-box, TLS, OS TUN, real VPS or ISP',
              'platform': platform.system(), 'python': platform.python_version(),
              'original_sha256': ORIGINAL_SHA256,
              'reviewed_sha256': hashlib.sha256(current_path.read_bytes()).hexdigest(),
              'rows': rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__': main()
