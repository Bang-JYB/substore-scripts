# 验证说明（2026-10-19）

## 2026-10-20 引用与候选边界（基线 d54ee160）

- Node **91 项**：原 65 场景保留，新增 20 项引用/辅助边界与 6 项 QQ 通用分流；边界测试对基线 15 失败/5 通过，QQ 新要求测试移除前六项失败，修复后均通过。
- 原 23 份有效完整配置继续校验，再增两家族精确空格链、两种协议双栈 IPv6 helper，共 **27 份/任务**；组合 IPv6 断链作为必须失败的负例，不输出半成品。六任务总计 162 次核心检查。
- Python 6 项、官方 Sub-Store 2.42.6 快照及输入、五组真实套接字集成、14 份真实规则/8 项匹配均保留。运行夹具直连域名改为本地 CN 集合下的 *.baidu.com，只适配用户撤除 QQ 专用规则，不删任何故障场景和断言。
- 已深比较六模板：只删除 QQ/Tencent 专用域名覆盖（VPS 通用 cn 保留），地址、MTU、端口、UDP/系统代理、DNS 主备和其他分流全部一致；两脚本不对 detour trim 或猜目标。
- 原始名称精确匹配：tag=" a " 的正确依赖是 detour=" a "；detour="a" 不会被自动匹配到它。精确同名不同配置报错，空格不同名称可分别指向不同节点，显示名规范化碰撞仍唯一编号；同配置别名继续按已有规则去重。
- 保守过滤与候选行为：IPv6 helper 被移除则组合导出失败；父节点被移除而 helper 存活时 helper 不可选择，池为空明确失败；未被引用的显式 ShadowTLS 按原功能保留，不能据此推断完整代理连通。

本节之后为历史记录。实际系统 TUN、真实节点握手及用户后端不由静态/loopback 测试替代，本轮仍需六任务最终 CI 结果确认。


## 2026-10-20 边界回归（基线 2c864da）

- 当前 Node **65 项**：原 51 项 + 14 项 Sub-Store/协议与分池回归；最终新回归在基线 12 失败/2 通过，修复后全部通过。Python 原 6 项不变。
- 每版本/平台 core check **23 份**：原 15 份保留，新增组合全 14 类协议 1 份、官方转换快照六模板 6 份、组合侧前置改名 1 份。六任务总计 138 次完整配置 check。
- Linux 继续执行原五组实际套接字故障、14 份上游规则解码/8 项匹配；不得设置 ALLOW_CORE_RUNTIME_SKIP。开发机若禁止 netlink，显式跳过仍不计通过。
- 固定官方 Sub-Store 2.42.6 parser/producer 已离线运行；快照带官方资产与输入 SHA256。CI 使用固定结果，不需要 Sub-Store 后端、真实订阅或新增 npm 依赖。快照消费/核心校验与实际远端协议握手是不同层次。
- 六份 JSON 与 MTU/测速/UDP/系统代理不变，11 种原正常输出与基线逐项相同。TUN 仅静态检查与三系统本地 core check；实际系统 TUN/应用稳定性待实机验证，详见 AUDIT.md。

重生成固定转换快照（可选，普通测试不需要下载转换器）：先从快照 provenance.url 下载官方 proxy-utils.esm.mjs 到本地，然后执行：

```bash
node --experimental-vm-modules scripts/capture-substore-fixture.mjs /本地路径/proxy-utils.esm.mjs
npm test
```

生成器先验证固定 SHA256，再执行未改动的官方 parse/produce；不允许网络或额外 import。修改输入需同步重生成快照，输入摘要按 UTF-8/LF 规范化（避免 Windows autocrlf 造成误报，内容改变仍会失败）；输入 hash 过期、错误归档、无效依赖/协议、辅助 hop 被放入池均有回归。不会启动实际 Sub-Store 服务器，不能证明用户后端的处理器顺序/版本/私有订阅格式。

首轮分支 280fff8 的两个 Windows CI 在输入原始字节摘要上失败，实测 LF/CRLF 摘要与日志完全一致；因此仅对人工输入统一 CRLF→LF，保留官方归档的严格原字节 SHA256。回归同时覆盖 LF/CRLF 相等、输入内容变化仍不等及错误归档不得执行/覆盖快照。

下方为先前轮次历史记录，本轮以此节与最终提交关联的六任务 CI 为准。


## 2026-10-20 增量验证（基线 ec00943）

- 注入回归先在原脚本复现 4 组失败，再修复；Node 总计 51 项（原 45 项保留）。Python 6 项（原种子 2 项 + 下载器默认版本/错误摘要/双版本独立发布 3 项 + 运行夹具端口复用 1 项）。
- CI 扩展为 Linux/Windows/macOS × 1.14.2/1.14.3 六个任务。两版本官方归档均锁定 SHA256；默认生产/下载版本仍为 1.14.2。每任务运行所有单元与 15 份有效配置 check（含全部 14 类独立服务器代理）；Android/mixed 原例改为“必须拒绝”的回归，不能再让空 inbounds 冒充正常配置。
- Linux 两版本均运行原 4 组 + 新增 bootstrap 故障组（覆盖六模板、主 DNS 故障时域名节点失败/QQ 备用直连、原地恢复、IP 节点独立于 bootstrap），并执行 14 份真实规则解码/8 项匹配。
- 本地执行器禁止 netlink，运行级测试显式使用 ALLOW_CORE_RUNTIME_SKIP=1 后跳过，不能记录为通过；CI 不允许跳过，以实际日志为准。
- TUN 模板只做静态/生成/core check；所有套接字集成将 TUN 替换为 loopback mixed，因此**未验证 Windows 驱动、SFM NetworkExtension 或 SFA VpnService**。设备风险与验收范围详见 AUDIT.md 本轮复审。

检查 1.14.3 时显式设置版本和对应可执行文件；Windows 用 PowerShell 的 `$env:`：

```bash
SING_BOX_VERSION=1.14.3 python scripts/download-core.py
SING_BOX_VERSION=1.14.3 SING_BOX=/下载器输出的1.14.3路径/sing-box npm run test:core
SING_BOX_VERSION=1.14.3 SING_BOX=/下载器输出的1.14.3路径/sing-box python tests/runtime.py
```

本轮 [完整 CI](https://github.com/Bang-JYB/substore-scripts/actions/runs/39340089443) 对实现提交 `466500bae5061057f03484de31981701c5820cf4` 的六个任务全部通过：每任务 51 项 Node、5 项 Python 与 15 份官方核心配置检查（累计 90 次 core check）；两个 Linux 任务均实际执行 5 组套接字故障集成、14 份真实规则解码与 8 项匹配，无运行级跳过。随后文档提交 a4b01b2 的 CI 复跑暴露已有测试夹具竞争：代理和 API 的两次“取空闲端口后立即关闭”可能取得同一端口，Linux 1.14.2 因 address already in use 失败（其他五任务通过）。先用可复用端口的 socket 夹具确定复现 15000 == 15000，再同时持有两个 socket 完成分配后统一释放，保证该对端口不同；没有重试失败测试或放宽业务断言。新增端口回归通过后将对最终提交重新运行全部六任务。

下方 2026-10-19 记录保留为历史基线，当前新增验证以本节与最终提交对应 Actions 为准。


## 已复现的问题

针对基线 main `7a72e9f` 先编写测试：首批脚本测试 15 项中 7 项失败；覆盖重名映射覆盖、去重别名丢失、自环/多节点环漏检、direct 歧义、缺失 server、嵌套 tag 错误去重。DNS/路由策略测试首次执行 12 项失败（六份模板分别暴露 AI 抢先直连、备用 DNS 未接入等）。这些失败不是 sing-box 语法检查可以发现的。

## 测试层次

| 层次 | 内容 | 能证明/不能证明 |
| --- | --- | --- |
| Node.js 原生回归 | 45 项：映射/依赖、八组/分池、地址族、接口、LAN/AI/GitHub/QQ/UDP443、GeoIP 顺序、备用引用、下载目标 DNS、种子参数 | 确认脚本输出与策略约束；策略夹具不是整个 sing-box 路由器的替身 |
| Python 单元测试 | 2 项：下载失败/坏规则不得覆盖旧种子；成功发布 manifest | 覆盖种子准备工具的发布边界 |
| 官方 1.14.2 check | 15 份生成配置，覆盖六模板、IPv6 优先、mixed、种子目录、多种真实协议字段的虚构节点 | 检查完整配置结构、引用与字段；不连接真实节点 |
| 官方核心真实套接字 | 4 个集成测试组，分别覆盖六模板直连 DNS/节点隔离、两家族代理 DNS/AI、FakeIP 转真实 direct、两家族规则冷启动/种子/缓存/更新失败 | 使用本地 UDP DNS、SOCKS5 和 HTTP；不需要 TUN 权限，不访问真实业务或真实节点 |
| 真实上游规则 | 下载并用官方核心解码 14 份规则，8 项 rule-set match | 核查 GitHub/AI/QQ/国内 IP 的当前实际规则覆盖 |
| 实机 VPN/应用 | 待用户环境验证 | 不宣称已在 Windows/SFM/SFA 建立真实系统 TUN 或完成 QQ 音乐持续播放 |

GitHub Actions 矩阵对 Windows/macOS/Linux 各运行全部单元测试和 15 份配置 check；真实套接字集成及上游规则检查在 Linux 运行。官方 release 归档版本和 SHA256 在 scripts/download-core.py 固定。不是调用仓库中的假核心或只检查六份空模板。

首轮验证分支 [Actions #1](https://github.com/Bang-JYB/substore-scripts/actions/runs/39215377198) 三系统通过，Linux 4 个运行级测试组全部执行且通过。之后新增下载目标 DNS 回归、IPv6/Global DNS 和上游规则校验；最终结果以最终提交关联的 Actions 为准，不将早期检查冒充最终验证。

## 故障夹具的具体约束

- 所有节点均虚构；测试地址在 loopback/保留网段，TLS 密码和 UUID 为 fixture-only。
- 国内主/备用、代理主/备用使用不同的本地 DNS 端口，按请求域名记录实际查询；只替换上游网络端点，不删除生产 DNS 规则。
- 主服务器正常时确认备用未被查询；超时/SERVFAIL 时确认备用；NXDOMAIN/NODATA 保持权威结果；两家国内 DNS 都失败时确认没有借用代理 DNS。
- 代理 SOCKS 服务关闭时，QQ 域名 DNS 与 HTTP 仍必须返回 direct-ok。单节点故障不自动把海外流量泄露为直连。
- FakeIP 用真实核心分配，再通过 mixed 入站访问该地址，确认核心反查域名、resolve 得到真实 IP 并完成 direct 请求。
- 缓存测试仍使用 remote 规则、真实 SRS 文件、HTTP detour、持久 cache.db；覆盖无缓存/种子失败、initial_path 成功、实际下载写缓存、重启读缓存、更新失败继续提供直连。
- 运行测试仅在本地副本中将 TUN 入站换为 loopback mixed、关闭 auto_detect_interface，并添加 loopback API 控制模式。生产模板的 TUN、MTU、stack 与接口由完整配置/策略断言检查，测试不会修改生产文件。
- 受限开发环境禁止 netlink 时必须显式设置 ALLOW_CORE_RUNTIME_SKIP=1 才可跳过；CI 不设置，无法运行应失败。不能把跳过记作通过。

## 本地复现

```bash
npm test
python -m unittest discover -s tests -p '*_test.py' -v
python scripts/download-core.py
export SING_BOX=/下载器输出的绝对路径/sing-box
npm run test:core
python tests/runtime.py
python scripts/prepare-rule-seeds.py --config config_tun.json --output .test-output/real-seeds --core "$SING_BOX"
python tests/upstream-rules.py --seeds .test-output/real-seeds --core "$SING_BOX"
```

Windows 使用 PowerShell 的 `$env:SING_BOX`，check 可运行；运行级集成按 CI 的 Linux 环境复现。Node.js 22+、Python 3.12+，不需要第三方 Python/npm 包。

## 设备验收建议

保留旧配置并使用同一手动节点，在 Rule 模式测试主站/下载、QQ 音乐换歌、Apple/Microsoft、AI、LAN IP/域名。然后临时选择已知不可用的测试节点，确认直连仍可新建连接；再比较 IPv4/IPv6 实际播放路径。记录出站与中断瞬间的日志，不能只凭 outbound connection to 判断成功。

不建议为验证而清空唯一可用的规则缓存、破坏真实节点或修改系统 DNS；离线首次启动请使用隔离目录和虚构节点。客户端真实密钥、私有 Sub-Store 链接不应上传到 Actions 或公开仓库。

## 完整验证记录

[Actions #2](https://github.com/Bang-JYB/substore-scripts/actions/runs/39216224295) 对提交 `eeba1b954366c6e4ffed44abe967ddd760fcb014` 三系统全部通过：每系统 44 项当时单元回归、2 项种子测试和 15 份完整配置检查；Linux 的 4 个套接字集成测试组与 14 份真实规则解码/8 项匹配检查通过。随后仅完善节点 identity 的有效协议夹具、增加 standalone 依赖负例测试及本验证记录；最终提交会再执行相同 Actions。
