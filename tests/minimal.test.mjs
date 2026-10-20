import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {generate,node,root} from './helpers.mjs';

const template=JSON.parse(fs.readFileSync(path.join(root,'examples/vps-minimal/config_vps_minimal.json')));
const build=(nodes,args={})=>generate('config_vps_standalone.json',[],nodes,args,root,template);
const list=x=>Array.isArray(x)?x:[x];
function matches(r,m){
 if(r.type==='logical')return r.mode==='or'?r.rules.some(x=>matches(x,m)):r.rules.every(x=>matches(x,m));
 return Object.entries(r).every(([k,v])=>{
  if(k==='clash_mode')return v===m.mode;
  if(k==='ip_is_private')return m.private===true;
  if(k==='domain_suffix')return list(v).some(s=>m.domain===s||m.domain?.endsWith('.'+s));
  if(k==='domain_regex')return typeof m.domain==='string'&&list(v).some(s=>new RegExp(s).test(m.domain));
  if(['protocol','port','network'].includes(k))return list(v).includes(m[k]);
  return true;
 });
}
function route(m){
 return template.route.rules.find(r=>(r.outbound||['reject','hijack-dns'].includes(r.action))&&matches(r,{mode:'Rule',...m}))?.outbound??
        template.route.rules.find(r=>['reject','hijack-dns'].includes(r.action)&&matches(r,{mode:'Rule',...m}))?.action??template.route.final;
}
test('minimal recovery profile starts without remote rules and keeps original transport parameters',()=>{
 const original=JSON.parse(fs.readFileSync(path.join(root,'config_vps_standalone.json')));
 assert.deepEqual(template.inbounds,original.inbounds);
 assert.deepEqual(template.outbounds,original.outbounds);
 assert.deepEqual(template.dns.servers,original.dns.servers);
 assert.equal(template.dns.strategy,'prefer_ipv4');
 assert.deepEqual(template.route.rule_set,[]);
 assert.equal(template.http_clients,undefined);
 assert.equal(template.route.rules.some(r=>r.rule_set),false);
 assert.equal(template.dns.rules.some(r=>r.rule_set),false);
 assert.equal(template.experimental.cache_file.store_dns,true);
 assert.notEqual(template.experimental.cache_file.path,original.experimental.cache_file.path);
 assert.notEqual(template.experimental.cache_file.cache_id,original.experimental.cache_file.cache_id);
 assert.deepEqual(template.experimental.clash_api,original.experimental.clash_api);
});
test('minimal Rule UDP443 guard preserves DNS, LAN, TCP and mode boundaries',()=>{
 for(const domain of ['google.com','www.gstatic.com','about.google','github.com','chatgpt.com','baidu.com']){
  assert.equal(route({domain,network:'udp',port:443}),'reject');
  assert.equal(route({domain,network:'tcp',port:443}),'VPS选择');
  assert.equal(route({domain,network:'udp',port:8443}),'VPS选择');
  for(const mode of ['Direct','Global'])assert.equal(route({domain,network:'udp',port:443,mode}),mode==='Direct'?'direct':'VPS选择');
 }
 for(const mode of ['Rule','Direct','Global']){
  assert.equal(route({domain:'nas.lan',network:'udp',port:443,mode}),'direct');
  assert.equal(route({private:true,network:'udp',port:443,mode}),'direct');
  assert.equal(route({network:'udp',port:53,mode}),'hijack-dns');
 }
});
test('minimal DNS retains primary/backup and NXDOMAIN/NODATA without GeoIP probing',()=>{
 for(const tag of ['direct-primary','proxy-primary']){
  const primary=template.dns.rules.find(r=>r.tag===tag);
  assert.equal(primary.action,'evaluate');
  assert.deepEqual(template.dns.rules.filter(r=>r.match_response===tag).map(r=>r.response_rcode),['NOERROR','NXDOMAIN']);
 }
 assert.ok(template.dns.rules.some(r=>r.server==='tx'&&r.clash_mode==='Direct'));
 assert.equal(template.dns.rules.at(-1).server,'proxy-backup');
 assert.equal(template.dns.rules.filter(r=>r.action==='evaluate').length,2);
 assert.equal(template.route.default_domain_resolver.server,'vps-dns');
});
test('minimal template uses existing injection safety and preserves dual stack and mixed mode',async()=>{
 const c=await build([node(' first '),node('last','2001:db8::2',{detour:' first '})],{mode:'mixed'});
 assert.equal(c.inbounds.length,1);assert.equal(c.inbounds[0].listen_port,7890);
 assert.equal(c.outbounds.find(o=>o.tag==='last').detour,'first');
 assert.equal(c.outbounds.find(o=>o.tag==='last').server,'2001:db8::2');
 await assert.rejects(build([node(' first '),node('last','192.0.2.3',{detour:'first'})]),/依赖/);
 await assert.rejects(build([{type:'unsupported',tag:'bad',server:'192.0.2.2'}]),/没有/);
});
test('minimal template keeps SS/Snell ShadowTLS dependency safety and helper exclusion',async()=>{
 const hop={type:'shadowtls',tag:' hop ',server:'2001:db8::3',server_port:443,version:3,password:'fixture-only',tls:{enabled:true,server_name:'example.com'}};
 for(const type of ['shadowsocks','snell']){
  const wrapper={type,tag:'wrapper',detour:' hop ',...(type==='snell'?{version:4,psk:'fixture-only'}:{method:'aes-128-gcm',password:'fixture-only'})};
  const c=await build([wrapper,hop]);
  assert.deepEqual(c.outbounds.find(o=>o.tag==='VPS自动').outbounds,['wrapper']);
  assert.equal(c.outbounds.find(o=>o.tag==='wrapper').detour,'hop');
  await assert.rejects(build([wrapper]),/依赖/);
 }
});
