SSH_TARGET ?= tc
REMOTE_DIR ?= /data/work/client/laser-mirror
NGINX_CONF ?= /etc/nginx/conf.d/laser-mirror.conf
REMOTE_PORT ?= 8347
PUBLIC_URL ?= http://106.55.78.71:$(REMOTE_PORT)/
GAME_HOST ?= 0.0.0.0
GAME_PORT ?= 8347
WECHAT_DEVTOOLS_CLI ?= /Applications/wechatwebdevtools.app/Contents/MacOS/cli
WECHAT_DEVTOOLS_PROJECT ?= $(CURDIR)/dist/wechat
WECHAT_PREVIEW ?= 1
WECHAT_FORTIFY ?= 1
WECHAT_FORTIFY_SECRET ?=
WECHAT_FORTIFY_TIMEOUT_MINUTES ?= 10

.DEFAULT_GOAL := help

GM_HOST ?= 0.0.0.0
GM_PORT ?= 8350

.PHONY: help install dev build wechat wechat-debug wechat-fortify-init wechat-fortify wechat-preview typecheck check clean up_106 gm

help: ## 显示全部 Make 命令和说明
	@echo "Laser Mirror 开发命令"
	@echo "用法：make <命令>"
	@awk 'BEGIN { FS = ":.*##" } /^[a-zA-Z0-9_-]+:.*##/ { printf "  %-14s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## 安装依赖
	npm ci

gm: ## 启动关卡设计 GM 后台（默认端口 8350）
	@echo ""
	@echo "Laser Mirror GM — 关卡设计台"
	@echo "  端口: $(GM_PORT)  绑定: $(GM_HOST)"
	@echo "  http://127.0.0.1:$(GM_PORT)/"
	@echo "  首次打开会载入项目中现有的 50 关"
	@echo "  点「导出到项目」写入 src/levels/levels.json"
	@echo ""
	npx vite --config tools/gm/vite.config.ts --host "$(GM_HOST)" --port "$(GM_PORT)" --strictPort --open

dev: ## 启动游戏并允许局域网访问（默认端口 8347）
	@echo ""
	@echo "Laser Mirror — 本地开发"
	@echo "  端口: $(GAME_PORT)  绑定: $(GAME_HOST)"
	@echo "  http://127.0.0.1:$(GAME_PORT)/"
	@echo ""
	npx vite --mode web --host "$(GAME_HOST)" --port "$(GAME_PORT)" --strictPort

build: ## 构建 Web 包到 dist/web
	npm run build:web

wechat: ## 构建微信包、自动加固，再同步开发者工具并生成预览二维码
	npm run build:wechat
	WECHAT_DEVTOOLS_CLI="$(WECHAT_DEVTOOLS_CLI)" \
	WECHAT_DEVTOOLS_PROJECT="$(WECHAT_DEVTOOLS_PROJECT)" \
	WECHAT_PREVIEW="$(WECHAT_PREVIEW)" \
	WECHAT_FORTIFY="$(WECHAT_FORTIFY)" \
	WECHAT_FORTIFY_SECRET="$(WECHAT_FORTIFY_SECRET)" \
	WECHAT_FORTIFY_TIMEOUT_MINUTES="$(WECHAT_FORTIFY_TIMEOUT_MINUTES)" \
	node tools/sync-wechat.mjs

wechat-debug: override WECHAT_FORTIFY=0
wechat-debug: wechat ## 构建未加固的微信调试包并预览

wechat-fortify-init: ## 生成仓库外的加固密钥和待登记公钥（首次使用）
	WECHAT_DEVTOOLS_PROJECT="$(WECHAT_DEVTOOLS_PROJECT)" WECHAT_FORTIFY_SECRET="$(WECHAT_FORTIFY_SECRET)" node tools/wechat-fortify.mjs --init

wechat-fortify: ## 仅加固当前微信包
	WECHAT_DEVTOOLS_PROJECT="$(WECHAT_DEVTOOLS_PROJECT)" \
	WECHAT_FORTIFY_SECRET="$(WECHAT_FORTIFY_SECRET)" \
	WECHAT_FORTIFY_TIMEOUT_MINUTES="$(WECHAT_FORTIFY_TIMEOUT_MINUTES)" node tools/wechat-fortify.mjs

wechat-preview: ## 校验或完成当前微信包加固后生成预览二维码
	WECHAT_DEVTOOLS_CLI="$(WECHAT_DEVTOOLS_CLI)" \
	WECHAT_DEVTOOLS_PROJECT="$(WECHAT_DEVTOOLS_PROJECT)" \
	WECHAT_PREVIEW=1 \
	WECHAT_FORTIFY="$(WECHAT_FORTIFY)" \
	WECHAT_FORTIFY_SECRET="$(WECHAT_FORTIFY_SECRET)" \
	WECHAT_FORTIFY_TIMEOUT_MINUTES="$(WECHAT_FORTIFY_TIMEOUT_MINUTES)" \
	node tools/sync-wechat.mjs

typecheck: ## 检查 TypeScript 类型
	npm run typecheck

check: typecheck build ## 类型检查并构建 Web 包

clean: ## 清理构建产物
	rm -rf dist

up_106: build ## 构建游戏并部署到 106 正式服（端口 8347）
	SSH_TARGET="$(SSH_TARGET)" \
	REMOTE_DIR="$(REMOTE_DIR)" \
	NGINX_CONF="$(NGINX_CONF)" \
	REMOTE_PORT="$(REMOTE_PORT)" \
	PUBLIC_URL="$(PUBLIC_URL)" \
	./tools/deploy_106.sh
