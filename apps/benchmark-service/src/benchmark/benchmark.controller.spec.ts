/**
 * BenchmarkController 单元测试
 *
 * 测试覆盖：
 *  - POST /benchmarks（create）：响应格式验证
 *  - GET /benchmarks（findAll）：分页响应格式验证
 *  - GET /benchmarks/:id（findOne）：详情响应格式验证
 *  - POST /benchmarks/:id/cancel（cancel）：取消响应格式验证
 */
import { Test } from '@nestjs/testing';
import { BenchmarkController } from './benchmark.controller';
import { BenchmarkService } from './benchmark.service';
import { CreateBenchmarkDto } from './dto/create-benchmark.dto';
import { ListBenchmarksDto } from './dto/list-benchmarks.dto';
import {
  Benchmark,
  BenchmarkPlatform,
  BenchmarkStatus,
} from '@reelclone/database';

// -------------------- Mock 数据 --------------------

/** 创建 Mock Benchmark */
function createMockBenchmark(overrides: Partial<Benchmark> = {}): Benchmark {
  return {
    id: 'bench-001',
    userId: 'user-001',
    sourceUrl: 'https://www.douyin.com/video/123',
    platform: BenchmarkPlatform.DOUYIN,
    status: BenchmarkStatus.COMPLETED,
    videoKey: 'oss://video.mp4',
    consumedPoints: 300,
    analysisResult: { style: '测试风格' },
    shots: null,
    transcript: null,
    ocrResult: null,
    visualDescription: null,
    errorMessage: null,
    createdAt: new Date('2025-01-01'),
    completedAt: new Date('2025-01-01T00:05:00'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as Benchmark;
}

// -------------------- 测试 --------------------

describe('BenchmarkController', () => {
  let controller: BenchmarkController;
  let service: jest.Mocked<BenchmarkService>;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<BenchmarkService>;

    const moduleRef = await Test.createTestingModule({
      controllers: [BenchmarkController],
      providers: [{ provide: BenchmarkService, useValue: service }],
    }).compile();

    controller = moduleRef.get(BenchmarkController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- POST /benchmarks --------------------

  describe('create', () => {
    it('调用 service.create 并返回 benchmarkId / status / estimatedPoints', async () => {
      const dto: CreateBenchmarkDto = {
        sourceUrl: 'https://www.douyin.com/video/123',
      };
      const mockResult = {
        benchmarkId: 'bench-001',
        status: BenchmarkStatus.PENDING,
        estimatedPoints: 300,
      };
      service.create.mockResolvedValue(mockResult);

      const result = await controller.create('user-001', dto);

      expect(service.create).toHaveBeenCalledWith('user-001', dto);
      expect(result).toEqual(mockResult);
      expect(result.benchmarkId).toBe('bench-001');
      expect(result.status).toBe('PENDING');
      expect(result.estimatedPoints).toBe(300);
    });

    it('传入 idempotencyKey 时应透传给 service', async () => {
      const dto: CreateBenchmarkDto = {
        sourceUrl: 'https://www.douyin.com/video/123',
        idempotencyKey: 'idem-key-1',
      };
      service.create.mockResolvedValue({
        benchmarkId: 'bench-001',
        status: BenchmarkStatus.PENDING,
        estimatedPoints: 300,
      });

      await controller.create('user-001', dto);

      expect(service.create).toHaveBeenCalledWith('user-001', dto);
    });
  });

  // -------------------- GET /benchmarks --------------------

  describe('findAll', () => {
    it('调用 service.findAll 并返回分页结果', async () => {
      const dto = new ListBenchmarksDto();
      const mockResult = {
        list: [createMockBenchmark()],
        page: 1,
        pageSize: 20,
        total: 1,
      };
      service.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll('user-001', dto);

      expect(service.findAll).toHaveBeenCalledWith('user-001', dto);
      expect(result.list).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(1);
    });

    it('支持筛选参数', async () => {
      const dto = new ListBenchmarksDto();
      dto.platform = BenchmarkPlatform.DOUYIN;
      dto.status = BenchmarkStatus.COMPLETED;
      dto.page = 2;
      dto.pageSize = 10;

      service.findAll.mockResolvedValue({
        list: [],
        page: 2,
        pageSize: 10,
        total: 0,
      });

      const result = await controller.findAll('user-001', dto);

      expect(service.findAll).toHaveBeenCalledWith('user-001', dto);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
    });
  });

  // -------------------- GET /benchmarks/:id --------------------

  describe('findOne', () => {
    it('调用 service.findOne 并返回 benchmark 详情', async () => {
      const mockBenchmark = createMockBenchmark({ id: 'detail-1' });
      service.findOne.mockResolvedValue(mockBenchmark);

      const result = await controller.findOne('user-001', 'detail-1');

      expect(service.findOne).toHaveBeenCalledWith('user-001', 'detail-1');
      expect(result).toBe(mockBenchmark);
      expect(result.id).toBe('detail-1');
      expect(result.platform).toBe(BenchmarkPlatform.DOUYIN);
    });
  });

  // -------------------- POST /benchmarks/:id/cancel --------------------

  describe('cancel', () => {
    it('调用 service.cancel 并返回取消结果', async () => {
      service.cancel.mockResolvedValue({
        benchmarkId: 'bench-001',
        status: BenchmarkStatus.CANCELLED,
      });

      const result = await controller.cancel('user-001', 'bench-001');

      expect(service.cancel).toHaveBeenCalledWith('user-001', 'bench-001');
      expect(result.benchmarkId).toBe('bench-001');
      expect(result.status).toBe('CANCELLED');
    });
  });
});
