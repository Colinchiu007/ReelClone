/**
 * useUpload —— 上传 Hook
 *
 * 返回：
 *  - uploading       是否上传中
 *  - progress        上传进度（0-100）
 *  - upload          单文件上传
 *  - uploadMultiple  多文件并行上传
 *
 * upload(file, type?)   上传单个文件，返回 { key, url }
 * uploadMultiple(files, type?)  并行上传多个文件，返回 { key, url }[]
 */
import { useState, useCallback } from 'react';
import { uploadFile } from '@/services/upload';

type FileType = 'image' | 'video' | 'audio';

interface UploadResult {
  key: string;
  url: string;
}

interface UploadFileInput {
  path: string;
  size: number;
}

export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  /** 单文件上传 */
  const upload = useCallback(
    async (file: UploadFileInput, type: FileType = 'image'): Promise<UploadResult> => {
      setUploading(true);
      setProgress(0);
      try {
        const result = await uploadFile(file, type, (percent) => {
          setProgress(percent);
        });
        setProgress(100);
        return result;
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  /** 多文件并行上传 */
  const uploadMultiple = useCallback(
    async (files: UploadFileInput[], type: FileType = 'image'): Promise<UploadResult[]> => {
      setUploading(true);
      setProgress(0);
      try {
        const total = files.length;
        let completed = 0;

        const results = await Promise.all(
          files.map((file) =>
            uploadFile(file, type, () => {
              completed++;
              setProgress(Math.round((completed / total) * 100));
            }),
          ),
        );
        setProgress(100);
        return results;
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  return { uploading, progress, upload, uploadMultiple };
}
