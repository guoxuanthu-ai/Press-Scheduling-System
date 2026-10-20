# 公网 IP + 自定义端口部署

适用于无域名场景，默认访问 `http://VPS公网IP:3000`。HTTP 不加密，只建议临时验收或受控网络使用；内部长期使用建议改用 Tailscale/WireGuard。

1. 在 VPS 安全组和系统防火墙开放 `3000/tcp`，或设置 `APP_PORT` 后开放对应端口。
2. 本机配置 SSH 免密登录。
3. 在 `app/` 目录执行：

```bash
GUOXUAN_BOOTSTRAP_PASSWORD='请填入总经理初始密码' bash scripts/deploy-ip.sh 106.53.23.60 ubuntu 22 3000
```

脚本会打包源码、上传 VPS、生成随机 MySQL 和管理员初始密码、执行 Docker Compose、运行数据库迁移并完成健康检查。除总经理外，`admin`、`market`、`production` 的初始密码可在服务器 `~/inductor-app/.env` 中查看，登录后应立即重置。

MySQL 只在 Docker 内网访问，不暴露公网端口。升级时重复执行同一脚本；备份与恢复仍可参考 `DEPLOY.md` 中的数据库命令，将 compose 文件替换为 `compose.ip.yaml`。
