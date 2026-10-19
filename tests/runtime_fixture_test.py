"""Reproduce ephemeral-port reuse between the runtime proxy and management API."""
import importlib.util, json, tempfile, types, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('runtime_fixture',Path(__file__).with_name('runtime.py'))
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)

class RuntimeFixtureTests(unittest.TestCase):
 def test_proxy_and_controller_never_receive_the_same_reusable_port(self):
  # A kernel may immediately reuse an ephemeral port after its socket is closed.
  active=set()
  class Socket:
   def __enter__(self):return self
   def __exit__(self,*args):self.close()
   def bind(self,_):
    self.port=next(p for p in range(15000,15010) if p not in active);active.add(self.port)
   def getsockname(self):return ('127.0.0.1',self.port)
   def close(self):active.discard(self.port)
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);generated=root/'.test-output/generated';generated.mkdir(parents=True)
   (generated/'fixture.json').write_text(json.dumps({'route':{'rule_set':[]},'dns':{'servers':[]},'experimental':{},'outbounds':[]}))
   with patch.object(runtime,'ROOT',root),patch.object(runtime.socket,'socket',side_effect=Socket):
    core=runtime.Core(types.SimpleNamespace(proxy_port=1080),'fixture.json',root)
   self.assertNotEqual(core.port,core.api_port)
   self.assertFalse(active)

if __name__=='__main__':unittest.main(verbosity=2)
