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

- `LXY-自动`：只含来自组合订阅的机场节点；香港节点保留。
- `VPS-自动`：只含组合中匹配 VPS 来源的自建节点。
- `LXY` 默认选 `LXY-自动`；`VPS` 默认选 `VPS-自动`；`AI` 默认选 `VPS`。
- 任一节点池为空、来源识别失败、同名不同配置或拨号依赖环路时，脚本报错并停止输出；不会自动直连。

保存成功后，把 **Sub-Store 生成文件的下载链接**导入兼容 sing-box 1.14.2 内核的客户端。
三份模板使用相同的分流和作者 DNS 策略，区别是入站方式和桌面/安卓默认测速频率。DNS 包含 Google 响应评估、IPv4 FakeIP、HTTPS/SVCB 拒绝和乐观缓存；更新时请同时刷新远程模板及文件脚本，再预览、保存。

## 设备设置

- **电脑 TUN**：Windows/macOS 使用 `config_tun.json`；开启客户端 TUN 并授予所需权限。
- **电脑非 TUN**：使用 `config_pc.json`，关闭 TUN。本地 HTTP/SOCKS 地址为 `127.0.0.1:7890`；保留 `set_system_proxy: true` 自动设置系统代理。macOS 自动设置是否成功取决于客户端权限，必要时手动设置同一代理地址。
- **Android**：使用 `config_android.json`，由兼容客户端创建系统 VPN；同意 Android VPN 授权。

固定 IPv4 包括：IPv4 TUN 地址、IPv4 解析、空 AAAA、拒绝进入 sing-box 的 IPv6 流量、过滤 IPv6 字面地址服务器，以及清理 WireGuard 的 IPv6 地址。它不会修改系统全局 IPv6 设置；没有进入代理/VPN 的流量不受本配置控制。

## DNS 更新

已采用作者方案，替换上一版的未知 DNS 国内优先：国内及 FakeIP 排除规则按作者列表处理，未知 A 先经 Google 评估，国内响应转阿里，其余按 FakeIP 规则处理。仅用 IPv4 FakeIP，继续返回空 AAAA 和拒绝 IPv6。AI 业务仍默认走 VPS；国外真实 DNS 查询使用作者的 Google，经 LXY。
