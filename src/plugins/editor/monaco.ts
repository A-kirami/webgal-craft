/* eslint-disable new-cap */
/* eslint-disable import-x/default */
import { loader } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { wireTmGrammars } from 'monaco-editor-textmate'
import { Registry } from 'monaco-textmate'

import webgalTextmate from './grammars/webgal.tmLanguage.json'
import darkTheme from './themes/webgal-dark.json'
import lightTheme from './themes/webgal-light.json'

// eslint-disable-next-line unicorn/prefer-global-this
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker()
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    return new editorWorker()
  },
}

loader.config({ monaco })

// 主题名称常量
export const THEME_LIGHT = 'webgal-light'
export const THEME_DARK = 'webgal-dark'

// 定义主题
monaco.editor.defineTheme(THEME_LIGHT, lightTheme as monaco.editor.IStandaloneThemeData)
monaco.editor.defineTheme(THEME_DARK, darkTheme as monaco.editor.IStandaloneThemeData)

// 注册 WebGAL 脚本语言
monaco.languages.register({ id: 'webgalscript' })
monaco.languages.setLanguageConfiguration('webgalscript', {
  comments: { lineComment: ';' },
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
})

// 配置 WebGAL 脚本语法高亮
export async function configureWebgalSyntaxHighlighting(
  editor: monaco.editor.IStandaloneCodeEditor,
) {
  try {
    const registry = new Registry({
      getGrammarDefinition: async (scopeName) => {
        if (scopeName === 'source.webgal') {
          return {
            format: 'json',
            content: JSON.stringify(webgalTextmate),
          }
        }
        return { format: 'json', content: '' }
      },
    })

    const grammars = new Map([['webgalscript', 'source.webgal']])
    await registry.loadGrammar('source.webgal')
    await wireTmGrammars(monaco, registry, grammars, editor)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`配置 WebGAL 脚本语法高亮失败: ${errorMessage}`)
    throw error
  }
}
