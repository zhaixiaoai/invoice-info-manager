# 腾讯云 CloudBase 云托管部署说明

本版本同时兼容原 Vercel 部署与腾讯云 CloudBase 云托管。

## CloudBase 配置

- Git 仓库：`https://github.com/zhaixiaoai/invoice-info-manager`
- 分支：`main`
- 服务名称：`invoice-info-manager`
- 访问端口：`3000`
- 服务端口：`3000`
- Dockerfile：项目根目录 `Dockerfile`
- 公网访问：开启

## 环境变量

在 CloudBase 云托管的“环境变量设置”中配置：

- `SUPABASE_URL`：只填写 `https://xxxx.supabase.co`，不要带 `/rest/v1`
- `SUPABASE_SECRET_KEY`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

如 Vercel 当前还保留旧的 `TEAM_PASSWORD`，腾讯云版本不需要它，成员使用成员管理中创建的个人账号和口令登录。

## 注意

任何密钥都不要写进 GitHub 文件或 Dockerfile，只能放在 CloudBase 环境变量中。
