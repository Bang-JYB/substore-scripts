# Sub-Store 设置：YBsSB2 组合订阅，固定 IPv4

最终节点取自组合订阅 **`YBsSB2`**，它包含你的 `LXY_SUB` 和 `VPS`。
脚本额外读取单订阅 `VPS` 来比对节点配置、识别自建来源；不会把未被组合选入的 VPS 节点额外加入。
香港节点保留，流量/套餐/到期等信息节点过滤。

## 1. 新建三个文件

在 Sub-Store「文件管理」分别新建文件，来源选择远程文件：

| 用途 | 模板地址 |
|---|---|
| Windows / macOS，TUN | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_tun.json` |
| Windows / macOS，非 TUN 系统代理 | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_pc.json` |
| Android，VPN 模式 | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_android.json` |

这些 JSON 是节点尚未填入的模板，不能直接作为客户端配置使用。

## 2. 每个文件添加一条脚本操作

移除旧的 Xream/Oterea 等节点与分组注入操作，换成下列**一条远程文件脚本**：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-nodes.js#name=YBsSB2&type=collection&vps_name=VPS&vps_type=subscription
```

可视化参数编辑器对应填写：

| 参数 | 值 | 含义 |
|---|---|---|
| `name` | `YBsSB2` | 最终使用的组合订阅内部名称 |
| `type` | `collection` | 读取组合订阅，也支持「组合订阅」 |
| `vps_name` | `VPS` | 用于识别自建来源的内部名称 |
| `vps_type` | `subscription` | 截图里的 VPS 属于单订阅 |

请核对 Sub-Store 编辑页的内部「名称」，它可能与列表显示名称不同。如果更名，修改上述参数即可。
脚本默认值也是这四项。脚本不接受订阅 URL/token 或开启 IPv6 的参数。

## 3. 预览、保存，再导入客户端

预览中应出现：

| 分组 | 类型 | 可选项 | 默认 |
|---|---|---|---|
| 节点选择 | 手动选择 | 自动选择、VPS、单个机场节点、🎯 全球直连 | 自动选择 |
| 自动选择 | 自动测速 | 仅机场节点 | 自动测速 |
| VPS | 手动选择 | VPS-自动、单个 VPS 节点 | VPS-自动 |
| VPS-自动 | 自动测速 | 仅自建 VPS 节点 | 自动测速 |
| AI工具 | 手动选择 | VPS、节点选择 | VPS |
| 漏网之鱼 | 手动选择 | 节点选择、自动选择、🎯 全球直连 | 节点选择 |
| 🎯 全球直连 | 手动选择 | direct | direct |
| GLOBAL | 手动选择 | 节点选择、自动选择、AI工具、VPS、🎯 全球直连 | 节点选择 |

- `自动选择` 保留香港机场节点，`VPS-自动` 只含组合中的自建节点。
- 固定 AI 使用某个 VPS：在 `AI工具` 保持选择 `VPS`，再到 `VPS` 组选择具体节点。
- 普通国外流量也改走 VPS：在 `节点选择` 选择 `VPS`；机场自动测速池仍保持隔离。
- 任一节点池为空、来源识别失败、同名不同配置或拨号依赖环路时，脚本报错并停止输出；不会自动直连。

保存成功后，把 **Sub-Store 生成文件的下载链接**导入兼容 sing-box 1.14.2 内核的客户端。
三份模板使用相同的分流和作者 DNS 策略，区别是入站方式和桌面/安卓默认测速频率。DNS 包含 Google 响应评估、IPv4 FakeIP、HTTPS/SVCB 拒绝和乐观缓存；更新时请同时刷新远程模板及文件脚本，再预览、保存。

## 设备设置

- **电脑 TUN**：Windows/macOS 使用 `config_tun.json`；开启客户端 TUN 并授予所需权限，同时启动本地 HTTP/SOCKS 代理 `127.0.0.1:7890`。Mac sing-box 图形客户端通过 `tun.platform.http_proxy` 提供系统 HTTP 代理，启动后保持「System HTTP Proxy / 系统 HTTP 代理」开启。`mixed.set_system_proxy: false` 仅避免通过普通进程设置系统代理，不关闭监听。Windows 或命令行客户端需要系统代理时可手动填写同一地址。
- **电脑非 TUN**：使用 `config_pc.json`，关闭 TUN。本地 HTTP/SOCKS 地址为 `127.0.0.1:7890`；保留 `set_system_proxy: true` 自动设置系统代理。macOS 自动设置是否成功取决于客户端权限，必要时手动设置同一代理地址。
- **Android**：使用 `config_android.json`，由兼容客户端创建系统 VPN；同意 Android VPN 授权。

固定 IPv4 包括：IPv4 TUN 地址、IPv4 解析、空 AAAA、拒绝进入 sing-box 的 IPv6 流量、过滤 IPv6 字面地址服务器，以及清理 WireGuard 的 IPv6 地址。它不会修改系统全局 IPv6 设置；没有进入代理/VPN 的流量不受本配置控制。

## DNS 更新

已采用作者方案，替换上一版的未知 DNS 国内优先：国内及 FakeIP 排除规则按作者列表处理，未知 A 先经 Google 评估，国内响应转阿里，其余按 FakeIP 规则处理。仅用 IPv4 FakeIP，继续返回空 AAAA 和拒绝 IPv6。AI 业务仍默认走 VPS；国外真实 DNS 查询使用作者的 Google，经节点选择。

## 从旧分组升级

模板地址及脚本参数保持原样。在 Sub-Store 文件管理中同时刷新远程 JSON 模板和 `inject-nodes.js`，预览确认以上八个分组后保存，再更新客户端的生成文件链接。新脚本会清理旧注入结果并重新构建，建议文件源仍指向原始远程模板。新的缓存 ID 用于避开旧分组选择；首次导入使用表中的默认值。

作者 DNS、IPv4、UDP443 拒绝以及三端入站配置保持原有逻辑。Global 模式通过 `GLOBAL` 选择出口；Direct 模式使用 `🎯 全球直连`。DNS Google 的代理出口映射为 `节点选择`。

## 规则下载连接重置的修复

2026-10-03 的本版将原先 21 份远程规则全部内置为 `inline`，加上原有 AI 自定义表共 22 份，客户端启动无需下载 `.srs`。八个分组、作者 DNS 逻辑、IPv4 和业务分流保持原样。

**必须在 Sub-Store 文件管理中刷新对应远程 JSON 模板**，预览里 `route.rule_set` 的所有项目都应为 `"type": "inline"`，不应再出现 `testingcf.jsdelivr.net` 下载地址；保存成功后更新客户端配置并重新启动。模板地址和节点注入脚本地址不变，组合参数不变。单独刷新客户端但 Sub-Store 仍缓存旧模板时，仍可能得到远程下载版本。

每份紧凑模板约 3.02 MB，首次刷新/预览可能稍慢。规则属于 2026-10-03 的数据快照，不再由客户端每天自动下载；后续规则更新通过新版模板发布，再按上述流程刷新。

## gRPC 消息过大修复

报错 `grpc: received message larger than max (5948321 vs. 4194304)` 是配置消息超过 4 MiB 上限。三份模板及节点注入脚本均改用紧凑 JSON，保留全部内置规则，模板大小约 3.02 MB；作者 DNS、分组和禁用 IPv6 保持原样。

1. 在 Sub-Store 文件管理中，刷新当前场景的远程 JSON 模板。
2. **同时刷新 `inject-nodes.js` 文件脚本**。旧脚本会重新生成约 5.9 MB 的格式化 JSON。
3. 重新预览并保存文件，再更新客户端配置并重启。模板地址、脚本地址和组合参数不变。

脚本会记录生成配置的 UTF-8 字节数；超过 4,128,768 字节会停止生成，给 4 MiB 消息包装预留 64 KiB。若仍提示配置过大，减少组合订阅选入的节点或节点附加数据后重新生成。请在 Sub-Store 保留紧凑输出，避免其他处理步骤再次格式化配置。

## TUN 与 7890 同时使用

电脑 TUN 模板现在同时包含 `tun-in` 与 `mixed-in`，HTTP 和 SOCKS 共用 `127.0.0.1:7890`。刷新 Sub-Store 的 `config_tun.json` 远程模板，重新预览、保存，再更新客户端配置并重启。预览中 `inbounds` 应有 `tun` 和 `mixed` 两项，`mixed.listen_port` 为 `7890`。节点注入脚本地址及参数不变。

如需手动设置系统或软件代理，地址填写 `127.0.0.1`、端口 `7890`，HTTP 或 SOCKS5 均可，不填写用户名/密码。使用明确的 IPv4 地址，避免软件把 `localhost` 解析为 `::1`。此端口仅允许本机连接。非 TUN 模板仍自动设置系统代理，Android 模板仍使用 VPN 入口。

Mac 图形客户端的 TUN 模板另有以下平台设置，用于把系统 HTTP/HTTPS 代理指向上述实际监听；它不替代 `mixed-in`，也不会单独创建端口：

```json
"platform": {
  "http_proxy": {
    "enabled": true,
    "server": "127.0.0.1",
    "server_port": 7890
  }
}
```

## 电脑 TUN 文件：内容与操作填写

编辑现有 TUN 文件，保留它的文件名称和生成文件下载链接。

| 「内容」项目 | 填写 |
|---|---|
| 类型 | 文件 |
| 来源 | 远程 |
| 合并来源 | 不合并 |
| 远程文件失败处理 | 严格报错 |
| User-Agent、代理策略、流量查询字段、age 公钥 | 沿用原空值 |
| 禁用远程缓存 | 本次更新先开启，确认后恢复缓存 |

「内容 → 链接」完整复制：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_tun.json
```

「操作 → 脚本操作」选 **远程链接**，仅保留一条本仓库节点注入脚本。「启用」「预览」勾选，本次先勾选「关闭缓存」，确认后恢复缓存；「不验证服务器证书」不勾选。链接完整复制：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-nodes.js#name=YBsSB2&type=collection&vps_name=VPS&vps_type=subscription
```

展开参数时应为 `name=YBsSB2`、`type=collection`、`vps_name=VPS`、`vps_type=subscription`；移除旧 `outbound` 等参数及其他追加分组的脚本。

点击「即时预览」：应只有上表八个策略组，`inbounds` 同时有 `tun-in` 和 `mixed-in`；后者的 `listen` 为 `127.0.0.1`、`listen_port` 为 `7890`，前者有上述 `platform.http_proxy`。保存后更新客户端中原有的 **Sub-Store 生成文件链接**，停止并重新启动配置。Mac sing-box 图形客户端保持「系统 HTTP 代理」开启；需要显式代理的软件填 `127.0.0.1:7890`。Windows 开启 TUN，手动系统代理按需要开启。

## 电脑非 TUN 文件：内容与操作填写

编辑现有非 TUN 文件，保留它的文件名称和生成文件下载链接。

| 「内容」项目 | 填写 |
|---|---|
| 类型 | 文件 |
| 来源 | 远程 |
| 合并来源 | 不合并 |
| 远程文件失败处理 | 严格报错 |
| User-Agent、代理策略、流量查询字段、age 公钥 | 沿用原空值 |
| 禁用远程缓存 | 本次更新先开启，确认后恢复缓存 |

「内容 → 链接」完整复制：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_pc.json
```

「操作 → 脚本操作」选 **远程链接**，仅保留一条本仓库节点注入脚本。「启用」「预览」勾选，本次先勾选「关闭缓存」，确认后恢复缓存；「不验证服务器证书」不勾选。链接完整复制：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-nodes.js#name=YBsSB2&type=collection&vps_name=VPS&vps_type=subscription
```

展开参数时应为 `name=YBsSB2`、`type=collection`、`vps_name=VPS`、`vps_type=subscription`；移除旧 `outbound` 等参数及其他追加分组的脚本。

点击「即时预览」：应只有上表八个策略组，`inbounds` 仅有 `mixed-in`，没有 `tun`；地址 `127.0.0.1:7890`，`set_system_proxy: true`。保存后更新客户端中原有的 **Sub-Store 生成文件链接**，停止并重新启动配置。关闭客户端 TUN；自动设置系统代理失败时手动设置 HTTP/HTTPS/SOCKS 为 `127.0.0.1:7890`。macOS 使用非 TUN 模板需要客户端支持独立代理进程及设置系统代理的权限；仅提供 VPN 扩展的运行方式不保证支持纯 mixed 配置。

## Mac 的 7890 检查

先在客户端正在使用的最终配置中确认 `mixed-in`，不是只看 GitHub 模板。更新下载失败时，客户端仍可能运行旧配置。启动日志应出现 `inbound/mixed[mixed-in]` 和 `127.0.0.1:7890`；若有 `address already in use`，关闭占用端口的另一个代理程序后重启，不要同时启动两份电脑配置。

Mac 终端先检查端口：

```bash
lsof -nP -iTCP:7890 -sTCP:LISTEN
nc -vz 127.0.0.1 7890
```

再分别验证 HTTP 与 SOCKS5 代理；无需在系统设置里反复切换，也不使用环境变量里的其他代理：

```bash
curl --noproxy "" --proxy http://127.0.0.1:7890 --connect-timeout 10 --max-time 30 -I https://www.google.com/generate_204
curl --noproxy "" --proxy socks5h://127.0.0.1:7890 --connect-timeout 10 --max-time 30 -I https://www.google.com/generate_204
```

- `Connection refused` / `Failed to connect`：检查配置是否真正更新、服务是否启动、端口是否存在。
- 7890 连接成功但网页超时：检查「节点选择」中的节点、DNS 与客户端出站日志；这时不能仅归因于代理端口没有开启。
- 两种 curl 都成功而某软件失败：核对该软件的代理协议、地址和端口；系统代理只对遵循系统设置的程序生效。

## 配置更新报 NGHTTP2_ENHANCE_YOUR_CALM

此错误是 HTTP/2 的 `ENHANCE_YOUR_CALM (0x0b)`，表示链路中的 HTTP/2 端点认为对端行为可能产生过大负载。单凭这行错误无法定位是 Sub-Store 服务、反向代理/CDN、上游订阅还是客户端连接触发，不能等同于 JSON 分组错误或先前的 4 MiB gRPC 限制。

用户报告它发生在**电脑客户端更新配置**时。客户端先下载远程配置，再检查和应用 JSON；下载尚未成功，新模板里的 `http_clients` 不会控制这一请求。因此不在模板中添加无效的“关闭 HTTP/2”字段，也不改作者 DNS。官方 Apple 客户端更新逻辑及 libbox 下载器也独立于路由里的 HTTP Client。

1. 在 Sub-Store 分别预览、保存两个电脑文件，确认生成的是紧凑 JSON 和八个策略组；不要同时连续更新三个场景。获取新文件后恢复模板/脚本缓存，避免每次重复拉取上游。
2. 在浏览器打开对应的 **Sub-Store 生成文件下载链接**并下载。如果下载仍失败，检查 Sub-Store 后端日志以及前面的反向代理/CDN 日志；模板文件地址与生成文件地址是两个不同环节。
3. 下载成功时，可先从本地文件导入客户端恢复使用。若要对比 HTTP/1.1 与 HTTP/2，在本机对同一生成文件 URL 做一次下载测试；该 URL 可能带 token，勿贴到公开仓库或日志中。Mac 默认 shell 为 zsh，可用：

```zsh
read -rs 'sb_update_url?粘贴 Sub-Store 生成文件下载链接（输入不回显）：'; printf '\n'
curl --http1.1 --fail --location --connect-timeout 10 --max-time 90 --output config-download.json "$sb_update_url"
unset sb_update_url
```

HTTP/1.1 成功而客户端仍报此错误时，优先检查下载服务/反向代理的 HTTP/2 兼容性与限制。要长期修复须调整实际下载链路或客户端，不能通过下载后才生效的 JSON 保证修复。保持证书验证；不要把生成的真实节点配置上传到 GitHub。

依据：[HTTP/2 RFC 9113 第 7 节](https://www.rfc-editor.org/rfc/rfc9113.html#section-7)、[官方 1.14.2 mixed 文档](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/mixed.md)、[官方 1.14.2 TUN 文档](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/tun.md)、[Apple 客户端更新逻辑](https://github.com/SagerNet/sing-box-for-apple/blob/main/Library/Database/Profile%2BUpdate.swift)、[1.14.2 libbox 下载器](https://github.com/SagerNet/sing-box/blob/v1.14.2/experimental/libbox/http.go)。

## 安卓文件编辑填写（原 main 地址）

“内容”页：类型选 **文件**，来源选 **远程**，合并来源选 **不合并**，远程文件失败处理选 **严格报错**。链接填写原 main 地址：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_android.json
```

User-Agent、代理策略、查询流量信息相关字段和 age 加密公钥按原设置留空。更新本次修复时可临时启用“禁用远程缓存”，获取新模板后再恢复缓存。

“操作”页：脚本操作选 **远程链接**，保持 **启用**、**预览**勾选。删除 Oterea `sing-box-col.js`、旧 Xream 模板及其他追加分组的操作，只保留下列本仓库脚本：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-nodes.js#name=YBsSB2&type=collection&vps_name=VPS&vps_type=subscription
```

若参数在界面中单独显示：`name=YBsSB2`、`type=collection`、`vps_name=VPS`、`vps_type=subscription`。移除旧的 `outbound` 等参数。首次更新可勾选“关闭缓存”，确保获取新脚本；“不验证服务器证书”保持未勾选。

新版脚本支持把旧注入结果清理后重建，但必须是最后一条修改出站的操作；其他脚本若在它后面追加分组，仍会产生多余分组。组合订阅本身保留原设置。

点击 **即时预览**，检查仅有八个分组，`自动选择` 填入机场节点，`VPS` 中包含 `VPS-自动` 和具体 VPS 节点，日志有 `分组 8/8`。再点击 **保存**，安卓更新已有生成文件链接并重启。手机应看不到 `proxy`、`AI`、`ALL AUTO`、机场 PIN 和地区测速组。本次保持原 main 路径；电脑模板入站、作者 DNS、禁用 IPv6 和完整规则数据沿用原设置。
