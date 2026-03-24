import { expect } from 'vitest'

import { parseSentence } from '~/helper/webgal-script/parser'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { CommandParamDescriptor } from '~/helper/webgal-script/params'

type TestCommandParamType = 'text' | 'number' | 'switch' | 'select'

export function mustParse(raw: string): ISentence {
  const parsed = parseSentence(raw)
  expect(parsed).toBeDefined()
  return parsed!
}

export function makeParamDef(
  key: string,
  type: TestCommandParamType,
  defaultValue?: string | boolean | number,
): CommandParamDescriptor {
  return {
    key,
    type,
    defaultValue,
  }
}
