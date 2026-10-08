// Sub-Store 远程文件脚本，配合 config_vps_standalone.json。
// 只读取单订阅；不依赖组合订阅、厂商或节点名称，不内置真实节点/凭据。
// 参数：name=VPS；strategy=prefer_ipv4 或 prefer_ipv6；mode=tun 或 mixed。
const args = typeof $arguments === 'object' && $arguments ? $arguments : {};
const name = String(args.name ?? 'VPS').trim();
const strategy = String(args.strategy ?? 'prefer_ipv4');
const mode = String(args.mode ?? 'tun');
if (!name) throw new Error('name 必须填写 Sub-Store 单订阅名称');
if (!['prefer_ipv4', 'prefer_ipv6'].includes(strategy)) throw new Error('strategy 只能是 prefer_ipv4 或 prefer_ipv6');
if (!['tun', 'mixed'].includes(mode)) throw new Error('mode 只能是 tun 或 mixed');
if (typeof produceArtifact !== 'function') throw new Error('请在 Sub-Store 远程文件脚本中运行');
const clone = value => JSON.parse(JSON.stringify(value));
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  }
  return value;
}
function identity(node) {
  const copy = clone(node);
  delete copy.tag;
  return JSON.stringify(sorted(copy));
}
let config;
try {
  const text = typeof $content === 'string' ? $content : $files[0];
  config = JSON.parse(text);
} catch (_) {
  throw new Error('无法读取模板，请使用 config_vps_standalone.json');
}
for (const [tag, type] of [['VPS选择', 'selector'], ['VPS自动', 'urltest'], ['direct', 'direct']]) {
  if (config.outbounds?.filter(node => node.tag === tag && node.type === type).length !== 1) {
    throw new Error('模板缺少或重复策略组：' + tag);
  }
}
if (!config.dns?.servers?.some(server => server.tag === 'vps-dns')) throw new Error('模板缺少 vps-dns');
let source;
try {
  source = await produceArtifact({
    name, type: 'subscription', platform: 'sing-box',
    produceOpts: {'include-unsupported-proxy': false}
  });
} catch (_) {
  throw new Error('单订阅读取失败，请检查订阅名称及该订阅能否预览：' + name);
}
try {
  source = typeof source === 'string' ? JSON.parse(source) : clone(source);
} catch (_) {
  throw new Error('订阅转换结果不是合法 sing-box JSON');
}
if (!Array.isArray(source?.outbounds)) throw new Error('订阅转换结果缺少 outbounds');
// 只注入转换后有服务器地址的代理出站，排除来源中的策略组和 direct。
const nodes = [], tags = [], seen = new Map(), originalTags = new Map();
const reserved = new Set(['VPS选择', 'VPS自动', 'direct']);
let duplicates = 0;
for (const raw of source.outbounds) {
  if (!raw || typeof raw.server !== 'string' || !raw.server.trim()) continue;
  if (['selector', 'urltest', 'direct', 'block', 'dns'].includes(raw.type)) continue;
  const id = identity(raw), original = String(raw.tag ?? '').trim();
  if (original && originalTags.has(original) && originalTags.get(original).id !== id) {
    throw new Error('订阅中节点重名且配置不同，请先重命名：' + original);
  }
  if (seen.has(id)) {
    if (original) originalTags.set(original, {id, tag: seen.get(id)});
    duplicates++;
    continue;
  }
  const base = original || 'VPS节点';
  let tag = base, suffix = 2;
  while (reserved.has(tag)) tag = base + ' [' + suffix++ + ']';
  reserved.add(tag);
  seen.set(id, tag);
  if (original) originalTags.set(original, {id, tag});
  const node = clone(raw);
  node.tag = tag;
  // 1.14 模板使用 domain_resolver，保留服务器 IP、TLS 和协议字段。
  delete node.domain_strategy;
  node.domain_resolver = {server: 'vps-dns', strategy};
  nodes.push(node);
  tags.push(tag);
}
if (!nodes.length) throw new Error('单订阅中没有可转换的服务器代理节点，已停止生成');
for (const node of nodes) {
  if (!node.detour || node.detour === 'direct') continue;
  const target = originalTags.get(node.detour);
  if (!target) throw new Error('链式拨号依赖不存在或不受支持：' + node.tag);
  node.detour = target.tag;
}
// 链式拨号必须能到达出口，避免自引用或环形依赖。
const byTag = new Map(nodes.map(node => [node.tag, node]));
const checked = new Set(), visiting = new Set();
function checkChain(tag) {
  if (checked.has(tag)) return;
  if (visiting.has(tag)) throw new Error('链式拨号存在循环：' + tag);
  visiting.add(tag);
  const target = byTag.get(tag)?.detour;
  if (target && target !== 'direct') checkChain(target);
  visiting.delete(tag);
  checked.add(tag);
}
for (const tag of tags) checkChain(tag);
const selector = clone(config.outbounds.find(node => node.tag === 'VPS选择'));
const auto = clone(config.outbounds.find(node => node.tag === 'VPS自动'));
const direct = clone(config.outbounds.find(node => node.tag === 'direct'));
selector.outbounds = ['VPS自动', ...tags];
selector.default = 'VPS自动';
auto.outbounds = tags;
direct.domain_resolver = {server: 'vps-dns', strategy};
config.outbounds = [selector, auto, direct, ...nodes];
config.dns.strategy = strategy;
config.route.default_domain_resolver = {server: 'vps-dns', strategy};
if (mode === 'mixed') config.inbounds = config.inbounds.filter(inbound => inbound.type !== 'tun');
const output = JSON.stringify(config);
if (new TextEncoder().encode(output).length > 1024 * 1024) throw new Error('生成配置超过 1 MiB，请减少订阅节点');
$content = output;
console.log('[VPS 独立订阅] ' + name + '：' + nodes.length + ' 个节点，去重 ' + duplicates + '；双栈 ' + strategy + '；' + mode);
