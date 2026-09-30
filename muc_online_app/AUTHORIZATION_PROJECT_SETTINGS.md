# 授权项目后台设置（2026-08-31）

## 使用入口与规则

人员与能力 → 后台设置 → 授权项目设置。

- 超级管理员 54002010 可以维护；其他账户必须具有 `personnel.qualification.manage`。资质查看账户只能调用目录查询，不能维护，不显示后台设置页签。
- 新增项目必须填写代码、标准名称。代码去除首尾空格、区分大小写、唯一且创建后不可修改。
- 修改名称必须填写原因。目录名称是所有人员授权的当前名称来源，不再在单条授权中编辑代码或名称。
- 引用数量包含已作废授权记录。任何引用都会阻止删除，返回 409 和 `referenceCount`；不级联删除授权。
- 增删改及拒绝删除写入审计。改名不更改授权状态、有效期或 RBAC，也不撤销登录会话。

## 授权导入格式

第一张工作表的首行为表头，使用 `.xlsx`：

| 字段 | 要求 |
| --- | --- |
| 工号（或员工工号） | 必填，8位数字，必须已存在于人员主数据；建议使用文本格式 |
| 姓名（或人员姓名） | 必填；与人员主数据不一致时警告，不更改人员姓名 |
| 项目代码 | 必填；必须已配置标准名称；区分大小写 |
| 项目名称 | 可选；不一致时警告，显示仍采用目录标准名称 |
| 授权类型、授权单位、申请单位、符合要求、执照号码、证书号码、授权人、授权日期、授权有效期、培训到限日期、授权状态、授权备注、评估备注 | 维持现有支持，不改变业务唯一键 |

未配置、待配置或空代码均阻止整个批次确认，提示 Excel 原始行号和具体代码。先在后台维护，再重新上传。确认时会在事务内重新检查目录和人员；暂存后目录被删除也不能生效。导入不新增项目，不覆盖目录名称。

`personnel_authorizations.project_name` 仅作为导入来源信息保留；当前展示通过 `project_code` 左关联 `capability_catalog`。`authorization_project` 通用字典也从该目录生成；旧字典行不再读取或追加。

## 迁移与接口

启动时执行幂等目录补齐：保留现有目录名称；缺失代码仅有一个非空历史名称时补建标准项；名称冲突或全空时补建 `pending` 项，列出历史候选名称，交管理员确认。人员页面显示“待配置名称（代码）”。不删除人员、账户或授权记录。

- `GET /api/personnel/authorization-projects?q=&page=1&pageSize=20`：查看或维护资质权限；每页最多100项，返回 `items/total/page/pageSize`。
- `POST /api/personnel/authorization-projects`：`projectCode/projectName`。
- `PUT /api/personnel/authorization-projects/:id`：`projectName/reason`；提交代码字段会被拒绝。
- `DELETE /api/personnel/authorization-projects/:id`：事务内检查所有引用再删除。

SQLite 使用立即写事务；PostgreSQL 对目录维护、迁移及授权确认采用一致的目录写锁。目录写入和审计同事务；引用拒绝审计在回滚后保留。

## 验证与启用

执行 `npm run check`、`npm run test:rbac`。测试自动创建独立临时 SQLite，不使用 `data/rbac-refactor-test.sqlite`。覆盖目录查询分页、增删改、不可变代码、权限拒绝、会话不失效、批次阻断、确认复验、真实行号、单条修改拒绝、作废引用、历史迁移、事务回滚和新进程启动后名称持久化，并运行原有 RBAC/信息传达回归。业务表快照检查确保目录改名不改写授权、账户、角色、信息或维修机会。

浏览器使用虚拟接口检查了列表、搜索、分页、待配置提示和只读弹窗；浏览器保存提交未执行（安全确认限制）。PostgreSQL 写锁路径未在真实 PostgreSQL 实例运行验证。

本次未修改或重启既有 8788 测试数据库/服务，更未操作另一项目的 8787 服务。启用前建议备份测试数据库，然后停止原 8788 服务并按原配置重新启动，刷新网页：

```sh
cd "/Users/zhaowei/.codex/worktrees/4288/MUC收集信息/muc_online_app"
env -u DATABASE_URL PORT=8788 DB_PATH="$PWD/data/rbac-refactor-test.sqlite" UPLOAD_DIR="$PWD/uploads-rbac-test" npm start
```

首次重启会向上述测试库补齐目录与索引，不删除现有授权。运行中的旧后端不会自动载入新接口；仅刷新网页不足以启用本次改造。
