/**
 * 项目内路径类型与工厂。
 *
 * - AbsPath：绝对文件系统路径（POSIX 形式，盘符大写归一）
 * - RelPath：项目相对逻辑路径，保留 segment 大小写
 *
 * 本模块只表达路径身份，不表达业务查找键，也不依赖 Vue / Tauri 运行时。
 * 大小写折叠比较与查找键派生位于 `~/services/resource-path/lookup`。
 */

export { AbsPath } from './abs'
export { RelPath } from './rel'
export { normalizePosix, PathError } from './normalize'
