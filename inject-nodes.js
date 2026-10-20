// Sub-Store 文件脚本：YBsSB2 组合订阅 + VPS 来源识别。
// 只生成 8 个策略组；固定 IPv4，不写入订阅链接、token 或节点密钥。
const args=typeof $arguments==='object'&&$arguments?$arguments:{};
const name=String(args.name??'YBsSB2').trim();
const vpsName=String(args.vps_name??'VPS').trim();
if(!name||!vpsName||name===vpsName)throw new Error('请填写不同的组合订阅名称和 VPS 订阅名称');
if(typeof produceArtifact!=='function')throw new Error('此脚本只能在 Sub-Store 文件脚本中运行');
const clone=v=>JSON.parse(JSON.stringify(v));
const array=v=>v==null?[]:Array.isArray(v)?v:[v];
async function load(source,type,label){
 let raw;
 try{raw=await produceArtifact({name:source,type,platform:'sing-box',produceOpts:{'include-unsupported-proxy':false}});}
 catch(_){throw new Error(label+'读取失败，请检查 Sub-Store 中该来源能否预览或更新');}
 try{raw=typeof raw==='string'?JSON.parse(raw):clone(raw);}catch(_){throw new Error(label+'输出不是合法的 sing-box JSON');}
 if(!raw||!Array.isArray(raw.outbounds))throw new Error(label+'缺少 outbounds');
 return raw;
}
function same(v){
 if(Array.isArray(v))return v.map(same);
 if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().filter(k=>k!=='tag').map(k=>[k,same(v[k])]));
 return v;
}
const isIPv6=v=>typeof v==='string'&&v.includes(':');
const supported=new Set(['shadowsocks','vmess','vless','trojan','hysteria','hysteria2','tuic','anytls','naive','ssh','shadowtls','http','socks']);
const ignored=/官网|剩余|流量|套餐|免费|订阅|到期|过期|expire|traffic|bandwidth|\d+(?:\.\d+)?\s*(?:gb|tb)/i;
// 按地区屏蔽英国、台湾节点；其余地区节点不受影响。
const blockedRegion=/🇬🇧|(?:^|[\s|\-_])(?:united\s+kingdom|uk)(?=$|[\s|\-_])|英国|英國|(?:^|[\s|\-_])taiwan(?=$|[\s|\-_])|台湾|台灣/i;
const normalName=v=>String(v??'').replace(/\s+/g,' ').trim();
let config;
try{config=JSON.parse(typeof $content==='string'?$content:$files[0]);}catch(_){throw new Error('模板 JSON 无法读取，请刷新 GitHub 模板');}
const groupTags=['节点选择','自动选择','VPS','VPS-自动','AI工具','漏网之鱼','🎯 全球直连','GLOBAL'];
for(const tag of groupTags)if(config.outbounds?.filter(o=>o.tag===tag).length!==1)throw new Error('模板缺少策略组：'+tag);
const direct=config.outbounds.find(o=>o.tag==='direct'&&o.type==='direct');
if(!direct)throw new Error('模板缺少 direct 出站');
const combined=await load(name,'collection','组合订阅');
const source=await load(vpsName,'subscription','VPS 订阅');
const vpsIDs=new Set(source.outbounds.filter(o=>o&&supported.has(o.type)).map(o=>JSON.stringify(same(o))));
const nodes=[],airport=[],vps=[],seen=new Set(),tagMap=new Map(),used=new Set([...groupTags,'direct']);
let droppedV6=0,droppedInfo=0,droppedManual=0,duplicates=0;
for(const raw of combined.outbounds){
 if(!raw||!supported.has(raw.type))continue;
 if(ignored.test(String(raw.tag||''))){droppedInfo++;continue;}
 if(blockedRegion.test(normalName(raw.tag))){droppedManual++;continue;}
 if(isIPv6(raw.server)){droppedV6++;continue;}
 const id=JSON.stringify(same(raw));
 if(seen.has(id)){duplicates++;continue;}
 seen.add(id);
 const base=used.has(raw.tag)?'节点 / '+raw.tag:String(raw.tag||'未命名节点');
 let tag=base,n=2;while(used.has(tag))tag=base+' ['+n+++']';
 used.add(tag);tagMap.set(raw.tag,tag);
 const node=clone(raw);node.tag=tag;delete node.inet6_bind_address;delete node.domain_strategy;
 node.domain_resolver={server:'ali',strategy:'ipv4_only'};
 nodes.push(node);(vpsIDs.has(id)?vps:airport).push(tag);
}
if(!airport.length)throw new Error('组合订阅中没有可用机场 IPv4 节点，已停止生成');
if(!vps.length)throw new Error('组合订阅中没有能与 VPS 订阅匹配的 IPv4 节点，已停止生成');
for(const node of nodes)if(node.detour&&node.detour!=='direct'){
 const mapped=tagMap.get(node.detour);if(!mapped)throw new Error('节点链式拨号依赖不存在或被过滤：'+node.tag);node.detour=mapped;
}
const values={
 '节点选择':['自动选择','VPS',...airport,'🎯 全球直连'],
 '自动选择':airport,
 'VPS':['VPS-自动',...vps],
 'VPS-自动':vps,
 'AI工具':['VPS','节点选择'],
 '漏网之鱼':['节点选择','自动选择','🎯 全球直连'],
 '🎯 全球直连':['direct'],
 'GLOBAL':['节点选择','自动选择','AI工具','VPS','🎯 全球直连']
};
config.outbounds=[...groupTags.map(tag=>{const o=clone(config.outbounds.find(x=>x.tag===tag));o.outbounds=values[tag];if(o.type==='selector')o.default=o.outbounds[0];return o;}),clone(direct),...nodes];
const json=JSON.stringify(config);
if(new TextEncoder().encode(json).length>1024*1024)throw new Error('生成配置超过 1 MiB；请减少组合订阅中的节点后再预览');
$content=json;
console.log('[YBsSB2] 完成：机场 '+airport.length+'，VPS '+vps.length+'，8 个分组；过滤 IPv6 '+droppedV6+'，信息项 '+droppedInfo+'，英国/台湾 '+droppedManual+'，去重 '+duplicates+'。');
