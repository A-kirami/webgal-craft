import { loadWASM } from 'onigasm'

let initialized = false

/**
 * 初始化 Onigasm 正则表达式引擎(仅一次)
 */
export async function initOnigasm() {
  if (initialized) {
    return
  }
  await loadWASM('/lib/onigasm.wasm')
  initialized = true
}
