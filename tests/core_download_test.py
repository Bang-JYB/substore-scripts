"""Offline regression tests for version pinning and digest enforcement."""
import contextlib, hashlib, importlib.util, io, os, tarfile, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('core_download',Path(__file__).resolve().parents[1]/'scripts/download-core.py')
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)

class CoreDownloadTests(unittest.TestCase):
 def test_default_remains_1142_and_unknown_versions_never_download(self):
  self.assertEqual(core.DEFAULT_VERSION,'1.14.2')
  self.assertEqual(set(core.DIGESTS),{'1.14.2','1.14.3'})
  for digests in core.DIGESTS.values():
   self.assertEqual(set(digests),{'linux-amd64','windows-amd64','darwin-amd64','darwin-arm64'})
   for digest in digests.values():self.assertRegex(digest,r'^[a-f0-9]{64}$')
  with patch.dict(os.environ,{'SING_BOX_VERSION':'latest'},clear=True),patch.object(core.urllib.request,'urlopen') as download:
   with self.assertRaisesRegex(SystemExit,'Unsupported validation version'):core.main()
   download.assert_not_called()
 def test_bad_digest_never_extracts_or_publishes_core(self):
  with tempfile.TemporaryDirectory() as tmp,contextlib.chdir(tmp),patch.dict(os.environ,{'GITHUB_ENV':str(Path(tmp)/'env')},clear=True):
   dest=Path('.test-output/core');dest.mkdir(parents=True)
   (dest/'sing-box-1.14.2-linux-amd64.tar.gz').write_bytes(b'wrong-core')
   with patch.object(core.platform,'system',return_value='Linux'),patch.object(core.platform,'machine',return_value='x86_64'),patch.object(core.tarfile,'open') as extract:
    with self.assertRaisesRegex(SystemExit,'SHA256 mismatch'):core.main()
    extract.assert_not_called()
   self.assertFalse(Path(tmp,'env').exists())
 def test_each_requested_version_downloads_and_publishes_its_own_verified_binary(self):
  for version in ['1.14.2','1.14.3']:
   with self.subTest(version=version),tempfile.TemporaryDirectory() as tmp,contextlib.chdir(tmp):
    data=io.BytesIO();name=f'sing-box-{version}-linux-amd64';payload=b'fixture-core'
    with tarfile.open(fileobj=data,mode='w:gz') as archive:
     info=tarfile.TarInfo(name+'/sing-box');info.size=len(payload);archive.addfile(info,io.BytesIO(payload))
    body=data.getvalue();env={'GITHUB_ENV':str(Path(tmp)/'env')}
    if version!='1.14.2':env['SING_BOX_VERSION']=version
    with patch.dict(os.environ,env,clear=True),patch.object(core.platform,'system',return_value='Linux'),patch.object(core.platform,'machine',return_value='x86_64'),patch.dict(core.DIGESTS,{version:{'linux-amd64':hashlib.sha256(body).hexdigest()}}),patch.object(core.urllib.request,'urlopen',return_value=io.BytesIO(body)) as download,contextlib.redirect_stdout(io.StringIO()):
     core.main()
    self.assertEqual(download.call_args.args[0],f'https://github.com/SagerNet/sing-box/releases/download/v{version}/{name}.tar.gz')
    binary=Path('.test-output/core',name,'sing-box').resolve()
    self.assertEqual(binary.read_bytes(),payload)
    self.assertEqual(Path('env').read_text().strip(),'SING_BOX='+str(binary))

if __name__=='__main__':unittest.main(verbosity=2)
