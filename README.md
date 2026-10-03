# substore-scripts

面向官方 sing-box **1.14.2** 的三端 Sub-Store 文件模板，最终使用组合订阅 **YBsSB2**。保留香港，固定 IPv4。

| 文件 | 用途 |
|---|---|
| `config_tun.json` | macOS / Windows，TUN |
| `config_pc.json` | macOS / Windows，非 TUN 系统代理 |
| `config_android.json` | Android，VPN |
| `inject-nodes.js` | 从组合订阅注入节点、识别 VPS 来源、校验空池与环路 |

安装步骤和完整地址见 [z-substore-scripts.md](z-substore-scripts.md)。每个模板只添加一条 `inject-nodes.js` 文件脚本，移除旧的两条 Xream 注入操作。

## 分流策略

- `LXY-自动` 只测速机场节点；`VPS-自动` 单独测速自建节点，AI 默认走 VPS。桌面测速间隔 30 分钟，安卓 1 小时。
- AI 自定义域名和 AI 规则集优先走 `AI`；Google、YouTube、GitHub、Telegram、明确国外和未知流量走 `LXY`。
- `.cn`、国内域名及国内 IP 直连；国内 Apple/Microsoft/Steam/游戏和 OneDrive 直连。
- DNS 沿用作者模板：阿里/腾讯/本地/hosts/Google + IPv4 FakeIP，Google 经 LXY。拒绝 HTTPS/SVCB，开启乐观缓存；国内和 FakeIP 排除域名按作者过滤表处理，未知 A 查询先由 Google 评估响应，国内响应转阿里，其余进入 FakeIP。AI 业务流量仍按路由走 VPS。
- 仅按端口阻断 UDP 443；这条规则在 Direct/Global 模式也优先生效。TCP 443、STUN 和其他 UDP 不因它被拒绝。
- 规则集通过 `hc-direct` 直连下载，默认使用 jsDelivr CDN；不依赖 gh-proxy。启动需要规则源可达，之后可使用已缓存规则。
- DNS `ipv4_only`、空 AAAA、IPv4 TUN、IPv6 流量拒绝；节点域名用直连 IPv4 DNS，IPv6 字面地址服务器过滤。
- 空机场/VPS 池停止生成；同配置去重、保留名称重映射、拨号依赖校验和环路保护。不会自动把 AI 改为直连。

## 来源识别

脚本实际读取 `YBsSB2` 组合订阅，并用截图中的 `VPS` 单订阅比对协议、服务器、凭据和拨号设置等完整节点配置。比较不依赖节点名称，因此普通名称、改名的 VPS 仍能识别；只添加组合选入的节点。

若组合订阅对 VPS 的协议或拨号配置做了修改、过滤掉全部 VPS，或者内部名称与显示名称不同，来源比对可能失败，脚本会停止生成。应统一两个来源的转换设置并核对名称。VPS 凭据只在自己的 Sub-Store 环境参与内存比对，不写进仓库或日志。

香港保留，不根据名称过滤 HK。机场主来源需保持为你的 LXY；组合加入第三种来源时，其非 VPS 节点也会归入机场池。

## 使用边界

JSON 是空节点模板，须经 Sub-Store 文件脚本生成后再导入客户端。只设置系统代理并不接管所有软件或全部 UDP；配置也不修改系统全局 IPv6 设置。

TUN 采用通用字段，不写死接口名称，不使用 Linux 专属 `auto_redirect`。桌面非 TUN 保留自动系统代理；macOS 权限及客户端能力会影响自动设置。三平台运行仍需在你的真实设备上验证。

DNS 已按你最新要求采用作者方案，取代上一版“未知 DNS 国内优先”。FakeIP 范围为 `198.19.0.0/16`，无 IPv6 FakeIP；增加 `store_fakeip` 保留映射并使用新的缓存 ID。测速延迟不能代表吞吐或 AI 服务可用性。客户端更新 Sub-Store 订阅的链接发生在新配置运行之前，本配置不能修复更新链路本身。

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

DNS 源自 [作者 windows.json](https://github.com/qichiyuhub/rule/blob/main/config/singbox/1.14X/windows.json)，三端采用同一套逻辑。适配包括：作者“默认代理”映射为 `LXY`，DNS 规则集加 `dns-` 前缀以保持业务路由规则不变，作者的批量规则标签展开为官方内核支持的单条定义，规则源去掉 gh-proxy 并通过直连 CDN 下载；额外保留空 AAAA 和 IPv6 拒绝。作者的 Google、FakeIP、evaluate、响应匹配、ECS、TTL 和缓存参数均保留。

沿用你上传模板的 AI 域名补充列表和 [qichiyuhub/rule 的 Sub-Store 模板思路](https://github.com/qichiyuhub/rule/blob/main/config/singbox/1.14X/z-substore-scripts.md)，重写节点注入以支持组合来源识别和空池保护。

你提供的 [视频](https://www.youtube.com/watch?v=B6zcuUo2bJ0)未取得完整字幕，字段依据以可读取的仓库及官方 1.14.2 文档为准：[DNS](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/dns/index.md)、[TUN](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/tun.md)、[mixed](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/inbound/mixed.md)、[HTTP Client](https://github.com/SagerNet/sing-box/blob/v1.14.2/docs/configuration/shared/http-client.md)、[MetaCubeX 规则数据](https://github.com/MetaCubeX/meta-rules-dat/tree/sing)。

不要提交生成后的真实配置、订阅 URL/token、服务器凭据或私钥。
