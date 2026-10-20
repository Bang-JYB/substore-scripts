// Sub-Store 文件脚本：YBsSB2 组合订阅 + VPS 来源识别。
// 只生成 8 个策略组；固定 IPv4，不写入订阅链接、token 或节点密钥。
const args=typeof $arguments==='object'&&$arguments?$arguments:{};
const name=String(args.name??'YBsSB2').trim();
const vpsName=String(args.vps_name??'VPS').trim();
if(!name||!vpsName||name===vpsName)throw new Error('请填写不同的组合订阅名称和 VPS 订阅名称');
if(typeof produceArtifact!=='function')throw new Error('此脚本只能在 Sub-Store 文件脚本中运行');
const clone=v=>JSON.parse(JSON.stringify(v));
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
 if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,same(v[k])]));
 return v;
}
const identity=v=>{const copy=clone(v);delete copy.tag;return JSON.stringify(same(copy));};
const isIPv6=v=>typeof v==='string'&&v.includes(':');
const supported=new Set(['shadowsocks','vmess','vless','trojan','hysteria','hysteria2','tuic','anytls','naive','ssh','shadowtls','http','socks','snell']);
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
// Collection renames also rename generated ShadowTLS hops. Compare their full
// physical-hop configuration for pool matching only; dependency/dedup identity stays strict.
function physicalHops(outbounds){
 const result=new Map();
 for(const hop of outbounds)if(hop?.type==='shadowtls'&&typeof hop.tag==='string'&&hop.tag&&typeof hop.server==='string'&&hop.server.trim()&&!hop.detour){
  const id=identity(hop);result.set(hop.tag,result.has(hop.tag)&&result.get(hop.tag)!==id?null:id);
 }
 return result;
}
const poolIdentity=(node,hops)=>hops.get(node.detour)?identity({...node,detour:{shadowtls:hops.get(node.detour)}}):identity(node);
const sourceHops=physicalHops(source.outbounds),combinedHops=physicalHops(combined.outbounds);
const vpsIDs=new Set(source.outbounds.filter(o=>o&&supported.has(o.type)).map(o=>poolIdentity(o,sourceHops)));
const nodes=[],airport=[],vps=[],seen=new Map(),tagMap=new Map(),originalIDs=new Map(),used=new Set([...groupTags,'direct']);
let droppedV6=0,droppedInfo=0,droppedManual=0,duplicates=0;
for(const raw of combined.outbounds){
 if(!raw||!supported.has(raw.type))continue;
 // Sub-Store ShadowTLS wrappers omit server; their physical hop is checked below.
 const wrapped=['shadowsocks','snell'].includes(raw.type)&&raw.server===undefined&&typeof raw.detour==='string'&&raw.detour.trim();
 if((typeof raw.server!=='string'||!raw.server.trim())&&!wrapped)throw new Error('节点缺少 server 服务器地址：'+String(raw.tag||''));
 // Source names are exact reference keys; never trim a detour into another node.
 const original=String(raw.tag??''),rawID=identity(raw);
 if(original&&originalIDs.has(original)&&originalIDs.get(original)!==rawID)throw new Error('订阅中节点重名且配置不同，请先重命名：'+original);
 if(original)originalIDs.set(original,rawID);
 if(ignored.test(String(raw.tag||''))){droppedInfo++;continue;}
 if(blockedRegion.test(normalName(raw.tag))){droppedManual++;continue;}
 if(isIPv6(raw.server)){droppedV6++;continue;}
 const id=identity(raw);
 if(seen.has(id)){if(original)tagMap.set(original,seen.get(id));duplicates++;continue;}
 const base=used.has(raw.tag)?'节点 / '+raw.tag:String(raw.tag||'未命名节点');
 let tag=base,n=2;while(used.has(tag))tag=base+' ['+n+++']';
 used.add(tag);seen.set(id,tag);if(original)tagMap.set(original,tag);
 const node=clone(raw);node.tag=tag;delete node.inet6_bind_address;delete node.domain_strategy;
 node.domain_resolver={server:'ali',strategy:'ipv4_only'};
 nodes.push(node);(vpsIDs.has(poolIdentity(raw,combinedHops))?vps:airport).push(tag);
}
if(!airport.length)throw new Error('组合订阅中没有可用机场 IPv4 节点，已停止生成');
if(!vps.length)throw new Error('组合订阅中没有能与 VPS 订阅匹配的 IPv4 节点，已停止生成');
// Resolve source names after deduplication; never guess between ambiguous names.
for(const node of nodes)if(node.detour){
 if(typeof node.detour!=='string')throw new Error('节点链式拨号依赖必须是名称：'+node.tag);
 if(node.detour==='direct'){
  if(originalIDs.has('direct'))throw new Error('direct 依赖存在歧义，请重命名来源节点 direct');
  continue;
 }
 const mapped=tagMap.get(node.detour);
 if(!mapped)throw new Error('节点链式拨号依赖不存在或被过滤：'+node.tag);
 node.detour=mapped;
}
// Iterative DFS avoids recursion overflow on large (but valid) subscriptions.
const byTag=new Map(nodes.map(n=>[n.tag,n])),checked=new Set();
for(const node of nodes)if(node.server===undefined&&byTag.get(node.detour)?.type!=='shadowtls')throw new Error('无 server 的包装节点必须依赖有效 ShadowTLS 出站：'+node.tag);
for(const node of nodes){
 const visiting=new Set();let tag=node.tag;
 while(tag&&tag!=='direct'&&!checked.has(tag)){
  if(visiting.has(tag))throw new Error('链式拨号存在循环：'+tag);
  visiting.add(tag);tag=byTag.get(tag)?.detour;
 }
 for(const item of visiting)checked.add(item);
}
// Preserve the source graph's helper role even when its parent was filtered.
const helpers=new Set();
for(const raw of combined.outbounds)if(raw&&supported.has(raw.type)){
 const target=tagMap.get(raw.detour);
 if(byTag.get(target)?.type==='shadowtls')helpers.add(target);
}
const selectableAirport=airport.filter(tag=>!helpers.has(tag)),selectableVPS=vps.filter(tag=>!helpers.has(tag));
if(!selectableAirport.length||!selectableVPS.length)throw new Error('组合订阅缺少可选择的机场或 VPS 代理节点，ShadowTLS 辅助出站不能独立选用');
const values={
 '节点选择':['自动选择','VPS',...selectableAirport,'🎯 全球直连'],
 '自动选择':selectableAirport,
 'VPS':['VPS-自动',...selectableVPS],
 'VPS-自动':selectableVPS,
 'AI工具':['VPS','节点选择'],
 '漏网之鱼':['节点选择','自动选择','🎯 全球直连'],
 '🎯 全球直连':['direct'],
 'GLOBAL':['节点选择','自动选择','AI工具','VPS','🎯 全球直连']
};
config.outbounds=[...groupTags.map(tag=>{const o=clone(config.outbounds.find(x=>x.tag===tag));o.outbounds=values[tag];if(o.type==='selector')o.default=o.outbounds[0];return o;}),clone(direct),...nodes];
const rulesDir=String(args.rules_dir??'').trim().replace(/\\/g,'/').replace(/\/+$/,'');
if(rulesDir)for(const rule of config.route?.rule_set??[])if(rule.type==='remote')rule.initial_path=rulesDir+'/{tag}.srs';
const json=JSON.stringify(config);
if(new TextEncoder().encode(json).length>1024*1024)throw new Error('生成配置超过 1 MiB；请减少组合订阅中的节点后再预览');
$content=json;
console.log('[YBsSB2] 完成：机场 '+selectableAirport.length+'，VPS '+selectableVPS.length+'，8 个分组；过滤 IPv6 '+droppedV6+'，信息项 '+droppedInfo+'，英国/台湾 '+droppedManual+'，去重 '+duplicates+'。');
