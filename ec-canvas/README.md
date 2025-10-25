# ECharts 小程序组件接入说明

本项目已内置 `ec-canvas` 组件与统计页的 ECharts 初始化逻辑（带 Canvas 回退）。要启用 ECharts 渲染，请将 ECharts 库文件放置到：

- 路径：`/ec-canvas/echarts.js`
- 文件内容：建议使用官方仓库 `echarts-for-weixin` 提供的 `echarts.min.js`（复制并重命名为 `echarts.js`）

完成后，统计页会自动检测并使用 ECharts 渲染折线与环形图；若未放置该文件，则继续使用内置 Canvas 绘图。

参考：
- 官方仓库：ecomfe/echarts-for-weixin（GitHub）
- 用法：统计页 WXML 使用 `<ec-canvas>` 组件，JS 中 `echarts.init(canvas, ...)` 初始化并 `setOption` 配置图表。
