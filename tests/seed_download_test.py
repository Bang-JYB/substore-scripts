import importlib.util,json,subprocess,tempfile,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('seeds',Path(__file__).resolve().parents[1]/'scripts/prepare-rule-seeds.py');seeds=importlib.util.module_from_spec(spec);spec.loader.exec_module(seeds)
class Response:
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self):return b'fixture-srs'
class SeedTests(unittest.TestCase):
 def test_failed_download_or_invalid_binary_preserves_old_seed(self):
  for error in [urllib.error.URLError('offline'),subprocess.CalledProcessError(1,'core')]:
   with self.subTest(error=type(error).__name__),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);out=root/'seeds';out.mkdir();old=out/'geosite-cn.srs';old.write_bytes(b'old-good')
    config=root/'config.json';config.write_text(json.dumps({'route':{'rule_set':[{'type':'remote','tag':'geosite-cn','url':'https://example.com/rules.srs'}]}}))
    with patch.object(seeds.urllib.request.OpenerDirector,'open',side_effect=error if isinstance(error,urllib.error.URLError) else None,return_value=Response()),patch.object(seeds.subprocess,'run',side_effect=error if isinstance(error,subprocess.CalledProcessError) else None):
     with self.assertRaises(Exception):seeds.prepare(config,out,'fixture-core')
    self.assertEqual(old.read_bytes(),b'old-good')
 def test_success_publishes_manifest_and_file(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);config=root/'config.json';config.write_text(json.dumps({'route':{'rule_set':[{'type':'remote','tag':'geosite-cn','url':'https://example.com/rules.srs'}]}}))
   with patch.object(seeds.urllib.request.OpenerDirector,'open',return_value=Response()),patch.object(seeds.subprocess,'run'):
    manifest=seeds.prepare(config,root/'seeds','fixture-core')
   self.assertEqual((root/'seeds/geosite-cn.srs').read_bytes(),b'fixture-srs')
   self.assertEqual(manifest['geosite-cn']['sha256'],seeds.hashlib.sha256(b'fixture-srs').hexdigest())
if __name__=='__main__':unittest.main(verbosity=2)
