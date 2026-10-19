# YBsSB2 / VPS：Sub-Store + sing-box 1.14.2

六份模板、两份独立的远程文件脚本。模板不含节点凭据，必须由 Sub-Store 注入节点后导入客户端。目标版本固定为 **官方 sing-box 1.14.2**，不是通用 Clash/Surge 配置。

## 选择模板

| 场景 | 组合版（固定 IPv4） | VPS 独立版（IPv4/IPv6 双栈） |
| --- | --- | --- |
| Windows/macOS TUN | `config_tun.json` | `config_vps_standalone.json` |
| Windows/macOS 非 TUN | `config_pc.json` | `config_vps_notun.json` |
| Android VPN | `config_android.json` | `config_vps_android.json` |

地址格式：`https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/文件名`。
桌面 mixed 入站维持 `127.0.0.1:7890` HTTP/SOCKS，不自动修改系统代理；非 TUN 使用时，须在客户端/应用中明确启用对应系统代理或手动填写地址。现有本地管理接口维持不变（有 Clash API 的模板为 `127.0.0.1:9090`）。Android 组合版不新建额外管理监听。

## 组合订阅版

在 Sub-Store 保留组合订阅 **YBsSB2**，其中包含单订阅 **VPS**。远程文件选一份组合版模板，并仅添加一条节点注入脚本，放在其他节点处理操作之后：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-nodes.js#name=YBsSB2&vps_name=VPS
```

保留八个策略组：`节点选择`、`自动选择`、`VPS`、`VPS-自动`、`AI工具`、`漏网之鱼`、`🎯 全球直连`、`GLOBAL`。
`自动选择`只测试机场节点，`VPS-自动`只测试 VPS；AI 默认 VPS；香港保留，英国/台湾、信息节点和 IPv6 地址节点按原规则过滤。模板与注入后节点均固定 IPv4。

脚本通过节点完整配置（只忽略最外层 tag）识别 VPS 来源、去重并保留依赖别名。**相同原始名称对应不同配置时停止生成**，请先在订阅里重命名；不能猜测 detour 应指向哪一个节点。自引用、循环、缺失/被过滤的依赖也会停止生成。来源节点名 `direct` 与内置 direct 依赖冲突时同样报错。没有 detour 的重名节点也先要求更名，避免后续新增链式节点时悄悄改变语义。

单订阅版见 [README_VPS_STANDALONE.md](README_VPS_STANDALONE.md)，不需要机场或 YBsSB2。

## DNS 与故障边界

- Rule 模式：局域网域名优先使用系统/本地 DNS；QQ 音乐、国内、Apple/Microsoft 使用直连 DNS。GitHub 和 AI 在 Apple/Microsoft 之前匹配，避免 GitHub、Copilot 被微软规则抢先直连。
- 直连业务：先查询阿里 DoH；成功的 NOERROR（包括 NODATA）或 NXDOMAIN 直接使用；超时/其他失败才切换腾讯 DoH。两者均失败时如实失败，**不借代理 DNS 来补救国内服务**。正常主 DNS 请求不会并行或串行多查备用。
- 代理业务：Google DoH 失败才切换经同一代理组访问的 Cloudflare DoH。DNS 备用不等于节点备用，整组节点都不可用时海外服务仍无法访问。节点服务器域名仍用显式直连 bootstrap 解析，避免依赖自身代理。
- 未收录域名：先用直连 DNS 做国内 IP/私有 IP 判断；只有主查询失败才额外使用备用做此判断。已收录的国外域名不做这一轮国内探测。
- 组合版保留 FakeIP。对尚未命中业务规则的域名，`route.resolve` 通过 DNS 规则取得真实地址后再判断 GeoIP；不强制指定阿里，也不直接使用 FakeIP 服务器。核心 1.14.2 的内部 Lookup 自动跳过 FakeIP route。已知国外服务先匹配代理，不付出额外国内探测延迟。
- 对域名形式的直连连接（例如 HTTP CONNECT），先通过同一 DNS 分流/备用逻辑 resolve，再交给 direct；TUN 已携带真实目标 IP 时 resolve 不额外查询。
- Direct 模式仍整体直连；Global 模式仍整体代理，**局域网例外提前直连**。Global 下 QQ 音乐并不保证直连，请使用 Rule 模式。
- 组合版的 UDP 443 限制只在 Rule 下对代理业务及剩余未匹配请求生效；QQ 音乐/国内/Apple/Microsoft 直连先放行。AI、GitHub、Google 等显式代理规则不能再抢先绕过限制。VPS 版维持原行为，不新增 UDP 443 限制。

主查询故障时会等待超时再使用备用：国内每次上游查询上限 2 秒，代理每次 3 秒；这不是健康路径额外等待。权威 NXDOMAIN/NODATA 不因切换而变成错误的可用地址。DNS 缓存按核心 1.14.2 的 transport 自动隔离，所有模板启用持久 DNS 缓存；组合版继续保留 FakeIP 缓存。不要添加已弃用的 `independent_cache`。

**不能承诺节点不可用时“整个直连应用”绝不会中断。** 应用可能使用额外域名/自有 DoH、已有 IPv6 连接或共享 TUN 服务；核心/NetworkExtension 本身异常会同时影响直连和代理。此处修复的是已命中规则业务对单 DNS 和代理的不必要依赖，不自动把未知海外流量改为直连。

### 仍保留的限制

`domain_resolver` 在 1.14.2 必须指定单个 transport，不能虚构 DNS 分组。节点服务器 bootstrap、直接拨号的管理下载器等显式解析仍用原阿里 transport；它失效时节点域名连接可能失败，但已命中直连业务可使用腾讯备用。不要用“经代理的 DNS”解析节点服务器本身，也不要用一个指向自身 TUN 的本地 DNS 监听来套娃。

## 规则下载、首次启动与离线种子

远程规则仍通过 `节点选择` / `VPS选择` 的 HTTP/1.1 下载器获取并每 168 小时更新。下载目标域名留给代理通道处理，不再强制用国内 DNS 先解析 raw.githubusercontent.com；连接节点服务器本身所需的 bootstrap 不变。

核心会保留有效缓存；后台更新失败会记录错误，不会主动丢弃旧规则。**没有缓存、没有本地种子且节点不可用时，首次启动仍会失败**，不能通过关闭安全校验或删除规则伪装为可用。

两份注入脚本新增可选 `rules_dir` 参数，通过官方 `initial_path` 加载规则种子；远程 URL、缓存和更新通道全部保留。已有用户不填参数即可沿用现有部署。

在有网络的电脑上（Python 3.12+，官方核心）：

```bash
python scripts/prepare-rule-seeds.py --config config_tun.json --output offline-seeds --core /绝对路径/sing-box
```

可选通过已运行的代理下载：加 `--proxy http://127.0.0.1:7890`。VPS 版把 config 改为对应 VPS 模板。下载器会先暂存全部文件并逐个用官方核心解码，全部成功后才替换现有种子，并写入 URL/SHA256 manifest；单个文件替换是原子的，整目录替换不是事务，不应在客户端正加载时同时运行准备工具。

将目录复制到**运行 sing-box 的设备**可读的位置，再在 Sub-Store 脚本参数加 `rules_dir=offline-seeds`，或填写 URL 编码的绝对路径。生成的 `initial_path` 为 `offline-seeds/{tag}.srs`，由客户端核心展开。路径不是 Sub-Store 服务器上的目录。桌面 CLI 最容易部署；Android/SFM 沙盒目录需自行确认文件可访问，不能仅将种子留在电脑就期待手机离线启动。

## Windows / macOS / Android TUN

| 平台 | 核查结论与配置选择 |
| --- | --- |
| Windows | 保留 `dns_mode: hijack`、`strict_route`、1400 MTU 和现有 stack；strict_route 可阻止其他接口的 53 端口请求。不要把所有私网网段机械添加到排除路由：172.16/12 会覆盖本模板 TUN 的 172.19.0.1/30 与 DNS 地址。 |
| macOS SFM | 使用 NetworkExtension；官方说明 strict_route 不由该实现执行。Include All Networks/enforceRoutes 是客户端选项，不等同于策略组 Global。没有实机证据，不调整系统开关或改 gVisor；本地网络权限需按应用允许。 |
| Android SFA | 使用 VpnService；不批量注入 GeoIP 排除路由，官方警告大量路由可导致 DeadSystemException。需要整个应用绕过 VPN 时使用客户端按应用设置并明确接受流量直连，不硬编码 QQ 音乐包名到所有平台。 |

局域网 IP 继续在模式切换前直连；`.lan`、`.local`、`.home.arpa`、单标签名字与 geosite-private 先用 local DNS，再直连。`.local` 的 mDNS/邻居发现支持和路由器的 DNS 记录取决于系统，不保证任意自定义内网域名都会解析。没有添加公网监听，没有使用 Linux 专用 bypass/auto_redirect，没有宣称这些设置能修复 macOS 内核崩溃。

## 更新与排障

1. 先保留当前可用的生成配置；在 Sub-Store 刷新**模板与脚本**的远程缓存，再预览、保存、更新客户端并停止/启动服务。
2. 保持同一手动节点与 Rule 模式，分别测试 GitHub、QQ 音乐换歌、Apple/Microsoft、AI 和局域网；再测试节点不可用时直连服务。
3. 默认日志仍为 warn。排障请只在本地副本临时改成 info/debug，记录中断瞬间和“连接”页的出站；正常信息可能包含域名/IP，分享前检查隐私。更新远程配置可能覆盖本地日志修改。
4. `outbound connection to` 只表明拨号尝试，不等于握手/音频数据传输成功；DNS `evaluate` 打印的候选响应也不等于最终返回给应用的响应。
5. `NGHTTP2_ENHANCE_YOUR_CALM` 发生在客户端下载远程配置时，可能早于新配置启动。配置保持约几十 KB、仍有 1 MiB 注入限制；若继续报错，检查 Sub-Store/反向代理通道，或下载生成 JSON 本地导入，不能靠本配置控制客户端下载器的 HTTP/2/gRPC。

## 自动化验证与回滚

Node.js 22+、Python 3.12+，无需 npm 第三方依赖：

```bash
npm test
python -m unittest discover -s tests -p '*_test.py' -v
python scripts/download-core.py
# 将下载器输出的绝对路径填入环境变量 SING_BOX
npm run test:core
python tests/runtime.py
```

Windows PowerShell 使用 `$env:SING_BOX="C:\\完整路径\\sing-box.exe"`；bash 使用 `export SING_BOX=/完整路径/sing-box`。下载器固定官方 1.14.2 并校验已锁定的 release SHA256。
GitHub Actions 对 Windows/macOS/Linux 做单元回归和 15 份完整生成配置校验，在 Linux 用本地 DNS/SOCKS/HTTP 故障夹具验证超时、失败备用、节点失效、FakeIP、规则冷启动/种子/缓存/更新失败。它不替代三个系统的实机 TUN、QQ 音乐播放和网络运营商测试。详见 [VALIDATION.md](VALIDATION.md) 和 [AUDIT.md](AUDIT.md)。

快速回滚：把所用模板和对应注入脚本 URL 中的 `/main/` **同时**替换为 `/7a72e9f56637a50cbf89a6c0a32df8cb1e7c7c26/`，刷新 Sub-Store 缓存并重新生成/导入。不要只回滚脚本却保留另一版本模板。此基线仍含本文已修复的问题，仅用于故障对照。

## 官方依据（固定版本）

- [DNS evaluate/respond 与故障匹配](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/dns/rule_action.md)
- [DNS 规则匹配与内部 Lookup](https://github.com/SagerNet/sing-box/blob/v1.14.2/dns/router.go)
- [resolve 与 FakeIP 预匹配](https://github.com/SagerNet/sing-box/blob/v1.14.2/route/route.go)
- [远程规则缓存、initial_path 和更新失败](https://github.com/SagerNet/sing-box/blob/v1.14.2/route/rule/rule_set_remote.go)
- [TUN 平台限制](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/tun.md)
- [Apple 客户端](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/clients/apple/features.md) / [Android 客户端](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/clients/android/features.md)
