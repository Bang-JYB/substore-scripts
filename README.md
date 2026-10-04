# YBsSB2 Sub-Store / sing-box 配置

这是重新编写的 sing-box 1.14.2 配置。只保留三个模板和一个节点注入脚本。

- 固定 IPv4：DNS 只解析 IPv4，AAAA 返回空结果，IPv6 流量拒绝。
- 保留香港节点。
- UDP 443 拒绝；TCP 443 和其他 UDP 不受影响。
- 最终节点来自组合订阅 `YBsSB2`，以单订阅 `VPS` 识别自建节点。
- 三端统一八个策略组：`节点选择`、`自动选择`、`VPS`、`VPS-自动`、`AI工具`、`漏网之鱼`、`🎯 全球直连`、`GLOBAL`。
- `自动选择`只测速机场节点，`VPS-自动`只测速 VPS；`AI工具`默认 VPS。
- DNS 结构按 qichiyuhub 的 1.14X Windows 模板重写：阿里、腾讯、本地、Google、FakeIP 与响应评估逻辑仍在。为满足禁用 IPv6，额外把 AAAA 查询返回空答案。

## 选择模板

| 场景 | 模板地址 | 客户端设置 |
| --- | --- | --- |
| Windows / macOS，开启 TUN | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_tun.json` | 启用 TUN；HTTP/SOCKS 代理地址为 `127.0.0.1:7890` |
| Windows / macOS，不开启 TUN | `https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_pc.json` | 启用系统代理；HTTP/SOCKS 代理地址为 `127.0.0.1:7890` |
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

模板本身约 10 KB，节点脚本在生成结果超过 1 MiB 前会停止，不再把大规则内嵌到 Sub-Store 输出。业务规则在客户端首次启动时通过当前“节点选择”下载，并固定 HTTP/1.1；之后由 sing-box 缓存并每 7 天更新一次。首次启动前，`节点选择`必须能连接到外网。

`NGHTTP2_ENHANCE_YOUR_CALM` 发生在 Windows 客户端下载远程配置时，往往早于新配置启动。此次重写降低了下载内容，但不能用配置字段直接控制客户端自己的内部 HTTP/2/gRPC 通道。若仍出现该错误，用 Sub-Store 的“预览”先确认生成成功，再下载生成的本地 JSON 导入客户端；同时查看 Sub-Store 反向代理和后端的 HTTP/2 日志。

## 验证

使用官方 sing-box 1.14.2 检查过三份由虚构节点生成的配置：八组、分池、7890、IPv4、UDP 443、远程规则集和三端入站字段均通过。未使用真实订阅、节点密码或 token。

参考：

- [sing-box HTTP Client 1.14.2](https://sing-box.sagernet.org/configuration/shared/http-client/)
- [sing-box Rule Set](https://sing-box.sagernet.org/configuration/rule-set/)
- [qichiyuhub/rule Windows 1.14X 模板](https://github.com/qichiyuhub/rule/blob/main/config/singbox/1.14X/windows.json)
- [MetaCubeX meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat/tree/sing)
