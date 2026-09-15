export const UPLOAD_FORMATS = [
  'jpg',
  'png',
  'webp',
  'gif',
  'pdf',
  'txt',
  'csv',
  'docx',
  'xlsx',
  'pptx',
  'zip',
  'mp3',
  'mp4',
] as const

export type UploadFormat = typeof UPLOAD_FORMATS[number]
export type AttachmentVisibility = 'private' | 'public'

// Resource ceilings, not runtime business settings. Actual limits come from policy rows.
export const UPLOAD_MAX_BYTES = 1024 * 1024 * 1024
export const UPLOAD_POLICY_CACHE_SECONDS = 60
export const UPLOAD_POLICY_PERMISSIONS = {
  READ: 'system:upload-policy:read',
  WRITE: 'system:upload-policy:write',
} as const
