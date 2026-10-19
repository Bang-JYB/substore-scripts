# 验证说明（2026-10-19）

## 2026-10-20 增量验证（基线 ec00943）

- 注入回归先在原脚本复现 4 组失败，再修复；Node 总计 51 项（原 45 项保留）。Python 5 项（原种子 2 项 + 下载器默认版本/错误摘要/双版本独立发布 3 项）。
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
