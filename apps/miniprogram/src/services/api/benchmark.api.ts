/**
 * Benchmark API —— 对标解析服务
 *
 * 端点（前缀 /benchmarks）：
 *  - POST /benchmarks            提交对标解析任务
 *  - GET  /benchmarks            解析历史（分页）
 *  - GET  /benchmarks/:id        解析详情
 *  - POST /benchmarks/:id/cancel 取消解析
 *  - POST /benchmarks/:id/clone  一键复刻（基于解析结果生成视频参数）
 */
import { request } from '../request'
import type { Benchmark, PaginatedResponse, PaginationParams } from '@/types'

// -------------------- 解析报告结构化类型 --------------------

/** 镜头脚本项 */
export interface ShotItem {
  sceneIndex: number
  duration: number
  visual: string
  voiceover: string
  onScreenText: string
}

/** 文案拆解 */
export interface Copywriting {
  hook: string
  body: string
  cta: string
}

/** 结构化解析报告（对应后端 analysisResult 字段） */
export interface StructuredReport {
  style: string
  pacing: string
  shotList: ShotItem[]
  copywriting: Copywriting
  sellingPoints: string[]
  templateSuggestion: string
}

/** 一键复刻返回结果 */
export interface CloneResult {
  benchmarkId: string
  prompt: string
  model: string
  resolution: string
  aspectRatio: string
  duration: number
}

/** 提交对标解析任务 */
export function createBenchmark(data: {
  sourceUrl: string
  idempotencyKey?: string
}): Promise<{ benchmarkId: string; status: string }> {
  return request.post<{ benchmarkId: string; status: string }>('/benchmarks', data)
}

/** 对标解析历史（分页 + 筛选） */
export function listBenchmarks(
  params?: { platform?: string; status?: string } & PaginationParams,
): Promise<PaginatedResponse<Benchmark>> {
  return request.get<PaginatedResponse<Benchmark>>('/benchmarks', params as Record<string, unknown>)
}

/** 对标解析详情 */
export function getBenchmark(id: string): Promise<Benchmark> {
  return request.get<Benchmark>(`/benchmarks/${id}`)
}

/** 对标解析详情（语义化别名） */
export function getBenchmarkDetail(id: string): Promise<Benchmark> {
  return request.get<Benchmark>(`/benchmarks/${id}`)
}

/** 取消对标解析任务 */
export function cancelBenchmark(id: string): Promise<void> {
  return request.post<void>(`/benchmarks/${id}/cancel`)
}

/** 一键复刻 —— 基于对标解析结果生成视频参数 */
export function cloneBenchmark(id: string): Promise<CloneResult> {
  return request.post<CloneResult>(`/benchmarks/${id}/clone`)
}
