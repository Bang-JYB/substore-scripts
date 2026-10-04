# substore-scripts

面向官方 sing-box **1.14.2** 的三端 Sub-Store 文件模板，最终使用组合订阅 **YBsSB2**。保留香港，固定 IPv4。

| 文件 | 用途 |
|---|---|
| `config_tun.json` | macOS / Windows，TUN |
| `config_pc.json` | macOS / Windows，非 TUN 系统代理 |
| `config_android.json` | Android，VPN |
| `inject-nodes.js` | 从组合订阅注入节点、识别 VPS 来源、校验空池与环路 |

安装步骤和完整地址见 [z-substore-scripts.md](z-substore-scripts.md)。每个模板只添加一条 `inject-nodes.js` 文件脚本，并移除旧的两条 Xream 注入操作。变更历史见 [CHANGELOG.md](CHANGELOG.md)，验证记录见 [VALIDATION.md](VALIDATION.md)。

## 分流策略

- AI 自定义域名和 AI 规则集优先走 `AI工具`；Google、YouTube、GitHub、Telegram 和明确的国外流量走 `节点选择`；未知流量走 `漏网之鱼`，默认跟随 `节点选择`。
- `.cn`、国内域名及国内 IP 直连；国内 Apple/Microsoft/Steam/游戏和 OneDrive 直连。
- DNS 沿用 qichiyuhub 的 windows.json：阿里/腾讯/本地/hosts/Google + IPv4 FakeIP，Google 经 `节点选择`；拒绝 HTTPS/SVCB，开启乐观缓存。国内和 FakeIP 排除域名按作者过滤表处理；未知 A 查询先由 Google 评估响应，国内响应转阿里，其余进入 FakeIP。
- 路由与 DNS 共用同一张国内域名表和同一张国外域名表。不在表里的国内域名，靠 DNS 评估加 `geoip-cn` 判定直连。
- 仅按端口阻断 UDP 443，在 Direct/Global 模式也优先生效；TCP 443、STUN 和其他 UDP 不受影响。
- 固定 IPv4：DNS `ipv4_only`、空 AAAA、IPv4 TUN、拒绝 IPv6 流量；节点域名用直连 IPv4 DNS，IPv6 字面地址服务器被过滤。
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

`自动选择` 只测速机场节点，`VPS-自动` 只测速自建节点；桌面测速间隔 30 分钟，安卓 1 小时。`VPS` 订阅内部名称与客户端的 `VPS` 策略组是不同概念，来源参数仍为 `vps_name=VPS`。

## 来源识别

脚本读取 `YBsSB2` 组合订阅，并用 `VPS` 单订阅比对协议、服务器、凭据和拨号设置等完整节点配置。比较不依赖节点名称，改名后的 VPS 仍能识别；只添加组合选入的节点。

若组合订阅修改了 VPS 的协议或拨号配置、过滤掉全部 VPS，或者内部名称与显示名称不同，来源比对可能失败，脚本会停止生成。VPS 凭据只在你自己的 Sub-Store 环境里参与内存比对，不写进仓库或日志。

香港保留，不按名称过滤 HK。机场主来源需保持为你的 LXY；组合再加入第三种来源时，其非 VPS 节点也会归入机场池。

## 使用边界

JSON 是空节点模板，须经 Sub-Store 文件脚本生成后再导入客户端。只设置系统代理并不接管所有软件或全部 UDP；配置也不修改系统全局 IPv6 设置。TUN 使用通用字段，不写死接口名称，不使用 Linux 专属的 `auto_redirect`。三平台运行仍需在真实设备上验证。

客户端更新 Sub-Store 订阅链接发生在新配置运行之前，本配置不能修复更新链路本身。测速延迟不能代表吞吐或 AI 服务的可用性。

## 规则快照与更新

规则以 `inline` 形式内置，客户端启动不下载规则，不依赖 CDN 或缓存。快照日期 2026-10-03，每份模板约 0.92 MB（紧凑）、缩进后约 1.65 MiB，低于客户端 4 MiB 的 gRPC 上限。脚本按缩进后的体积检查，超限时停止生成。

规则不会自动更新。更新时需要重新取得上游数据、用官方内核解码，再更新三个模板和 `RULE_SOURCES.json`；然后同时刷新 Sub-Store 的远程模板和 `inject-nodes.js`，预览、保存并更新客户端。

[RULE_SOURCES.json](RULE_SOURCES.json) 记录规则来源、原始文件摘要和内置数据摘要，以及已移除的规则表。[THIRD_PARTY.md](THIRD_PARTY.md) 保留第三方来源说明。

## 开发与验证

无 npm 依赖，Node.js 18+：

```
node test.mjs
```

加入官方内核检查：

```
SING_BOX=/absolute/path/to/sing-box node test.mjs
```

Windows PowerShell 可先设置 `$env:SING_BOX = 'C:\path\sing-box.exe'`。测试仅使用虚构节点。不要提交生成后的真实配置、订阅 URL/token、服务器凭据或私钥。

## 参考

DNS 源自 [作者 windows.json](https://github.com/qichiyuhub/rule/blob/main/config/singbox/1.14X/windows.json)，三端采用同一套逻辑。适配包括：作者的「默认代理」映射为 `节点选择`；DNS 专用规则集保留 `dns-` 前缀，国内/国外域名表与路由共用；批量规则标签展开为官方内核支持的单条定义；额外保留空 AAAA 与 IPv6 拒绝。Google、FakeIP、evaluate、响应匹配、ECS、TTL 和缓存参数均保留。

沿用 AI 域名补充列表和 [qichiyuhub/rule 的 Sub-Store 模板思路](https://github.com/qichiyuhub/rule/blob/main/config/singbox/1.14X/z-substore-scripts.md)。字段依据官方 1.14.2 文档：[DNS](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/dns/index.md)、[TUN](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/tun.md)、[mixed](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/mixed.md)、[HTTP Client](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/shared/http-client.md)、[MetaCubeX 规则数据](https://github.com/MetaCubeX/meta-rules-dat/tree/sing)。
