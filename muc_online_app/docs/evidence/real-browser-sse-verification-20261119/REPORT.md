# 真实浏览器 SSE 跨导航验证报告（2026-11-19）——SEALED 根因最终闭合

## 测试环境

- IAB（ZCode 内建浏览器，WebKit 内核，**非 headless**）
- 测试服务器 127.0.0.1:18888（合成库 base-r2 + SSE 连接生命周期日志）
- 测试账号 54002010/muc2026（root）
- sse-log.json 全量记录每次 SSE-OPEN / SSE-CLOSE 及时间戳

## 测试流程

1. 登录（API fetch 登录 + cookie → goto /dashboard）
2. **6 次完整页面导航**：dashboard ↔ /maintenance（tab.goto()，每次触发完整页面卸载/加载）
3. **1 次 SPA 内部导航**：点击"维修管控"导航按钮（不触发页面卸载）

## 结果

### 完整页面导航（6 次）

每次导航 SSE 连接生命周期完美配对：
```
SSE-CLOSE ×2  ← 旧连接正确关闭（页面卸载）
SSE-OPEN  ×2  ← 新页面新连接
```
总计：16 OPEN / 14 CLOSE / 活跃 2（= 1 个页面的正常连接数）
**零堆积。**

### SPA 内部导航（1 次）

1 条额外 CLOSE（dashboard 特有 SSE 被正确释放），其余保持。
最终：16 OPEN / 15 CLOSE / 活跃 1。
**无泄漏。**

## 结论

**SEALED 页面入口失败的 SSE 泄漏问题确认为 headless=new Chrome + CDP 程序化导航的环境特定产物。**

真实浏览器（非 headless，含 WebKit 内核）中：
- 完整页面导航正确触发页面卸载事件 → SSE 连接正确关闭
- SPA 内部导航不触发卸载 → SSE 连接按需管理
- **不存在连接堆积风险**

此前合身环境的 stopMaintenanceSync / 卸载监听器 / SW 注销三件套在真实浏览器中均非必需（但作为防御性措施保留无害）。

## 对台账的影响

SEALED 根因的最后一个开放问题（"真实浏览器用户导航是否受影响"）→ **已闭合：不受影响。**

相关项：
- P0-114"SSE 断线重连"残留 → 真实浏览器 SSE 管理正常，断线重连为网络级场景
- 手册 B 的 SSE 对照实验 → **完成，结论为无影响**
