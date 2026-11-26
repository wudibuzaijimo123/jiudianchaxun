#!/usr/bin/env bash
# 阿里云 ECS 一键部署 / 更新脚本
# 用法：
#   1) 把项目上传到服务器（git clone 或 scp/rsync 都行），假定目录 /opt/jiudianchaxun
#   2) bash deploy/deploy.sh
#   3) 首次部署后按 deploy/nginx-jiudianchaxun.conf 配好域名与证书
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/jiudianchaxun}"
PORT="${PORT:-5173}"
MODE="${MODE:-docker}"   # docker | node

cd "$APP_DIR"
echo "==> 工作目录：$(pwd)"

if [ "$MODE" = "docker" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "未检测到 docker，改用 node 模式"
    MODE=node
  fi
fi

if [ "$MODE" = "docker" ]; then
  echo "==> docker compose 构建并后台启动"
  docker compose up -d --build
  docker image prune -f >/dev/null 2>&1 || true
else
  echo "==> Node 模式：安装依赖并构建"
  npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
  npm install --no-audit --no-fund
  npm run build

  echo "==> 重启 systemd 服务 jiudianchaxun"
  if [ -f /etc/systemd/system/jiudianchaxun.service ]; then
    systemctl restart jiudianchaxun
  else
    cat >/etc/systemd/system/jiudianchaxun.service <<EOF
[Unit]
Description=Nearby Stay Radar
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
ExecStart=$(command -v node) $APP_DIR/server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable --now jiudianchaxun
  fi
fi

echo "==> 健康检查 http://127.0.0.1:$PORT/api/lan-info"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:$PORT/api/lan-info" >/dev/null 2>&1; then
    echo "服务已就绪 ✅"
    break
  fi
  sleep 1
  if [ "$i" = "15" ]; then
    echo "服务 15 秒内未就绪，请查看日志：docker compose logs -f 或 journalctl -u jiudianchaxun -n 100"
    exit 1
  fi
done

echo
echo "接下来："
echo "  1. 阿里云安全组放通 80 / 443"
echo "  2. 域名 A 记录指向本机公网 IP"
echo "  3. 拷贝 deploy/nginx-jiudianchaxun.conf 到 /etc/nginx/conf.d/ 并改域名与证书路径"
echo "  4. nginx -t && systemctl reload nginx"
echo "  5. iPhone Safari 打开 https://你的域名 → 分享 → 添加到主屏幕"
