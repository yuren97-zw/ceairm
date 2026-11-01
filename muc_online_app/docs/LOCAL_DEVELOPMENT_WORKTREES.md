# 三条本机开发线

三条分支属于同一个Git仓库，每套都包含完整系统。这里划分开发责任，不通过删除其他模块来隔离。

| 分支 | 本机端口 | 主要责任 |
| --- | --- | --- |
| codex/info-rbac | 8787 | 信息通报、登录账户、角色与RBAC |
| codex/maintenance-personnel | 8788 | 维修管控、人员与能力、审计、备份快照 |
| codex/attendance-leave | 8792 | 考勤、假期、钉钉同步、统计；兼8792真实执行端 |

进入对应工作树的muc_online_app后执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run start:dev
```

启动入口根据分支选择端口；衍生功能分支可使用相同分支名前缀。其他独立功能分支可显式指定，例如`npm run start:dev -- attendance-leave`。不得从main或原主工作目录启动此入口。

考勤线例外：其工作树即`~/Documents/航线中心考勤统计项目`（原8792统一开发工作区并入，见`ATTENDANCE_SETUP.md`），承载真实执行数据库`work/`，负责8792真实同步；真实执行入口为`npm run dev`（`scripts/start-attendance-8792.mjs`），不走上述隔离开发入口。该线不使用`start:dev`，凭据与正式数据仅存在于该工作树的`work/`。

默认仅监听127.0.0.1，不对局域网或公网开放。端口占用时拒绝启动，不自动停止已有服务。

info-rbac与maintenance-personnel两线保持隔离：每个工作树使用自己的`data/local-development.sqlite`及`uploads-local-development`，不复制正式数据库或认证材料。空库沿用应用现有本机测试管理员初始化规则；与正式网站认证分开。

三个本机配置使用不同的登录Cookie名称，避免同一浏览器在三个端口切换时互相覆盖会话；正式环境仍使用原Cookie名称。

隔离开发入口不继承DATABASE_URL、ATTENDANCE_ENV_FILE、NODE_OPTIONS、钉钉/COS/微信凭据等环境，且关闭所有真实考勤事件、worker、计划及补偿执行。不要把8792私有配置复制到其他工作树。查看正式同步结果请使用正式网站；8792真实执行端已迁至考勤线工作树（原「航线中心考勤统计项目」独立拷贝已退役归档），不要从归档目录启动。

服务器仅为通过全部本机隔离条件的显式开发配置允许8787；生产环境、非回环地址、外部数据库或配置、非本地运行目录及真实同步开关均不能使用此例外。未使用该配置时，原Codex工作树的8787保护仍有效。

新工作通过功能分支和PR进入main。main合并与正式发布仍分离；正式Release需要批准的完整SHA、成功主线CI及DEPLOY_PRODUCTION确认。启动开发服务不会创建Release或操作腾讯云。

公共接口、人员身份、RBAC、数据库迁移编号等跨模块变更，应先协调后合入main，再同步到其他开发线。不要让三个工作树各自复制修改同一套正式数据。
