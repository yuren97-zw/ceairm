// Compatibility entry only. There is no separate 8791 development server.
console.warn('8791开发入口已停用；使用8792现有数据库及同步配置。后续请运行 npm run dev。');
await import('./start-attendance-8792.mjs');
