# VPS 独立版性能审计（基线 0325468）

## 实验前假设与方法

目标是查出新增连接中的冗余 DNS/resolve 等待，不预先承诺优化或修改生产配置。用户环境为 Windows 官方 sing-box + 广州移动、macOS 官方 sing-box + 广州电信。生产目标仍为 1.14.2，1.14.3 只作兼容检查。

1. 未知域名的国内 GeoIP 探测是否由新版本引入？对比 7a72e9f 与当前 DNS/route，记录已知国内、已知海外、未知国内 IP、未知海外 IP 的 A/AAAA 上游次数和顺序。
2. 新增国内/LAN/Direct 的显式 resolve 是否重复查 DNS？测健康主 DNS 的冷/热缓存 mixed 域名 HTTP 首包；仅在测试内删除紧邻同匹配 direct 规则的 resolve，观察是否真正减少查询和延迟。
3. 删除上述 resolve 是否绕过业务 DNS 主备？注入主 DNS SERVFAIL，对比当前和候选的国内 HTTP 结果及备用查询。若故障恢复退化，候选不得部署。

运行 `SING_BOX=/官方核心路径 SING_BOX_VERSION=1.14.2 python tests/vps-performance.py`，1.14.3 同理。原六任务矩阵保留，在两版 Linux 原运行集成之后执行测量。原 93 Node、6 Python、27 份/任务完整配置、固定 Sub-Store 转换及故障测试不删、不跳过。

测量使用未修改的官方核心、真实 loopback DNS/SOCKS/HTTP 套接字；DNS 注入 primary/backup 40 ms、proxy/proxy-backup 80 ms、local 5 ms 的人工等待。每次新建 TCP 请求，记录连接至首字节 TTFB；DNS A/AAAA 分别测量，mixed 内部双栈 Lookup 则由核心按原行为执行。普通场景三个独立冷域名及相同域名热请求；GitHub/AI 优先级冲突使用固定域名，各一对冷/热请求。原始事件记录每个上游的开始/结束、类型与相对时间，便于区分串行与并行；排空后台模拟请求和缓存发布的等待不计入时间。时间只作观察，不能作为不稳定 CI 的毫秒门槛；查询路径、分流与恢复是断言。

历史夹具只捕获 7a72e9f 的 DNS/route 策略，固定原文件 SHA256；排除历史 QQ 专用覆盖（不测 QQ），不将它们恢复到生产。比较使用相同当前注入器、虚构 IP 节点、内联小规则集和本地代理，隔离策略成本，不声称是旧客户端/真实上游规则/真实线路的端到端对比。三份独立模板的历史及当前 DNS/route 策略分别相同，运行测量使用桌面 standalone 代表共同策略；完整配置检查覆盖全部入站模板。

当前开发执行器禁止 netlink，官方运行测试启动失败，不能算通过、不能通过跳过代替测量。实际运行数据必须取 Linux CI。此实验没有真实 TUN、DoH TLS、远端 DNS/节点握手或下载吞吐，不能证明广州宽带性能变化。

首轮实验发现原功能夹具的 SOCKS UDP 循环在人工 sleep 时串行处理 A/AAAA，使未知海外 mixed 请求人为多等一轮 proxy 延迟。性能夹具改为独立线程回复 DNS；保留真实 SOCKS detour、原功能夹具与全部故障测试，不把这个夹具效应当成生产缺陷或上线优化。最终数据以修正后的实验为准。

## 初步源码判断（待运行证据确认）

- 旧版已有未知 A/AAAA 的 domestic-check；当前通过 geosite-foreign/GitHub/AI 优先规则跳过已知海外的国内探测。未知域名保持 GeoIP 准确性需要探测，不能盲删。
- 官方 route.actionResolve 在未指定 server 时走业务 DNS；direct 的显式 domain_resolver 则指定单 transport。不能假设删除 resolve 后仍有业务备用。
- VPS自动 用 generate_204 的 HTTP HEAD 延迟选路，5m/tolerance=50 保持。该延迟不是带宽、并发或大文件吞吐；低延迟节点也可能限速或拥塞。注入脚本在生成时运行，不在每个下载数据包路径运行。
- 不预先修改任何 MTU、stack、系统路由、双栈、协议、测速周期、DNS 主备、规则缓存、QQ 专用策略或节点安全逻辑。

证据来源：官方 [route resolve](https://github.com/SagerNet/sing-box/blob/v1.14.2/route/route.go)、[DNS router](https://github.com/SagerNet/sing-box/blob/v1.14.2/dns/router.go)、[指定 resolver](https://github.com/SagerNet/sing-box/blob/v1.14.2/common/dialer/dialer.go)、[urltest](https://github.com/SagerNet/sing-box/blob/v1.14.2/common/urltest/urltest.go)。
