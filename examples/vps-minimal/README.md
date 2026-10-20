# VPS 最小恢复配置（独立试用，不替换原国内分流版）

适用官方 sing-box **1.14.2/1.14.3**。参考官方 [Basic TUN usage for Chinese users](https://sing-box.sagernet.org/manual/proxy/client/)，并核对 1.14.2 固定版本的 `docs/manual/proxy/client.md`、DNS rule action、Dial Fields。官网会更新到后续版本，不能把所有最新字段直接复制到 1.14.2。官方示例省略了节点和具体部署，不是可以直接导入的完整中国分流订阅。

本版的用途是先隔离“节点/入口”与“复杂分流/远程规则”的问题。**不能承诺提速，也不能证明用户 Google 故障已经修复。** 截图中 HTML 已出现、CSS/图片失败，可能涉及资源域名、DNS、连接/节点、浏览器或 TUN，截图不能定位根因。CI 和回环成功不等于实际 Windows/macOS 及 VPS 可用。

## 行为

- Rule：明确的私有 IP、`.lan/.local/.home.arpa` 和单标签主机名直连；其他公网业务都走 VPS，包括国内网站。**本版没有 geosite-cn/geoip-cn、Apple/Microsoft 专用直连；不能冒充原版的等价性能优化。** 未知域名解析到私网、企业自定义域名、mDNS/广播发现和 VPN 叠加仍需实机验证。
- GitHub、AI、Google 及其图片/样式等公网资源统一代理，不依赖域名规则下载。不额外添加 QQ/Tencent 专用规则。
- Rule 的代理应用 UDP 443 拒绝；DNS 53、LAN、TCP 443、其他 UDP 保留。由于国内公网也走代理，其 UDP 443 同样受该保护，这与原国内分流版不同。
- Direct/Global 保持原语义：Direct 公网直连，Global 公网代理；LAN 优先。两模式不新增应用 UDP 443 拒绝。HY2/TUIC 出站外层 UDP 端口不封禁，不改服务器防火墙。
- 公网 DNS：原代理 Google DoH → 失败后 Cloudflare DoH；Direct 模式：原直连阿里 DoH → 失败后腾讯 DoH；LAN 用本地解析。NOERROR（包括 NODATA）和 NXDOMAIN 直接返回，不误触备用。超时仍为原 3s/2s，不把服务器故障伪装成快速成功。
- 节点域名 bootstrap 仍用原 `vps-dns`，**单点限制保留**；如果它不可达，业务 DNS 的备用不能修复节点建连。没有循环引用代理 DNS 来解析代理服务器。不盲改节点服务器为 IP，尤其 CF/WS 节点要保留实际 Host/SNI。
- 无远程规则和 GeoIP 国内探测；不执行公网通用 route.resolve。无首次启动规则下载依赖。保留 DNS 主备、双栈、原 MTU 1400、mixed stack、系统代理开关、节点协议和 5m/tolerance50 自动测速参数。
- 只复用原安全注入器，不新增节点转换器。协议白名单、去重、精确 detour、Snell/ShadowTLS 依赖校验均保留。仍可手动固定节点；VPS自动只是延迟/连通性测试，不测带宽。
- 管理 API 仍为 `127.0.0.1:9090`，HTTP/SOCKS 仍为 `127.0.0.1:7890`。不与原配置同时运行。使用独立 `cache-vps-minimal.db` / cache ID，避免继承原配置的选择/模式状态。正常启动日志为 info，便于本机排障；日志可能含私密地址，不上传原文。

## Sub-Store 使用（先复制原远程文件，保留回滚入口）

试用分支模板 URL：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/audit/vps-minimal-20261020/examples/vps-minimal/config_vps_minimal.json
```

只添加现有独立 VPS 注入脚本，不同时使用组合版脚本：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/cdb4e3f258cc8663e753ef0d86d6ec7a1700f921/inject-vps-standalone.js#name=VPS
```

非 TUN 时改用同一个脚本的 mixed 参数：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/cdb4e3f258cc8663e753ef0d86d6ec7a1700f921/inject-vps-standalone.js#name=VPS&mode=mixed
```

`name=VPS` 对应自己的现有单订阅内部名称。刷新模板缓存，预览、保存，将 **Sub-Store 生成文件** 导入一个新的客户端配置；不能直接导入带空策略组的 GitHub 模板。无需提供真实配置、订阅或密码给别人。

先在 **VPS选择** 点选一个已知能用的具体节点，不选 VPS自动。原注入器仍默认自动组，因此这一步必须手工完成；单独刷新页面不能保证旧连接重新拨号。停止再启动测试配置后，关闭浏览器测试标签并重新打开。不要同时开另一代理/VPN。

## 最短恢复检查

1. Windows 先使用 `mode=mixed`，浏览器/系统手动指向 `127.0.0.1:7890`（模板不自动开启系统代理）。在 PowerShell 执行：

   ```powershell
   curl.exe -q --noproxy probe-no-bypass.invalid --proxy http://127.0.0.1:7890 --http1.1 --connect-timeout 10 --max-time 20 -o NUL -sS -w "status=%{http_code} first_byte=%{time_starttransfer}s total=%{time_total}s\n" https://www.google.com/
   ```

   macOS 用 `curl` 和 `/dev/null`；先确认客户端运行时7890确实存在，不为关闭 TUN 而误停整个 SFM 服务。

2. 同节点查看 `https://www.google.com/`、`https://about.google/intl/zh-CN/products/`，确认样式/图片完整。仅 HTML 有内容不算通过。浏览器代理扩展可能绕开系统设置，先统一只用一个代理入口测试。
3. HTTP 正常后再试 TUN；同设备、同节点、同目标对照。HTTP 仍失败时，先从客户端本地 info 日志区分“7890未开、节点拨号、认证/TLS、DNS”；换一个已知可用节点比较，不先改 DNS/MTU/BBR。需要分享时仅抄匿名错误摘要，去掉域名/IP/UUID/凭据。
4. 需要分段下载时继续用 [现有诊断工具](../../tools/README.md)，不重新开发测速。Windows 广州移动和 macOS 广州电信分开保存结果，固定具体节点，至少3次。HTTP/1.1 成功不等于浏览器 H2/H3、OS TUN 或节点吞吐已验证。

## 证据与限制

新配置是明确更改分流范围的恢复对照，**不是删除原版故障回退来换性能**。原六模板、八个组合策略组、两份注入器及全部原测试保持不变。受控回环比较公开记录 DNS 查询次数：已知 Google 路径原版/本版都不需要国内预查；未知域名原版会按国内 GeoIP 识别，本版统一代理，不能把少一次查询当作完全等价提速。

新增测试检查生成后的完整双栈/TUN/mixed 配置、原注入安全约束、模式和 UDP 边界，以及 Linux 官方核心真实 DNS 主备/缓存/LAN 节点失效和 HY2/TUIC 外层 UDP443 的 HTTPS/下载/应用 UDP443拒绝。Windows/macOS 核心 check 不等于系统 TUN 实机通过；真实 VPS 和运营商性能仍待测。当前执行器 netlink 受限，运行集成测试必须以 CI Linux 结果为准。

回滚只需停用本配置，切回原先保存的配置；原规则缓存文件无需删除，原订阅和服务器参数没有变更。若本版可用而原版不可用，再基于相同节点的匿名日志逐项定位规则/DNS差异，不能据此直接删除原版全部国内分流。若本版同样不可用，不能继续把问题笼统归咎于规则数量。
