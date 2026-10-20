# VPS 独立版性能审计（基线 0325468）

结论：未测出安全有效的新生产精简，六份 JSON 和两份注入脚本保持不变；不恢复 QQ/Tencent 专用覆盖。本轮增加可复现 A/B、故障断言与记录，删除显式 resolve 的候选因恢复/LAN 退化被拒绝。实验结果与实机验证步骤见下文。

## 实验前假设与方法

目标是查出新增连接中的冗余 DNS/resolve 等待，不预先承诺优化或修改生产配置。用户环境为 Windows 官方 sing-box + 广州移动、macOS 官方 sing-box + 广州电信。生产目标仍为 1.14.2，1.14.3 只作兼容检查。

1. 未知域名的国内 GeoIP 探测是否由新版本引入？对比 7a72e9f 与当前 DNS/route，记录已知国内、已知海外、未知国内 IP、未知海外 IP 的 A/AAAA 上游次数和顺序。
2. 新增国内/LAN/Direct 的显式 resolve 是否重复查 DNS？测健康主 DNS 的冷/热缓存 mixed 域名 HTTP 首包；仅在测试内删除紧邻同匹配 direct 规则的 resolve，观察是否真正减少查询和延迟。
3. 删除上述 resolve 是否绕过业务 DNS 主备？注入主 DNS SERVFAIL，对比当前和候选的国内 HTTP 结果及备用查询。若故障恢复退化，候选不得部署。

另对当前策略测一次主 DNS 丢包（timeout）后的国内 HTTP，记录实际配置 2s 备用等待；不把 SERVFAIL 的快速失败冒充超时场景。

运行 `SING_BOX=/官方核心路径 SING_BOX_VERSION=1.14.2 python tests/vps-performance.py`，1.14.3 同理。原六任务矩阵保留，在两版 Linux 原运行集成之后执行测量。原 93 Node、6 Python、27 份/任务完整配置、固定 Sub-Store 转换及故障测试不删、不跳过。

测量使用未修改的官方核心、真实 loopback DNS/SOCKS/HTTP 套接字；DNS 注入 primary/backup 40 ms、proxy/proxy-backup 80 ms、local 5 ms 的人工等待。每次新建 TCP 请求，记录连接至首字节 TTFB；DNS A/AAAA 分别测量，mixed 内部双栈 Lookup 则由核心按原行为执行。普通场景三个独立冷域名及相同域名热请求；GitHub/AI 优先级冲突使用固定域名，各一对冷/热请求。原始事件记录每个上游的开始/结束、类型与相对时间，便于区分串行与并行；排空后台模拟请求和缓存发布的等待不计入时间。时间只作观察，不能作为不稳定 CI 的毫秒门槛；查询路径、分流与恢复是断言。

历史夹具只捕获 7a72e9f 的 DNS/route 策略，固定原文件 SHA256；排除历史 QQ 专用覆盖（不测 QQ），不将它们恢复到生产。比较使用相同当前注入器、虚构 IP 节点、内联小规则集和本地代理，隔离策略成本，不声称是旧客户端/真实上游规则/真实线路的端到端对比。三份独立模板的历史及当前 DNS/route 策略分别相同，运行测量使用桌面 standalone 代表共同策略；完整配置检查覆盖全部入站模板。

当前开发执行器禁止 netlink，官方运行测试启动失败，不能算通过、不能通过跳过代替测量。实际运行数据必须取 Linux CI。此实验没有真实 TUN、DoH TLS、远端 DNS/节点握手或下载吞吐，不能证明广州宽带性能变化。

首轮实验发现原功能夹具的 SOCKS UDP 循环在人工 sleep 时串行处理 A/AAAA，使未知海外 mixed 请求人为多等一轮 proxy 延迟。性能夹具改为独立线程回复 DNS；保留真实 SOCKS detour、原功能夹具与全部故障测试，不把这个夹具效应当成生产缺陷或上线优化。最终数据以修正后的实验为准。

## 源码核对与实验依据

- 旧版已有未知 A/AAAA 的 domestic-check；当前通过 geosite-foreign/GitHub/AI 优先规则跳过已知海外的国内探测。未知域名保持 GeoIP 准确性需要探测，不能盲删。
- 官方 route.actionResolve 在未指定 server 时走业务 DNS；direct 的显式 domain_resolver 则指定单 transport。不能假设删除 resolve 后仍有业务备用。
- VPS自动 用 generate_204 的 HTTP HEAD 延迟选路，5m/tolerance=50 保持。该延迟不是带宽、并发或大文件吞吐；低延迟节点也可能限速或拥塞。注入脚本在生成时运行，不在每个下载数据包路径运行。
- 不预先修改任何 MTU、stack、系统路由、双栈、协议、测速周期、DNS 主备、规则缓存、QQ 专用策略或节点安全逻辑。

证据来源：官方 [route resolve](https://github.com/SagerNet/sing-box/blob/v1.14.2/route/route.go)、[DNS router](https://github.com/SagerNet/sing-box/blob/v1.14.2/dns/router.go)、[指定 resolver](https://github.com/SagerNet/sing-box/blob/v1.14.2/common/dialer/dialer.go)、[urltest](https://github.com/SagerNet/sing-box/blob/v1.14.2/common/urltest/urltest.go)。

## 实测数据与判定

采集提交 `0ca3287`，原六任务 [CI](https://github.com/Bang-JYB/substore-scripts/actions/runs/39404737301) 全部通过。两版 Linux 各记录 232 条观测，共 464 条；下表是每场景三次冷请求的中位数，GitHub/AI/故障场景仅一次。完整冷/热、A/AAAA、查询次数见 [CSV](PERFORMANCE_RESULTS.csv)，代表时间线见 [JSON](PERFORMANCE_TRACES.json)。这些是**官方核心在人工网络条件下的套接字实测，不是广州移动/电信测速**。普通场景 n=3 只用于路径定位，毫秒级差值不能当成统计显著的性能收益。

单位 ms；“旧版”仅指固定历史策略夹具，“当前”对应 0325468 生产策略；本轮没有上线新的生产优化。

| DNS A 冷请求 | 旧 1.14.2 | 当前 1.14.2 | 旧 1.14.3 | 当前 1.14.3 | 上游次数（旧→当前） |
| --- | ---: | ---: | ---: | ---: | --- |
| 国内 | 41.611 | 41.828 | 41.592 | 41.798 | 国内1→国内1 |
| 已知海外 | 122.483 | 81.874 | 122.381 | 81.677 | 国内1+代理1→代理1 |
| 未知/国内IP | 41.72 | 41.643 | 41.673 | 41.849 | 国内1→国内1 |
| 未知/海外IP | 122.201 | 122.462 | 122.574 | 122.445 | 国内1+代理1→国内1+代理1 |

| mixed 域名 HTTP 冷请求 TTFB | 旧 1.14.2 | 当前 1.14.2 | 删除 resolve 候选 1.14.2 | 当前 1.14.3 |
| --- | ---: | ---: | ---: | ---: |
| 国内 | 42.284 | 42.338 | 42.437 | 42.442 |
| 已知海外 | 122.908 | 1.384 | 1.592 | 1.303 |
| 未知海外 | 123.074 | 122.984 | 123.277 | 123.024 |
| LAN | 42.255 | 7.028 | 42.251 | 7.053 |

- 当前正常场景的热请求均为 **0 次上游查询**；1.14.2 热中位数范围 1.045–1.888 ms，1.14.3 为 0.951–1.532 ms。代理 HTTP 的约 1 ms 只测本地核心与假 SOCKS，未模拟远端 DNS、TLS 或 RTT，不能与真实网站首包直接对应。
- 国内 mixed 冷请求为国内 **A1+AAAA1**；两版均未观察到同一类型的重复请求。显式 resolve 与后面的 direct 复用地址/缓存；不是“规则两行就查两次”。
- 未知海外 1.14.2 的代表时间线：国内 A 0.975–41.131 ms、AAAA 1.093–41.339 ms；代理 A 41.639–121.789 ms、AAAA 41.755–121.925 ms。两个地址族并行，两阶段串行约 40+80 ms；这是为未知国内 IP 兜底保留的分类等待，旧版同样存在。未知国内 IP 只测 DNS 分类，没有连接真实国内公网目标。
- 已知海外当前不做国内探测；普通 mixed 域名代理直接委托虚构代理，不在本地先解析目标。真实 TUN/浏览器通常先发 DNS，这与 mixed 传域名的路径不同。
- GitHub 两版优先代理；AI 与 Microsoft 重叠测试中旧策略误直连，当前代理。旧版错误直连的结果不能当成可接受的速度基线。
- 国内主 DNS SERVFAIL：当前 1.14.2 **83.421 ms**、1.14.3 **83.021 ms** 后备用成功，查询 primary A1+AAAA1、backup A1+AAAA1。旧版与候选均失败、没有查询备用，失败快不算提速。
- 当前主 DNS 丢包：1.14.2 **2043.852 ms**、1.14.3 **2042.744 ms** 后备用成功。这验证配置的约 2s 等待成本；若实机主 DoH 经常超时，可能造成新连接变慢，但本实验没有证明广州线路发生了该故障。节点在实验中为 IP 地址，不能据此消除域名节点 bootstrap 的单点限制。

## 整改决定

**不修改生产代码。** 健康国内删除 resolve 前后查询数相同、时间差不足以证明收益；该候选还使 LAN 从本地 DNS 退回国内公网 DNS 模型，并破坏主故障后的备用能力。禁止将候选输出导入客户端。没有证据支持删除 evaluate、未知 GeoIP 探测、DNS 备用、持久规则缓存，或改变双栈/MTU/stack/测速/协议参数。

本轮实际变更仅为性能测量脚本、历史测试夹具、原六任务 Linux 的额外 A/B 步骤、报告和数据。六份 JSON、两份注入脚本逐字节不变；所有协议白名单、去重、精确 detour、Snell/ShadowTLS/IPv6 安全、分池、GitHub/AI、LAN、UDP、QQ 专用覆盖删除保持。原 93 Node、6 Python、每任务 27 完整核心检查、固定官方 Sub-Store 2.42.6 和五组运行集成继续执行。

历史变化中，DNS 主备新增的是故障时的条件等待，不能按 evaluate 规则总数估算每次请求成本。route.resolve 的有匹配 direct 后立即终止，其他后续 resolve 不会重复执行。geosite-foreign 增加了首次下载规则的资源，规则更新仍为 168h；无缓存/种子且节点不可用仍不能首启，有缓存/种子时可保留现有规则。已有恢复集成保留，未拿冷启动可靠性换性能。

## Windows/macOS 与真实线路验收

三份 VPS 模板的 inbounds 与 VPS自动 参数相对 7a72e9f 完全一致。桌面 mixed 仍为 127.0.0.1:7890、set_system_proxy=false；桌面 TUN 仍 mtu=1400、stack=mixed、auto_route=true、strict_route=true、dns_mode=hijack，Android 设置也未改变。

| 环境 | 本轮检查 | 实机尚未完成 |
| --- | --- | --- |
| Windows / mixed | 原生核心完整配置、端口及安全断言；Linux 模型测 HTTP 与 SOCKS DNS | HTTP CONNECT/SOCKS 域名代理、应用实际代理设置、真实 DNS/节点/TLS 首包 |
| Windows / TUN | 原生核心字段检查；未修改系统路由或栈 | WFP/严格路由、多网卡、真实 A/AAAA、休眠/换网、LAN；不能把 Linux loopback 当 Windows 验收 |
| macOS / mixed | 原生核心完整配置和相同入站声明 | 官方客户端实际监听可达性、同节点 HTTP/SOCKS 首包；NetworkExtension 内外路径需实测 |
| macOS / TUN | 原生核心字段检查；SFM 支持 stack，但 strict_route 在其 NetworkExtension 中未实现 | SFM 权限、Include All Networks、休眠/换网、系统 DNS/IPv6 和实际吞吐 |

官方依据：[Apple features](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/clients/apple/features.md)、[TUN](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/tun.md)。Windows/macOS 的 CI 运行配置 check，不启动系统 TUN；套接字故障和本实验只在 Linux 运行。

实机建议按以下顺序采样，不先调整参数：

1. Windows 移动、Mac 电信分别选定**同一个明确 VPS 节点**，记录协议/出口、客户端及核心版本、当前组实际选择、目标 A/AAAA；暂停其他下载和优选测速。不要一边自动切节点一边比较配置。
2. 对固定国内、GitHub/AI、普通海外、未收录域名分别测 5 次冷 DNS与 10 次热请求。冷 DNS在隔离测试配置中清 DNS缓存即可，不删除规则缓存；可使用现有 loopback API `POST /cache/dns/flush`。TUN 还要单独控制操作系统 DNS缓存。实际 TTL/缓存命中须看短时调试日志确认，不能把“重开 curl”直接叫冷 DNS。
3. mixed 使用 `curl --proxy http://127.0.0.1:7890 --noproxy __no_bypass__.invalid --http1.1 --connect-timeout 10 --max-time 30 --output /dev/null --silent --show-error --write-out 'connect=%{time_connect} tls=%{time_appconnect} first=%{time_starttransfer} total=%{time_total} speed=%{speed_download}\n' '同一测试URL'`；Windows 用 curl.exe、输出 NUL。另测 `--socks5-hostname 127.0.0.1:7890` 代替 --proxy。这里 curl 的 time_namelookup 不代表 sing-box 内部 DNS时间，需结合日志。
4. TUN 仅用同一测试 URL 配 `--noproxy '*'`（不传 --proxy/--socks5-hostname），与 mixed 分开采样。固定同一节点与目标；如仅 TUN 变慢，再查系统网络层。对 IPv4/IPv6 分别记录实际路径，不能仅通过 mixed 的 curl -4/-6 判断代理目标使用的地址族。
5. 同节点、同下载目标分别记录新连接首包与 5/15/30 秒分段吞吐，比较单连接及多连接。再逐个手动节点与 VPS自动 选择比较。HEAD 延迟最低不保证大文件最快；DNS主要影响建立/重建连接，持续传输的速度爬升还需核对真实 RTT、丢包、拥塞控制、CDN目标、协议/服务端限速，当前没有数据证明这些原因中的任何一个。
6. 主 DNS/节点故障和恢复只在隔离测试配置做；确认国内主备、LAN、GitHub/AI、未知国内 IP 分类、缓存重启均保持。调试结束恢复原日志级别。

## 回滚

revert 本轮 PR，只撤回新增测量、CI 步骤和报告；生产行为与 0325468 相同，无生产网络行为需要回退。不要通过恢复 7a72e9f 整份配置来做本轮回滚；那会恢复已删除的专用覆盖和已修复问题。实机 A/B 使用单独配置副本，保留原有规则缓存与可用配置。
