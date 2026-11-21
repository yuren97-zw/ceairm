# SEALED 页面入口失败 — 现象记录与机制分析（v2，2026-11-17，经 Codex 只读复核修正）

范围：交接书 §6.2「四阶段浏览器 SEALED 入口等待失败、根因未建立」。合成隔离环境；未触碰业务库、8788 或真实凭据；业务源码零改动。

> **v2 修正说明**：v1 版曾断言「CDP 导航不触发卸载事件」与「显式清理为决定性修复」。Codex 复核指出卸载探针只安装一次、不能据后续无回报作此断言。修订版探针（每个新文档安装、带文档标识）证明：**注册了卸载监听器的文档在每次导航都会触发 beforeunload/pagehide/visibilitychange/unload**。v1 断言作废，本版按有效对照收窄结论。

## 已确证的观察（四格运行矩阵）

| 运行 | 驱动 | 导航前显式关闭SSE | 页面注册卸载监听器 | 结果 |
|---|---|---|---|---|
| hI7RkK / cPQ248 / evlydg / RSKyrz | v1 系 | 否 | 否（应用本身未注册） | **失败**，均在第 5 次页面加载（SEALED-1280）tabs 超时 |
| BJiCir | v1（存档精确字节） | 是 | 否 | 通过 8/8 |
| obeMCa（r2 对照） | r2 | 否 | 是（每文档探针） | 通过 8/8，SSE 每次导航即关 |
| 6YK6aT（r2 对照） | r2 | 否 | 否 | **失败**，第 4 次加载（IN_REVIEW-390）tabs 超时，退出码 1 |

三层证据（失败运行共同签名）：

1. **服务端**：所有到达请求 0-6ms 处理完；maintenance/events SSE 每页 1 条到达且**跨导航不关闭**（5 条滞留至 ~60s 浏览器回收才集中关闭）；失败页面加载后 ~58 秒无任何请求到达，之后（+61.9s）集中涌入且全部毫秒级完成。
2. **浏览器 netlog**：capabilities 请求在 `HTTP_STREAM_REQUEST`（等待连接）阶段停滞 41.19s 才 `HTTP_STREAM_REQUEST_BOUND_TO_JOB`，随后 10ms 内 200。
3. **隔离复测**（无浏览器、同业务状态）：全部相关端点 2-3ms。

## 收窄后的结论

**已确证**：在连续同标签页程序化导航（CDP `Page.navigate`、Chrome headless=new、本机此版本）下，当页面既未在导航前显式关闭 EventSource、也未注册 beforeunload/unload/pagehide 监听器时，旧页 maintenance/events SSE 连接不被关闭（服务端可见滞留）；累积至第 4-5 次页面加载时占满浏览器同源连接预算，后续 API 请求在浏览器侧排队停滞 41-58 秒无法到达服务器，前端引导链（app.js:1173 capabilities → tab 渲染）未完成，面板空、tabs=[]，驱动 16 秒等待超时。

**两个独立运行各证明一种消除方式**：导航前显式 `stopMaintenanceSync();stopInfoSync()`（BJiCir）；或页面注册卸载监听器（obeMCa，每次导航卸载事件四连发且 SSE 随即关闭）。

**与 SEALED 无关的直接证据**：失败可复现于 IN_REVIEW-390（6YK6aT）——失败点取决于连接累积计数（第 4 或第 5 次加载），与业务阶段无关；原始终恰好落在 SEALED-1280 造成误判。

**仍待有效验证（不下列断）**：
- Chromium 跳过 unload/连接回收的确切条件（监听器缺失？程序化导航？headless 特有？）。
- **真实浏览器用户导航是否受同样影响**——现网页面本身不注册 beforeunload/unload/pagehide 监听器，但真实导航（地址栏/链接/F5）是否触发同一跳过路径未验证。若受影响，app 侧缓解（如 pagehide 显式关闭 SSE，曾试作 v56 后因当时误判无效而回退）是候选方案，**未合入**；须先以真实浏览器证据重开。
- 本结论仅覆盖合成隔离环境浏览器验证；真机、已安装 PWA 热升级仍属未验收。

## 驱动版本与产物对照

- `four-state-diagnostic.mjs` = v1，BJiCir（通过运行）驱动精确字节；早于它的失败运行（hI7RkK→evlydg）与其差异仅为：无导航前清理、无每文档探针、无 evaluate 导航竞态重试（逐次补丁演进）。
- `four-state-diagnostic-r2.mjs` = r2：DRIVER_VERSION 写入 proof；每文档卸载探针（doc=location.search）；`TEARDOWN=0|1`、`PROBE=0|1` 对照开关；任一宽度失败或出错时**非零退出码**。obeMCa=TEARDOWN:0,PROBE:1；6YK6aT=TEARDOWN:0,PROBE:0。
- `build-base.mjs` = v1（含查询不存在的 schema_migrations 表的缺陷，保留原件）；`build-base-r2.mjs` 修正为查询 sqlite_master/users 并带失败退出码（验证通过：142 表/种子用户/38 角色，退出码 0）。
- `isolate-finalization.mjs` = v1；`isolate-finalization-r2.mjs` 补非零退出码。
- 失败运行 netlog 全量保全：`failing-run-v55/netlog.json`（v1 失败，SHA256 `fa0aa293…8b4b`）、`failing-control-noprobe-r2/netlog.json`（r2 失败对照，含探针开关记录）。

## 台账措辞限定（同步修正）

- P0-26 本轮证据：**仅页面级**私密零泄露复验；**未含导出验证**；「浏览器写 0」仅指已监测的评议端点（`/api/maintenance/nonroutine-reviews/*` 非 GET 请求计数为 0），不外推其他端点。
- P0-56 同上限定「浏览器 0 写」。
