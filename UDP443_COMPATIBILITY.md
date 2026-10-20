# UDP 443 兼容性审查

基线：main `3fe2a6ca1de3c16a99a211ea8662da91f0e13f98`。用户报告组合版曾在未限制UDP443时出现网络访问异常，本轮将其视为需保留的兼容策略，不作为可删除的性能冗余。该历史故障尚未在用户设备重现；本轮可复现的是三份VPS版缺少相同保护目标。

## 生产改动及优先级

三份组合JSON不变，原五个UDP443拒绝位置/匹配优先级保留。三份VPS JSON各增加**三条**拒绝规则（共60行），不移动或删除任何原规则：

1. GitHub/AI代理规则之前：`rule_set:[geosite-github,geosite-ai] + network:udp + port:443`。两类相邻且都用VPS选择，可合为一条，优先于Apple/Microsoft，保持原优先代理语义。
2. geosite-foreign代理规则之前、国内直连之后：`rule_set:geosite-foreign + network:udp + port:443`。国内/海外集合重叠仍按原国内优先顺序。
3. 最后的resolve、私有IP和geoip-cn直连之后：`network:udp + port:443`。未分类国内IP先直连，只有走到最终代理兜底的请求被拒绝。

三条已覆盖三个分隔的代理决策点；只在末尾放一条会被前面的GitHub/AI/海外代理规则抢先终止，在顶部统一拒绝又会误伤LAN、国内直连和模式。未机械复制组合版中VPS版不存在的Google/Telegram/OneDrive细分规则。

DNS劫持、LAN和Direct/Global终止规则都在新增规则前，因此新增阻断仅作用于原Rule分流路径。**不改变Direct/Global语义**：Direct仍直连，Global仍全局代理（LAN例外保留）；两模式不新增UDP443拒绝。若用户需在Global也阻断，应另作明确决策，不能在本轮悄悄扩大。

## 修改前后行为

| 应用目标/模式 | 组合版原/本轮 | VPS原 | VPS本轮 |
| --- | --- | --- | --- |
| Rule：海外、GitHub、AI UDP443 | 拒绝/不变 | 代理 | 拒绝 |
| Rule：同目标TCP443 | 原代理/不变 | 代理 | 代理 |
| Rule：同目标UDP8443等 | 原代理/不变 | 代理 | 代理 |
| Rule：国内域名/国内IP UDP443 | 原直连/不变 | 直连 | 直连 |
| LAN UDP443（各模式） | 原直连/不变 | 直连 | 直连 |
| DNS UDP53 | 原DNS劫持分流/不变 | 原DNS分流 | 不变 |
| Rule：未知海外IP UDP443 | 拒绝/不变 | 代理兜底 | 拒绝 |
| Direct：海外UDP443 | 原直连/不变 | 直连 | 不变 |
| Global：海外UDP443 | 原代理/不变 | 代理 | 不变 |
| HY2/TUIC外层UDP443 | 不因应用规则封禁 | 正常协议拨号 | 不因应用规则封禁，须按下述层级验证 |

“国内直连”指原分类规则判为直连的请求。GitHub/AI即使与Microsoft/国内集合重叠，仍保持原优先代理类别，故Rule下其UDP443被拒绝。组合版原有IPv6总体拒绝不变；VPS双栈仍保留，代理目的IPv4/IPv6 UDP443都受防护，其他IPv6不新增限制。QQ专用覆盖不恢复，通用国内分类仍可直连QQ。

应用HTTP/3通常使用UDP443，但该规则按**目标端口和分流**拒绝，并非识别所有QUIC：其他端口的QUIC不在范围内，使用UDP443的非QUIC代理业务也会被拒绝。依赖QUIC且没有TCP回退的海外应用可能不可用，这是兼容策略的取舍；不保证所有应用都会自动回退。

## 应用QUIC与代理外层QUIC

路由规则处理应用入站元数据；HY2/TUIC外层由对应outbound的dialer建立，不是把封装后的UDP重新当作应用入站分类。不得在VPS防火墙或系统路由封禁服务端UDP端口。本轮不改节点server_port、协议参数、DNS/MTU/stack/BBR/测速周期。

官方1.14.2实现依据：[HY2 outbound](https://github.com/SagerNet/sing-box/blob/v1.14.2/protocol/hysteria2/outbound.go)、[TUIC outbound](https://github.com/SagerNet/sing-box/blob/v1.14.2/protocol/tuic/outbound.go)、[dialer](https://github.com/SagerNet/sing-box/blob/v1.14.2/common/dialer/default.go)。源码说明执行边界，**不能单独证明真实节点可用**。

## 先复现及回归

先修改测试预期而不改JSON：99项Node中原组合版及其边界通过，三份VPS分别在原业务检查和新边界检查失败，共6项失败（原93项通过），明确显示VPS的UDP443仍进入代理。加入三条规则后99项通过。测试匹配器同时纠正无域名IP被字符串`undefined`错误匹配成单标签LAN域名的问题，只影响测试，不改生产。

- `tests/policy.test.mjs`：保留原全部用例，更新三项旧VPS放行预期；新增六模板矩阵，覆盖各模式、GitHub/AI/海外UDP443、相同TCP443/其他UDP、LAN、国内域名/IP、未知海外IP、DNS53及VPS双栈。
- `tests/udp443-runtime.py` 第一部分：官方核心真实套接字，保留生成配置的生产规则顺序；使用小型规则夹具和本地DNS，将代理及direct的传输替换为回环SOCKS，避免向公网发送测试包。以实际reject日志和数据返回共同断言，不用“收不到回包”冒充阻断，也检查实际直连/代理出站标签。**这是受控分流测试，不是外网节点验收。**
- 同文件第二部分：官方核心作为真正HY2/TUIC客户端和服务端，服务端仅监听回环**UDP443**，临时证书由官方核心生成并验证，虚构认证。六份生成配置分别通过两协议建立连接，访问HTTPS小资源、下载固定正文并校验SHA256，另外验证代理UDP8443可传而应用UDP443被拒绝。测试中服务器把目的映射到本地HTTPS/UDP服务，绝不访问GitHub公网。
- 另加测试专用的前置UDP443拒绝（早于LAN）作为对照：应用访问127.0.0.1:443也被拒绝，而经该回环UDP443节点的HTTPS仍通过，避免仅因外层服务器是私网地址而掩盖错误阻断。此对照不写入生产JSON。

原两版×三平台六任务、93 Node用例（更新必要预期）、6 Python、27份完整配置、Sub-Store2.42.6固定转换、原五组故障恢复、规则种子和性能A/B均保留。新增官方运行测试只在Linux执行，用sudo赋予回环低端口绑定权限；不改防火墙、sysctl、路由、TUN或服务器设置，不新增公网监听。测试结束关闭进程、删除临时私钥和目录。Windows/macOS CI仍做原生核心完整配置check及Node/Python回归，不声称启动其系统TUN。

本地执行器禁止netlink，不能将本地核心运行失败或跳过记为通过；官方HY2/TUIC运行结果须以本PR Linux CI日志的 `OFFICIAL_QUIC_OK` 与测试完成状态为准。真实VPS、Windows/macOS/Android TUN和真实线路测试仍待用户执行，不能用本地协议成功替代。

## 实机步骤与回滚

1. 在独立客户端配置副本固定同一具体HY2/TUIC节点，不用自动组选路。确认真实服务端UDP端口保留；不改VPS防火墙。
2. Rule下对比相同公开目标：应用UDP443应拒绝，TCP443 HTTPS网页/下载应成功；国内和LAN直连、DNS53与实际使用的其他UDP应用保持正常。记录匿名结果和本地日志摘要，不分享订阅/密码/UUID/IP。
3. Windows/macOS分别在mixed与TUN测，Android用原VPN入口。浏览器H3支持/缓存可变，需从本地日志确认实际网络和目标端口；仅“网页能打开”不能证明尝试过H3。
4. Direct/Global分别确认原模式语义，尤其Global不会新增此阻断。节点不可用时仍按原DNS/缓存恢复策略，不借此次策略调整其他网络参数。
5. 观察网页首包和同流下载曲线，但本轮不宣称提速；历史异常的根因和真实运营商收益尚未证明。

本轮独立分支，仅创建人工审核PR，不自动合并。上轮工具PR #7仍独立未合并，不将其文件或CI步骤混入本轮main基线，也不撤销它。

若人工合并后需回滚，revert本PR即可；如只撤销网络行为，仅删除三份VPS JSON新增的三条UDP443拒绝规则，**保留组合版原阻断和全部原路由/DNS规则**，重新生成订阅并运行核心check。不要回退历史整份配置；客户端保留原可用副本和规则缓存。回滚后VPS的代理UDP443恢复原放行，不更改服务器端口。
