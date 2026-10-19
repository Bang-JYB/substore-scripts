# 验证说明（2026-10-19）

## 已复现的问题

针对基线 main `7a72e9f` 先编写测试：首批脚本测试 15 项中 7 项失败；覆盖重名映射覆盖、去重别名丢失、自环/多节点环漏检、direct 歧义、缺失 server、嵌套 tag 错误去重。DNS/路由策略测试首次执行 12 项失败（六份模板分别暴露 AI 抢先直连、备用 DNS 未接入等）。这些失败不是 sing-box 语法检查可以发现的。

## 测试层次

| 层次 | 内容 | 能证明/不能证明 |
| --- | --- | --- |
| Node.js 原生回归 | 44 项：映射/依赖、八组/分池、地址族、接口、LAN/AI/GitHub/QQ/UDP443、GeoIP 顺序、备用引用、下载目标 DNS、种子参数 | 确认脚本输出与策略约束；策略夹具不是整个 sing-box 路由器的替身 |
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
