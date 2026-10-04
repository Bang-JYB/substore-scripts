# 验证记录（2026-10-04）

- 使用官方 sing-box 1.14.2 Linux amd64 发布包。
- 三份由虚构机场/VPS节点生成的配置均通过 `sing-box check`。
- 自动化检查：八个策略组、机场/VPS 两个测速池、AI 默认 VPS、安卓仅 TUN、桌面 `127.0.0.1:7890`、IPv4 DNS、IPv6 拒绝、UDP 443 拒绝、14 份远程规则均经 `rules-via-proxy` 的 HTTP/1.1 下载器。
- 远程规则 URL 的仓库和路径已通过 GitHub API 核对。

不包含真实设备、真实订阅或真实节点的连通性验证。
