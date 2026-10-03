# 第三方规则数据

本版将上游规则数据转换为 sing-box inline headless rules，转换日期为 2026-10-03。只改变存储形式，保留原始规则标签和匹配内容。源文件 URL、SHA-256、格式版本及转换后规则摘要见 [RULE_SOURCES.json](RULE_SOURCES.json)。

- MetaCubeX/meta-rules-dat：https://github.com/MetaCubeX/meta-rules-dat ，业务分流数据来自 sing 分支的 geo/geosite 与 geo/geoip。该仓库发布的 GPL-3.0 许可全文保留于 [LICENSE.third-party-GPL-3.0.txt](LICENSE.third-party-GPL-3.0.txt)，适用于其嵌入的数据及相关派生部分；上游及各原始数据贡献者的声明继续适用。
- SagerNet/sing-geosite：https://github.com/SagerNet/sing-geosite ，作者 DNS 的地理域名规则来自 rule-set 分支。
- SagerNet/sing-geoip：https://github.com/SagerNet/sing-geoip ，作者 DNS 的国内 IP 规则来自 rule-set 分支。
- qichiyuhub/rule：https://github.com/qichiyuhub/rule ，作者的两个 FakeIP 排除规则来自 rules/fakeipfilter-cn.json 与 rules/fakeipfilter-!cn.json。
- 解码工具：官方 SagerNet/sing-box 1.14.2 `rule-set decompile`；未将内核二进制放入本仓库。

配置中的 inline JSON 是可编辑的规则数据，未嵌入节点凭据、订阅 URL 或 token。源数据按各上游声明提供，无连通性、适用性或持续更新保证。本说明不改变用户原创的节点注入脚本及其他独立文件的许可。
