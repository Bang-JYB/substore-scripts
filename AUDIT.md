# sing-box 1.14.2 审查与整改记录（2026-10-19）

## 2026-10-20 引用边界复查（基线 d54ee160）

本轮按最新指令撤除 QQ 音乐专用直连；其余保留六模板、八组、机场/VPS 分池、组合 IPv4/VPS 双栈、DNS 主备、GitHub/AI、端口、MTU、测速周期、UDP 和系统代理设置。未作性能重构。

| 先复现/核查 | 最小处理 | 回归依据 |
| --- | --- | --- |
| 两脚本把源 tag trim 后建表，却按原 detour 查找；合法带空格链会失败，反向不精确引用可能误命中，空格不同的节点被当作重名 | 只把来源字典键改成原始字符串；detour 精确匹配，绝不自动 trim 或猜目标。独立版仅输出显示名继续 trim，重名输出依旧唯一编号 | 前后空格/制表符、多跳链、不同节点不合并、精确同名歧义、完整相同配置别名去重、direct 源节点/内置直连、自环/多环及错误引用 |
| 无 server 的 SS/Snell 包装节点依赖 IPv6 ShadowTLS 时，组合版过滤 hop 后已能保守失败 | 不改生产过滤；继续明确拒绝整个导出，不静默替换节点/丢链或改为 direct | 两种协议均报依赖被过滤，$content 不被半成品覆盖；独立双栈保留 hop/链且不把 hop 放候选池；核心 check |
| 父节点被 IPv6/地区规则过滤、IPv4 辅助 hop 存活时，原代码会把 hop 当作独立可选节点 | 辅助角色按原始支持节点的依赖图识别，再通过已有别名映射定位；即使父节点被过滤，辅助 hop 也不进入任何候选池 | IPv6/英国父节点两个用例；健康 VPS 池保持纯净，只有辅助 hop 的池明确失败；共享/去重/带空格 helper 不被测速或手动选择 |
| 未被任何支持节点引用的显式 ShadowTLS 出站 | 不盲改既有支持范围和候选行为；仍保留机场/VPS 原分池 | 独立类型与已引用辅助类型分别断言。仅有显式 ShadowTLS 不保证能作为完整代理访问任意业务，真实用途需用户验收 |
| 用户补充“QQ 音乐直连可以去掉” | 删除六模板原 QQ/Tencent 域名清单的两处 DNS 专用匹配与 resolve/direct 路由；VPS 的通用 cn 后缀保留 | 六份 JSON 与基线深比较：仅此项删除；六项规则回归确认无专用覆盖、QQ 按通用国内 IP/兜底分类，不强制代理 |

最终 20 项引用/辅助边界回归对基线脚本 15 失败/5 通过，修复后全部通过；IPv6 无 server 链及共享候选等五项原本就通过，不为这些情况改逻辑。QQ 六项需求回归在移除前全部失败，移除后通过；这是用户要求的业务变化，不把旧规则称为软件缺陷。

### 保留测试与验证界限

原 65 项 Node 场景、官方 Sub-Store 2.42.6 固定输入/转换快照、原 23 份完整配置、五组运行级故障集成均保留。QQ 专用断言按新要求改为通用国内分流断言；运行故障域名从 *.qq.com 换为 *.baidu.com（本地模拟 geosite-cn 已覆盖），保留所有超时、主备、负响应、双失败、节点故障、Bootstrap 隔离/恢复、缓存/FakeIP 断言。真实上游规则里 QQ 域名的通用 geosite-cn 匹配检查保留，不能把“删除专用覆盖”误当作“QQ 一定走代理”。

当前 Node 91 项（65 + 20 引用边界 + 6 QQ），Python 6 项；每个版本/系统的完整 core check 由 23 加至 27（两家族空格链 + SS/Snell 双栈 IPv6 helper，并验证组合负例）。1.14.2 仍为生产目标，1.14.3 仅兼容矩阵。五组套接字与真实规则校验继续在 Linux 两版执行。

Bootstrap 的显式单 transport 限制未改；没有新增 DNS 监听或回环。固定转换快照不覆盖任意用户处理器或未来后端格式。core check 不等于 ShadowTLS/SS/Snell 真实远端握手或系统 TUN；Windows/SFM/SFA 的设备权限、换网/休眠、实际 IPv6、应用连续播放等仍按前轮说明待实机验证。

### 变更文件与回滚

生产：两份注入脚本（精确源名称键与组合辅助角色保留）；六份 JSON 仅按用户要求删除专用 QQ/Tencent 覆盖。测试：reference-boundaries.test.mjs、policy.test.mjs、runtime.py、core-check.mjs。文档：本记录、VALIDATION、两 README。固定 Sub-Store 快照/捕获工具、工作流、核心版本/摘要均不改。

回滚：revert 本轮 PR，或将模板与脚本 URL 同时固定到 `d54ee16043e95fa0787af40b0f1cdf09da59240e`，刷新缓存后重新生成/导入；回滚会同时恢复 QQ 专用直连和旧的空格/孤立辅助候选问题。使用已备份的旧生成配置也可直接回切，不能只回滚一份脚本再混用新旧模板。


## 2026-10-20 边界复审（基线 2c864da）

范围：两份注入脚本的小修、转换输入回归、文档。六份 JSON、全部策略组、MTU、测速间隔、UDP/系统代理、DNS 主备、VPS 双栈均未改。生产目标仍为 1.14.2，兼容性矩阵仍为 1.14.2/1.14.3 × 三系统。

| 先证明的问题 | 必要修复 | 回归 |
| --- | --- | --- |
| 组合版白名单 13 类，独立版 14 类；组合版丢弃 Snell，纯 Snell 机场/VPS 无法生成 | 组合版只补 snell，统一 14 类已支持范围；不加入 endpoint/Tor/已移除协议 | 全 14 类协议与分池、Snell v4/v6、顶层改名仍识别 VPS；两版本完整核心检查 |
| 官方 Sub-Store 为 SS/Snell + ShadowTLS 生成无 server 包装节点，当前两脚本拒绝，但原始转换结果能通过两版核心 check | 只允许这两类无 server 节点委托给存在且有效的 ShadowTLS 出站；普通缺失/空/错误 server 仍失败，依赖/循环校验保留 | 六模板官方快照、direct/错误类型/缺失 helper/循环负例，完整配置 check |
| 辅助 ShadowTLS 出站会进入手动/自动池，单独选用绕开 SS/Snell/VLESS 协议层；官方 shadowtls DialContext 使用自身服务器且不处理任意代理目标 | 被引用的 ShadowTLS hop 保留在 outbounds，但不作为独立策略候选；不改变测速周期 | 六模板确认辅助引用保留、策略池只含代理根节点；未被引用的显式 ShadowTLS 出站仍按原白名单保留 |
| 组合处理器重命名会改变生成的 helper 标签及根节点 detour，使三种包装根节点误归机场 | 仅在 VPS 来源比较时，把无后续 detour 的 ShadowTLS 物理 hop 按完整配置比较；不修改实际 detour，不放宽去重/歧义/循环检测，不按 IP 猜测 | 用官方转换器对组合侧先改名后转换，复现 SS/Snell/VLESS 包装节点误分池；不同代理密码即使共用物理 hop 仍分池 |

最终 14 项新回归在基线脚本上 12 失败/2 通过，修复后全部通过；原 51 项回归保留。中间单独复现过“辅助出站误入池”六模板全部失败与“集合改名误分池”失败，未通过删功能或放宽断言处理。

### 真实转换覆盖与界限

已执行官方 Sub-Store **2.42.6** 发布的 proxy-utils.esm.mjs：SHA256 `599ed6ae6570c17939282f2f2a6fa28b204fdc1fd36faf6ae9b534588f26c80f`，源码提交 `1f0318bc6feb46fbe204836f32ca7acab37ea67e`。未改动 parser/producer；在无 process 的 VM 中用内存 QX 存储宿主，禁止网络/外部 import。输入为人工构造、保留地址/示例域名、fixture-only 密码和零填充测试 key。真实执行 parse → produce('sing-box', 'external', include-unsupported-proxy=false)，捕获原始 JSON 字符串与 endpoints 分离结果，不以手写 sing-box 节点冒充真实转换。

覆盖：Snell 5→4 / 6 字段、SS/Snell/VLESS 的 ShadowTLS 多出站、WS header 字符串/数组与 early-data path、Reality/uTLS、IPv6、WireGuard endpoint 隔离、组合前置改名、JSON 字符串/对象与 $files 入口、API 请求参数。官方 [producer](https://github.com/sub-store-org/Sub-Store/blob/1f0318bc6feb46fbe204836f32ca7acab37ea67e/backend/src/core/proxy-utils/producers/sing-box.js)、[produceArtifact 调用链](https://github.com/sub-store-org/Sub-Store/blob/1f0318bc6feb46fbe204836f32ca7acab37ea67e/backend/src/restful/sync.js) 与 1.14.2 [registry](https://github.com/SagerNet/sing-box/blob/v1.14.2/include/registry.go)、[QUIC registry](https://github.com/SagerNet/sing-box/blob/v1.14.2/include/quic.go) 已核对。

CI 只消费固定快照，不增加实时 Sub-Store 服务/下载依赖；可用 scripts/capture-substore-fixture.mjs 和同一官方归档离线重生成。**不是用户真实后端端到端验收，也未验证 Snell/ShadowTLS/Reality 与真实远端的握手/吞吐**。旧版或未来 Sub-Store、任意用户脚本/自定义字段、多跳 helper 的改名及两入口不同认证/TLS 配置不在自动兼容承诺内；来源比较仍要求相同的完整协议配置，未知情况不按服务器 IP 猜来源。

### Bootstrap 与平台复核

节点 bootstrap 仍由显式单 transport 解析；本轮没有改 domain_resolver。原五组核心套接字故障测试全部保留，其中覆盖六模板主 DNS 故障→域名节点失败而 QQ 备用直连、主 DNS 原地恢复及 IP 节点独立性。没有证明更可靠、无回环且跨客户端的替代方案，因此保留单点限制；业务 DNS 主备不能替代 bootstrap 主备。

核对两版固定文档：SFM/SFA features 完全一致；1.14.3 TUN 文档澄清 auto_route 关闭时 DNS 默认模式为 disabled，但本仓库 TUN 已显式 dns_mode=hijack 且 auto_route=true，不依赖该默认值，不需改配置。Windows strict_route 仍会限制非 TUN 的 53 端口；SFM/SFA 不实现 strict_route，不得将该字段当成这些客户端的验收依据。未加入 Linux bypass/auto_redirect。

实机待验收：Windows 多网卡/WFP/VirtualBox、休眠恢复、LAN IP/域名；SFM NetworkExtension 权限、本地网络权限、睡眠/换网/其他 VPN；SFA VpnService 与按应用覆写、始终开启 VPN/阻止未使用 VPN 的连接、厂商后台限制、Wi-Fi/移动切换。三个平台均需实际 QQ 连续播放/换歌、节点失效时新建直连、IPv4/IPv6 路径检查。CI 核心 check 是字段/引用验证；loopback 集成没有建立真实系统 TUN，不能当作这些设备项目已通过。

### 改动与回滚

生产只改 inject-nodes.js / inject-vps-standalone.js 的上述注入与候选池逻辑。tests/substore.test.mjs、substore-fixture.mjs、fixtures/*、scripts/capture-substore-fixture.mjs 增加固定转换捕获与回归；core-check.mjs 由 15 增至 23 份有效完整配置。README、VPS README、VALIDATION 与本记录更新。原 11 种正常生成输出逐项比较一致，所有 JSON 与网络参数原样保留。

新网络选择行为仅影响之前被丢弃的 Snell、无法注入的包装节点，以及误选的辅助 hop/误分池的包装节点；上表列出依据与回归。回滚：revert 本轮 PR，或模板与注入脚本 URL 同时固定到 `2c864da5eeb4522cb6d64af93db0844b516f8145`，刷新缓存、重新生成/导入；保留此前生成配置可直接回切。旧版组合 Snell/ShadowTLS 仍有本轮已证明的问题，不能把回滚等同于修复。


## 2026-10-20 小范围复审（基线 ec00943）

本轮保持生产目标 **1.14.2**。六份 JSON、inject-nodes.js、八组/分池、IPv4/IPv6、7890/9090、GitHub/QQ/AI、DNS 主备均未更改。不调整 MTU、栈或系统路由。

| 已证明的问题 | 修改及回归 |
| --- | --- |
| config_vps_android + mode=mixed 得到空 inbounds；核心 check 不会拒绝空入站 | 独立脚本在读取订阅前检查入站结构，mixed 过滤会删空时明确拒绝，指导改用桌面模板/默认 tun；桌面 mixed 与 notun 的 7890/管理接口保持原样 |
| 独立脚本接收任何带 server 的对象，可注入未知协议或已移除的 WireGuard/SSR 出站 | 根据官方 v1.14.2 include/registry.go、quic.go 的服务器代理类型设 14 类白名单（含原先可用的 Snell）；未知/非服务器对象不注入，依赖被过滤则拒绝；支持类型缺少 server 明确报错 |
| 原 15 份 core check 把 Android 空入站当作有效配置通过 | 保留该参数组合为必须拒绝的负例，每个有效输出另检查非空；增加含全部 14 类协议的完整配置，共仍为 15 份有效配置 check |

先补六组注入回归，ec00943 上四组失败（22 通过/4 失败），再做上述最小修改，六组全部通过。新增测试不依赖真实订阅或凭据。锁定官方归档 SHA256，同时检查稳定版 [1.14.3](https://github.com/SagerNet/sing-box/releases/tag/v1.14.3)，未把默认下载/生产目标改成 1.14.3。

### Bootstrap DNS：测出限制，保留网络行为

新增运行级故障组遍历六模板：节点 server 使用测试域名、国内主 DNS 返回 SERVFAIL，断言代理 HTTP 无法完成、bootstrap 只查询主 DNS、不查询腾讯或代理 DNS；同期 QQ HTTP 通过腾讯备用直连。恢复主 DNS 后不重启核心即可恢复代理；同样故障下 IP 字面量节点仍可用。其余既有超时、DNS 主备、缓存/FakeIP 故障测试全部保留。

官方 1.14.2 option/outbound.go 的 domain_resolver 对象要求非空 server，common/dialer/dialer.go 将其指定为单 transport，不经过业务 DNS 主备规则。故本轮**保留阿里显式直连 bootstrap**，不移除 resolver，不使用代理 DNS 自解析，不增加自指本地 DNS 监听，不在加载阶段解析/固化订阅域名。安全且跨三平台的备用方案尚未在此架构证明；不能把应用 DNS 主备误认为节点 bootstrap 主备。IP 节点不需要该层域名解析，但不自动改写用户节点或 SNI。

### TUN 剩余风险与验收边界

| 平台 | 静态/核心检查覆盖 | 仍需实际设备验证 |
| --- | --- | --- |
| Windows | 原 strict_route、dns_mode=hijack、auto_detect_interface、loopback mixed/API、无 Linux bypass 保持 | strict_route 可能影响多网卡/VirtualBox 等应用；Wi-Fi/有线切换、休眠恢复、防火墙/驱动与 LAN DNS，需实机检查 |
| macOS SFM | JSON/core check 不代表 NetworkExtension 建立成功；官方 SFM 不实现 strict_route，接口由系统管理 | 系统扩展权限、局域网访问权限、网络切换、睡眠恢复、与其他 VPN/USB 网卡共用；不能据此宣称解决 iMac panic |
| Android SFA | Android 默认保留 TUN；拒绝删空；不加桌面 mixed 或 Linux 权限字段 | VpnService 覆写、按应用绕过、系统“始终开启 VPN/阻止未使用 VPN 的连接”、厂商后台限制、Wi-Fi/移动切换，需实机检查 |

共同边界：direct 规则仍经运行中的核心；核心/VPN 本身故障不能保证直连持续。组合版仅 IPv4 TUN 地址和 ipv4_only 解析，不能由静态检查推出系统其他 IPv6 流量必被捕获/阻断；VPS 双栈需实际 IPv6 ISP 路径验证。172.19.0.0/30 或 VPS ULA 与现网冲突、mDNS/DHCP/local DNS、MTU/UDP 等也不能由 loopback 集成推断正常；本轮无证据不改地址/MTU/stack，不大范围排除 RFC1918。

固定版本依据：[TUN](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/tun.md)、[SFM](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/clients/apple/features.md)、[SFA](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/clients/android/features.md)、[Linux bypass](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/route/rule_action.md)。在线官方文档也已交叉核对，避免用 testing 新字段推定 1.14.2 行为。

### 本轮文件与回滚

- 生产代码只改 inject-vps-standalone.js：入站防御、协议白名单/有效 server。
- tests/helpers.mjs、injection.test.mjs、core-check.mjs、runtime.py：负例、完整协议配置及 bootstrap 故障；另修复 CI 已证明的临时代理/API 端口复用竞争，并在 tests/runtime_fixture_test.py 先复现再回归；原有测试不删减功能。
- scripts/download-core.py、tests/core_download_test.py、.github/workflows/validate.yml：双版本锁定、版本/摘要负例、3 系统 × 2 版本；测试下载器默认仍为 1.14.2。
- README_VPS_STANDALONE.md、VALIDATION.md、AUDIT.md：参数边界、测试层次、设备待验收与回滚。

本轮不改正常配置的实际网络路径；新增行为是拒绝原先不可用的入站/节点数据，并过滤不支持的类型。回滚时同时将模板/注入脚本 URL 固定到 `ec00943bb5ef91a5b9f74dfe4350807b673fb46e`，刷新 Sub-Store 缓存并重新生成；Android 不得用 mode=mixed。仓库可 revert 本轮提交/PR，禁止 force-push 重写历史。保留旧的生成配置以便回切。


审查基线：main `7a72e9f56637a50cbf89a6c0a32df8cb1e7c7c26`。未使用真实订阅、凭据、私人配置或服务器登录。

## 先复现，再修改

| 问题与基线证据 | 最小整改 | 回归证据 |
| --- | --- | --- |
| inject-nodes 的 `tagMap.set(raw.tag, tag)` 对同名不同节点覆盖；去重分支不记录别名 | 原始名称先做歧义检查；identity → 输出 tag 与原始名 → 输出 tag 分离；去重也保存别名 | 原始脚本首批 15 项测试中 7 项失败，修复后全部通过；重名、别名、保留组名分别测试 |
| 组合版只检查目标是否存在，不检测自引用或多节点环 | 完成映射后以迭代 DFS 验证 detour 图；两脚本均避免递归栈溢出 | 自环、二节点环、缺失依赖、被过滤的 IPv6/地区依赖、direct 歧义测试 |
| `same()` 递归删除所有层级 tag，可能把不同嵌套协议配置误去重 | 仅忽略最外层节点 tag，其余字段完整参与 identity | 两个节点仅嵌套 tag 不同仍保留；字段/输入不可变性测试 |
| 六份模板国内业务只用阿里；tx/local 没有参与备用 | evaluate 主查询，NOERROR/NXDOMAIN respond；其余失败才使用腾讯；代理 DNS 同理增加 Cloudflare 备用 | 官方核心套接字测试：健康单查询、SERVFAIL、超时、NXDOMAIN、NODATA、两者皆失败、节点失效 |
| direct 出站的显式 domain_resolver 会绕开备用规则 | 对匹配直连业务的域名先无指定 server 地 resolve，再 route direct；已是 IP 的 TUN 连接不重复查 DNS | 节点关闭、阿里失败时 HTTP 域名请求仍返回 mock direct-ok；官方代码 route/conn.go 使用解析结果 |
| 组合版 GeoIP 规则前没有 resolve，HTTP/SOCKS 域名请求不能可靠判断国内 IP | 已知业务先结束匹配；只对剩余请求 resolve，再私有 IP/GeoIP 兜底；不指定 FakeIP/阿里 | 路由策略测试 + 核心 FakeIP→真实地址→direct 请求；完整配置校验；真实 GeoIP rule-set match |
| Microsoft 规则还包含 copilot.microsoft.com | GitHub 与 AI 的路由/DNS 均先于微软；VPS 版增加同源 AI/foreign 规则，避免已知海外域名多做国内探测 | 实际上游 category-ai、Microsoft/GitHub 交叉检查；两套配置核心代理 mock 返回 proxy-ok |
| Google/AI/GitHub 代理规则位于旧 UDP443 reject 之前，限制被绕过 | 组合版对显式代理业务先检查 UDP443；保留已明确直连业务放行、Global 模式、VPS 版无额外限制 | TCP/UDP、QQ/GitHub/Google/Copilot、Direct/Global 规则回归 |
| 局域网域名使用阿里 DNS，且被 Global 模式提前拦走 | 私有域名使用 local，直连路由置于模式选择之前 | Global 下 nas.lan DNS 与 HTTP direct-ok；局域网 IP/管理监听断言 |
| 规则下载器显式用国内 DNS 解析 GitHub 目标，即使下载指定代理 | 移除仅用于下载目标的强制 resolver，目标域名交给代理通道；节点服务器 bootstrap 保留 | 核心远程规则下载测试使用只在 mock 代理可访问的 rules.fixture.invalid，国内 DNS 查询次数必须为 0 |
| 冷启动无缓存且节点不可用，初始化失败 | 保留明确失败；新增可选 rules_dir → initial_path 与种子准备工具，不删除任何远程规则 | 核心无种子失败、有种子启动、缓存重启、后台更新失败仍直连；种子下载失败/坏二进制不覆盖旧文件 |
| 缺少长期自动化验证 | Node 原生测试、Python 故障夹具、锁定版本/SHA256 的官方核心、三系统 Actions | 见 VALIDATION.md 与实际 Actions 记录 |

## DNS 与性能取舍

采用顺序备用，不开启无依据的 race/speculative。正常国内查询只发一次；只在主查询失败才增加备用等待。保留权威 NXDOMAIN/NODATA。未知域名主 DNS 已成功返回非国内地址时，不再多问第二个国内 DNS；已知海外域名提前匹配，避免额外国内探测。

1.14.2 的内部 Lookup 不允许 FakeIP transport 作为实际解析结果，来源为固定版本 dns/router.go。新增 resolve 没有显式指定 FakeIP server；已知 GitHub/AI 等提前代理，不为 GeoIP 兜底强制解析一遍。真实上游规则仍远程缓存，未将其内嵌为大型 JSON。

模板约 13–19 KB（不含节点）；保留 1 MiB 注入输出上限。没有更改测速间隔、MTU、stack、QUIC 拥塞算法或操作系统内核参数，也没有宣称已实测吞吐量提升。

## 跨平台核查

- Windows：保留 HTTP/SOCKS 7890、loopback 管理接口、strict_route 与 DNS hijack；不把覆盖 TUN 地址的整个 RFC1918 网段加入排除路由。
- macOS：官方 SFM 基于 NetworkExtension，strict_route 不由该平台实现；不擅自切换 includeAllNetworks/enforceRoutes/gVisor。不把 QoS/运营商问题或 kernel panic 归因于单条 JSON。
- Android：VpnService 不适合大量 GeoIP 路由排除；保留移动入站，不添加系统级 process_name 或 Linux bypass。整应用绕过 VPN 由用户在客户端按应用管理。
- 局域网域名由 local DNS 处理；mDNS、DHCP DNS 和 OS 权限仍有平台差异。Windows/macOS/Android 的实机 TUN 测试仍需用户完成。

## 未解决、明确保留的边界

1. 两个国内 DNS 都不可用，或物理网络/核心/NetworkExtension 失效时，不能保证直连应用在线；规则未覆盖的海外接口仍需节点。
2. 节点域名 bootstrap 的 domain_resolver 在 1.14.2 只能引用单个 transport，仍使用原阿里直连。没有创建指向自身的 DNS 监听或代理 DNS 回环；bootstrap DNS 全故障时域名节点可失败。
3. 没有缓存、没有部署可读的种子且所有节点不可用时，默认首次启动仍失败。initial_path 不能保证移动/SFM 沙盒能读到任意电脑路径。
4. Global 模式明确代理 QQ 音乐；需要国内分流应使用 Rule。用户手动把代理组设为直连时，效果还取决于该域名最终的 DNS 路由；不要把任意组选择等同于 OS 级绕过 VPN。
5. 未使用真实节点/QQ 音乐下载 URL/真实 Sub-Store 后端验收。故障测试验证协议逻辑，不等于播放、带宽或丢包实测。
6. 上游 geosite 数据可能变化；种子准备工具校验 HTTPS 下载与核心可解析性，manifest SHA256 用于记录完整性，并非上游内容签名。应周期性更新种子。

## 更新与回滚

本次保留 YBsSB2、VPS、八组与两份注入脚本，组合固定 IPv4、VPS 双栈；没有公网监听、真实凭据或新订阅依赖。
更新必须同时刷新模板和脚本的 Sub-Store 缓存、重新生成并更新客户端，保留旧生成文件以便对照。
最快回滚：模板和脚本 URL 均固定到基线 `7a72e9f56637a50cbf89a6c0a32df8cb1e7c7c26`，重新生成/导入。仓库级可使用 GitHub 对本次提交执行 revert，保留历史，避免 force-push。
