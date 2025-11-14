import SceneParser from 'webgal-parser'
import { ADD_NEXT_ARG_LIST, SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'

export const WebgalParser = new SceneParser(
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  () => {},
  (fileName: string) => {
    return fileName
  },
  ADD_NEXT_ARG_LIST,
  SCRIPT_CONFIG,
)
