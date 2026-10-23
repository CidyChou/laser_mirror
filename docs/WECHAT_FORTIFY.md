# 微信代码加固

参考 block-escape 的构建流程，使用固定版本 `minigame-code-fortify-cli@0.1.8`。默认配置对 `game.js`、`game-runtime.js`、`runtime-compat.js` 添加水印及三级混淆，避免仅保护体积很小的启动器。

## 使用

```sh
make wechat                 # 重新构建 → 等待加固和校验 → 开发者工具同步、手机预览
make wechat-debug           # 重新构建未加固包 → 同步、预览
make wechat-fortify-init    # 首次生成密钥，已有密钥不覆盖
make wechat-fortify         # 仅加固当前包
make wechat-preview         # 校验或完成当前包的加固，再预览
npm run verify:wechat-fortify
```

`npm run build:wechat` 仍只负责打包。`make wechat-debug` 强制设置 `WECHAT_FORTIFY=0`，重建清除上次加固代码及 map；两种模式共用 `dist/wechat`，后执行的模式覆盖前一次产物。即使关闭开发者工具同步，默认加固仍执行。

## 首次准备

先在 `dist/wechat/project.config.json` 配置本游戏正式 AppID，再执行 `make wechat-fortify-init`。把生成的 `id_rsa.public.pem` 公钥登记到本游戏微信后台「开发支持 → 研发工具箱 → 密钥管理」，完成后运行 `make wechat`。本项目不会复用 block-escape 的密钥或 AppID。

私钥默认位于 `~/.config/laser-mirror/wechat-fortify/<appid>/id_rsa.conf`，文件权限为 0600，不进入仓库或上传目录。只登记公钥，私钥留在本机。可用 `WECHAT_FORTIFY_SECRET` 指向已有、本游戏对应的密钥配置；路径必须在仓库及上传目录之外。`WECHAT_FORTIFY_TIMEOUT_MINUTES` 默认为 10，可设为 1～60。

## 校验及失败处理

先在临时目录调用 CLI，全部目标文件通过保护标记、内容变更、JavaScript 语法、source map 和包体大小检查后才替换上传目录。异常、超时、不完整结果及包体超限会停止同步和预览，不自动降级为未加固包。加固锁防止同一上传目录重复执行；产物指纹及配置相同时可复用已经验证的结果。

构建会保留开发者工具配置及 `code.fortify.config.json`。加固默认配置源文件在 `templates/wechat/code.fortify.config.json`，已有输出目录配置优先保留；修改模板后应同步已有输出配置。`build-info.json` 中的 runtimeSha256 记录加固前的运行时代码，最终加固字节及 map 的指纹记录在上传目录外的 `dist/wechat.fortify-state.json`。

本地回归使用模拟加固服务，覆盖密钥初始化、错误 AppID、路径隔离、等待、互斥、重复执行、异常与多文件输出；不代表微信服务已接受公钥或真机已通过。真实服务和真机验收需登记公钥后执行。

依赖审计：本次安装的官方 CLI 间接依赖 node-forge，npm audit 报告签名验证相关高危告警且暂无可用修复；现有 Vite 和 source-map-js 也有告警。加固 CLI 仅为本机构建依赖，不打入游戏包，本次没有跨范围升级构建工具。后续需跟进官方修复。
