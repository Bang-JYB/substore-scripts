# 通用客户端诊断

`vps_client_probe.py` 基于用户上传的同名工具小范围修订，Python **3.9+**、系统 **curl 7.63+**，无第三方依赖。它不读取订阅、节点配置、日志或管理 API，不切换节点、清缓存或改网络设置。仅使用现有 `127.0.0.1:7890`；不启动监听。

本轮审核和受控对照见 [AUDIT.md](AUDIT.md)，原核心策略实验仍在 [PERFORMANCE.md](../PERFORMANCE.md)，二者不能代替用户 Windows/Mac/VPS 实测。

## 开始前

1. 在 **VPS选择** 直接固定一个具体节点，记录匿名编号 N01 和协议；基线不要选 VPS自动。记录核心/客户端版本、出口、有线/Wi-Fi、时段、CPU负载和外层会话是否已热。不同设备的不同运营商结果不能直接归因 OS。
2. 选择可信、公开、无登录/令牌的 HTTPS 小资源和能持续下载超过30s的大文件**最终地址**。本工具不跟随重定向，不自动重试，不开启并发或断点续传。302应更换最终目标；多次下载会消耗流量。
3. HTTP/SOCKS/TUN 应在同一设备、同一网络、同节点、同目标和邻近时段交错比较，至少各3次。暂停其他下载。先小请求，再大文件；没有现成通用目标可保证永不变更或不限速，因此不自动选下载站。
4. 确认 `py -3 --version` / `python3 --version` 及 `curl.exe --version` / `curl --version`。Windows 使用真正的 curl.exe，避免 PowerShell 别名。

## Windows PowerShell

在仓库根目录运行，输入公开URL（不是订阅链接）：

```powershell
$Small = Read-Host "公开HTTPS小资源最终URL"
py -3 tools/vps_client_probe.py --mode http --url "$Small" --seconds 10 --runs 3 --label N01
py -3 tools/vps_client_probe.py --mode socks --url "$Small" --seconds 10 --runs 3 --label N01
py -3 tools/vps_client_probe.py --mode tun --url "$Small" --seconds 10 --runs 3 --label N01
$Big = Read-Host "公开HTTPS大文件最终URL"
py -3 tools/vps_client_probe.py --mode http --url "$Big" --seconds 40 --runs 3 --label N01
py -3 tools/vps_client_probe.py --mode tun --url "$Big" --seconds 40 --runs 3 --label N01
py -3 tools/vps_client_probe.py --mode http --url "$Big" --seconds 40 --runs 3 --label N01 --sink null
```

## macOS zsh

```zsh
read 'Small?公开HTTPS小资源最终URL: '
python3 tools/vps_client_probe.py --mode http --url "$Small" --seconds 10 --runs 3 --label N01
python3 tools/vps_client_probe.py --mode socks --url "$Small" --seconds 10 --runs 3 --label N01
python3 tools/vps_client_probe.py --mode tun --url "$Small" --seconds 10 --runs 3 --label N01
read 'Big?公开HTTPS大文件最终URL: '
python3 tools/vps_client_probe.py --mode http --url "$Big" --seconds 40 --runs 3 --label N01
python3 tools/vps_client_probe.py --mode tun --url "$Big" --seconds 40 --runs 3 --label N01
python3 tools/vps_client_probe.py --mode http --url "$Big" --seconds 40 --runs 3 --label N01 --sink null
```

HTTP 使用本机HTTP代理，SOCKS 使用远端解析的 SOCKS5，TUN仅禁用curl显式和环境代理：**不会启用或检测 TUN**。TUN关闭时该模式测的是普通系统路径。要手工确认路径；未确认不把结果叫TUN实测。TUN仍开启时测mixed只分入口，不能完全隔离系统VPN开销。macOS SFM关闭VPN可能同时停止7890，不能把入口关闭判为节点/DNS故障。纯非TUN只在客户端确实支持或独立官方CLI测试副本中比较。

`--family 4/6` 仅允许TUN入口，用于目标地址族对照；mixed不能凭curl到本机代理的地址族确定远端节点/目标地址族。实际外层节点和出口需本地日志确认。保留现有TUN、MTU、系统路由和协议参数。

## 目标保护与隐私

- 默认只接受HTTPS；拒绝URL凭据、片段、控制字符、反斜杠、非法端口。检查字面IP、局域网名字及OS解析结果；任何非公网地址或解析失败均拒绝。`--allow-http` **仅放行HTTP协议**，局域网/非公网目标还必须显式 `--allow-private`。FakeIP也会被默认拒绝；不要为普通公网测速随意绕过保护。
- 预检查在计时外，可能预热OS/core DNS，故HTTP测试不能标 `cold-confirmed`。它不会用固定IP替换目标：这样保留域名分流、TLS和代理端解析。**本地预检查不能约束远端代理DNS差异、之后的DNS变化或重绑定**；它防止常见误用，不是对恶意目标的隔离沙箱。仅测试可信公开资源；无重定向可减少意外转向私网。保留真实分流比伪造固定目标更重要。
- URL经stdin交给curl，不在curl命令行；Python自身的 `--url` 参数仍可能被本机进程查看/终端历史记录，所以禁止使用私密URL。禁用curlrc和环境代理，不读取netrc、不使用认证、不导出原始stderr。HTTPS证书验证保留。
- JSON及正常终端输出不记录域名、IP、URL、响应正文、节点名称、配置、密码或UUID。标签仅接受 N01/N002 等匿名编号；curl版本只保存数字版本，不保存自定义构建信息。文件名含时间和随机后缀，防止覆盖。
- 结果默认写 `probe-results/`（已gitignore），也可 `--output-dir`。该目录应只放结果；提交前仍应人工确认没有附带其他文件。

授权的局域网测试示例：`python3 tools/vps_client_probe.py --mode tun --url http://127.0.0.1:8000/ --allow-http --allow-private --label N01`。工具不替你启动服务，也不修改LAN分流。

## DNS 冷/热与约2秒等待

DNS探针**始终**经mixed SOCKS UDP和当前DNS劫持（包括 `--mode tun` 时），并非OS、浏览器DoH或TUN捕获验收。`192.0.2.53:53` 是保留的劫持标记，不是公网DNS服务器。A/AAAA独立顺序发送，不能相加冒充浏览器并行解析时间。

只在隔离测试配置、没有重要会话时，通过客户端功能确认DNS缓存已清；若现有loopback管理API允许，可在本机执行（Windows用curl.exe）：

```sh
curl -q --noproxy '*' --silent --show-error -X POST http://127.0.0.1:9090/cache/dns/flush
python3 tools/vps_client_probe.py --dns-domain www.baidu.com --qtype A --cache-state cold-confirmed --label N01
python3 tools/vps_client_probe.py --dns-domain www.baidu.com --qtype A --cache-state hot --runs 3 --label N01
```

Windows将python3替换为 `py -3`。API未成功或需要secret时用客户端功能，**不要上传secret**。AAAA冷测需再次确认清缓存，再单独 `--qtype AAAA`。cold-confirmed仅允许一次DNS-only单一类型查询；拒绝批量冷标签、A+AAAA共用冷标签或带HTTP请求。默认 `unspecified`；`hot`同样是使用者断言，工具明确记录 `cache_state_verified_by_tool:false`，不从速度推断命中缓存。DNS+HTTP合并执行会先查询DNS，比较时建议分开。

浏览器/OS缓存和外层HY2/TUIC/AnyTLS复用会话另行记录；新curl进程不等于全路径冷启动。TUN的OS冷测需人工控制：Windows `Clear-DnsClientCache`，macOS在本机合适权限下 `sudo dscacheutil -flushcache`、`sudo killall -HUP mDNSResponder`；不删除cache.db或远程规则缓存。HTTP预检查可能再次预热，因此要研究真正冷HTTP，须另用本地日志/受控目标，不使用本工具冷标签。

| DNS状态 | 解释 |
| --- | --- |
| local_socks_unavailable | 本地TCP入口连接失败，尚未测到DNS |
| socks_auth_unavailable / socks_setup_timeout | 本地握手/认证不兼容或超时 |
| udp_unsupported | SOCKS明确返回command not supported（REP=7） |
| udp_association_refused | UDP关联其他拒绝，不能统称协议不支持 |
| dns_exchange_timeout | 关联后未收到DNS答复；可能UDP/劫持/中继/上游，不能单独定位上游DNS |
| reply + dns_result | answers、no_answers、nxdomain、dns_error、truncated；rcode与答案条数保留，答案地址不保存 |
| probe_failed | EOF、畸形响应等其他探针失败；只记阶段和异常类型 |

无AAAA答案或NXDOMAIN可以是正常结果；截断不能当作完整解析。要证明约2s来自主解析器，在测试副本临时开debug，本地核对同次查询的主超时→备用成功和时间差，仅抄匿名摘要，再恢复日志级别。上轮人工网络结果约2043ms不是用户真实环境的证据。节点bootstrap显式resolver有单点限制，本探针不能证明它具有业务DNS主备。

## 计时、同流速率与观察开销

固定 **HTTP/1.1** 用于可比性，不能代表浏览器HTTP/2、HTTP/3、连接复用、并发资源或安全DNS性能；HY2/TUIC外层仍是原QUIC协议。

| 输出 | 语义与边界 |
| --- | --- |
| time_namelookup | curl开始至自身解析完成；mixed不等于核心DNS耗时 |
| time_connect | 累计至TCP完成；mixed连接本机7890，不能当VPS RTT |
| time_appconnect | 累计至网站TLS完成；不是节点外层握手，减connect仍可能含CONNECT/节点拨号/DNS |
| time_starttransfer | 累计至网站首字节，含此前等待和服务端处理 |
| time_pretransfer / time_total | 累计至传输准备完成 / 整次请求结束 |
| size_download / http_code / http_version | 分别为字节数 / HTTP状态 / HTTP版本，虽保留原curl_metrics_cumulative_seconds字段名，这三者不是秒 |
| per_second / windows | **同一次下载**第一块正文到达后，Python读流时刻分桶；不是三次独立下载；Mbps为十进制 |
| observer_cpu_seconds | Python观察进程CPU时间，不包含curl/核心/VPS；不能代表整机CPU |

不足完整秒或0–5、5–15、15–30s完整窗口，mbps为null；零流量完整区间记0。分桶是用户态近似，有管道批量读取误差，不是抓包级带宽；短资源不适合判断爬升。逐秒速率不排除CDN单流限制。`body_bytes_match_curl`检测流式字节计数是否一致；失败/不一致先排查测量。HTTP失败的部分数据不能当作成功吞吐。`time_limit_with_data`仅表示2xx已传数据后curl时限退出，不保证完整文件。

若怀疑高速下载时观察器限制吞吐，以**同目标、同节点、同入口**交错比较 `--sink stream`（默认）与 `--sink null` 各3次。null由curl直接写NUL或/dev/null，不经过Python正文管道，因此没有逐秒/分段窗口（空数组，字节观测为null）；用 `size_download*8/time_total/1e6` 看全程平均，它含建连，不是分段速率。结合Python单核负载和观察CPU时间：只有stream明显慢才考虑观测开销；不能把本机64MiB回环的Gbps数当VPS能力。

## 选路、协议及只读服务端检查

手动逐个测N01/N02后，再恢复VPS自动，人工记录其实际选中匿名编号，重测同文件。VPS自动的HTTP HEAD延迟不等于带宽评分。低RTT可能仍受拥塞、丢包、CPU或单流限速；不据此改测速周期/tolerance。

TCP下载爬升需核对实际rtt、cwnd、接收窗口、重传及两段链路；DNS一次等待不能独自解释正文持续十几秒爬升。HY2/TUIC需看实际UDP/QUIC路径、拥塞/恢复、协议端设置与CPU；TCP BBR不等于QUIC拥塞控制。不同CDN入口、协议和地址族同时变化不能作纯协议A/B；ICMP丢包也不等于业务重传。

下载时在自己的VPS本地只读采样：

```sh
uname -r
sysctl net.ipv4.tcp_congestion_control net.core.default_qdisc
ss -tin
nstat -az TcpRetransSegs TcpExtTCPSynRetrans TcpExtTCPTimeouts
uptime
```

只抄相关流的匿名rtt/cwnd/retrans/delivery/pacing数据，不上传含peer IP的原输出。默认sysctl不必等于既有socket算法，nstat是整机累计量，比较同窗口增量仅作辅助；缺命令就跳过。VPS本机下载同目标也慢，先查目标/CDN/出口；本机快而客户端慢，再查入口方向、协议、CPU/限速。不同地域CDN可能不同，不直接下结论。不改BBR/qdisc/窗口/MTU/QUIC设置。

匿名汇总格式（真实值未取得时保留待测）：

| OS/版本 | 入口 | 节点编号/协议 | 缓存证据 | DNS A/AAAA ms | TCP/TLS/首包累计s | 三段Mbps | 实际自动选择/CPU/重传 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 待测 | http/socks/tun | N01/协议 | 未确认/本地日志 | 待测 | 待测 | 待测 | 匿名摘要 |

测试后恢复原策略选择、日志级别和客户端运行方式；工具无生产网络变更。停止工具即可，已清DNS缓存会自然重建。

## 开发验证

`python -m unittest discover -s tools/tests -p 'test_*.py' -v`；六项原CI分别在Python3.9和3.12执行，保留全部原测试。可选观察器受控复测：`python tools/tests/observer_benchmark.py --baseline /路径/原附件vps_client_probe.py`，只绑定回环，固定64MiB文件，原附件SHA校验，无性能阈值。

计时依据：[curl官方手册](https://curl.se/docs/manpage.html#-w)；[1.14.2 URLTest源码](https://github.com/SagerNet/sing-box/blob/v1.14.2/common/urltest/urltest.go)；[TCP RFC5681](https://www.rfc-editor.org/rfc/rfc5681.html)、[QUIC RFC9002](https://www.rfc-editor.org/rfc/rfc9002.html)。
