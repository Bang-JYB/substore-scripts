import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generate,node,groups,templates} from './helpers.mjs';
const v=node('自建','192.0.2.2');
const scriptRoot=process.env.SCRIPT_ROOT;
test('ambiguous duplicate source names fail instead of overriding detour',async()=>{
 await assert.rejects(generate('config_pc.json',[node('入口'),node('入口','192.0.2.3'),node('链','192.0.2.4',{detour:'入口'}),v],[v],{},scriptRoot),/重名|ambiguous/);
});
test('deduplicated aliases remain valid dependency targets',async()=>{
 const c=await generate('config_pc.json',[node('入口'),node('别名'),node('链','192.0.2.4',{detour:'别名'}),v],[v],{},scriptRoot);
 assert.equal(c.outbounds.find(x=>x.tag==='链').detour,'入口');
});
for(const deps of [['入口','入口'],['入口','链','入口']])test('reject detour cycle '+deps.join(' -> '),async()=>{
 const a=node('入口','192.0.2.1',{detour:deps[1]}),b=node('链','192.0.2.3',{detour:'入口'});
 await assert.rejects(generate('config_pc.json',[a,b,v],[v],{},scriptRoot),/循环/);
});
test('missing or filtered chain dependencies fail',async()=>{
 for(const target of ['不存在','英国入口'])await assert.rejects(generate('config_pc.json',[node('链','192.0.2.1',{detour:target}),node('英国入口','192.0.2.3'),v],[v],{},scriptRoot),/依赖/);
});
test('direct source name cannot silently shadow built-in direct',async()=>{
 await assert.rejects(generate('config_pc.json',[node('direct'),node('链','192.0.2.3',{detour:'direct'}),v],[v],{},scriptRoot),/direct|歧义/);
});
test('supported malformed nodes fail with actionable error',async()=>{
 const a=node('坏节点');delete a.server;
 await assert.rejects(generate('config_pc.json',[a,v],[v],{},scriptRoot),/server|服务器/);
});
test('stable unique names, top-level identity, independent pools and protocol fields',async()=>{
 const a=node('节点选择','192.0.2.1',{tls:{enabled:true,tag:'nested-a'}});
 const b=node('另外','192.0.2.1',{tls:{enabled:true,tag:'nested-b'}});
 const c=await generate('config_pc.json',[a,b,v],[v],{},scriptRoot);
 assert.equal(new Set(c.outbounds.map(x=>x.tag)).size,c.outbounds.length);
 assert.equal(c.outbounds.filter(x=>x.server).length,3);
 assert.deepEqual(c.outbounds.filter(x=>['selector','urltest'].includes(x.type)).map(x=>x.tag),groups);
 assert.deepEqual(c.outbounds.find(x=>x.tag==='VPS-自动').outbounds,['自建']);
 assert.equal(c.outbounds.find(x=>x.tag==='AI工具').default,'VPS');
});
for(const f of templates)test('generate preserves platform contract '+f,async()=>{
 const c=await generate(f,undefined,undefined,{},scriptRoot);
 assert.equal(c.inbounds.some(x=>x.type==='tun'),!['config_pc.json','config_vps_notun.json'].includes(f));
 if(c.inbounds.some(x=>x.type==='mixed'))assert.equal(c.inbounds.find(x=>x.type==='mixed').listen_port,7890);
 assert.ok(c.inbounds.every(x=>x.type==='tun'||x.listen==='127.0.0.1'));
 assert.ok(!c.route.rules.some(x=>x.action==='bypass'));
});
test('standalone keeps alias chains and rejects cycles/duplicate names',async()=>{
 for(const bad of [[node('a'),node('a','192.0.2.3')],[node('a','192.0.2.1',{detour:'a'})]])await assert.rejects(generate('config_vps_notun.json',[],bad,{},scriptRoot),/重名|循环/);
 const c=await generate('config_vps_notun.json',[],[node('a'),node('alias'),node('b','192.0.2.3',{detour:'alias'})],{},scriptRoot);
 assert.equal(c.outbounds.find(x=>x.tag==='b').detour,'a');
});
