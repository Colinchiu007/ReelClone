# TabBar 图标目录

该目录用于存放微信小程序底部 TabBar 的图标资源。

## 需要手动添加的图标文件

由于脚手架阶段无法生成真实 PNG 图标，请在此目录下手动添加以下 8 个图标文件：

| 文件名 | 用途 | 状态 |
| --- | --- | --- |
| `home.png` | 首页 - 未选中态 | 待添加 |
| `home-active.png` | 首页 - 选中态 | 待添加 |
| `square.png` | 灵感广场 - 未选中态 | 待添加 |
| `square-active.png` | 灵感广场 - 选中态 | 待添加 |
| `benchmark.png` | 对标解析 - 未选中态 | 待添加 |
| `benchmark-active.png` | 对标解析 - 选中态 | 待添加 |
| `mine.png` | 我的 - 未选中态 | 待添加 |
| `mine-active.png` | 我的 - 选中态 | 待添加 |

## 图标规格要求

- **尺寸**: 81 × 81 px（微信官方推荐，最大不超过 40KB）
- **格式**: PNG（支持透明背景）
- **色彩**:
  - 未选中态: 使用 `#666680`（与 `app.config.ts` 中 `tabBar.color` 一致）
  - 选中态: 使用 `#7C3AED`（与 `app.config.ts` 中 `tabBar.selectedColor` 一致）
- **设计风格**: 建议线性图标（未选中）+ 实心图标（选中），与 WouwouAI 视觉规范保持一致
- **背景**: 透明（不要使用纯色背景块）

## 注意事项

1. 图标缺失时小程序可正常编译，但 TabBar 图标位置将显示空白
2. 路径在 `src/app.config.ts` 的 `tabBar.list` 中配置，路径以 `assets/tab/` 开头
3. 添加图标后无需修改任何代码，Taro 会自动将本目录的 PNG 文件拷贝到产物中
