// 获取编辑器默认选项
export function getDefaultEditorOptions() {
  return {
    fontSize: 14,
    tabSize: 2,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    theme: 'vs-dark',
    fontFamily: 'FiraCode, Consolas, "Courier New", monospace',
    fontLigatures: true,
  }
}
