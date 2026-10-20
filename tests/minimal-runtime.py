"""Optional recovery profile: official core, loopback only; never an ISP/VPS test."""
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from runtime import BIN, ROOT, Core, World

NAME = 'config_vps_minimal.json'


class MinimalRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='vps-minimal-')
        self.world = World()
        self.cores = []

    def tearDown(self):
        for core in self.cores:
            core.stop()
        self.world.close()
        self.temp.cleanup()

    def core(self, name=NAME, cache=False):
        core = Core(self.world, name, Path(self.temp.name), cache=cache)
        self.cores.append(core)
        core.start()
        return core

    def count(self, role, name):
        return sum(r == role and n == name for r, n, _ in self.world.calls)

    def test_rule_free_startup_dns_backup_cache_and_lan_outage(self):
        core = self.core(cache=True)
        self.assertEqual(core.config['route']['rule_set'], [])
        self.assertEqual(core.dns('google.com'), (0, '8.8.8.8'))
        self.assertEqual(self.count('primary', 'google.com'), 0)
        self.assertEqual(core.dns('google.com'), (0, '8.8.8.8'))
        self.assertEqual(self.count('proxy', 'google.com'), 1)
        self.assertEqual(core.dns('ipv6.google.com', 28), (0, '2001:4860:4860::8888'))
        for failure in ['servfail', 'timeout']:
            self.world.failure['proxy'] = failure
            name = failure+'.google.com'
            self.assertEqual(core.dns(name), (0, '8.8.8.8'))
            self.assertGreater(self.count('proxy-backup', name), 0)
        for failure, expected in [('nxdomain', (3, None)), ('nodata', (0, None))]:
            self.world.failure['proxy'] = failure
            name = failure+'.google.com'
            self.assertEqual(core.dns(name), expected)
            self.assertEqual(self.count('proxy-backup', name), 0)
        self.world.failure.clear()
        self.world.available = False
        self.assertEqual(core.dns('nas.lan'), (0, '127.0.0.1'))
        self.assertIn('direct-ok', core.http('nas.lan'))
        # No rule download is needed for a fresh startup with a dead node.
        core.stop()
        offline = self.core()
        self.assertIn('direct-ok', offline.http('nas.lan'))

    def test_direct_mode_dns_fallback_and_public_proxy_boundary(self):
        core = self.core()
        for domain in ['google.com', 'www.gstatic.com', 'about.google', 'baidu.com']:
            self.assertIn('proxy-ok', core.http(domain))
        core.mode('Direct')
        self.world.available = False
        self.world.failure['primary'] = 'servfail'
        self.assertEqual(core.dns('fallback.baidu.com'), (0, '127.0.0.1'))
        self.assertGreater(self.count('backup', 'fallback.baidu.com'), 0)
        self.assertIn('direct-ok', core.http('http-fallback.baidu.com'))

    def test_query_count_comparison_is_a_policy_change_not_a_speed_claim(self):
        self.world.unknown_ip = '8.8.8.8'
        old = self.core('config_vps_standalone.json')
        new = self.core()
        rows = []
        for label, core in [('main-split', old), ('minimal-public-proxy', new)]:
            names = ['google.com', 'unclassified.example']
            counts = {}
            for name in names:
                self.world.calls.clear()
                self.assertEqual(core.dns(name), (0, '8.8.8.8'))
                counts[name] = {role:self.count(role, name) for role in ['primary', 'proxy']}
            rows.append({'profile':label, 'queries':counts})
        self.assertEqual(rows[0]['queries']['google.com'], rows[1]['queries']['google.com'])
        self.assertEqual(rows[0]['queries']['unclassified.example'], {'primary':1, 'proxy':1})
        self.assertEqual(rows[1]['queries']['unclassified.example'], {'primary':0, 'proxy':1})
        print('MINIMAL_CONTROLLED_QUERY_COUNTS '+json.dumps(rows), flush=True)


if __name__ == '__main__':
    if not BIN:
        raise SystemExit('SING_BOX must name the pinned official core')
    actual = subprocess.check_output([BIN, 'version'], text=True).splitlines()[0]
    assert actual == 'sing-box version '+os.environ['SING_BOX_VERSION'], actual
    subprocess.run(['node', 'tests/generate.mjs'], cwd=ROOT, check=True)
    script = """
import fs from 'node:fs';
import {generate,root} from './tests/helpers.mjs';
const template=JSON.parse(fs.readFileSync('examples/vps-minimal/config_vps_minimal.json'));
const config=await generate('config_vps_standalone.json',undefined,undefined,{},root,template);
fs.writeFileSync('.test-output/generated/config_vps_minimal.json',JSON.stringify(config));
"""
    subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True)
    spec = importlib.util.spec_from_file_location('minimal_quic', ROOT/'tests/udp443-runtime.py')
    quic = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(quic)
    quic.NAMES = [NAME]
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(MinimalRuntimeTests)
    # Reuse the complete existing real HY2/TUIC test, without weakening its assertions.
    suite.addTest(quic.UDP443Tests('test_real_hy2_tuic_outer_udp443_https_download_and_udp'))
    try:
        result = unittest.TextTestRunner(verbosity=2).run(suite)
    finally:
        (ROOT/'.test-output/generated'/NAME).unlink(missing_ok=True)
    raise SystemExit(0 if result.wasSuccessful() else 1)
