import { TASK_QUEUE } from './types'

describe('Temporal Task Queue 契约', () => {
  it('使用唯一规范队列名称', () => {
    expect(TASK_QUEUE.DEFAULT).toBe('reelclone-tasks')
  })

  it('单 Worker 架构下所有工作流使用同一任务队列', () => {
    expect(TASK_QUEUE.VIDEO_GENERATION).toBe(TASK_QUEUE.DEFAULT)
    expect(TASK_QUEUE.BENCHMARK_ANALYSIS).toBe(TASK_QUEUE.DEFAULT)
    expect(TASK_QUEUE.TEMPLATE_GENERATION).toBe(TASK_QUEUE.DEFAULT)
  })
})
