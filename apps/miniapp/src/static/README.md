# 小程序本地视觉资源

正式小程序仅引用当前目录，不在运行时依赖只读原型目录。

- `brand/login-background.jpg`：复用原型 `media/background.png`，等比缩至宽 750 px 并以 JPEG 85 质量压缩；未改变内容。
- `brand/logo.png`：复用原型 `media/favicon.png`，等比缩至 144 × 144 px；用于 72 px Logo。
- `icons/*.png`：由原型 `frontend/js/icons.js` 的同名 SVG 路径机械转为 48 × 48 px 透明 PNG，灰色 `#6b7280`、选中色 `#015cbb`。PNG 兼容微信原生 TabBar；不是另起一套图标。

上述源文件始终只读。资源更新后检查单文件尺寸及小程序主包体积。
