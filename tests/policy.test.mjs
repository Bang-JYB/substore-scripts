import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,templates,generate} from './helpers.mjs';
const list=x=>Array.isArray(x)?x:[x];
// Independent policy fixtures, not copies of production rules.
const sets={
 'geosite-github':d=>d==='github.com'||d.endsWith('.githubusercontent.com'),
 'geosite-ai':d=>['copilot.microsoft.com','gemini.google.com','chatgpt.com'].includes(d),
 'geosite-microsoft':d=>['github.com','copilot.microsoft.com','office.com'].includes(d),
 'geosite-apple':d=>d==='apple.com',
 'geosite-cn':d=>d==='baidu.com',
 'geosite-private':d=>d.endsWith('.lan'),
 'geosite-foreign':d=>['unknown-foreign.example','google.com'].includes(d),
 'geosite-google':d=>d==='google.com',
 'geoip-cn':(_d,ip)=>ip==='223.5.5.5',
};
export function match(r,m){
 let yes=true;
 if(r.type==='logical')yes=r.mode==='and'?r.rules.every(s=>match(s,m)):r.rules.some(s=>match(s,m));
 if(r.domain_suffix)yes&&=list(r.domain_suffix).some(s=>m.domain===s||m.domain?.endsWith('.'+s));
 if(r.domain_regex)yes&&=list(r.domain_regex).some(s=>new RegExp(s).test(m.domain));
 if(r.clash_mode)yes&&=r.clash_mode===m.mode;
 if(r.network)yes&&=list(r.network).includes(m.network);
 if(r.port)yes&&=list(r.port).includes(m.port);
 if(r.ip_version)yes&&=r.ip_version===m.ipVersion;
 if(r.ip_is_private)yes&&=m.private===true;
 if(r.protocol)yes&&=r.protocol===m.protocol;
 if(r.rule_set)yes&&=list(r.rule_set).some(s=>sets[s]?.(m.domain,m.ip));
 return r.invert?!yes:yes;
}
function route(c,domain,network='tcp',port=443,mode='Rule',extra={}){
 for(const r of c.route.rules){if(match(r,{domain,network,port,mode,ipVersion:4,...extra})&&(r.outbound||r.action==='reject'))return r.outbound??'reject';}
 return c.route.final;
}
for(const f of templates)test('business routing, QUIC, LAN and GeoIP '+f,()=>{
 const c=JSON.parse(fs.readFileSync(path.join(root,f))),v=f.startsWith('config_vps_'),proxy=v?'VPS选择':'节点选择';
 assert.equal(route(c,'github.com'),proxy);
 assert.equal(route(c,'copilot.microsoft.com'),v?'VPS选择':'AI工具');
 for(const d of ['y.qq.com','ws6.stream.qqmusic.qq.com','apple.com','office.com','baidu.com'])assert.ok(['direct','🎯 全球直连'].includes(route(c,d)),d);
 assert.equal(route(c,'github.com','udp'),v?proxy:'reject');
 assert.equal(route(c,'google.com','udp'),v?proxy:'reject');
 assert.equal(route(c,'copilot.microsoft.com','udp'),v?'VPS选择':'reject');
 assert.equal(route(c,'y.qq.com','udp'),'direct');
 assert.equal(route(c,'nas.lan','tcp',80,'Global'),'direct');
 assert.equal(route(c,'anything','tcp',80,'Global',{private:true}),'direct');
 const resolve=c.route.rules.findIndex(r=>r.action==='resolve'&&!r.server&&!r.rule_set&&!r.domain_suffix&&!r.type&&!r.clash_mode);
 const geo=c.route.rules.findIndex(r=>list(r.rule_set??[]).includes('geoip-cn'));
 assert.ok(resolve>=0&&resolve<geo,'unmatched domain must resolve real IP before GeoIP fallback');
 assert.equal(route(c,'not-listed.example','tcp',80,'Rule',{ip:'223.5.5.5'}),v?'direct':'🎯 全球直连');
});
for(const f of templates)test('domestic DNS backup is wired without a proxy '+f,()=>{
 const c=JSON.parse(fs.readFileSync(path.join(root,f)));
 assert.ok(c.dns.rules.some(r=>r.action==='evaluate'&&r.tag==='direct-primary'));
 assert.ok(c.dns.rules.some(r=>r.server==='tx'&&r.timeout));
 assert.ok(!c.dns.servers.find(r=>r.tag==='tx').detour);
 assert.equal(c.dns.servers.find(r=>r.tag==='local').type,'local');
 assert.ok(!c.route.rules.some(r=>r.action==='bypass'));
});
test('optional offline seeds retain remote URL and update channel in both scripts',async()=>{
 for(const f of ['config_tun.json','config_vps_standalone.json']){
  const c=await generate(f,undefined,undefined,{rules_dir:'seeds/'});
  for(const r of c.route.rule_set){assert.equal(r.type,'remote');assert.equal(r.initial_path,'seeds/{tag}.srs');assert.ok(r.url.startsWith('https://'));assert.ok(r.http_client);}
 }
});
