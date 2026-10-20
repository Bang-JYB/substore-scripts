# VPS 单订阅独立配置

只读取 Sub-Store 单订阅 `VPS`（可改名），不需要机场、组合订阅或 YBsSB2。可放入多个厂商的 VPS 节点。主文档的 [DNS/备用、规则缓存、TUN 和排障说明](README.md) 同样适用。

## 模板与使用

| 场景 | 模板 | 入站 | VPS自动间隔 |
| --- | --- | --- | --- |
| Windows/macOS TUN | config_vps_standalone.json | TUN + 127.0.0.1:7890 HTTP/SOCKS | 5m |
| Windows/macOS 非 TUN | config_vps_notun.json | 仅 127.0.0.1:7890，不自动设置系统代理 | 5m |
| Android VPN | config_vps_android.json | 仅 TUN，IPv4/IPv6 | 10m |

1. 建立单订阅，内部名称为 VPS，确认可预览。
2. 建立远程文件，模板地址例如：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_vps_standalone.json
```

3. 仅添加本脚本，不同时添加 inject-nodes.js：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-vps-standalone.js#name=VPS
```

4. 预览中应有 `VPS选择`、`VPS自动` 和 direct，所有订阅节点在同一 VPS 池。把 **Sub-Store 生成文件**导入客户端，不直接导入空策略组的 GitHub 模板。白名单仅接收 sing-box 1.14.2 的服务器代理类型：shadowsocks、vmess、vless、trojan、hysteria、hysteria2、tuic、anytls、naive、ssh、shadowtls、http、socks、snell。策略组、未知/已移除类型及 WireGuard endpoint/Tor 等非服务器代理不在范围；若没有可用节点或链路依赖被过滤，停止生成。白名单不代替核心字段/构建能力校验。

## 参数

| 参数 | 默认值 | 行为 |
| --- | --- | --- |
| name | VPS | 单订阅内部名称；名字含空格、中文或 & 时在 URL 中编码参数值 |
| strategy | prefer_ipv4 | 保留双栈，域名优先 IPv4；可选 prefer_ipv6，不凭空生成另一地址族的节点 |
| mode | tun | `mixed` 只移除模板中的 TUN；若会删空入站（如 Android 模板）则明确报错，改用桌面模板或默认 tun |
| rules_dir | 空 | 可选客户端本地规则种子目录；不是 Sub-Store 服务器目录 |

例如：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-vps-standalone.js#name=VPS&strategy=prefer_ipv6
```

noTUN 模板本身没有 TUN，无需另外加 mode。用桌面 TUN 模板加 `mode=mixed` 也可只保留 HTTP/SOCKS。Android 使用默认 mode，不加 mixed。使用其他客户端须确认支持 sing-box 1.14.2 字段，这不是通用 Surge 配置。

## 行为与边界

- Rule 模式：局域网优先，已收录国内/Apple/Microsoft 直连；QQ 音乐没有专用直连覆盖，按通用规则分流；GitHub 和 AI 在微软直连之前走 VPS。未匹配业务规则的域名先 resolve，再根据国内/私有地址直连，否则走 VPS。
- DNS 保留 A/AAAA。直连阿里失败才切换腾讯；国外 Google 失败才切换同一代理组内的 Cloudflare。NXDOMAIN/NODATA 不触发备用；国内两个 DNS 都失败不会改走海外节点。local DNS 处理局域网域名。
- 节点服务器 bootstrap 仍是显式直连解析；它与应用 DNS 备用不是同一层。整个应用还可能使用未收录服务、自带 DNS 或已经建立的 IPv6 连接，不能保证其所有请求都不依赖节点。
- 两个策略组和节点池保留；默认选择 VPS自动，手动固定节点不会因测速而被重新选择。测速是连通性/延迟测试，不能代表下载带宽。切换默认不主动中断既有连接。
- 保留协议、TLS/SNI、服务器地址与认证字段；节点按完整配置去重。源 tag/detour 按原始字符串精确匹配，不修剪引用去猜节点；只规范输出显示名，碰撞时唯一编号。支持类型缺少 server（SS/Snell 的有效 ShadowTLS 包装例外）、原始名称冲突、依赖缺失、direct 名称歧义、detour 自引用或循环都会报错，不静默改指向。
- 被引用的 ShadowTLS 辅助出站保留供 detour 使用，但不进入手动/自动选择池；不改变测速周期。
- 不新增 UDP 443 限制。已有 127.0.0.1:9090 本地管理接口不变；不能与另一份同端口配置同时启动。
- 远程规则仍走 VPS 并每 7 天更新；现在包含 geosite-cn/private、geoip-cn、Apple、Microsoft、GitHub、AI、foreign。首次运行无缓存/种子且所有节点不可用时仍不能初始化。

## 可选离线首次启动

```bash
python scripts/prepare-rule-seeds.py --config config_vps_standalone.json --output offline-seeds --core /绝对路径/sing-box
```

把全部 `{tag}.srs` 文件放到客户端可读的目录，脚本参数加 `rules_dir=offline-seeds`。核心先使用缓存，再使用 initial_path，最后才要求首次下载；种子不是永久内嵌规则，远程更新照常保留。沙盒客户端需额外确认文件部署位置，详见主文档。

## 更新、验证和回滚

刷新 Sub-Store 模板和脚本的远程缓存，重新预览/保存/更新客户端，然后停止并启动服务。
[VALIDATION.md](VALIDATION.md) 记录完整配置检查、DNS 故障和缓存恢复测试；这些不等于真实设备播放稳定性验收。
本轮小修回滚：将模板和注入脚本 URL 中 `/main/` 同时换为 `/d54ee16043e95fa0787af40b0f1cdf09da59240e/`，再重新生成/导入；该版本会恢复 QQ 专用覆盖，仍有本轮已证明的空格引用及组合孤立辅助候选问题。更早一轮回滚见 AUDIT.md。
不要公开真实节点配置、订阅密钥或 Sub-Store 私有分享链接；仓库测试只使用保留地址和虚构认证。
