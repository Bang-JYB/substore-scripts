# Sub-Store 脚本（sing-box 1.14，仅 IPv4）

> 分流：AI 工具 → VPS 节点（`AI` 分组）；国内 → 直连；其余 → LXY_SUB 节点（`LXY` 分组）。

## 一、脚本操作（三个文件都添加这两条，顺序不限）

脚本 ①：LXY_SUB 的节点 → 填入 `LXY` 与 `LXY-自动`

```
https://raw.githubusercontent.com/xream/scripts/main/surge/modules/sub-store-scripts/sing-box/template.js#name=LXY_SUB&outbound=🕳ℹ️^LXY(-自动)?$🏷ℹ️^(?!.*(?:官网|剩余|流量|套餐|免费|订阅|到期|直连|GB|Expire.?Date|Traffic)).*
```

脚本 ②：VPS 的节点 → 填入 `AI`

```
https://raw.githubusercontent.com/xream/scripts/main/surge/modules/sub-store-scripts/sing-box/template.js#name=VPS&outbound=🕳ℹ️^AI$
```

> `name=` 后面必须是 Sub-Store 里订阅的“名称”，不是“显示名称”。如果你的订阅名称不是 `LXY_SUB` / `VPS`，请改成实际名称。
> 如果 Sub-Store 所在服务器拉不到 raw.githubusercontent.com，可以在链接最前面加 `https://gh-proxy.com/`。

## 二、三个文件的“远程链接”

在 Sub-Store「文件」里各新建一个文件，来源选“远程文件”，链接分别填（把 `<用户名>`、`<仓库名>`、`main` 换成你自己的）：

| 用途 | 远程链接 |
| --- | --- |
| 电脑 · TUN 模式 | `https://raw.githubusercontent.com/<用户名>/<仓库名>/main/config/singbox/config_tun.json` |
| 电脑 · 非 TUN（系统代理） | `https://raw.githubusercontent.com/<用户名>/<仓库名>/main/config/singbox/config_pc.json` |
| 安卓 | `https://raw.githubusercontent.com/<用户名>/<仓库名>/main/config/singbox/config_android.json` |

然后在每个文件里添加上面两条“脚本操作”，保存即可。
