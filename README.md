# substore-scripts

面向官方 sing-box **1.14.2** 的三端 Sub-Store 文件模板，最终使用组合订阅 **YBsSB2**。保留香港，固定 IPv4。

| 文件 | 用途 |
|---|---|
| `config_tun.json` | macOS / Windows，TUN + 本地 HTTP/SOCKS 7890 |
| `config_pc.json` | macOS / Windows，非 TUN 系统代理 |
| `config_android.json` | Android，VPN |
| `inject-nodes.js` | 从组合订阅注入节点、识别 VPS 来源、校验空池与环路 |

安装步骤和完整地址见 [z-substore-scripts.md](z-substore-scripts.md)。每个模板只添加一条 `inject-nodes.js` 文件脚本，移除旧的两条 Xream 注入操作。

## 分流策略

- `自动选择` 只测速机场节点；`VPS-自动` 只测速自建节点。桌面测速间隔 30 分钟，安卓 1 小时。
- `VPS` 是手动选择组，默认 `VPS-自动`；固定 VPS 节点只需在这里选择。`AI工具` 默认 `VPS`，`节点选择` 也可切换到同一 `VPS` 组。
- AI 自定义域名和 AI 规则集优先走 `AI工具`；Google、YouTube、GitHub、Telegram和明确国外流量走 `节点选择`；未知流量走 `漏网之鱼`，默认跟随 `节点选择`。
- `.cn`、国内域名及国内 IP 直连；国内 Apple/Microsoft/Steam/游戏和 OneDrive 直连。
- DNS 沿用作者模板：阿里/腾讯/本地/hosts/Google + IPv4 FakeIP，Google 经节点选择。拒绝 HTTPS/SVCB，开启乐观缓存；国内和 FakeIP 排除域名按作者过滤表处理，未知 A 查询先由 Google 评估响应，国内响应转阿里，其余进入 FakeIP。AI 业务流量仍按路由走 VPS。
- 仅按端口阻断 UDP 443；这条规则在 Direct/Global 模式也优先生效。TCP 443、STUN 和其他 UDP 不因它被拒绝。
- 原有 21 份外部规则已完整内置为 `inline`，加上 AI 自定义列表共 22 份。客户端启动不下载规则，无需 CDN、规则缓存或额外文件；不会因规则源连接重置而卡住启动。
- DNS `ipv4_only`、空 AAAA、IPv4 TUN、IPv6 流量拒绝；节点域名用直连 IPv4 DNS，IPv6 字面地址服务器过滤。
- 空机场/VPS 池停止生成；同配置去重、保留名称重映射、拨号依赖校验和环路保护。不会自动把 AI 改为直连。

## 分组与选择

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

`VPS` 订阅内部名称与客户端的 `VPS` 策略组是不同概念；来源参数仍为 `vps_name=VPS`。机场测速不会因手动选择 VPS 而混入 VPS；AI 与普通国外流量都选 VPS 时，共享该组的手动选择。

## 来源识别

脚本实际读取 `YBsSB2` 组合订阅，并用截图中的 `VPS` 单订阅比对协议、服务器、凭据和拨号设置等完整节点配置。比较不依赖节点名称，因此普通名称、改名的 VPS 仍能识别；只添加组合选入的节点。

若组合订阅对 VPS 的协议或拨号配置做了修改、过滤掉全部 VPS，或者内部名称与显示名称不同，来源比对可能失败，脚本会停止生成。应统一两个来源的转换设置并核对名称。VPS 凭据只在自己的 Sub-Store 环境参与内存比对，不写进仓库或日志。

香港保留，不根据名称过滤 HK。机场主来源需保持为你的 LXY；组合加入第三种来源时，其非 VPS 节点也会归入机场池。

## 使用边界

JSON 是空节点模板，须经 Sub-Store 文件脚本生成后再导入客户端。只设置系统代理并不接管所有软件或全部 UDP；配置也不修改系统全局 IPv6 设置。

TUN 采用通用字段，不写死接口名称，不使用 Linux 专属 `auto_redirect`。桌面 TUN 同时监听 `127.0.0.1:7890` 的 HTTP/SOCKS 代理，程序可手动指定该地址；TUN 模板的 `set_system_proxy` 为 `false`，需要系统代理时自行开启。桌面非 TUN 保留自动系统代理；macOS 权限及客户端能力会影响自动设置。三平台运行仍需在你的真实设备上验证。

DNS 已按你最新要求采用作者方案，取代上一版“未知 DNS 国内优先”。FakeIP 范围为 `198.19.0.0/16`，无 IPv6 FakeIP；增加 `store_fakeip` 保留映射并使用新的缓存 ID。测速延迟不能代表吞吐或 AI 服务可用性。客户端更新 Sub-Store 订阅的链接发生在新配置运行之前，本配置不能修复更新链路本身。

## 规则快照与更新

2026-10-03：将原配置的 21 份规则源完整解码后内置，保留全部规则标签和匹配数据，没有删减国内 IP、国外域名或作者 DNS 过滤表。三个模板每份约 3.02 MB（十进制），采用紧凑 JSON，全部规则保持完整。节点注入后也保持紧凑输出。

客户端不再每天独立下载规则。更新规则需要重新从上游取得数据、使用官方内核解码并更新三个模板及 `RULE_SOURCES.json`；随后同时刷新 Sub-Store 远程模板及 `inject-nodes.js`、预览保存并更新客户端。只更新客户端已有的 Sub-Store 链接，不会自动拉取上游规则的最新数据。

[规则来源与 SHA-256](RULE_SOURCES.json)记录原始文件及内置匹配数据的摘要。[第三方来源说明](THIRD_PARTY.md)保留来源及适用声明。

## gRPC 配置大小修复

`grpc: received message larger than max (5948321 vs. 4194304)` 表示传输消息超过客户端的 4 MiB 上限。三份模板去除格式化空白，脚本使用 `JSON.stringify(config)` 紧凑输出；分组、作者 DNS、禁用 IPv6 和全部内置规则保持原样。

**必须同时刷新对应远程 JSON 模板和 `inject-nodes.js`**，然后预览、保存，更新客户端配置并重启。旧脚本会把紧凑模板重新格式化为约 5.9 MB；只刷新模板或只刷新客户端都不足以完成更新。

脚本按 UTF-8 字节计数，并在输出超过 **4,128,768 字节**时停止生成，为 4 MiB 消息包装预留 64 KiB。若组合订阅包含大量节点或附加数据导致触发大小提示，请减少组合订阅选入的节点后重新生成。日志只输出字节数，不输出节点密码。

## 开发与验证

无 npm 依赖，Node.js 18+：

```bash
node test.mjs
```

加入官方内核检查：

```bash
SING_BOX=/absolute/path/to/sing-box node test.mjs
```

Windows PowerShell 可先设置 `$env:SING_BOX = 'C:\path\sing-box.exe'`。测试仅用虚构节点，不生成真实配置到公开仓库。验证结果见 [VALIDATION.md](VALIDATION.md)。

## 参考

DNS 源自 [作者 windows.json](https://github.com/qichiyuhub/rule/blob/main/config/singbox/1.14X/windows.json)，三端采用同一套逻辑。适配包括：作者“默认代理”映射为 `节点选择`，DNS 规则集加 `dns-` 前缀以保持业务路由规则不变，作者的批量规则标签展开为官方内核支持的单条定义，规则数据完整内置以免启动依赖外部下载；额外保留空 AAAA 和 IPv6 拒绝。作者的 Google、FakeIP、evaluate、响应匹配、ECS、TTL 和缓存参数均保留。

沿用你上传模板的 AI 域名补充列表和 [qichiyuhub/rule 的 Sub-Store 模板思路](https://github.com/qichiyuhub/rule/blob/main/config/singbox/1.14X/z-substore-scripts.md)，重写节点注入以支持组合来源识别和空池保护。

你提供的 [视频](https://www.youtube.com/watch?v=B6zcuUo2bJ0)未取得完整字幕，字段依据以可读取的仓库及官方 1.14.2 文档为准：[DNS](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/dns/index.md)、[TUN](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/tun.md)、[mixed](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/mixed.md)、[HTTP Client](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/shared/http-client.md)、[MetaCubeX 规则数据](https://github.com/MetaCubeX/meta-rules-dat/tree/sing)。

不要提交生成后的真实配置、订阅 URL/token、服务器凭据或私钥。
