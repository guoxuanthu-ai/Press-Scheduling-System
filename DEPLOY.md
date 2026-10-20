# VPS 生产部署

## 1. 前置条件

- 一台安装 Docker Engine 与 Docker Compose 插件的 VPS，安全组/防火墙仅开放 80、443 和必要的 SSH 端口。
- 一个域名，将其 A 或 AAAA 记录指向 VPS。Caddy 会自动申请和续期 HTTPS 证书。
- MySQL 不暴露公网端口，业务数据保存在命名卷 `db-data`。

## 2. 配置与启动

```bash
cd app
cp .env.example .env
# 编辑 .env：设置 DOMAIN、MYSQL_PASSWORD、BOOTSTRAP_PASSWORD、GUOXUAN_BOOTSTRAP_PASSWORD

docker compose up -d --build
docker compose ps
docker compose logs -f app
```

应用启动时自动执行 Drizzle migration。首次初始化会创建 `admin`、`market`、`production` 和总经理 `guoxuan`。前三个账户使用 `BOOTSTRAP_PASSWORD`，总经理使用 `GUOXUAN_BOOTSTRAP_PASSWORD`。登录后请立即在“账户权限”中分别重置密码；这些环境变量只用于首次建库，之后修改它们不会覆盖现有账户密码。

访问 `https://你的域名`。不同设备通过同一 MySQL 数据和 SSE 版本通知同步，页面变更通常即时刷新，断线时自动重连并以数据库版本检查兜底。

## 3. 验证

```bash
docker compose ps
curl -I https://你的域名
docker compose exec app wget -qO- http://localhost:3000/api/health
```

分别登录三个角色验证：管理员全权限；市场只能编辑打样任务；生产可维护压机/模具并排产、任务只读。用两台设备同时打开任务列表，在一侧编辑任务，另一侧应自动刷新。

## 4. 备份与恢复

```bash
# 备份到当前目录
docker compose exec db sh -c 'mysqldump -uinductor -p"$MYSQL_PASSWORD" inductor_scheduler' > backup-$(date +%F).sql

# 恢复（会覆盖当前数据库，执行前先确认备份文件）
cat backup-YYYY-MM-DD.sql | docker compose exec -T db sh -c 'mysql -uinductor -p"$MYSQL_PASSWORD" inductor_scheduler'
```

## 5. 升级与排障

```bash
# 拉取新代码后重建，数据库迁移自动执行
docker compose up -d --build

# 查看服务与实时连接问题
docker compose logs --tail=200 app caddy db
```

升级前必须备份。回滚应用代码后按原镜像重新部署；不要通过删除 `db-data` 回滚数据。SSE 已经在 Caddy 中配置 `flush_interval -1`，如额外使用其他 CDN/WAF，也需关闭 `/api/events` 的响应缓冲。
