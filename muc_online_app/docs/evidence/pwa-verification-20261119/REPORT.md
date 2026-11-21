# PWA 基础设施与移动端验证报告（2026-11-19）

测试环境：IAB（ZCode 内建浏览器，WebKit 内核，390×844 视口模拟 iPhone）+ 服务端 127.0.0.1:18888

## 一、PWA 基础设施（全部 ✅）

| 检查项 | 结果 | 详情 |
|---|---|---|
| manifest.webmanifest | ✅ | name=航线运行中心, display=standalone, start_url=/dashboard, 3 icons |
| Service Worker | ✅ | 已注册+已激活，scope=全站，v55 |
| SW 缓存策略 | ✅ | networkFirst（先网络后缓存→离线回退 dashboard），app shell 预缓存 17 个资源 |
| SW 业务隔离 | ✅ | /api/ 请求不走 SW 缓存（保证业务数据新鲜） |
| viewport meta | ✅ | width=device-width, initial-scale=1 |
| apple-mobile-web-app-capable | ✅ | yes（iOS 独立窗口模式） |
| apple-mobile-web-app-title | ✅ | 航线中心 |
| theme-color | ✅ | #0F5F7A |
| 图标 | ✅ | 192px + 512px + maskable-512px + apple-touch-icon（4 个文件全在） |
| SW 控制器 | ✅ | navigator.serviceWorker.controller = true |

## 二、移动端 390px 视口测试（全部 ✅）

| 检查项 | 结果 | 详情 |
|---|---|---|
| 无水平溢出 | ✅ | scrollWidth(390) = innerWidth(390) |
| 响应式布局 | ✅ | 截图确认 dashboard 与维修管控页均正确堆叠（截图归档） |
| 16px 字号防护 | ✅ | CSS 源码 11 处 font-size:16px（iOS 焦点不自动放大） |
| 底部抽屉 safe-area | ✅ | safe-area-inset-bottom 在标准选择器 CSS 中 |
| 底部抽屉样式 | ✅ | inset:auto 0 0（从底部弹出）+ border-radius:16px 16px 0 0 |
| 键盘视口适配 | ✅ | keyboard-visible CSS 类（fixed 定位 + dvh 计算） |
| 导航按钮换行 | ✅ | 390px 下导航栏正确折叠/换行 |

## 三、需要真机才能验证的项目

以下项目**必须在实体设备上**测试，桌面无法替代：

| 项目 | 原因 | 建议操作 |
|---|---|---|
| iOS Safari "添加到主屏幕" | 需真实 iOS 设备 | iPhone Safari → 分享 → 添加到主屏幕 → 验证独立窗口启动 |
| iOS 键盘弹出行为 | 需真实键盘覆盖输入框 | 打开标准选择器 → 点击搜索框 → 键盘弹出 → 列表仍可操作 |
| safe-area 刘海屏适配 | 需带刘海的真机 | iPhone 上打开 PWA → 检查顶部/底部安全区 |
| 触摸手势 | 需真实触摸屏 | 滑动导航/下拉刷新/左右滑动筛选 |
| PWA 离线启动 | 需真机断网 | 飞行模式下打开已安装的 PWA → app shell 从缓存加载 |
| Android Chrome 安装 | 需 Android 设备 | Chrome → 安装应用 → 验证独立窗口 |

## 结论

**PWA 基础设施完备**：manifest/SW/图标/元标签/缓存策略全部正确。390px 移动视口无水平溢出、
布局正确堆叠、iOS 缩放防护就位。桌面可验证的 PWA 项目全部通过。

**真机验证清单**已列出（6 项），需实体设备操作。
