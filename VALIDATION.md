# 验证记录（2026-10-04 版）

只记录本次实际运行过的检查；没有运行的明确写出。

## 已运行

| 检查 | 命令 / 方法 | 结果 |
|---|---|---|
| 自动化测试 | `node test.mjs`（Node.js v22.22.2） | PASS，300 项检查，0 项内核检查 |
| 引用完整性 | 脚本遍历三份模板的 `route` 与 `dns` 规则 | 全部规则集标签存在，无未使用的规则集 |
| 三端一致性 | 比较三份模板 | DNS 与 `route.rule_set` 完全一致 |
| 与上一版对比 | 比较分组、`dns.servers/final/strategy/fakeip/optimistic/cache_capacity`、`route.rules` | 全部不变（仅 DNS 规则里的规则集标签有替换） |
| 体积 | 本地测量 | 紧凑约 0.92 MB；缩进 2 格 1.65 MiB；缩进 4 格 2.37 MiB |
| 真实规则数据抽样 | `test.mjs` 中的域名回归 | AI、国外常用、国内常用域名的路由和 DNS 路径符合预期 |

## 未运行（发布前请自行完成）

| 检查 | 方法 |
|---|---|
| 官方内核检查 | `SING_BOX=/absolute/path/to/sing-box node test.mjs`，应为三份模板各自通过 `sing-box check` |
| 真实 Sub-Store 输出 | 在 Sub-Store 中预览生成结果，确认八个分组和节点数量；`produceArtifact` 的真实输出格式只用虚构数据模拟过 |
| 真机导入 | Windows/macOS TUN、非 TUN，Android 各导入一次，确认不再出现 gRPC 体积报错 |
| 路由实测 | AI 站点走 VPS、国外站点走 `节点选择`、国内站点直连，并抽查几个小表未覆盖的国内域名 |

## 说明

- 测试只使用虚构节点，不包含真实订阅或凭据。
- 规则快照日期 2026-10-03，来源与摘要见 `RULE_SOURCES.json`。
