import { FieldDef, UNSPECIFIED } from '~/features/editor/command-registry/schema'

export function readJsonFieldValue(
  rawValue: string,
  fieldKey: string,
  fieldType?: FieldDef['type'],
): string | number | boolean | undefined {
  try {
    const objectValue = JSON.parse(rawValue) as Record<string, unknown>
    const value = objectValue[fieldKey]
    if (value === undefined) {
      return ''
    }

    if (fieldType === 'switch') {
      return value === 'true' || value === true
    }

    if (fieldType === 'number') {
      if (typeof value === 'number') {
        return value
      }
      const parsed = Number(value)
      return Number.isNaN(parsed) ? String(value) : parsed
    }

    return String(value)
  } catch {
    return ''
  }
}

export function writeJsonFieldValue(
  rawValue: string,
  fieldKey: string,
  value: string | number | boolean,
  fieldType?: FieldDef['type'],
): string {
  let objectValue: Record<string, unknown> = {}
  try {
    objectValue = JSON.parse(rawValue) as Record<string, unknown>
  } catch {
    // 忽略 JSON 解析错误，按空对象继续
  }

  if (value === '' || value === null || value === undefined || value === UNSPECIFIED) {
    delete objectValue[fieldKey]
  } else if (fieldType === 'switch') {
    objectValue[fieldKey] = value === true || value === 'true'
  } else if (fieldType === 'number') {
    const numberValue = Number(value)
    objectValue[fieldKey] = Number.isNaN(numberValue) ? value : numberValue
  } else {
    objectValue[fieldKey] = value
  }

  return Object.keys(objectValue).length > 0 ? JSON.stringify(objectValue) : ''
}
