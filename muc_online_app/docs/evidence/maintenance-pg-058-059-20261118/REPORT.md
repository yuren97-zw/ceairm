# PG16 双库演练报告——058/059 迁移 + 全量用例（2026-11-18）

一次性隔离 PG16 集群（check-maintenance-v101-postgres.mjs，端口 15432，合成数据，随机密码
仅内存/0600 短暂文件，结束停机）。二进制：/Users/zhaowei/Applications/Postgres.app/…/16/bin
（16.15）。命令与原始输出：pg16-drill.log。

## 结果（EXIT=0）

- populatedLegacyRefused:true（已填充旧库身份拒绝）
- **upgrade:true——001→059 全部迁移应用成功**（含 058 standard_effective_refreshes 审计表
  与 059 过夜事实/关联两表）
- repeatedMigration:true（重复迁移幂等）
- **serverTests:true——873 用例在 PostgreSQL 全过**（coordinator 配置）
- 12 进程并发 advisory-lock 演练通过（dispatch 同版本冲突 200/409 串行化等）
- stopped:true（集群干净关闭）

## 过程修复（test-only，双库方言一致性）

node:pg 的 `count(*)` 返回字符串（bigint→text），SQLite 返回数字。四处未包裹的严格相等
断言在 PG 上失败，统一 `Number()` 包裹（数值语义与断言强度不变）：
- tests/server.test.mjs:5353/5356（release-authority 用例，放行架次计数 ×2）
- :5426（八类别 UNDECIDED 用例，复核案计数）
- :5940/6017/6032（P0-37/P0-38 用例，effective-refresh 审计计数 ×3）

修复后：sqlite 双配置 873/873（sqlite-default/coordinator-totals.log）+ PG serverTests
873 全过。058/059 迁移策略检查此前已过（见 maintenance-p057-overnight-20261118）。
