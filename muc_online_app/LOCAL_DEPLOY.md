# MUC 本地部署测试说明

## 启动方式

双击 `start-local.command`，或在终端执行：

```bash
cd /Users/zhaowei/Documents/MUC收集信息/muc_online_app
./start-local.command
```

启动成功后访问：

```text
http://127.0.0.1:8787/
```

不要再直接打开：

```text
public/index.html
```

直接用 `file://` 打开会绕过后端服务，导致登录、收藏、发布、附件、阅读回执等 API 功能失效或会话错位。

## 测试账号

- 管理员：`54002010 / muc2026`
- 发布者：`publisher / 123456`
- 接收者：`receiver / 123456`

## 本地数据位置

- SQLite 数据库：`data/muc.sqlite`
- 附件目录：`uploads/`
- 前端页面：`public/index.html`
- 后端入口：`server.mjs`

## 停止服务

在启动服务的终端窗口按：

```text
Control + C
```

## 本地验收清单

- 首页显示 73 条信息。
- `54002010 / muc2026` 可以登录管理员。
- 收藏后刷新仍保留。
- 展开原文后生成阅读回执并显示提示。
- 发布新信息后列表新增记录。
- 上传附件后展开条目可以打开附件。
- 系统设置中的人员、账号、批量导入功能可用。
- 统计分析支持日期、班组、个人筛选，并可导出 CSV / Excel。
