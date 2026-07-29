/**
 * UploadManager —— 文件直传 OSS
 *
 * 流程：
 *  1. 调用 asset-service 获取 STS 上传凭证（uploadUrl + key + token）
 *  2. 使用 Taro.uploadFile 直传 OSS（表单上传方式）
 *  3. 返回 { key, url } 供业务层登记资产记录
 *
 * 进度回调：通过 onProgress 参数暴露给调用方（如 useUpload Hook）
 */
import Taro from '@tarojs/taro';
import type { UploadToken } from '@/types';
import { request } from './request';

/**
 * 上传文件到 OSS
 *
 * @param file        文件信息（path 为本地临时路径，size 为字节大小）
 * @param type        文件类型：image / video / audio
 * @param onProgress  上传进度回调（0-100）
 * @returns { key, url } OSS 存储键与可访问 URL
 */
export async function uploadFile(
  file: { path: string; size: number },
  type: 'image' | 'video' | 'audio',
  onProgress?: (percent: number) => void,
): Promise<{ key: string; url: string }> {
  // 1. 获取 STS 上传凭证
  const fileType = type.toUpperCase();
  const fileName = file.path.split('/').pop() || `upload-${Date.now()}`;

  const token = await request.post<UploadToken>('/assets/upload-token', {
    fileType,
    fileName,
  });

  // 2. 直传 OSS
  await new Promise<void>((resolve, reject) => {
    const uploadTask = Taro.uploadFile({
      url: token.uploadUrl,
      filePath: file.path,
      name: 'file',
      formData: {
        key: token.key,
        token: token.token,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`上传失败 (HTTP ${res.statusCode})`));
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '文件上传失败'));
      },
    });

    // 进度回调
    if (onProgress) {
      uploadTask.onProgressUpdate((progressRes) => {
        onProgress(progressRes.progress);
      });
    }
  });

  // 3. 构造可访问 URL（uploadUrl 为 OSS endpoint，拼接 key 即为文件访问地址）
  const base = token.uploadUrl.endsWith('/')
    ? token.uploadUrl
    : `${token.uploadUrl}/`;

  return {
    key: token.key,
    url: `${base}${token.key}`,
  };
}
