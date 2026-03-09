import type { arg } from 'webgal-parser/src/interface/sceneInterface'

/** 在 args 数组中插入或更新指定 key 的参数 */
export function upsertArg(args: arg[], key: string, value: string | boolean): void {
  const idx = args.findIndex(a => a.key === key)
  if (idx === -1) {
    args.push({ key, value })
  } else {
    args[idx] = { key, value }
  }
}

/** 从 args 数组中移除指定 key 的参数 */
export function removeArg(args: arg[], key: string): void {
  const idx = args.findIndex(a => a.key === key)
  if (idx !== -1) {
    args.splice(idx, 1)
  }
}

/** 有值时 upsert，空值或等于默认值时移除 */
export function setOrRemoveArg(
  args: arg[],
  key: string,
  value: string,
  defaultValue?: string | boolean | number,
): void {
  if (value === '' || (defaultValue !== undefined && value === String(defaultValue))) {
    removeArg(args, key)
  } else {
    upsertArg(args, key, value)
  }
}
