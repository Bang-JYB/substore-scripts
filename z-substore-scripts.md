# Sub-Store 设置：YBsSB2 组合订阅，固定 IPv4

最终节点取自组合订阅 **`YBsSB2`**，它包含你的 `LXY_SUB` 和 `VPS`。
脚本额外读取单订阅 `VPS`，只用来比对节点配置、识别自建来源；不会把未被组合选入的 VPS 节点额外加入。
香港节点保留；流量、套餐、到期等信息节点会被过滤。

## 1. 新建三个文件

在 Sub-Store「文件管理」分别新建文件，来源选择「远程文件」：

| 用途 | 模板地址 |
|---|---|
| Windows / macOS，TUN | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_tun.json` |
| Windows / macOS，非 TUN 系统代理 | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_pc.json` |
| Android，VPN 模式 | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_android.json` |

这些 JSON 是节点尚未填入的模板，不能直接作为客户端配置使用。

## 2. 每个文件添加一条脚本操作

先移除原来的两条 Xream 模板注入操作，再添加下面这**一条远程文件脚本**：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-nodes.js#name=YBsSB2&type=collection&vps_name=VPS&vps_type=subscription
```

可视化参数编辑器对应填写：

| 参数 | 值 | 含义 |
|---|---|---|
| `name` | `YBsSB2` | 最终使用的组合订阅内部名称 |
| `type` | `collection` | 读取组合订阅，也支持「组合订阅」 |
| `vps_name` | `VPS` | 用于识别自建来源的内部名称 |
| `vps_type` | `subscription` | VPS 属于单订阅 |

请核对 Sub-Store 编辑页的内部「名称」，它可能与列表显示名称不同；如果更名，修改上述参数即可。
脚本默认值就是这四项。脚本不接受订阅 URL、token，也没有开启 IPv6 的参数。

## 3. 预览、保存，再导入客户端

预览中应出现下面八个分组：

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

- 固定 AI 使用某个 VPS：`AI工具` 保持选择 `VPS`，再到 `VPS` 组选具体节点。
- 普通国外流量也走 VPS：在 `节点选择` 里选 `VPS`；机场自动测速池仍保持隔离。
- 日志里会输出机场/VPS 节点数、各项过滤数量和配置体积，不会输出节点名称或密码。

保存成功后，把 **Sub-Store 生成文件的下载链接**导入兼容 sing-box 1.14.2 内核的客户端。

## 出错时的提示

| 提示 | 含义与处理 |
|---|---|
| 没有可用机场节点 / 没有可识别的 IPv4 VPS 节点 | 对应节点池为空。核对组合订阅是否选入了两个来源，以及 VPS 来源名称、类型是否填对 |
| 链式拨号依赖缺失或已被过滤 / 目标存在重名节点 | 某个节点的 `detour` 指向的节点被过滤或重名，先改名或取消过滤 |
| 请移除旧注入脚本，并使用原始 JSON 模板 | 文件源不是仓库里的空模板，或叠加了旧的 Xream 脚本 |
| 配置过大 | 缩进后超过 4 MiB 传输上限，减少组合订阅选入的节点 |

遇到不认识的节点类型时，脚本只会跳过并在日志里计数；同名但配置不同的节点会自动加 ` [2]` 之类的后缀。
任一节点池为空、来源识别失败或拨号依赖成环时，脚本报错并停止输出，不会自动直连。

## 设备设置

- **电脑 TUN**：Windows/macOS 使用 `config_tun.json`；开启客户端 TUN 并授予所需权限。
- **电脑非 TUN**：使用 `config_pc.json`，关闭 TUN。本地 HTTP/SOCKS 地址为 `127.0.0.1:7890`，保留 `set_system_proxy: true` 自动设置系统代理。macOS 自动设置是否成功取决于客户端权限，必要时手动设置同一地址。
- **Android**：使用 `config_android.json`，由兼容客户端创建系统 VPN，并同意 Android VPN 授权。安卓模板有意不含 `clash_api`。

固定 IPv4 包括：IPv4 TUN 地址、IPv4 解析、空 AAAA、拒绝进入 sing-box 的 IPv6 流量、过滤 IPv6 字面地址服务器，以及清理 WireGuard 的 IPv6 地址。它不会修改系统全局 IPv6 设置；没有进入代理/VPN 的流量不受本配置控制。

## 更新

模板地址和脚本参数不变。更新时在 Sub-Store 文件管理中同时刷新远程 JSON 模板和 `inject-nodes.js`，预览确认八个分组后保存，再更新客户端的生成文件链接。不要在已注入的 JSON 上重复运行脚本。

规则以内置快照的形式随模板发布，不由客户端自动下载；更新流程和历史变更见 [CHANGELOG.md](CHANGELOG.md)。
