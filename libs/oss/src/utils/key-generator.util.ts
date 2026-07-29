/**
 * OSS Key 生成工具
 * 统一约定 ReelClone 各业务场景下的对象存储路径，避免散落的字符串拼接
 *
 * 目录约定：
 * - assets/{type}/{userId}/{uuid}.{ext}              用户素材
 * - works/{type}/{userId}/{workId}.{ext}              用户作品
 * - works/covers/{userId}/{workId}.jpg                作品封面
 * - benchmarks/videos/{userId}/{benchmarkId}.mp4      对标视频
 * - templates/{type}/{templateId}.{ext}               官方模板
 * - temp/uploads/{userId}/{uuid}.{ext}                临时上传（定期清理）
 */

import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * 素材 / 作品的业务类型
 * 用 string 兼容未来扩展，但提供常用枚举便于 IDE 提示
 */
export type OSSObjectType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'cover'
  | (string & {});

/**
 * 安全化字符串：去除首尾空白，剥离路径分隔符，防止越权拼接
 */
function sanitize(segment: string): string {
  return segment
    .trim()
    .replace(/^[/\\]+|[/\\]+$/g, '')
    .replace(/\.\.+/g, '.');
}

/**
 * 从文件名中提取扩展名（不带点，统一小写）
 * 无扩展名时返回 'bin'
 */
function extractExt(fileNameOrPath: string): string {
  const ext = extname(fileNameOrPath).toLowerCase().replace(/^\./, '');
  return ext || 'bin';
}

/**
 * 生成素材 Key：assets/{type}/{userId}/{uuid}.{ext}
 *
 * @param userId    用户 ID
 * @param fileName  原始文件名（用于推断扩展名）
 * @param type      素材类型，默认 image
 * @param uuid      可选自定义 UUID，默认随机生成
 */
export function generateAssetKey(
  userId: string,
  fileName: string,
  type: OSSObjectType = 'image',
  uuid: string = uuidv4(),
): string {
  const uid = sanitize(userId);
  const t = sanitize(type);
  const ext = extractExt(fileName);
  return `assets/${t}/${uid}/${uuid}.${ext}`;
}

/**
 * 生成作品 Key：works/{type}/{userId}/{workId}.{ext}
 *
 * @param userId  用户 ID
 * @param workId  作品 ID
 * @param type    作品类型，默认 video
 * @param ext     扩展名（不带点），默认 mp4
 */
export function generateWorkKey(
  userId: string,
  workId: string,
  type: OSSObjectType = 'video',
  ext: string = 'mp4',
): string {
  const uid = sanitize(userId);
  const wid = sanitize(workId);
  const t = sanitize(type);
  const e = ext.toLowerCase().replace(/^\./, '') || 'bin';
  return `works/${t}/${uid}/${wid}.${e}`;
}

/**
 * 生成作品封面 Key：works/covers/{userId}/{workId}.jpg
 * 封面统一使用 JPG 格式
 *
 * @param userId  用户 ID
 * @param workId  作品 ID
 */
export function generateThumbnailKey(userId: string, workId: string): string {
  const uid = sanitize(userId);
  const wid = sanitize(workId);
  return `works/covers/${uid}/${wid}.jpg`;
}

/**
 * 生成对标视频 Key：benchmarks/videos/{userId}/{benchmarkId}.mp4
 *
 * @param userId       用户 ID
 * @param benchmarkId  对标视频 ID
 */
export function generateBenchmarkKey(
  userId: string,
  benchmarkId: string,
): string {
  const uid = sanitize(userId);
  const bid = sanitize(benchmarkId);
  return `benchmarks/videos/${uid}/${bid}.mp4`;
}

/**
 * 生成官方模板 Key：templates/{type}/{templateId}.{ext}
 *
 * @param templateId  模板 ID
 * @param type        模板类型，默认 video
 * @param ext         扩展名（不带点），默认 mp4
 */
export function generateTemplateKey(
  templateId: string,
  type: OSSObjectType = 'video',
  ext: string = 'mp4',
): string {
  const tid = sanitize(templateId);
  const t = sanitize(type);
  const e = ext.toLowerCase().replace(/^\./, '') || 'bin';
  return `templates/${t}/${tid}.${e}`;
}

/**
 * 生成临时上传 Key：temp/uploads/{userId}/{uuid}.{ext}
 * 临时目录应由生命周期规则定期清理
 *
 * @param userId  用户 ID
 * @param uuid    可选自定义 UUID，默认随机生成
 * @param ext     扩展名（不带点），默认 bin
 */
export function generateTempKey(
  userId: string,
  uuid: string = uuidv4(),
  ext: string = 'bin',
): string {
  const uid = sanitize(userId);
  const e = ext.toLowerCase().replace(/^\./, '') || 'bin';
  return `temp/uploads/${uid}/${uuid}.${e}`;
}
