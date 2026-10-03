# 验证记录

日期：2026-10-03（Asia/Shanghai）。目标：官方 sing-box 1.14.2 Linux amd64。

- `test.mjs`：**213 项测试通过**，覆盖三端模板。
- 三端基础、链式拨号和 WireGuard endpoint 共 **9 次 `sing-box check` 通过**。
- 原有 **13 个业务规则集**此前已通过内核解码；新增 **8 个作者 DNS 规则文件**已从配置使用的直连 CDN 下载，其中 6 个 SRS 通过解码，2 个 JSON 通过编译。共 21 个远程规则集；不代表用户网络能直连访问规则源。
- 核对组合订阅默认读取 `YBsSB2`、VPS 来源默认读取单订阅 `VPS`。
- 核对保留香港、信息节点过滤、配置去重、VPS 改名后仍按完整配置识别、只使用组合选入的节点以及两池隔离。
- 核对 AI 默认 VPS、独立 VPS 测速、空 VPS/机场池和来源不匹配时报错，不插入直连回退。
- 核对 IPv4 DNS、空 AAAA、IPv4 TUN、IPv6 流量拒绝、IPv6 服务器过滤和 WireGuard IPv6 清理。
- 核对 UDP443 在三种 Clash 模式优先拒绝，TCP443/STUN 仍按正常分流；明确国外服务优先于国内 IP；国内直连以及规则直连下载。
- 核对同名不同配置、链式引用缺失、环路和重复注入会报错。
- 三端 DNS 与作者 `windows.json` 实时读取的 DNS 对象逐项比对一致，适配仅为代理名/规则标签映射和首条空 AAAA；均保留反向映射、8192 缓存及乐观缓存。
- 验证作者的 FakeIP 排除表、Google 非终止 evaluate、国内响应转阿里、已知国外/未知国外响应进入 FakeIP、TXT 默认 Google、Direct/Global 模式、HTTPS/SVCB 拒绝、ECS、评估超时参数和 FakeIP TTL。
- 新增 `store_fakeip` 和新的缓存 ID，节点及规则下载 bootstrap 指向 `ali`，避免把节点域名解析成 FakeIP。

分流测试使用明确的请求/评估响应规则集归属模拟匹配顺序，没有逐个审核规则库的全部域名，也没有向真实 Google/阿里服务器发起 DNS 查询来验证 evaluate 的实际网络结果。全部节点、密码、IP 和 WireGuard 密钥为虚构测试数据。

尚未在用户真实 macOS、Windows、Android 设备和订阅上运行。内核配置检查通过仅表明测试配置的字段、协议参数和引用可被该内核接受，不证明 VPN 接管、系统代理权限、节点连通、运营商速度或 AI 服务可用性。
