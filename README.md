# 公司开票信息管理（云端多人共享版 v1.3）

网页部署在 Vercel，正式数据存储在 Supabase Postgres 数据库中。

## 权限

- 管理员：查询、复制、新增、编辑、删除、回收站恢复、导入和导出。
- 只读成员：查询、刷新和复制有效开票信息。
- `ADMIN_PASSWORD` 为管理员口令，仅本人保存。
- `TEAM_PASSWORD` 为共享成员查看口令，可发给需要查看资料的人。

## Vercel 环境变量

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TEAM_PASSWORD`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

`ADMIN_PASSWORD` 与 `TEAM_PASSWORD` 必须不同，且都至少 8 位。

## 更新说明

上传替换 GitHub 仓库中的同名文件后，Vercel 会自动部署。数据库独立保存在 Supabase，正常更新代码不会清空历史数据。本次更新无需重新执行 `supabase/schema.sql`。
