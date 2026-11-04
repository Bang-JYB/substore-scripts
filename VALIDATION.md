# 验证记录

## 当前：全部客户端统一 IPv4-only（2026-11-04，覆盖 PR #14 首稿）

main 仍为 `f22a5528c05f7f1e628f03c89704a5a10ebf9aa6`，沿用 PR #14 / `fix/node-ipv4-only-20261104`，不新增 PR 或开发分支、不合并。主线备份 `backup/main-before-node-ipv4-20261104` 不变；另已创建并重新读取 `backup/pr14-before-all-ipv4-20261104`，指向首稿 `7aeb67485db74ec4dcf0a69c91671e7c1eaf0632`。

### 必要差异

- 组合版三份 JSON 和 `inject-nodes.js` 已满足要求，逐字节保留。VPS 三份模板把 DNS、Direct、默认解析、规则下载解析四处 strategy 改为 `ipv4_only`；只新增 AAAA 空响应与 `ip_version: 6` / `reject` 两条规则。前者优先于 DNS 模式分流，后者在 sniff 后、DNS/LAN/模式/代理分类前，避免 IPv6 私网或 Direct/Global 放行。
- VPS 注入器固定 `ipv4_only`，不再读取或校验 `args.strategy`，删除双栈切换功能；旧链接中遗留的该参数被忽略，测试证明不能重新启用 IPv6。保留首稿的 IPv6 字面量过滤、日志提示和 detour 断链/循环拒绝。
- DNS 服务器、缓存、FakeIP、route.resolve、国内/LAN 的 IPv4、AI/GitHub/即时设计/Apple/Microsoft、UDP443 原规则、八组/分池、节点字段、TUN stack/MTU/地址、端口及测速均不改。仅按用户本轮要求取消 IPv6 业务支持。
- 保留 TUN 原 IPv6 地址用于接管后拒绝，不删除地址以避免把该项误当成系统 IPv6 禁用。mixed 中未使用代理的应用，以及未被 TUN 捕获的系统流量不在配置控制范围；不修改操作系统 IPv6 或服务端。

### 官方 1.14.4 依据与边界

固定版本 [DNS Lookup](https://github.com/SagerNet/sing-box/blob/v1.14.4/dns/client.go) 的 `ipv4_only` 仅查 A；[DNS action](https://github.com/SagerNet/sing-box/blob/v1.14.4/docs/configuration/dns/rule_action.md) 支持 `predefined` 空响应；[Route rule](https://github.com/SagerNet/sing-box/blob/v1.14.4/docs/configuration/route/rule.md) 支持 `ip_version: 6`，配合官方 `reject`。直接沿用组合版已有方式，不新增自定义机制。

客户端统一 IPv4 不修改 VPS 本身的双栈配置；如果客户端预先解析目标为 IPv4，则该次代理连接可能使用 IPv4 出口。实际传递域名时，远端选择仍取决于服务端/协议。CDN 到源站由 CDN 决定，不要求本轮额外实现远端双栈优选。

### 验证

先更新断言，在 PR #14 首稿复现 14 项失败；应用最小变更后，39 项 Node 检查全部通过。官方 1.14.4 和兼容性基准 1.14.2 各检查六份完整生成配置，均成功，0 跳过；实际输出及输入哈希见 [checks/results/all-client-ipv4-20261104.log](checks/results/all-client-ipv4-20261104.log)。

覆盖六模板的 AAAA 空响应、IPv6 LAN/TCP/UDP/53/443/8443 在 Rule/Direct/Global 下拒绝；节点 IPv6 过滤、旧优选参数无效、Direct/默认/规则下载策略、CDN TLS/WS/认证及链式依赖；原 IPv4 国内/海外/AI/GitHub/即时设计/UDP443/QQ/八组分池仍通过。通过精确差异断言防止 IPv4 以外字段变化。路由结果属于静态夹具，核心 check 不执行真实连接；执行器 netlink 受限，不宣称 Windows/macOS/Android 实机 IPv4 或真实 HY2/TUIC 连接通过。

### 试用及回滚

VPS 试用文件的“内容”模板 URL 与“操作”注入脚本 URL **都**改用 `/fix/node-ipv4-only-20261104/`，刷新两者缓存；保留原 name/mode，删除旧 strategy 参数（遗留也无效）。预览确认 ipv4_only、AAAA 空响应、优先 IPv6 拒绝，重新生成并更新客户端，停止/启动后固定节点测试。组合版无需修改试用链接。实际设备检查 IPv4 网站及直连/代理正常，IPv6 字面量目标（含 LAN）失败；核对核心 TCP/UDP 远端地址及 TUN 捕获范围，不能以浏览器出口 IP 代替。

回滚到生产版：恢复模板和脚本的 main URL（当前 main 未改），重新生成、更新并重启客户端；需要固定版本时使用 main 备份对应的完整 SHA。只回到 PR 首稿可用 `backup/pr14-before-all-ipv4-20261104`。若以后合并，用独立 revert PR 回滚，不强推、不删除任何备份，不修改 VPS。

## 历史：PR #14 首稿仅限制节点（2026-11-04；已被上方统一策略取代）

基线 main：`f22a5528c05f7f1e628f03c89704a5a10ebf9aa6`，PR #13 已合并；开放 PR #9 不混入。备份 `backup/main-before-node-ipv4-20261104` 已通过 GitHub ref 重新读取验证，指向同一基线。开发分支 `fix/node-ipv4-only-20261104`，提交 PR 后等待实机测试，不合并。

### 最小差异与官方依据

- 唯一生产改动在 `inject-vps-standalone.js`：每个服务器节点的解析固定为 `vps-dns` / `ipv4_only`；过滤 IPv6 字面量并报告；全部过滤或过滤后 detour 缺失时停止生成。原 detour 映射和环检测复用，不重构。IPv4、CDN 域名、TLS/SNI/WS/认证和命名保持原样。
- 六份 JSON 与基线逐字节相同，`inject-nodes.js` 与历史基线相同。组合版已使用 `ipv4_only` 并过滤 IPv6；不重复添加规则。全局 DNS、Direct、默认解析继续使用原 `strategy` 参数，包含 `prefer_ipv6`；未改服务端。
- 官方固定版本 [Dial Fields](https://github.com/SagerNet/sing-box/blob/v1.14.4/docs/configuration/shared/dial.md) 将代理 `domain_resolver` 的作用域定义为服务器域名，Direct 的作用域为请求域名。[dns/client.go](https://github.com/SagerNet/sing-box/blob/v1.14.4/dns/client.go) 的 `Lookup` 在 `ipv4_only` 分支只调用 A 查询；`prefer_ipv4` 则仍有 A/AAAA 两个分支。
- [dialer.go](https://github.com/SagerNet/sing-box/blob/v1.14.4/common/dialer/dialer.go) 对显式指定 `domain_resolver.server` 的 detour 节点仍包装解析器；[resolve.go](https://github.com/SagerNet/sing-box/blob/v1.14.4/common/dialer/resolve.go) 将解析后的地址交给拨号器，IP 字面量不重新解析。无 A 记录时，[dns/router.go](https://github.com/SagerNet/sing-box/blob/v1.14.4/dns/router.go) 将空结果转为解析错误，不创建 IPv6 回退。
- 普通 HY2/TUIC 使用同一出站拨号器，未更改外层 UDP 443 或 QUIC 参数。原独立注入器只接收有 `server` 的 outbounds；endpoint、无 server 的 Realm 等不在原支持范围，本次不新增协议路径或声称这些特殊模式已验证。

### A/B/C/D 与双栈边界

| 路径 | 本次行为 |
| --- | --- |
| A 客户端解析/连接节点服务器 | 固定 IPv4-only；detour 链中所有保留的服务器节点同样处理 |
| B 本地 Direct 访问网站 | 原业务策略、DNS 服务器及路由不变，不改为 IPv4-only |
| C 客户端预先解析代理目标 | 原 `route.resolve`、系统/应用解析和协议行为不变；可能把目标 IP 传给 VPS，并非保证服务端自主解析 |
| D VPS 接收到目标域名 | 在协议允许且实际传递域名时由服务端决定解析/出口；客户端节点解析策略不配置远端服务器 DNS 或出口 |

官方 [route action](https://github.com/SagerNet/sing-box/blob/v1.14.4/docs/configuration/route/rule_action.md) 明确 `resolve` 将请求域名解析成 IP；[route/conn.go](https://github.com/SagerNet/sing-box/blob/v1.14.4/route/conn.go) 对已有目标地址列表的请求采用地址拨号路径。故只能保证本次不新增目标 IPv4 限制，不能声称所有请求保持域名到达 VPS。组合版原有整体 IPv4/FakeIP 策略也不改。强制所有目标由 VPS 自主双栈解析属于另一个路由/协议/服务端问题，本次不实施。

CDN 的 A 记录对应 IPv4 边缘；CDN 到源站由 CDN 配置和网络决定，不等于客户端控制了源站的连接地址族。真实 VPS 的 IPv6 路由、防火墙、DNS 和协议是否可用，本次没有权限或实测证据。

### 测试与限制

先添加针对性断言，旧脚本下 4 项检查失败（仍保留 IPv6 字面量，节点解析仍随 prefer 策略）；修改后现有 Node 检查扩展到 33 项，全部通过。包括两种业务策略/三份 VPS 模板与旧输出的逐字段对照、CDN 原始字段、IPv4、AAAA-only 策略、IPv6 各种字面量、detour/direct 链、IPv6 ShadowTLS 依赖被过滤时拒绝生成及环检测。未删原有分流/QQ/UDP443/分池检查；原“保留 VPS IPv6 服务器”断言按本次明确需求改为排除。

官方 1.14.4 与原 1.14.2 分别检查六份完整生成配置（含虚构 HY2/TUIC/CDN 节点），33/33 通过、0 跳过。结果和输入哈希见 [checks/results/node-ipv4-20261104.log](checks/results/node-ipv4-20261104.log)。1.14.4 发布包 SHA256：`699a1b510aa4396b2176d32d1181920399ebf1e267835da6f3b598d0f7c24968`，与官方 release asset digest 一致。

尝试官方 1.14.4 `tools fetch` 配合纯回环 HTTP 代理和官方 hosts DNS 的最小连接实验，核心初始化报 `create netlink socket: operation not permitted`，未进入 DNS/连接阶段。因此没有把连接实验、实际 A/AAAA 查询次数、AAAA-only 运行时错误或 Windows/macOS/Android 实机连接计为通过。地址族约束的证据是生成结果和官方源码，核心 `check` 只证明配置可接受；本次不声称真实 VPS 双栈、CDN 或 HY2/TUIC 连通通过。

### 实机试用与回滚

1. 复制当前 Sub-Store 远程文件，六份模板 URL 保持原样；只把 VPS 注入脚本 URL 的 `/main/` 改为 `/fix/node-ipv4-only-20261104/`，原 `#name=...&strategy=...&mode=...` 参数全部保留。组合版无需替换脚本。刷新远程脚本缓存，重新生成并更新客户端，停止/启动服务，固定同一节点再建新连接。
2. 预览确认节点（包括链式辅助节点）为 `ipv4_only`，全局 DNS、direct 和默认解析仍为原 prefer 策略，域名/TLS/WS 字段完全不变，IPv6 字面量不在池中。
3. Windows 用核心进程 TCP 连接表，macOS 用核心进程 `lsof -nP -a -p <PID> -iTCP` 或抓包，核对到节点/CDN 服务器端口的远端为 IPv4；HY2/TUIC 应核对 UDP，不能只查 TCP。不要以浏览器出口 IP 或 curl 的 `-4/-6` 证明节点外层地址族。
4. 有现成 AAAA-only 节点时，确认新连接明确解析失败、不会出现 IPv6 外连；仅 IPv6 字面量订阅应在 Sub-Store 停止生成。不要为测试删除生产域名的 A 记录。
5. 分别在 Windows 移动、macOS 电信、Android 上检查国内/LAN、即时设计、GitHub/AI、TUN/mixed 和下载。真实 VPS 若需确认双栈，仅由用户在服务端做只读网络测试；不调整 IPv6/路由/BBR。
6. 不理想时停用试用文件，恢复原文件/脚本 URL（原始基线可固定为 `/f22a5528c05f7f1e628f03c89704a5a10ebf9aa6/`），重新生成订阅并更新、重启客户端。旧 `prefer_ipv6` 将恢复包括节点解析在内的旧行为；不会恢复 QQ 专用规则。若以后合并，用独立 revert PR 撤销本轮，不强推 main；保留备份分支，不删除缓存或更改服务端。

## 即时设计直连与 VPS UDP 443（2026-10-30）

基线：main `3b2607b111e74d9f3d31577902e75647f757a58f`。独立分支 `fix/jsdesign-direct-20261030`；不自动合并。

### 范围与证据

- 用户要求即时设计直连，并为 VPS 独立版增加 UDP 443 阻断。这是明确的分流变更；未声称已复现或解决用户设备的慢速原因。
- 实际读取官网 https://js.design/ 、生产常量 https://js.design/constant.js 和编辑器入口 https://js.design/jsdesign 。生产常量使用 `/backend`、`img.js.design`、`data.js.design`；编辑器还引用 `ds.js.design`、`download.js.design`。一条 `domain_suffix: ["js.design"]` 覆盖根域名和全部子域名，无须逐个列举。
- 未将外链产品、开发环境、统计平台或共享 CDN 整段直连。编辑器入口可读取，但部分 CDN JS 返回 HTTP 403；未登录客户端或读取真实文件，不能声称已枚举所有第三方依赖。若设备端仍有慢请求，应根据连接记录追加经过确认的专用主机，不能盲加云厂商根域名。
- 六份模板各新增一条直连 DNS 和一条 `direct` 路由，均位于 Direct/Global 模式规则之后、分类规则之前。组合版 AAAA/HTTPS/SVCB 及 IPv6 限制不变。VPS 双栈与 `strategy` 参数不变。
- VPS 每份再增加两条拒绝：GitHub 分类的 UDP 443 在其代理路由前拒绝；其他 UDP 443 在原国内/GeoIP 直连之后、最终代理之前拒绝。即时设计直连优先。Direct/Global 不新增拒绝；组合版原单条 UDP 443 规则及相对优先级不改。
- 两份注入 JS、所有节点协议字段、DNS 服务器、FakeIP、缓存、route.resolve、TUN、MTU、端口及测速参数不变；未恢复 QQ/Tencent 专用覆盖。

### 实际检查

先运行原有检查（22 项通过、核心项明确跳过），再添加断言：未修改模板时新增直连与 VPS 拒绝断言失败。应用最小规则后，29 项全部通过、0 跳过，包含官方 sing-box 1.14.2 对六份注入虚构节点的完整配置检查。真实输出与输入哈希保存于 [checks/results/minimal-rules-20261030.log](checks/results/minimal-rules-20261030.log)。

覆盖：根域名及资源/未知子域名、分类冲突、近似域名不误匹配、Direct/Global、国内/GeoIP/LAN、DNS、TCP443、UDP443/8443、VPS IPv4/IPv6、组合版 IPv6 限制，以及原有八组/分池/QQ/AI/GitHub/注入器回归。单独拒绝 GitHub 与末尾拒绝的对象、数量和位置也固定验证。

上述路由匹配属于静态夹具；官方核心 `check` 验证接受完整配置。没有 Windows/macOS/Android 实机性能数据、真实 HY2/TUIC 外层 UDP443 连通/下载测试或本轮 GitHub CI 成功记录，不将其描述为已通过。

### 试用与回滚

PR 合并前，main 不会包含本次变更。试用时仅复制 Sub-Store 远程文件，并将六份模板中正在使用的对应模板 URL 的 `/main/` 替换为 `/fix/jsdesign-direct-20261030/`；继续使用原注入脚本及参数，刷新模板缓存，重新生成、更新客户端并重启。原生产文件保持不动。

不理想时切回原文件；若以后合并，可通过独立 revert 提交撤销本 PR，不强推 main。基线 `3b2607b111e74d9f3d31577902e75647f757a58f` 保留，可用于恢复旧模板后重新生成订阅。既有 QQ 专用规则删除仍然保留。

## 历史验证（2026-10-04；以下为当时结果）

- 使用官方 sing-box 1.14.2 Linux amd64 发布包。
- 三份由虚构机场/VPS节点生成的配置均通过 `sing-box check`。
- 自动化检查：八个策略组、机场/VPS 两个测速池、AI 默认 VPS、安卓仅 TUN、桌面 `127.0.0.1:7890`、IPv4 DNS、IPv6 拒绝、UDP 443 拒绝、14 份远程规则均经 `rules-via-proxy` 的 HTTP/1.1 下载器。
- 远程规则 URL 的仓库和路径已通过 GitHub API 核对。

不包含真实设备、真实订阅或真实节点的连通性验证。

## 7a72e9f 最小规则整改（2026-10-20）

基线 main `f7d41f1653d362204fed5b19c6bba9cb8b4f8335` 的完整 tree 与 `7a72e9f56637a50cbf89a6c0a32df8cb1e7c7c26` 相同，已建立回滚分支 `backup/before-minimal-rules-20261020-f7d41f1`。本轮独立分支 `audit/7a72e9f-minimal-rules-20261020`，提交 PR 后不合并。

### 实际整改及证据

- 六份 JSON 各删除一条 QQ/Tencent 专用 DNS 和一条强制直连路由，QQ 音乐使用普通分类，不强制走代理。
- 上游 [Microsoft](https://github.com/MetaCubeX/meta-rules-dat/blob/sing/geo/geosite/microsoft.json) 包含 `domain_suffix: microsoft.com`，[AI](https://github.com/MetaCubeX/meta-rules-dat/blob/sing/geo/geosite/category-ai-!cn.json) 包含 `domain_suffix: copilot.microsoft.com`。旧版静态复现 Copilot 先命中 Microsoft direct。PR 首稿另有 AI/GitHub 重叠问题：`copilot-proxy.githubusercontent.com` 先进入节点选择，本次复现后修正。
- 组合版只移动现有 AI 路由，顺序为 **AI工具 → GitHub 节点选择 → Apple/Microsoft 直连**。AI 分类重叠时优先 AI工具，默认 VPS；普通 github.com、api.github.com 仍走节点选择。不添加逐域名生产规则。
- 撤回 PR 首稿的 AI DNS 扩展；六份 DNS 的完整对象严格等于 7a72e9f，仅删除 QQ 专用规则。google 解析器仍经节点选择，既有 GitHub DNS 不变。旧 Copilot/Microsoft 分类仍走 ali，Gemini 等未提前命中的 A 查询仍可用原 FakeIP；不将这些原行为描述为全部 AI DNS 已走 VPS。
- DNS 扩展没有业务路由优先级修复所必需的依据：它把部分原 ali/FakeIP 的 AI 首次 A 查询改为经节点选择的代理 DoH，引入该阶段的代理等待和节点池依赖；不能据此断言所有请求总耗时增加。没有实机延迟证据，本轮按要求保留旧 DNS，不新增服务器、重试或回退。原 GitHub/AI 重叠域名仍命中既有 GitHub DNS，经节点选择；这项原依赖并未消除。
- VPS 独立版只删除 QQ 覆盖，不加入 AI 规则集或 UDP 阻断；Microsoft 分类内的 AI 服务仍按独立版原行为。本轮 AI 优先级整改范围是组合版。
- 两份注入脚本逐字节不变；所有其他 DNS、FakeIP、缓存、resolve、规则下载、策略组、入站、IPv4/双栈、MTU、测速和节点字段保持基线。没有重新搭建旧复杂整改架构或六任务 CI。

### 原单条 UDP 443 规则的真实边界

三份组合版均保留原来的 `{network: udp, port: 443, action: reject}`，没有移动、扩展或增加拒绝规则。sing-box 的 route 是终结动作，提前选中出站的连接不再继续匹配后面的 reject。

| Rule 模式请求 | 当前结果 |
| --- | --- |
| GitHub / Google / YouTube / Telegram UDP443 | 提前代理，原单条拒绝不覆盖 |
| AI UDP443（包括与 GitHub 重叠的 Copilot） | 提前走 AI工具，默认 VPS；原末尾拒绝仍不覆盖 |
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

先在未改的六份 JSON 上运行，QQ 残留及 Copilot 优先级断言失败；本次也在 PR 首稿配置上复现了 GitHub/AI 重叠目标选错组。更新后 **23 项检查通过、0 跳过**；其中核心校验注入虚构 HY2/TUIC/机场节点，六份完整配置全部 `sing-box check` 成功。完整实际命令、核心版本/哈希、六配置与检查脚本的输入哈希及 TAP 输出保存于 [checks/results/minimal-rules-20261020.log](checks/results/minimal-rules-20261020.log)，不是仅依据本文声明。没有 GitHub CI 记录，不宣称 CI 通过。

静态夹具核对普通国内/GeoIP/LAN、AI 优先 GitHub、普通 GitHub、UDP 边界、八组、香港保留、英国/台湾/信息过滤、机场/VPS 独立池、双栈及原字段不变；新增断言保证 DNS 除 QQ 删除外完整等于历史版本。不给 --core 时核心项会明确跳过，不能计为核心通过。

已确认的独立旧限制：组合脚本若有两个不同服务器使用同一源 tag `dup`，随后节点 detour 引用 `dup`，会静默指向后出现的节点。用 TEST-NET 虚构节点已复现；本 PR 不改注入器。若实际订阅涉及该情况，另开最小修复，仅拒绝有引用的同名歧义，不重构整个节点转换流程。常规唯一名称夹具分池正常，不代表所有真实 Sub-Store 输出都已验证。

Windows/macOS/Android 入站按模板生成并通过官方 Linux 核心解析，不等于这三类设备实际 TUN、网络、网页首包或下载吞吐验收。没有本轮真实性能 A/B 数据，不声称提速；节点域名解析、单解析器故障、首次无缓存规则下载、系统 LAN 名称等原有限制未改。

### 试用与回滚

PR 未合并时，复制现有 Sub-Store 远程文件，仅将六份模板 URL 的 `/main/` 改为 `/audit/7a72e9f-minimal-rules-20261020/`；保留原注入脚本。刷新模板缓存、重新生成/导入，固定同一具体节点后重启。组合订阅仍使用 YBsSB2 + VPS，VPS 独立版仍使用原单订阅。先实际检查网页和下载，再决定是否合并。

回滚试用：切回原文件或将模板 URL 换回 `/7a72e9f56637a50cbf89a6c0a32df8cb1e7c7c26/`；两份脚本没有改变。若以后合并，revert 本 PR 即可；不删除规则/DNS 缓存，不改 VPS 设置。回到历史基线会同时恢复当时的 QQ 专用覆盖，这是回滚的范围，不能误称其已经删除。

主要规范依据是官方 [v1.14.2 文档](https://github.com/SagerNet/sing-box/tree/v1.14.2/docs/configuration)：DNS、Route/Rule Action、Rule Set、Selector/URLTest、TUN/Mixed、Dial/Domain Resolver。只调整已证明的分类问题，没有照搬官网后续版本字段或第三方复杂模板。
