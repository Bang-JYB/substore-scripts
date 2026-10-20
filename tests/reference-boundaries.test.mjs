import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {generate,node,root} from './helpers.mjs';
const scriptRoot=process.env.SCRIPT_ROOT??root;
const vps=node('vps','192.0.2.2');
const hop=(tag,server='192.0.2.3')=>({type:'shadowtls',tag,server,server_port:443,version:3,password:'fixture-only',tls:{enabled:true,server_name:'example.com'}});
const wrap=(type,tag,detour)=>type==='shadowsocks'?{type,tag,detour,method:'aes-128-gcm',password:'fixture-only'}:{type,tag,detour,version:4,psk:'fixture-only'};
const files=['config_tun.json','config_vps_standalone.json'];
const run=(file,nodes)=>generate(file,[node('airport','192.0.2.100'),...nodes],nodes,{},scriptRoot);
const byServer=(c,server)=>c.outbounds.find(n=>n.server===server);
const candidates=c=>c.outbounds.filter(n=>['selector','urltest'].includes(n.type)).flatMap(n=>n.outbounds);
for(const file of files){
 test('exact leading/trailing source tag survives a multi-hop detour '+file,async()=>{
  const c=await run(file,[node(' first ','192.0.2.10'),node('\tmiddle\t','192.0.2.11',{detour:' first '}),node('leaf','192.0.2.12',{detour:'\tmiddle\t'})]);
  assert.equal(byServer(c,'192.0.2.12').detour,byServer(c,'192.0.2.11').tag);
  assert.equal(byServer(c,'192.0.2.11').detour,byServer(c,'192.0.2.10').tag);
 });
 test('whitespace-distinct source names with different nodes never merge or redirect '+file,async()=>{
  const c=await run(file,[node('target','192.0.2.10'),node(' target ','192.0.2.11'),node('a','192.0.2.12',{detour:'target'}),node('b','192.0.2.13',{detour:' target '})]);
  assert.equal(byServer(c,'192.0.2.12').detour,byServer(c,'192.0.2.10').tag);
  assert.equal(byServer(c,'192.0.2.13').detour,byServer(c,'192.0.2.11').tag);
  assert.notEqual(byServer(c,'192.0.2.10').tag,byServer(c,'192.0.2.11').tag);
 });
 test('exact duplicate names remain ambiguous, identical aliases remain safe '+file,async()=>{
  await assert.rejects(run(file,[node(' same ','192.0.2.10'),node(' same ','192.0.2.11'),node('leaf','192.0.2.12',{detour:' same '})]),/重名/);
  const c=await run(file,[node('same','192.0.2.10'),node(' same ','192.0.2.10'),node('leaf','192.0.2.11',{detour:' same '})]);
  assert.equal(c.outbounds.filter(n=>n.server==='192.0.2.10').length,1);
  assert.equal(byServer(c,'192.0.2.11').detour,byServer(c,'192.0.2.10').tag);
 });
 test('detour never trims a mismatched name to guess another target '+file,async()=>{
  for(const [tag,detour] of [[' target ','target'],['target',' target ']])await assert.rejects(run(file,[node(tag,'192.0.2.10'),node('leaf','192.0.2.11',{detour})]),/依赖/);
 });
 test('padded source direct and built-in direct stay separate '+file,async()=>{
  const c=await run(file,[node(' direct ','192.0.2.10'),node('builtin','192.0.2.11',{detour:'direct'}),node('source','192.0.2.12',{detour:' direct '})]);
  assert.equal(byServer(c,'192.0.2.11').detour,'direct');
  assert.equal(byServer(c,'192.0.2.12').detour,byServer(c,'192.0.2.10').tag);
  assert.notEqual(byServer(c,'192.0.2.10').tag,'direct');
  await assert.rejects(run(file,[node('direct','192.0.2.10'),node('leaf','192.0.2.11',{detour:'direct'})]),/歧义/);
 });
 test('spaced self and multi-node cycles cannot escape graph validation '+file,async()=>{
  for(const nodes of [[node(' a ','192.0.2.10',{detour:' a '})],[node(' a ','192.0.2.10',{detour:' b '}),node(' b ','192.0.2.11',{detour:' a '})]])await assert.rejects(run(file,nodes),/循环/);
 });
 test('padded ShadowTLS aliases are retained for detour but excluded from every candidate pool '+file,async()=>{
  const nodes=[hop(' helper '),hop(' helper alias '),wrap('shadowsocks','root',' helper alias '),hop('standalone','192.0.2.4')];
  const c=await run(file,nodes),helper=byServer(c,'192.0.2.3');
  assert.equal(c.outbounds.find(n=>n.tag==='root').detour,helper.tag);
  assert.equal(c.outbounds.filter(n=>n.server==='192.0.2.3').length,1);
  assert.ok(!candidates(c).includes(helper.tag));assert.ok(candidates(c).includes('standalone'));
 });
}
for(const type of ['shadowsocks','snell']){
 test('IPv6-only helper causes conservative combo failure without publishing a broken '+type+' chain',async()=>{
  const before=fs.readFileSync(path.join(root,'config_tun.json'),'utf8');
  const nodes=[vps,wrap(type,'wrapped','helper-v6'),hop('helper-v6','2001:db8::3')];
  const ctx={$content:before,$arguments:{},TextEncoder,console:{log(){}},produceArtifact:async({type})=>({outbounds:type==='collection'?[node('airport','192.0.2.100'),...nodes]:nodes})};
  const script=fs.readFileSync(path.join(scriptRoot,'inject-nodes.js'),'utf8');
  await assert.rejects(vm.runInNewContext('(async()=>{'+script+'})()',ctx,{timeout:5000}),/依赖.*过滤/);
  assert.equal(ctx.$content,before);
 });
 test('standalone dual stack retains IPv6 helper for '+type,async()=>{
  const c=await run('config_vps_standalone.json',[wrap(type,'wrapped','helper-v6'),hop('helper-v6','2001:db8::3')]);
  assert.equal(c.outbounds.find(n=>n.tag==='wrapped').detour,'helper-v6');
  assert.equal(byServer(c,'2001:db8::3').type,'shadowtls');assert.ok(!candidates(c).includes('helper-v6'));
 });
}
test('shared ShadowTLS hop stays outside both airport and VPS pools; explicit standalone hops stay in their own pool',async()=>{
 const h=hop('shared'),a=wrap('shadowsocks','airport-root','shared'),v={...a,tag:'vps-root',password:'fixture-other'};
 const soloAirport=hop('airport-standalone','192.0.2.20'),soloVps=hop('vps-standalone','192.0.2.21');
 const c=await generate('config_tun.json',[a,v,h,soloAirport,soloVps],[v,h,soloVps],{},scriptRoot);
 assert.deepEqual(c.outbounds.find(n=>n.tag==='自动选择').outbounds,['airport-root','airport-standalone']);
 assert.deepEqual(c.outbounds.find(n=>n.tag==='VPS-自动').outbounds,['vps-root','vps-standalone']);
 assert.equal(c.outbounds.find(n=>n.tag==='airport-root').detour,'shared');
 assert.equal(c.outbounds.find(n=>n.tag==='vps-root').detour,'shared');assert.ok(!candidates(c).includes('shared'));
});

test('a helper never becomes a standalone candidate just because its parent is filtered',async()=>{
 for(const parent of [node('IPv6-parent','2001:db8::10',{detour:'orphan-hop'}),node('英国 parent','192.0.2.10',{detour:'orphan-hop'})]){
  const h=hop('orphan-hop');
  const c=await generate('config_tun.json',[node('airport','192.0.2.100'),vps,parent,h],[vps,parent,h],{},scriptRoot);
  assert.ok(c.outbounds.some(n=>n.tag==='orphan-hop'),'keep the dependency object without exposing it');
  assert.ok(!candidates(c).includes('orphan-hop'));
  assert.deepEqual(c.outbounds.find(n=>n.tag==='VPS-自动').outbounds,['vps']);
  await assert.rejects(generate('config_tun.json',[node('airport','192.0.2.100'),parent,h],[parent,h],{},scriptRoot),/可选择|VPS/);
 }
});
