# 公司开票信息管理（云端多人共享版）

这是一个面向团队使用的开票资料管理工具。网页代码部署在 Vercel，正式数据存储在 Supabase Postgres 数据库中。

## 功能

- 固定网址，后续更新代码后自动发布新版
- 多设备共享、每 10 秒自动同步
- 公司资料新增、编辑、搜索、复制
- 团队访问口令
- 操作人记录、并发修改冲突保护
- 软删除与回收站恢复
- JSON 备份导入和导出
- 数据库与网页代码完全分离，更新功能不会覆盖历史资料

## 部署顺序

1. 创建 Supabase 项目。
2. 在 Supabase 的 SQL Editor 中运行 `supabase/schema.sql`。
3. 在 Supabase 的 Settings → API Keys 中创建并复制后端 **Secret key**（`sb_secret_...`）。
4. 在 Vercel 中导入此 GitHub 仓库。
5. 配置四个环境变量：
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `TEAM_PASSWORD`
   - `SESSION_SECRET`
6. 点击 Deploy。部署完成后获得固定网址。

详细图文式步骤见：[部署说明.md](./部署说明.md)

## 安全说明

- `SUPABASE_SECRET_KEY` 只能放在 Vercel 环境变量中，不能写进代码、网页或聊天截图。
- 数据表已启用 RLS，并撤销匿名访问权限；浏览器只能通过受团队口令保护的服务器接口访问。
- GitHub 仓库可以公开，但 `.env` 和真实密钥绝不能提交。
- 删除操作是软删除，可从回收站恢复。
