# 通用化与性能复核：2026-10-20

基线与实际main：`3fe2a6ca1de3c16a99a211ea8662da91f0e13f98`。本轮在独立分支 `audit/client-probe-20261020` 工作，只提交人工审核PR，不自动合并。**未发现可复现且可安全修复的新生产性能缺陷，六份JSON和两份注入脚本逐字节不变。**

## 输入与证据

完整阅读两个附件及现有 `PERFORMANCE.md`、`PERFORMANCE_RESULTS.csv`、`PERFORMANCE_TRACES.json`、`tests/vps-performance.py`，复用已有实验，不重写核心策略性能测试。

| 附件 | 原始SHA256 |
| --- | --- |
| vps_client_probe.py | 77d58de2f38e8193784edf01225a91594d31eaafaad7e6ec365d7fb2cb7e7ca3 |
| VPS_Real_Client_Review_20261020.md | 280c31c54d7ae4e74ad17c2e1c42b4ba9ef15428f09ef49218ff19e29a0d83d5 |

没有取得用户Windows、macOS或真实VPS访问与观测，不能给出其真实DNS、TLS或下载改善率。原报告的“未提交修改”描述是上一次工作的历史结论；本轮新增独立诊断工具及测试文档，不修改生产策略。

## 已复现问题与最小整改

先把原附件接入 `tools/`，针对边界编写14项测试：原版本结果为23个失败子案例、3个缺少新接口/字段的错误；这些接口错误用于定义所需行为，不冒充额外生产缺陷。随后实现最小修订，扩展为19项测试。对应测试见 `tools/tests/test_probe.py`。

| 优先级 | 证据/风险 | 处理及对应回归 |
| --- | --- | --- |
| P1 工具目标保护 | 原validate_url接受127.0.0.1、RFC1918、共享地址、IPv4映射IPv6等；--allow-http未区分LAN授权 | 默认公开HTTPS、OS DNS预检查，任何非公网结果拒绝，LAN另需--allow-private；private_literals/public_dns/lan/url_syntax |
| P2 测量归因 | TCP入口关闭、REP7拒绝UDP、关联后DNS超时均被归为probe_failed | 分阶段状态，保留REP，不把中继超时称为已证明的上游超时；local_entry/udp_unsupported/dns_exchange/reply_outcomes及真实回环UDP |
| P2 缓存标签 | 原--runs 3可全部标cold-confirmed；DNS+HTTP还会互相预热 | 冷标签仅一次DNS-only A或AAAA；声明标签为人工断言，HTTP预检查后禁止声称冷；cache_claim_guard |
| P2 数据准确性 | 原0.9995s被判完整秒；NaN可写入非标准JSON | 严格完整窗口、拒绝非有限及负数指标；incomplete_second/metric_allowlist/same_flow_windows |
| P2 隐私 | 原自由标签和完整curl构建首行可能携带真实节点/本机构建信息 | 标签限制匿名编号、版本数字化、异常不输出原文、端口/控制字符校验；cli_json/cli_labels/entry_commands |
| P2 高速观察开销 | 下述同目标A/B中管道读流明显受本地吞吐上限影响 | 保留流式读取、不盲调缓冲区，增加--sink null原生curl对照、CPU与计数一致性；loopback_stream/null、entry_commands；不把null伪造为有逐段速率 |

保留原DNS包封装、SOCKS UDP、curl基础计时、stdin URL、同连接分段、无外部依赖的结构。未加入测速到生产注入脚本。新增独立标准库观察器实验只复测工具开销，与已有官方核心DNS/路由A/B用途不同。

默认目标预检查不是恶意URL沙箱：远端代理DNS和之后重绑定无法由本地OS解析保证；不固定目标IP以免改变分流、CDN选择及TLS。它也可能预热DNS，故不能用其HTTP运行声称真实冷启动。这些限制在README明示。

## 生产审核决定

| 范围 | 复核结论及保留理由 |
| --- | --- |
| DNS/resolve | 既有受控实验：国内冷mixed查询A1+AAAA1并行，热缓存零上游；没有同类型重复。未知海外国内→代理两阶段是GeoIP分类成本，旧版已有。已知海外已跳过国内探测。删除resolve未减少查询，反而破坏LAN与主故障恢复，继续禁止部署候选。 |
| DNS主备/bootstrap | 国内2s、代理3s主超时可产生条件等待，不能把evaluate规则数乘成总延迟。主备用和缓存保留。节点显式vps-dns resolver仍有单点限制；不能凭业务DNS探针定位bootstrap，更不能盲改造成回环。 |
| 分流/共享逻辑 | GitHub、AI优先于Apple/Microsoft/国内，LAN、geosite-cn、geoip-cn和海外兜底保留。未恢复QQ/Tencent专用覆盖；通用国内集合可能仍将QQ直连，这不是专用规则恢复。 |
| 节点与双栈 | 保留14类型白名单、配置去重、原始名称精确detour、循环/歧义检查、SS/Snell包装与ShadowTLS辅助排除、IPv6依赖保守失败、机场/VPS分池；组合IPv4，独立VPS双栈。原93项Node及27份完整生成配置继续覆盖。 |
| TUN/mixed | 不改1400 MTU、stack、strict_route、7890、系统代理行为。Windows WFP/多网卡、macOS NetworkExtension/休眠换网、Android权限/IPv6/UDP必须实机测，CI的字段check不代表OS网络验收。 |
| 自动选路/吞吐 | VPS自动仍为HEAD延迟评分，桌面5m/Android10m、tolerance50不变。不是带宽测速；手动同节点与自动实际选择对照后才可归因。下载爬升需查RTT、窗口、重传、QUIC、CPU、CDN单流与线路，不能仅归DNS或改BBR/MTU。 |
| 首启/规则缓存 | 168h更新、规则缓存和可选initial_path不变；有缓存/种子可恢复，无缓存种子且代理不可用仍无法完成规则首启。保留原下载/失败/重启集成，不删除错误处理换速度。 |

## 性能数据：严格区分范围

**原有核心人工网络数据，非本轮用户实测**：`PERFORMANCE_RESULTS.csv` 与 `PERFORMANCE_TRACES.json` 固定保留，1.14.2/1.14.3各232次观测。国内主丢包→备用的TTFB分别2043.852/2042.744ms；SERVFAIL恢复83.421/83.021ms。它证明可能的故障等待，不证明真实线路经常触发。没有通过重复运行该实验获得新的生产优化结论。

**本轮实际Linux回环观察器A/B，非sing-box/TUN/VPS/ISP/TLS测试**：原附件与修订工具、原生null对照，独立服务端进程，固定64MiB，每种3次交错测量。原始9行及双方SHA见 [OBSERVER_AB.json](OBSERVER_AB.json)，脚本为 `tests/observer_benchmark.py`。

| 中位数（n=3） | 原附件stream | 修订stream | 新增native-null对照 |
| --- | ---: | ---: | ---: |
| curl全程秒 | 0.033211 | 0.050595 | 0.018034 |
| Python观察CPU秒 | 0.015359 | 0.023870 | 0.000790 |
| 字节计数 | 67108864 | 67108864 | curl确认67108864，无Python正文观察 |

同组波动很大，且没有修改正文读取算法，因此**不宣称修订版吞吐提高**。仅用这个对照证明需要排除观察器开销；所有下载都不足1s，不能外推30s曲线或生成有效5/15/30s窗口。未做生产网络行为修改，生产前后A/B收益为“无证据/不适用”，不把工具变化包装成网站提速。

## 文件与验证

- `tools/vps_client_probe.py`：上述最小工具修订；`tools/tests/test_probe.py`：19项标准库测试（含真实回环HTTP及SOCKS UDP），其他模式命令语义由受控进程夹具覆盖，未声称真实HTTPS/VPS验收。
- `tools/tests/observer_benchmark.py`、`tools/OBSERVER_AB.json`：可复现观察器A/B和数据；`tools/README.md`：Windows/macOS命令、匿名格式、DNS/计时/模式边界、只读VPS命令；本文件：审核决定与回滚。
- `.github/workflows/validate.yml`：原六任务均增加Python3.9和3.12工具回归；原93 Node、6 Python、固定Sub-Store2.42.6、每任务27份官方配置、Linux运行/规则种子/A/B步骤均保留。
- `.gitignore`：排除默认本地诊断结果；根 `README.md` 仅增加文档入口。六份JSON、两份注入器、原性能报告/CSV/trace/脚本保持不变。

本地：93 Node、6原Python、19新增测试通过；1.14.2和1.14.3各27份官方完整配置check通过。受限执行器不能创建netlink，原核心运行集成不在本地算通过，必须以本PR六项CI结果确认。Python3.9、Windows/macOS运行工具的证据以CI为准，不用语法检查冒充跨平台执行。CI仍不能证明真实客户端TUN行为。

## 遗留与实机门槛

按 [README](README.md) 在Windows/Mac各自固定同实际节点、同目标，HTTP/SOCKS/TUN各至少3次；DNS确认冷/热，保留TCP/TLS/首包累计计时、同流三段与null控制；再比较自动组实际节点。仅匿名抄VPS只读采样与本地短时日志，区分DNS/路由、入口、外层协议、服务端与CDN。真实结果尚待取得；没有数据不改生产。

工具不覆盖浏览器H2/H3、真实UDP业务吞吐、系统TUN捕获或bootstrap主备；null控制无分段，Python观察有开销，DNS交换超时不能独自区分上游与中继问题。跨平台CI只是工具/配置/受控夹具验证。

## 回滚

本PR不自动合并，生产main不受影响。人工合并后如需回滚，revert本PR提交即可撤回tools、CI新增步骤和文档入口；无需回滚任何生产JSON、节点脚本或系统设置。不要回退7a72e9f整份生产配置，以免恢复QQ专用覆盖及旧缺陷。实机测试只需恢复原节点选择、日志与客户端模式，停止工具并按需删除结果；不删规则缓存、不运行网络优化脚本。

## PR #8 / #7 合并前最终复核（2026-10-20）

最新main仍为 `3fe2a6ca1de3c16a99a211ea8662da91f0e13f98`；PR #7原head `5f59026`已包含最新main，因此无需变基或复制其他PR的生产改动。本轮仅追加此审核记录以重新触发六项CI，工具、测试逻辑和生产配置不变。**两份PR均等待用户批准，不自动合并。**

| 对象 | 审核结论 |
| --- | --- |
| PR #8 head `48f0e28` | 可合并，待批准；GitHub干净可合并，无新的阻塞缺陷 |
| 三份VPS模板 | 各三条新增UDP443拒绝；去掉新增规则后，全部原字段与main完全相同 |
| 三份组合模板/两份注入器 | 与main逐字节相同，原UDP443阻断及优先级保留 |
| Rule保护范围 | GitHub/AI优先代理、已知海外和最终海外兜底UDP443拒绝；国内/LAN、DNS53、同目标TCP443、其他UDP按原分流 |
| Direct/Global | 均由更早的终止规则处理，没有新增阻断；原组合IPv6限制不变 |
| HY2/TUIC外层UDP443 | 官方核心真实协议回环通过；不是服务端端口防火墙封禁 |
| PR #7生产差异 | 六份JSON、两份注入器、DNS/路由/UDP规则零差异，不会撤销#8的兼容性策略 |

已重新读取PR #8最终[六任务CI](https://github.com/Bang-JYB/substore-scripts/actions/runs/39417799869)：全部成功。每任务99 Node、6原Python、27份完整核心配置；Linux继续执行原故障恢复、规则种子和性能夹具。两版核心日志各12条 `OFFICIAL_QUIC_OK`，覆盖六模板×HY2/TUIC，外层UDP443、HTTPS小资源、2228224字节正文SHA256校验以及其他UDP放行/应用UDP443拒绝；另有前置拒绝早于LAN的对照。24组是官方客户端/服务端的回环实测，**不是用户真实VPS、Windows/macOS/Android TUN或运营商性能验收**。

PR #7与#8共享的 `README.md`、`.github/workflows/validate.yml`自动三方合并无冲突；工具Python3.9/3.12检查和#8协议检查均须保留。为排除“分别通过、合在一起失败”，在独立临时验证分支构造#8→#7的候选树，重新运行同样六项CI；不把#8复制进#7、不变更main、不代替用户批准。最终候选SHA、CI链接与结果记入两份PR说明。

合并顺序：先批准/合并#8，使VPS获得必须保留的UDP443兼容保护；再确认main对应的#7检查状态并合并#7。若main或任一PR head发生变化，现有组合证据不自动覆盖新版本，需重新同步和验证。

没有需要追加的生产整改；剩余限制为真实客户端/节点未验收、QUIC-only海外应用可能不能回退TCP、诊断工具预检查可能预热DNS、远端代理DNS差异无法由本地预检查完全约束。上述限制不构成盲改DNS/MTU/BBR/TUN/IPv6/测速或节点逻辑的依据，QQ专用直连不恢复。

回滚优先分别撤回实际合并提交：普通/squash提交使用 `git revert <提交>`，双亲merge提交使用 `git revert -m 1 <合并提交>`。先撤回#7仅移除工具、文档入口及新增工具CI，必须保留#8规则和协议测试；如确需撤回#8，完整撤回其规则、预期及关联CI，保留#7。撤回#8会恢复VPS旧有的UDP443放行，应明确知晓失去该保护；组合版原阻断始终保留。不要回退历史整份配置。
