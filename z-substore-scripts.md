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

移除原来的两条 Xream 模板注入操作，换成下列**一条远程文件脚本**：

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

- **电脑 TUN**：Windows/macOS 使用 `config_tun.json`；开启客户端 TUN 并授予所需权限，同时启动本地 HTTP/SOCKS 代理 `127.0.0.1:7890`。需要指定代理的软件可填写此地址，TUN 模板不自动设置系统代理（`set_system_proxy: false`）；需要时可手动开启系统代理。
- **电脑非 TUN**：使用 `config_pc.json`，关闭 TUN。本地 HTTP/SOCKS 地址为 `127.0.0.1:7890`；保留 `set_system_proxy: true` 自动设置系统代理。macOS 自动设置是否成功取决于客户端权限，必要时手动设置同一代理地址。
- **Android**：使用 `config_android.json`，由兼容客户端创建系统 VPN；同意 Android VPN 授权。

固定 IPv4 包括：IPv4 TUN 地址、IPv4 解析、空 AAAA、拒绝进入 sing-box 的 IPv6 流量、过滤 IPv6 字面地址服务器，以及清理 WireGuard 的 IPv6 地址。它不会修改系统全局 IPv6 设置；没有进入代理/VPN 的流量不受本配置控制。

## DNS 更新

已采用作者方案，替换上一版的未知 DNS 国内优先：国内及 FakeIP 排除规则按作者列表处理，未知 A 先经 Google 评估，国内响应转阿里，其余按 FakeIP 规则处理。仅用 IPv4 FakeIP，继续返回空 AAAA 和拒绝 IPv6。AI 业务仍默认走 VPS；国外真实 DNS 查询使用作者的 Google，经节点选择。

## 从旧分组升级

模板地址及脚本参数保持原样。在 Sub-Store 文件管理中同时刷新远程 JSON 模板和 `inject-nodes.js`，预览确认以上八个分组后保存，再更新客户端的生成文件链接。不要在已注入的 JSON 上重复运行脚本。新的缓存 ID 用于避开旧分组选择；首次导入使用表中的默认值。

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

如需手动设置系统或软件代理，地址填写 `127.0.0.1`、端口 `7890`。此端口仅允许本机连接。非 TUN 模板仍自动设置系统代理，Android 模板仍使用 VPN 入口。
