import { Mime } from 'mime/lite'
import otherTypes from 'mime/types/other.js'
import standardTypes from 'mime/types/standard.js'

export const mime = new Mime(standardTypes, otherTypes)

mime.define({
  // 'text/x-scss': ['scss'], // 在此处添加新的 MIME 类型定义, 此行为示例
})
