# VPS 单订阅独立配置

只读取 Sub-Store 的一份单订阅；订阅中可包含 Oracle 或任何其他厂商的多个 VPS 节点。
不需要机场，不需要组合订阅，也不需要 YBsSB2。

## 即时设计直连与 UDP 443（2026-10-30）

- Rule 模式：`js.design` 及全部子域名使用 `vps-dns` 和 `direct`，包括官网、编辑器、图片、数据、下载及新增子域名。不泛化匹配包含 `js` 的域名，也不将共享云厂商整段直连。
- 两条简单拒绝规则覆盖代理业务 UDP 443：一条紧邻 GitHub 代理路由之前，另一条在国内 IP 直连兜底之后。单纯放在末尾会漏掉提前代理的 GitHub；无条件上移则会误伤国内直连。
- 国内、LAN、即时设计的 UDP 443 继续直连；TCP 443、其他 UDP、DNS 劫持、Direct/Global 模式不变。未知公网 IP 在未命中国内 IP 规则时，UDP 443 被拒绝。
- 不更改 HY2/TUIC 节点端口、传输或认证参数。新增规则针对进入配置的业务流量；配置检查不等于真实 QUIC 节点连通测试。
- 两份注入脚本不变，IPv4/IPv6 优先参数仍可使用；DNS 服务器、缓存、TUN、MTU、端口和测速周期不变。
- 试用或合并更新后，刷新 Sub-Store 模板缓存、重新生成订阅、在客户端更新并停止/启动服务，再重新打开即时设计。仅更新注入脚本无法获取模板变更。真实访问速度需设备端验证。

## 文件分工

- config_vps_standalone.json：独立 sing-box 配置模板，没有真实节点和密钥。
- inject-vps-standalone.js：读取指定单订阅，把节点填入模板并生成两个策略组。

模板的节点列表留空是正常的；须经过脚本生成后再导入客户端。
Sub-Store 订阅转换支持的服务器代理协议可以使用；WireGuard endpoint 等非服务器 outbounds 不在此脚本支持范围。

## 各平台模板

| 场景 | 模板文件 | 入站设置 |
| --- | --- | --- |
| 桌面 TUN | config_vps_standalone.json | TUN + 本机混合代理 7890 |
| 桌面 noTUN | config_vps_notun.json | 只有本机 HTTP/SOCKS 混合代理 7890，不自动设置系统代理 |
| Android 手机 | config_vps_android.json | 只有 VPN/TUN，保留 IPv4/IPv6，自动测速间隔 10 分钟 |

三份模板使用同一个 inject-vps-standalone.js，国内外分流规则一致。
分别建立远程文件，将模板链接末尾文件名换为对应文件。脚本地址仍为 #name=VPS；只需修改单订阅名称。
noTUN 不需要额外添加 mode=mixed，模板本身就没有 TUN。Android 使用默认 mode=tun，勿添加 mode=mixed。
Android 在 sing-box 客户端导入生成文件的链接，允许系统 VPN 权限并启动，选择 Rule／规则模式。
手机模板按 Android sing-box 配置；iPhone 需使用兼容 sing-box 1.14 字段的客户端，不能当作通用 Surge/其他客户端配置直接导入。

## Sub-Store 使用步骤

1. 在“订阅”中新建单订阅，例如内部名称 VPS，放入几个 VPS 节点，先确认订阅能预览。
2. 在“文件”中新建远程文件，内部名称例如 VPS-SingBox，远程链接填写：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_vps_standalone.json
```

3. 添加一条“远程文件脚本”，填写：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-vps-standalone.js#name=VPS
```

name 使用单订阅内部名称，而不是备注或文件名称；参数区单独填写时，name 填 VPS 即可。
不要添加旧 inject-nodes.js 或 inject-vps-dualstack.js。

4. 预览：VPS选择包含 VPS自动 和该订阅所有可转换的节点；VPS自动包含同一批节点。
5. 保存文件，将 Sub-Store 生成文件的下载/分享链接导入 sing-box 客户端。不要直接导入 GitHub 模板。
6. 在客户端 VPS选择中，选 VPS自动 使用自动选择；点某个节点名称则固定使用该节点。

另一份订阅的内部名称如 MyVPS，只需另建远程文件，沿用同一模板，把脚本参数改为 #name=MyVPS。
名称含中文、空格或 & 等字符时，将参数值 URL 编码，或在界面参数编辑器填写原始名称。

## 可选设置

| 参数 | 默认值 | 用法 |
| --- | --- | --- |
| name | VPS | 单订阅内部名称 |
| strategy | prefer_ipv4 | 同时保留 IPv4、IPv6，域名优先 IPv4；prefer_ipv6 则优先 IPv6 |
| mode | tun | TUN/VPN 模式；桌面只使用 HTTP/SOCKS 时可选 mixed |

优先 IPv6：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-vps-standalone.js#name=VPS&strategy=prefer_ipv6
```

桌面不开 TUN：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-vps-standalone.js#name=VPS&mode=mixed
```

mixed 模式需在使用代理的应用中设置 HTTP/SOCKS 地址 127.0.0.1:7890，模板不自动设置系统代理。
TUN 默认支持 IPv4/IPv6 地址，在桌面客户端开启 TUN，Android 使用 VPN。
请使用与现有仓库相同的 sing-box 1.14.2 或兼容配置字段的版本。

## 行为说明

- VPS自动使用 HTTPS 请求测试延迟，间隔 5 分钟、容差 50 ms；这是延迟/连通性测试，不是下载带宽测试。
- 默认选择 VPS自动；手动选节点后不会因为自动测试而改变手动选择。
- Rule 模式：局域网、国内域名和国内 IP 直连，其余流量通过 VPS选择。Direct 模式全部直连，Global 模式除局域网外全部走 VPS。
- DNS 支持 A 和 AAAA，不屏蔽 IPv6；节点域名、国内域名用直连阿里 DoH，其他域名用 VPS 访问 Google DoH；Direct 模式 DNS 也直连。
- 首次启动通过“VPS选择”代理下载上游 GitHub 的 geosite-cn、geosite-private、geoip-cn、geosite-apple、geosite-microsoft 五个规则集，随后缓存并每 7 天更新。首次启动需要配置中至少一个可用 VPS 节点。国内应用是否直连取决于其域名/IP 是否命中规则；规则未涵盖的海外服务仍走 VPS。
- 要使用国内外分流，请将客户端模式设为 Rule／规则模式。更新配置后重启客户端和出现断线的应用，让已有连接重新建立。
- IPv6 地址节点需要客户端网络具备可用 IPv6；不能凭 IPv6 地址自动推导 IPv4。
- 保留协议、TLS/SNI、服务器地址和认证字段，不会把单个 IP 节点拆成凭空生成的双栈节点。
- 节点按配置去重；重名且配置不同、缺失链式依赖或循环依赖时停止生成，防止错误配置。
- 只有支持的节点会进入输出；若前置订阅操作已删除 IPv6 节点，脚本无法恢复它们。
- 切换节点默认保留现有入站连接，新连接使用新的选择。
- 与旧配置使用相同的本地端口 7890 和 9090，选择其中一份配置启动，避免同时启动造成端口冲突。
- 真实凭据只在 Sub-Store 生成的私人配置中。不要将生成配置提交到公开 GitHub，也不要公开 Sub-Store 私有分享链接。

## 验证

使用虚构 IPv4、IPv6、域名节点验证单订阅读取、手动和自动候选、TLS 保留、
去重、重名、链式依赖以及错误参数。TUN 和 mixed 两种生成配置均通过官方 sing-box 1.14.2 check。
国内外分流修复后再次通过 TUN/mixed 配置检查，并使用官方规则集验证 qq.com、baidu.com、223.5.5.5 命中国内规则，google.com、8.8.8.8 不命中国内规则。
未读取真实节点密钥，未进行真实应用连通性或真实 Sub-Store 后端运行验收。

参考：
- https://sing-box.sagernet.org/configuration/outbound/selector/
- https://sing-box.sagernet.org/configuration/outbound/urltest/
- https://sing-box.sagernet.org/configuration/shared/dial/

## 国内播放与服务直连修复（2026-10-12）

- 已删除六份模板的 QQ/QQMusic/GTImg 等专用覆盖，QQ 音乐跟随普通分类；VPS 独立版 UDP 443 的当前行为见本文开头 2026-10-30 更新。Global/全局模式仍遵循原有选择。
- 国内 IP 兜底判断先使用直连 DNS，减少代理节点不可用对国内域名解析的影响；国外流量仍按原有代理/FakeIP 分流。
- 原版三份模板保留固定 IPv4，UDP 443 限制移到国内直连规则之后；VPS 三份模板继续保留双栈。端口、系统代理设置和测速间隔不变。
- 更新时刷新 Sub-Store 远程模板缓存，重新生成并更新客户端配置，然后重启客户端并重新打开测试应用。
- 六份虚构节点生成的配置通过 sing-box 1.14.2 check。两套配置在本机隔离测试中模拟代理 DNS 不可用，QQ 音乐/苹果/微软与未收录国内域名解析通过；不是实际设备播放稳定性验证。
- 规则集首次下载及后续更新通过代理节点完成；应用直连规则和直连 DNS 不因此改变。

## 新设备首次启动（代理下载规则）

1. 在 Sub-Store 预览并保存，确保生成配置已包含可用节点；不要直接导入只有空策略组的 GitHub 模板。
2. 新设备导入 Sub-Store 生成的完整配置。sing-box 初始化时会使用配置中的“节点选择”（组合版）或“VPS选择”（独立版）下载规则，然后启动。规则下载不依赖额外开启系统代理。
3. 保持 Rule/规则模式。国内及苹果/微软按普通规则分流，QQ 音乐没有专用覆盖；规则文件的代理下载通道与应用分流相互独立。
4. 若首次下载仍失败，先用同一节点单独测试连接；将已确认可用的节点放到订阅首位，再重新生成并导入配置。临时客户端或系统代理不会自动替换本配置显式指定的规则下载节点。
5. 此方案保持小配置与远程更新，但没有缓存时仍需要可用节点，不能保证在所有节点不可用时启动。

2026-10-12 恢复代理下载与上游 GitHub 规则地址。六份虚构节点生成的配置通过 sing-box 1.14.2 检查；未使用用户真实节点验证其下载连接。

## 规则模式 DNS 修复（2026-10-13）

三份 VPS 模板的 route resolve 不再强制指定 vps-dns，而是使用 DNS 分流规则。已收录国内域名、苹果和微软仍使用直连 DNS，QQ 音乐按普通分类处理；其他域名先查询直连 DNS 做国内 IP 判断，未匹配时使用 proxy-dns。避免国外域名绕过 DNS 分流后使用异常解析结果连接。节点服务器域名的直连解析、代理规则下载通道及 HTTP/SOCKS 7890 端口保持不变。

更新时先刷新 Sub-Store 远程模板缓存，重新生成文件，再更新 Windows 客户端配置并停止/启动服务。保持同一手动节点，在 Rule 模式下重测 HTTP 代理连接；设备端实际恢复情况仍需验证。

## GitHub 代理优先级修复（2026-10-13）

上游微软完整规则集也包含 GitHub。六份模板均在苹果/微软直连规则之前增加 GitHub 专用路由与 DNS 规则：组合版使用节点选择与代理 Google DNS，VPS 独立版使用 VPS选择与 proxy-dns。覆盖范围由上游 github.srs 维护，包含主站、API、静态资源、原始文件和下载资源等。Direct/Global 模式仍遵循原有模式选择。

刷新 Sub-Store 远程模板缓存，重新生成并更新客户端配置，然后停止/启动服务。保持 Rule 模式及同一可用节点，测试 github.com、api.github.com、raw.githubusercontent.com 和资源下载。
