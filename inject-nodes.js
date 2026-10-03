// Sub-Store 文件脚本，sing-box 1.14.2。最终节点来自组合订阅 YBsSB2。
// 保留香港；固定 IPv4；机场和 VPS 分开测速；空池停止生成，不回退直连。
// 参数只填写内部订阅名称，不能填写订阅 URL、token 或节点密钥。
const args = typeof $arguments === 'object' && $arguments ? $arguments : {};
const known = new Set(['name','type','vps_name','vps_type']);
for (const key of Object.keys(args)) if (!known.has(key)) throw new Error('未知参数：' + key);
const name = String(args.name ?? 'YBsSB2').trim();
const vpsName = String(args.vps_name ?? 'VPS').trim();
function subType(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (/^(collection|col|组合订阅|组合|1)$/i.test(String(value))) return 'collection';
  if (/^(subscription|sub|单订阅|订阅|0)$/i.test(String(value))) return 'subscription';
  throw new Error('订阅 type 无效');
}
if (subType(args.type, 'collection') !== 'collection') throw new Error('name 必须指向组合订阅');
if (!name || !vpsName || name === vpsName) throw new Error('请填写不同的组合订阅和 VPS 来源名称');
if (typeof produceArtifact !== 'function') throw new Error('需要 Sub-Store 文件脚本环境');
const clone = v => JSON.parse(JSON.stringify(v));
const array = v => v == null ? [] : Array.isArray(v) ? v : [v];
async function read(name, type) {
  const raw = await produceArtifact({name,type,platform:'sing-box',
    produceOpts:{'include-unsupported-proxy':false}});
  let data;
  try {data = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);}
  catch (_) {throw new Error('订阅转换输出不是合法 JSON');}
  if (!data || !Array.isArray(data.outbounds)) throw new Error('订阅转换结果缺少 outbounds');
  return data;
}
let config;
try {config = JSON.parse(typeof $content !== 'undefined' ? $content : $files[0]);}
catch (_) {throw new Error('文件源必须是仓库中的三端 JSON 模板');}
if (!config || !Array.isArray(config.outbounds)) throw new Error('模板缺少 outbounds');
// 每次从组合订阅重建节点。兼容旧注入追加的出站，清理后固定为八个分组。
const groups = ['节点选择','自动选择','VPS','VPS-自动','AI工具','漏网之鱼','🎯 全球直连','GLOBAL'];
const reserved = new Set([...groups,'direct']);
for (const tag of groups) if (config.outbounds.filter(o=>o.tag===tag).length !== 1) throw new Error('模板策略组缺失或重名：' + tag);
for (const tag of groups) {
  const group=config.outbounds.find(o=>o.tag===tag);
  const expectedType=['自动选择','VPS-自动'].includes(tag)?'urltest':'selector';
  if (group.type !== expectedType) throw new Error('模板策略组类型错误：' + tag + '，请刷新仓库模板');
}
const direct=config.outbounds.filter(o=>o.tag==='direct');
if (direct.length!==1 || direct[0].type!=='direct') throw new Error('模板 direct 出站缺失、重名或类型错误');
const removedOutbounds=config.outbounds.filter(o=>!reserved.has(o.tag));
const removedGroups=removedOutbounds.filter(o=>['selector','urltest'].includes(o.type)).length;
// 只保留模板策略定义和 direct；其余节点/端点重新读取，避免旧订阅分组混入。
config.outbounds=[...groups.map(tag=>config.outbounds.find(o=>o.tag===tag)),direct[0]];
delete config.endpoints;
const combined = await read(name,'collection');
// 仅用 VPS 单订阅辨认来源，不把组合中未选入的节点额外添加到最终配置。
const vpsSource = await read(vpsName,subType(args.vps_type,'subscription'));
const nonNodes = new Set(['selector','urltest','direct','block','dns','bridge']);
const supported = new Set(['socks','http','shadowsocks','vmess','trojan','vless','hysteria',
  'hysteria2','tuic','naive','ssh','shadowtls','anytls']);
const info = /官网|剩余|流量|套餐|免费|到期|过期|订阅|Expire[ _-]*Date|Traffic|Bandwidth|\d+(?:\.\d+)?\s*(?:GB|TB)(?:$|[^a-z])/i;
function records(data) {
  return [...array(data.outbounds).map(node=>({node,endpoint:false})),
    ...array(data.endpoints).map(node=>({node,endpoint:true}))]
    .filter(r=>r.node && !nonNodes.has(r.node.type));
}
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
  return v;
}
function identity(record) {
  const node={...record.node}; delete node.tag;
  return JSON.stringify([record.endpoint,canonical(node)]);
}
const vpsIDs = new Set(records(vpsSource).map(identity));
const nodes=[], endpoints=[], airport=[], vps=[], identities=new Map(), tags=new Map(), used=new Set(reserved);
let filteredIPv6=0, removedInfo=0, duplicates=0;
for (const record of records(combined)) {
  const raw=record.node;
  if (typeof raw.tag !== 'string' || !raw.tag.trim()) throw new Error('节点缺少名称');
  if (info.test(raw.tag)) {removedInfo++;continue;}
  if (!record.endpoint && raw.type === 'wireguard') throw new Error('旧 WireGuard outbound 需转换为 endpoint');
  if (record.endpoint ? raw.type !== 'wireguard' : !supported.has(raw.type)) throw new Error('不支持的节点类型：' + raw.type);
  if (typeof raw.server === 'string' && raw.server.includes(':')) {filteredIPv6++;continue;}
  const node=clone(raw);
  if (record.endpoint) {
    node.address=array(node.address).filter(a=>!String(a).includes(':'));
    node.peers=array(node.peers).filter(p=>!String(p.address || '').includes(':'));
    for (const peer of node.peers) peer.allowed_ips=array(peer.allowed_ips).filter(a=>!String(a).includes(':'));
    if (!node.address.length || !node.peers.length || node.peers.some(p=>!p.allowed_ips.length)) {
      throw new Error('WireGuard 节点没有完整可用的 IPv4 配置');
    }
  }
  const id=identity(record), isVps=vpsIDs.has(id);
  let tag=identities.get(id);
  if (!tag) {
    const base=reserved.has(raw.tag) ? '节点 / ' + raw.tag : raw.tag;
    tag=base; let suffix=2;
    while (used.has(tag)) tag=base + ' [' + suffix++ + ']';
    used.add(tag); identities.set(id,tag); node.tag=tag;
    delete node.domain_strategy; delete node.inet6_bind_address;
    node.domain_resolver={server:'ali',strategy:'ipv4_only'};
    (record.endpoint ? endpoints : nodes).push(node);
    (isVps ? vps : airport).push(tag);
  } else duplicates++;
  if (tags.has(raw.tag) && tags.get(raw.tag)!==tag) throw new Error('组合订阅存在重名但不同配置的节点，请先重命名');
  tags.set(raw.tag,tag);
}
if (!airport.length) throw new Error('组合订阅中没有可用机场节点，停止生成');
if (!vps.length) throw new Error('组合订阅中没有可识别的 IPv4 VPS 节点，请核对 VPS 来源和组合选项，停止生成');
for (const node of [...nodes,...endpoints]) {
  if (node.detour && node.detour!=='direct') {
    const target=tags.get(node.detour);
    if (!target) throw new Error('节点链式拨号依赖缺失或已被过滤');
    node.detour=target;
  }
}
// 机场与 VPS 分开测速；VPS 手动组共享给节点选择与 AI，避免重复铺节点。
for (const [tag,pool] of [
  ['节点选择',['自动选择','VPS',...airport,'🎯 全球直连']],
  ['自动选择',airport],
  ['VPS',['VPS-自动',...vps]],
  ['VPS-自动',vps],
  ['AI工具',['VPS','节点选择']],
  ['漏网之鱼',['节点选择','自动选择','🎯 全球直连']],
  ['🎯 全球直连',['direct']],
  ['GLOBAL',['节点选择','自动选择','AI工具','VPS','🎯 全球直连']]
]) {
  const group=config.outbounds.find(o=>o.tag===tag);
  group.outbounds=pool;
  if (group.type==='selector') group.default=pool[0];
}
config.outbounds.push(...nodes);
if (endpoints.length) config.endpoints=endpoints;
else delete config.endpoints;
const finalGroups=config.outbounds.filter(o=>['selector','urltest'].includes(o.type));
if (finalGroups.length!==groups.length || finalGroups.some((o,i)=>o.tag!==groups[i])) {
  throw new Error('最终分组数量或顺序错误，停止生成');
}
// 节点依赖、策略引用和环路检查；从不打印订阅或节点对象。
const objects=[...config.outbounds,...endpoints], graph=new Map();
for (const node of objects) {
  if (graph.has(node.tag)) throw new Error('重复节点标签');
  graph.set(node.tag,[...array(node.outbounds),...array(node.detour)]);
}
const visiting=new Set(),visited=new Set();
function visit(tag) {
  if (!graph.has(tag)) throw new Error('出站引用不存在');
  if (visiting.has(tag)) throw new Error('节点拨号或策略存在环路');
  if (visited.has(tag)) return;
  visiting.add(tag); for (const dep of graph.get(tag)) visit(dep);
  visiting.delete(tag);visited.add(tag);
}
for (const tag of graph.keys()) visit(tag);
// 紧凑输出：完整保留规则，避免超过客户端 4 MiB gRPC 传输上限。
function utf8Length(text) {
  let bytes=0;
  for (const char of text) {
    const cp=char.codePointAt(0);
    bytes += cp<=0x7f ? 1 : cp<=0x7ff ? 2 : cp<=0xffff ? 3 : 4;
  }
  return bytes;
}
const content=JSON.stringify(config);
const outputBytes=utf8Length(content);
const maxOutputBytes=4*1024*1024-64*1024; // 为消息包装预留 64 KiB。
if (outputBytes>maxOutputBytes) {
  throw new Error('紧凑配置仍过大：' + outputBytes + ' 字节，上限 ' + maxOutputBytes +
    ' 字节（4 MiB 传输上限预留 64 KiB）。请减少组合订阅选入的节点或节点附加数据，再重新生成');
}
$content=content;
console.log('[组合订阅注入] 完成：机场 ' + airport.length + '，VPS ' + vps.length +
  '，IPv6 节点过滤 ' + filteredIPv6 + '，信息过滤 ' + removedInfo + '，去重 ' + duplicates +
  '；分组 8/8；清理旧分组 ' + removedGroups + '；香港保留；紧凑配置 ' + outputBytes + ' 字节');
