# YBsSB2 Sub-Store / sing-box 配置

这是 sing-box 1.14.2 配置仓库，包含六份 JSON 配置和两份节点注入脚本：组合订阅版三份、VPS 独立版三份，分别配合各自的注入脚本使用。

- Rule 模式下，六份模板均将 `js.design` 及全部子域名设为直连，并使用原有直连 DNS；包含官网、编辑器及 `img` / `data` / `ds` / `download` 等资源子域名。Direct/Global 模式与组合版 IPv4 限制保持原行为。
- VPS 三份模板在 Rule 模式拒绝原本走代理的 UDP 443：提前拦截 GitHub 分类，末尾拦截未匹配直连的流量；国内、LAN、即时设计、DNS 和其他 UDP 不受新增拒绝影响。组合版原单条拒绝规则保持原有相对顺序。

- 固定 IPv4：DNS 只解析 IPv4，AAAA 返回空结果，IPv6 流量拒绝。
- 保留香港节点。
- QQ 音乐没有专用 DNS/直连规则，遵循普通分流。组合版原单条 UDP 443 限制及位置保留；提前命中 GitHub/AI/Google 等代理规则的 UDP 443 不会到达该拒绝规则，覆盖边界见 [本轮验证](VALIDATION.md)。
- 最终节点来自组合订阅 `YBsSB2`，以单订阅 `VPS` 识别自建节点。
- 三端统一八个策略组：`节点选择`、`自动选择`、`VPS`、`VPS-自动`、`AI工具`、`漏网之鱼`、`🎯 全球直连`、`GLOBAL`。
- `自动选择`只测速机场节点，`VPS-自动`只测速 VPS；`AI工具`默认 VPS。
- DNS 结构按 qichiyuhub 的 1.14X Windows 模板重写：阿里、腾讯、本地、Google、FakeIP 与响应评估逻辑仍在；国内 IP 判断改为先查询直连阿里 DNS。为满足禁用 IPv6，额外把 AAAA 查询返回空答案。

## 选择模板

| 场景 | 模板地址 | 客户端设置 |
| --- | --- | --- |
| Windows / macOS，开启 TUN | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_tun.json` | 仅启用 TUN，不修改系统代理；如个别应用需要，可手动使用 HTTP/SOCKS `127.0.0.1:7890` |
| Windows / macOS，不开启 TUN | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_pc.json` | 不启用系统代理；需要代理的应用可手动使用 HTTP/SOCKS `127.0.0.1:7890` |
| Android | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_android.json` | 在 sing-box Android 启动 VPN |

## Sub-Store 填写

每个场景单独建立一个“远程文件”。给该文件添加**唯一一条**远程文件脚本，且放在所有会改动节点/策略组的操作之后：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-nodes.js#name=YBsSB2&vps_name=VPS
```

| 参数 | 填写值 |
| --- | --- |
| `name` | `YBsSB2` |
| `vps_name` | `VPS` |

先“预览”，应只看到八个策略组；保存后再更新客户端。脚本将组合中的 VPS 归入 VPS 池，其他 IPv4 节点归入机场池。若提示没有 VPS，检查 `YBsSB2` 组合订阅确实包含 VPS，且 VPS 的转换设置与单订阅 `VPS` 一致。

## 规则下载与 Windows 更新

模板本身约 10 KB，节点脚本在生成结果超过 1 MiB 前会停止，不再把大规则内嵌到 Sub-Store 输出。业务规则在客户端首次启动时通过“节点选择”代理下载上游 GitHub 文件，并固定 HTTP/1.1；之后由 sing-box 缓存并每 7 天更新一次。首次启动需要配置中至少一个可用代理节点。

`NGHTTP2_ENHANCE_YOUR_CALM` 发生在 Windows 客户端下载远程配置时，往往早于新配置启动。此次重写降低了下载内容，但不能用配置字段直接控制客户端自己的内部 HTTP/2/gRPC 通道。若仍出现该错误，用 Sub-Store 的“预览”先确认生成成功，再下载生成的本地 JSON 导入客户端；同时查看 Sub-Store 反向代理和后端的 HTTP/2 日志。

## 验证

使用官方 sing-box 1.14.2 检查过三份由虚构节点生成的配置：八组、分池、7890、IPv4、UDP 443、远程规则集和三端入站字段均通过。未使用真实订阅、节点密码或 token。

参考：

- [sing-box HTTP Client 1.14.2](https://sing-box.sagernet.org/configuration/shared/http-client/)
- [sing-box Rule Set](https://sing-box.sagernet.org/configuration/rule-set/)
- [qichiyuhub/rule Windows 1.14X 模板](https://github.com/qichiyuhub/rule/blob/main/config/singbox/1.14X/windows.json)
- [MetaCubeX meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat/tree/sing)

## 国内播放与服务直连修复（2026-10-12）

- 本轮已删除六份模板的 QQ/QQMusic/GTImg 等专用覆盖，QQ 音乐跟随普通分类；苹果/微软原直连保留，组合版 GitHub/AI 优先于这些直连规则。Global/全局模式仍遵循原有选择。
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

## GitHub 代理优先级修复（2026-10-13）

上游微软完整规则集也包含 GitHub。六份模板均在苹果/微软直连规则之前增加 GitHub 专用路由与 DNS 规则：组合版使用节点选择与代理 Google DNS，VPS 独立版使用 VPS选择与 proxy-dns。覆盖范围由上游 github.srs 维护，包含主站、API、静态资源、原始文件和下载资源等。Direct/Global 模式仍遵循原有模式选择。

刷新 Sub-Store 远程模板缓存，重新生成并更新客户端配置，然后停止/启动服务。保持 Rule 模式及同一可用节点，测试 github.com、api.github.com、raw.githubusercontent.com 和资源下载。
