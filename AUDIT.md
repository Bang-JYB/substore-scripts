# sing-box 1.14.2 审查与整改记录（2026-10-19）

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
