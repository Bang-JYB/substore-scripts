# VPS 单订阅独立配置

只读取 Sub-Store 的一份单订阅；订阅中可包含 Oracle 或任何其他厂商的多个 VPS 节点。
不需要机场，不需要组合订阅，也不需要 YBsSB2。

## 文件分工

- config_vps_standalone.json：独立 sing-box 配置模板，没有真实节点和密钥。
- inject-vps-standalone.js：读取指定单订阅，把节点填入模板并生成两个策略组。

模板的节点列表留空是正常的；须经过脚本生成后再导入客户端。
Sub-Store 订阅转换支持的服务器代理协议可以使用；WireGuard endpoint 等非服务器 outbounds 不在此脚本支持范围。

## Sub-Store 使用步骤

1. 在“订阅”中新建单订阅，例如内部名称 VPS，放入几个 VPS 节点，先确认订阅能预览。
2. 在“文件”中新建远程文件，内部名称例如 VPS-SingBox，远程链接填写：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/config_vps_standalone.json
```

3. 添加一条“远程文件脚本”，填写：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-vps-standalone.js#name=VPS
```

name 使用单订阅内部名称，而不是备注或文件名称；参数区单独填写时，name 填 VPS 即可。
不要添加旧 inject-nodes.js 或 inject-vps-dualstack.js。

4. 预览：VPS选择包含 VPS自动 和该订阅所有可转换的节点；VPS自动包含同一批节点。
5. 保存文件，将 Sub-Store 生成文件的下载/分享链接导入 sing-box 客户端。不要直接导入 GitHub 模板。
6. 在客户端 VPS选择中，选 VPS自动 使用自动选择；点某个节点名称则固定使用该节点。

另一份订阅的内部名称如 MyVPS，只需另建远程文件，沿用同一模板，把脚本参数改为 #name=MyVPS。
名称含中文、空格或 & 等字符时，将参数值 URL 编码，或在界面参数编辑器填写原始名称。

## 可选设置

| 参数 | 默认值 | 用法 |
| --- | --- | --- |
| name | VPS | 单订阅内部名称 |
| strategy | prefer_ipv4 | 同时保留 IPv4、IPv6，域名优先 IPv4；prefer_ipv6 则优先 IPv6 |
| mode | tun | TUN/VPN 模式；桌面只使用 HTTP/SOCKS 时可选 mixed |

优先 IPv6：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-vps-standalone.js#name=VPS&strategy=prefer_ipv6
```

桌面不开 TUN：

```text
https://raw.githubusercontent.com/Bang-JYB/substore-scripts/main/inject-vps-standalone.js#name=VPS&mode=mixed
```

mixed 模式需在使用代理的应用中设置 HTTP/SOCKS 地址 127.0.0.1:7890，模板不自动设置系统代理。
TUN 默认支持 IPv4/IPv6 地址，在桌面客户端开启 TUN，Android 使用 VPN。
请使用与现有仓库相同的 sing-box 1.14.2 或兼容配置字段的版本。

## 行为说明

- VPS自动使用 HTTPS 请求测试延迟，间隔 5 分钟、容差 50 ms；这是延迟/连通性测试，不是下载带宽测试。
- 默认选择 VPS自动；手动选节点后不会因为自动测试而改变手动选择。
- 私有地址直连，其他流量通过 VPS选择；没有附加机场分组、国家过滤或中国网站直连规则。
- DNS 支持 A 和 AAAA，不屏蔽 IPv6；节点域名用直连阿里 DoH 解析，业务域名用选中的 VPS 访问 Google DoH。
- IPv6 地址节点需要客户端网络具备可用 IPv6；不能凭 IPv6 地址自动推导 IPv4。
- 保留协议、TLS/SNI、服务器地址和认证字段，不会把单个 IP 节点拆成凭空生成的双栈节点。
- 节点按配置去重；重名且配置不同、缺失链式依赖或循环依赖时停止生成，防止错误配置。
- 只有支持的节点会进入输出；若前置订阅操作已删除 IPv6 节点，脚本无法恢复它们。
- 切换节点默认保留现有入站连接，新连接使用新的选择。
- 与旧配置使用相同的本地端口 7890 和 9090，选择其中一份配置启动，避免同时启动造成端口冲突。
- 真实凭据只在 Sub-Store 生成的私人配置中。不要将生成配置提交到公开 GitHub，也不要公开 Sub-Store 私有分享链接。

## 验证

使用虚构 IPv4、IPv6、域名节点验证单订阅读取、手动和自动候选、TLS 保留、
去重、重名、链式依赖以及错误参数。TUN 和 mixed 两种生成配置均通过官方 sing-box 1.14.2 check。
未读取真实节点密钥，未进行真实节点连通性或真实 Sub-Store 后端运行验收。

参考：
- https://sing-box.sagernet.org/configuration/outbound/selector/
- https://sing-box.sagernet.org/configuration/outbound/urltest/
- https://sing-box.sagernet.org/configuration/shared/dial/
