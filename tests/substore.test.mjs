import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root,templates,groups,generate,node} from './helpers.mjs';
import {captured,fromSubstore} from './substore-fixture.mjs';
const scriptRoot=process.env.SCRIPT_ROOT??root;
const types=['shadowsocks','vmess','vless','trojan','hysteria','hysteria2','tuic','anytls','naive','ssh','shadowtls','http','socks','snell'];
test('both injectors preserve all 14 official 1.14.2 server proxy types and VPS pool membership',async()=>{
 const proxies=types.map((type,i)=>node(type,'192.0.2.'+(i+10),{type}));
 const combo=await generate('config_pc.json',[node('机场'),...proxies],proxies,{},scriptRoot);
 const solo=await generate('config_vps_notun.json',[],proxies,{},scriptRoot);
 for(const c of [combo,solo])assert.deepEqual(c.outbounds.filter(x=>types.includes(x.type)&&x.tag!=='机场').map(x=>x.type),types);
 assert.deepEqual(combo.outbounds.find(x=>x.tag==='自动选择').outbounds,['机场']);
 assert.deepEqual(combo.outbounds.find(x=>x.tag==='VPS-自动').outbounds,types);
});
test('Snell-only airport and VPS remain distinct pools, and renamed source tags still match by identity',async()=>{
 const airport={type:'snell',tag:'机场4',server:'192.0.2.11',server_port:443,version:4,psk:'fixture-only'};
 const vps={...airport,tag:'组合名6',server:'192.0.2.12',version:6};
 const c=await generate('config_tun.json',[airport,vps],[{...vps,tag:'单订阅名6'}],{},scriptRoot);
 assert.deepEqual(c.outbounds.find(x=>x.tag==='自动选择').outbounds,['机场4']);
 assert.deepEqual(c.outbounds.find(x=>x.tag==='VPS-自动').outbounds,['组合名6']);
 assert.deepEqual(c.outbounds.filter(x=>x.type==='selector'||x.type==='urltest').map(x=>x.tag),groups);
});
for(const file of templates)test('official captured Sub-Store external JSON preserves wrappers, fields and pools '+file,async()=>{
 const solo=file.startsWith('config_vps_');
 const {config:c,calls}=await fromSubstore(file,{scriptRoot,useFiles:true});
 assert.deepEqual(calls.map(x=>[x.name,x.type,x.platform,x.produceOpts]),solo?
  [['VPS','subscription','sing-box',{'include-unsupported-proxy':false}]]:
  [['YBsSB2','collection','sing-box',{'include-unsupported-proxy':false}],['VPS','subscription','sing-box',{'include-unsupported-proxy':false}]]);
 const named=tag=>c.outbounds.find(x=>x.tag===tag);
 assert.equal(named('自建 Snell5').version,4);assert.equal(named('自建 Snell6').version,6);
 assert.equal(named('自建 Snell6').mode,'unshaped');assert.equal(named('自建 Snell6').reuse,true);
 for(const tag of [solo?'VPS':'节点 / VPS','自建 Snell链']){
  const wrapped=named(tag);assert.ok(wrapped,'wrapper retained');assert.equal(wrapped.server,undefined);
  assert.equal(named(wrapped.detour).type,'shadowtls');assert.ok(named(wrapped.detour).server);
 }
 assert.equal(named('自建 Reality').tls.reality.public_key,'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
 assert.equal(named('自建 Reality').tls.utls.fingerprint,'chrome');
 const pool=c.outbounds.find(x=>x.tag===(solo?'VPS自动':'VPS-自动')).outbounds;
 for(const n of c.outbounds.filter(x=>x.type==='shadowtls'))assert.ok(!pool.includes(n.tag),'auxiliary hops must not be selected alone');
 assert.equal(named(named('自建 VLESS链').detour).type,'shadowtls');
 assert.equal(c.outbounds.some(x=>x.tag==='自建 IPv6'),solo);
 assert.ok(!c.endpoints);assert.ok(!c.outbounds.some(x=>x.type==='wireguard'));
 if(!solo){
  assert.deepEqual(named('自动选择').outbounds,['机场 Snell4','机场 WS']);
  const expected=['自建 Snell5','自建 Snell6','节点 / VPS','自建 Snell链','自建 Reality','自建 VLESS链'];
  assert.deepEqual(named('VPS-自动').outbounds,expected);
  const ws=named('机场 WS');assert.equal(ws.transport.path,'/fixture');assert.equal(ws.transport.max_early_data,2048);
  assert.deepEqual(ws.transport.headers.tag,['fixture-a','fixture-b']);assert.equal(ws.transport.headers.Host,'example.com');
 }
});
test('captured JSON also works as object output, without mutating snapshots',async()=>{
 const before=JSON.stringify(captured);
 for(const file of ['config_tun.json','config_vps_notun.json']){
  const object=await fromSubstore(file,{asObject:true,scriptRoot});
  const text=await fromSubstore(file,{scriptRoot});assert.deepEqual(object.config,text.config);
 }
 assert.equal(JSON.stringify(captured),before);
});
test('serverless wrappers cannot bypass validation with direct, wrong protocol, missing helper or cycles',async()=>{
 for(const file of ['config_pc.json','config_vps_notun.json']){
  const good=node('physical','192.0.2.2');
  for(const type of ['shadowsocks','snell'])for(const detour of ['direct','missing','physical']){
   const wrapped={type,tag:'wrapper',detour};
   await assert.rejects(generate(file,[node('机场'),good,wrapped],[good,wrapped],{},scriptRoot),/server|服务器|依赖|ShadowTLS/);
  }
  const wrapped={type:'shadowsocks',tag:'wrapper',detour:'helper'},helper={type:'shadowtls',tag:'helper',server:'192.0.2.3',detour:'wrapper'};
  await assert.rejects(generate(file,[node('机场'),good,wrapped,helper],[good,wrapped,helper],{},scriptRoot),/循环/);
 }
});
test('malformed external JSON and unsupported internal-array shape fail explicitly',async()=>{
 for(const file of ['config_tun.json','config_vps_notun.json'])for(const result of ['{broken',JSON.stringify([])]){
  await assert.rejects(fromSubstore(file,{artifacts:{combined:result,vps:result},scriptRoot}),/JSON|outbounds/);
 }
});
test('captured fixture pins source, bundle and input hashes; unknown bundle cannot overwrite it',()=>{
 const input=fs.readFileSync(path.join(root,'tests/fixtures/substore-input.json'));
 assert.equal(crypto.createHash('sha256').update(input).digest('hex'),captured.provenance.input_sha256);
 assert.equal(captured.provenance.sha256,'599ed6ae6570c17939282f2f2a6fa28b204fdc1fd36faf6ae9b534588f26c80f');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'substore-digest-'));
 try{
  const bad=path.join(dir,'bad.mjs');fs.writeFileSync(bad,'throw Error("must never execute")');
  const before=fs.readFileSync(path.join(root,'tests/fixtures/substore-2.42.6.json'),'utf8');
  const r=spawnSync(process.execPath,['--experimental-vm-modules',path.join(root,'scripts/capture-substore-fixture.mjs'),bad],{encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/SHA256/);assert.ok(!r.stderr.includes('must never execute'));
  assert.equal(fs.readFileSync(path.join(root,'tests/fixtures/substore-2.42.6.json'),'utf8'),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('collection rename before official conversion cannot move wrapped VPS proxies into the airport pool',async()=>{
 const artifacts={...captured,combined:captured.renamedCombined};
 const {config:c}=await fromSubstore('config_tun.json',{artifacts,scriptRoot});
 assert.deepEqual(c.outbounds.find(x=>x.tag==='自动选择').outbounds,['机场 Snell4','机场 WS']);
 const expected=['自建 Snell5','自建 Snell6','VPS','自建 Snell链','自建 Reality','自建 VLESS链'].map(x=>'集合 / '+x);
 assert.deepEqual(c.outbounds.find(x=>x.tag==='VPS-自动').outbounds,expected);
});

test('sharing a physical ShadowTLS hop never makes a different-password airport proxy a VPS proxy',async()=>{
 const combined=JSON.parse(captured.combined);
 const original=combined.outbounds.find(n=>n.tag==='VPS');
 combined.outbounds.unshift({...original,tag:'不同密码机场',password:'fixture-other'});
 const {config:c}=await fromSubstore('config_tun.json',{artifacts:{...captured,combined:JSON.stringify(combined)},scriptRoot});
 assert.ok(c.outbounds.find(n=>n.tag==='自动选择').outbounds.includes('不同密码机场'));
 assert.ok(!c.outbounds.find(n=>n.tag==='VPS-自动').outbounds.includes('不同密码机场'));
 assert.ok(c.outbounds.find(n=>n.tag==='VPS-自动').outbounds.includes('节点 / VPS'));
});
