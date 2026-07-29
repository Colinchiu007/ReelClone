/**
 * 工作流注册入口
 *
 * Temporal Worker 通过 workflowsPath 加载此文件，将所有工作流函数
 * 注册到 workflow isolate。新增工作流时需在此文件 re-export。
 */

export { videoGenerationWorkflow } from './video-generation.workflow'
export { benchmarkAnalysisWorkflow } from './benchmark-analysis.workflow'
