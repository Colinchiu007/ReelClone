# ReelClone

## 快速导航

## 识图能力

底层模型不具备原生识图能力。遇到图片时，**不要用 Read 工具看图**，改用共享识图脚本：

```
node D:/Data/projects/Multi-Publish/tools/vision.js "<图片路径>" "用中文详细描述这张图片"
```

网络图片用 `--url`：

```
node D:/Data/projects/Multi-Publish/tools/vision.js --url "<图片链接>" "用中文详细描述这张图片"
```

触发场景：用户分享图片（本地或网络 URL）、消息出现 "Saved attachments:"、用户要求分析/描述/识别图片。配置在共享脚本同目录 `.env`（当前 OpenCode Go / mimo-v2.5）。配置好后用户直接发图片即自动识图。
