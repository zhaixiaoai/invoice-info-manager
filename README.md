# 公司开票信息管理（云端多人共享版 v1.4）

网页部署在 Vercel，正式数据存储在 Supabase Postgres 数据库中。

## v1.4 主要功能

- 同一税号可以保存多条资料；仅当全部字段完全相同时阻止重复保存。
- 保存错误固定显示在新增/编辑弹窗顶部。
- 管理员使用 `ADMIN_PASSWORD` 登录。
- 每位共享成员使用独立账号和独立口令，管理员可以随时停用或重置。
- 停用成员后，该成员已经登录的设备也会立即失效。
- 记录成员登录、查看公司卡片和复制开票信息的时间。
- 未填写的注册电话、备注不会出现在“复制全部信息”结果中。

## Vercel 环境变量

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

v1.4 起 `TEAM_PASSWORD` 不再用于共享成员登录，可以保留，也可以从 Vercel 删除。

## 已有项目升级

1. 在 Supabase SQL Editor 执行 `supabase/migration-v1.4.sql`。
2. 上传本项目文件到 GitHub 仓库根目录并提交。
3. 等待 Vercel 自动部署为 `Ready / Latest`。
4. 管理员退出后使用 `ADMIN_PASSWORD` 重新登录。
5. 点击“成员管理”，为每位在职人员创建独立账号和个人口令。

升级脚本不会删除现有开票信息。
