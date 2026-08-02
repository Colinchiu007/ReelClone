/**
 * 生成类型枚举（Capability Registry 权威定义）
 *
 * 所有模块应从 @reelclone/capability 导入此枚举，
 * 而非各自重复定义。
 */
export enum GenerationType {
  TEXT_TO_VIDEO = 'TEXT_TO_VIDEO',
  IMAGE_TO_VIDEO_FIRST = 'IMAGE_TO_VIDEO_FIRST',
  IMAGE_TO_VIDEO_FIRST_LAST = 'IMAGE_TO_VIDEO_FIRST_LAST',
  THREE_D_MODELING = '3D_MODELING',
  EDIT_VIDEO = 'EDIT_VIDEO',
  EXTEND_VIDEO = 'EXTEND_VIDEO',
  TEXT_GENERATE = 'TEXT_GENERATE',
  IMAGE_GENERATE = 'IMAGE_GENERATE',
}
