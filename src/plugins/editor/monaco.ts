/* eslint-disable new-cap */
/* eslint-disable import-x/default */
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

const cssWorkerLabels = new Set(['css', 'scss', 'less'])
const htmlWorkerLabels = new Set(['html', 'handlebars', 'razor'])
const tsWorkerLabels = new Set(['typescript', 'javascript'])

// eslint-disable-next-line unicorn/prefer-global-this
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker()
    }
    if (cssWorkerLabels.has(label)) {
      return new cssWorker()
    }
    if (htmlWorkerLabels.has(label)) {
      return new htmlWorker()
    }
    if (tsWorkerLabels.has(label)) {
      return new tsWorker()
    }
    return new editorWorker()
  },
}
