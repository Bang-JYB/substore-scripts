# 验证记录（2026-10-04）

- 使用官方 sing-box 1.14.2 Linux amd64 发布包。
- 三份由虚构机场/VPS节点生成的配置均通过 `sing-box check`。
- 自动化检查：八个策略组、机场/VPS 两个测速池、AI 默认 VPS、安卓仅 TUN、桌面 `127.0.0.1:7890`、IPv4 DNS、IPv6 拒绝、UDP 443 拒绝、14 份远程规则均经 `rules-via-proxy` 的 HTTP/1.1 下载器。
- 远程规则 URL 的仓库和路径已通过 GitHub API 核对。

不包含真实设备、真实订阅或真实节点的连通性验证。

## 7a72e9f 最小规则整改（2026-10-20）

基线 main `f7d41f1653d362204fed5b19c6bba9cb8b4f8335` 的完整 tree 与 `7a72e9f56637a50cbf89a6c0a32df8cb1e7c7c26` 相同，已建立回滚分支 `backup/before-minimal-rules-20261020-f7d41f1`。本轮独立分支 `audit/7a72e9f-minimal-rules-20261020`，提交 PR 后不合并。

### 实际整改及证据

- 六份 JSON 各删除一条 QQ/Tencent 专用 DNS 和一条强制直连路由，QQ 音乐使用普通分类，不强制走代理。
- 上游 [Microsoft](https://github.com/MetaCubeX/meta-rules-dat/blob/sing/geo/geosite/microsoft.json) 包含 `domain_suffix: microsoft.com`，[AI](https://github.com/MetaCubeX/meta-rules-dat/blob/sing/geo/geosite/category-ai-!cn.json) 包含 `domain_suffix: copilot.microsoft.com`。旧版静态复现 Copilot 先命中 Microsoft direct，DNS 也先命中 ali；GitHub 已在 Microsoft 之前，无需再改。
- 组合版仅将现有 AI 路由移到 Apple/Microsoft 之前；现有 GitHub DNS 规则的 rule_set 扩为 GitHub+AI，仍复用 google 解析器。不添加域名特例、DNS 服务器或查询回退。AI 业务仍默认 VPS；其 DNS 复用原 google（经节点选择），并不声称 DNS 也固定同一 VPS 节点。
- VPS 独立版只删除 QQ 覆盖，不加入 AI 规则集或 UDP 阻断；Microsoft 分类内的 AI 服务仍按独立版原行为。本轮 AI 优先级整改范围是组合版。
- 两份注入脚本逐字节不变；所有其他 DNS、FakeIP、缓存、resolve、规则下载、策略组、入站、IPv4/双栈、MTU、测速和节点字段保持基线。没有重新搭建旧复杂整改架构或六任务 CI。

### 原单条 UDP 443 规则的真实边界

三份组合版均保留原来的 `{network: udp, port: 443, action: reject}`，没有移动、扩展或增加拒绝规则。sing-box 的 route 是终结动作，提前选中出站的连接不再继续匹配后面的 reject。

| Rule 模式请求 | 当前结果 |
| --- | --- |
| GitHub / Google / YouTube / Telegram UDP443 | 提前代理，原单条拒绝不覆盖 |
| AI UDP443 | 提前走 AI工具；Copilot 本轮由误直连改为 AI工具 |
| 到达末尾的普通 foreign / 未分类公网 UDP443 | 拒绝 |
| 国内、Apple/Microsoft、LAN | 原直连；私网 IP 仍更早直连 |
| 相同目标 TCP443、其他 UDP | 原出站分类；仅 Copilot 等 AI 重叠目标修正为 AI工具 |
| DNS UDP53 | 原 sniff + hijack-dns 顺序 |
| Direct / Global | 原模式终结规则在拒绝之前，不新增阻断 |
| VPS 独立版 UDP443 | 原行为，无新增拒绝 |

因此，不能将本版描述为“所有代理 UDP443 都已阻断”。若要求统一覆盖，最小候选是**仍保留一条**：放到首个代理业务路由前，限定“明确代理分类，或排除原全部直连分类后的兜底”，同时保留 LAN/模式优先。单纯上移无条件拒绝会误伤国内；单纯放末尾无法覆盖提前代理。这会改变匹配条件，需另轮确认和分类重叠验证，**本 PR 不实施**。

没有修改 HY2/TUIC 协议自身的 UDP/TLS/SNI/认证或服务器端口。官方核心 check 只证明完整配置可接受，不等于真实 HY2/TUIC/VPS 连通测试。

### 轻量检查与限制

仅新增一份 Node 标准库检查文件，无 npm 依赖、无新测试框架或 GitHub Actions。Node 18+，完整 Git checkout 中运行：

```sh
node checks/minimal-rules.mjs --core /绝对路径/sing-box-1.14.2
```

先在未改的六份 JSON 上运行，QQ 残留及 Copilot 优先级断言失败。最小修改后 **23 项检查通过、0 跳过**；其中核心校验注入虚构 HY2/TUIC/机场节点，六份完整配置全部 `sing-box check` 成功。静态夹具核对普通国内/GeoIP/LAN、GitHub/AI、UDP 边界、八组、香港保留、英国/台湾/信息过滤、机场/VPS 独立池、双栈及原字段不变。不给 --core 时核心项会明确跳过，不能计为核心通过。

已确认的独立旧限制：组合脚本若有两个不同服务器使用同一源 tag `dup`，随后节点 detour 引用 `dup`，会静默指向后出现的节点。用 TEST-NET 虚构节点已复现；本 PR 不改注入器。若实际订阅涉及该情况，另开最小修复，仅拒绝有引用的同名歧义，不重构整个节点转换流程。常规唯一名称夹具分池正常，不代表所有真实 Sub-Store 输出都已验证。

Windows/macOS/Android 入站按模板生成并通过官方 Linux 核心解析，不等于这三类设备实际 TUN、网络、网页首包或下载吞吐验收。没有本轮真实性能 A/B 数据，不声称提速；节点域名解析、单解析器故障、首次无缓存规则下载、系统 LAN 名称等原有限制未改。

### 试用与回滚

PR 未合并时，复制现有 Sub-Store 远程文件，仅将六份模板 URL 的 `/main/` 改为 `/audit/7a72e9f-minimal-rules-20261020/`；保留原注入脚本。刷新模板缓存、重新生成/导入，固定同一具体节点后重启。组合订阅仍使用 YBsSB2 + VPS，VPS 独立版仍使用原单订阅。先实际检查网页和下载，再决定是否合并。

回滚试用：切回原文件或将模板 URL 换回 `/7a72e9f56637a50cbf89a6c0a32df8cb1e7c7c26/`；两份脚本没有改变。若以后合并，revert 本 PR 即可；不删除规则/DNS 缓存，不改 VPS 设置。回到历史基线会同时恢复当时的 QQ 专用覆盖，这是回滚的范围，不能误称其已经删除。

主要规范依据是官方 [v1.14.2 文档](https://github.com/SagerNet/sing-box/tree/v1.14.2/docs/configuration)：DNS、Route/Rule Action、Rule Set、Selector/URLTest、TUN/Mixed、Dial/Domain Resolver。只调整已证明的分类问题，没有照搬官网后续版本字段或第三方复杂模板。
