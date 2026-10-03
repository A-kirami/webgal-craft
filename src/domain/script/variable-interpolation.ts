/**
 * 判断文本是否含有 WebGAL 变量插值：以成对花括号包起来的一段内容，如 `{chapter}`、`bg_{chapter}.png`。
 *
 * 引擎在运行时才把插值替换成具体值，诊断与资源索引都判断不了这类文本的最终取值，只能跳过。
 * 判据认整段文本而不只是「整串就是一个变量」：变量与字面文本混写时同样无法静态判断。
 */
export function hasVariableInterpolation(text: string): boolean {
  let searchFrom = 0

  while (searchFrom < text.length) {
    const openIndex = text.indexOf('{', searchFrom)
    if (openIndex === -1) {
      return false
    }

    const closeIndex = text.indexOf('}', openIndex + 1)
    if (closeIndex === -1) {
      return false
    }

    if (closeIndex > openIndex + 1) {
      return true
    }

    // `{}` 没有变量名，引擎替换不出内容，按字面文本继续往后找
    searchFrom = closeIndex + 1
  }

  return false
}
