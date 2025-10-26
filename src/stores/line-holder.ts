import { Position } from 'monaco-editor'
import { defineStore } from 'pinia'

// 临时存储各场景文件的光标位置
export const useLineHolderStore = defineStore(
  'line-holder',
  () => {
    const sceneLineMap = $ref(new Map<string, Position>())

    const getPosition = (path: string): Position | undefined => {
      return sceneLineMap.get(path)
    }

    const setPosition = (path: string, position: Position) => {
      sceneLineMap.set(path, position)
    }

    const setLineNumber = (path: string, lineNumber: number) => {
      const pos = sceneLineMap.get(path)
      if (pos) {
        sceneLineMap.set(path, { ...pos, lineNumber })
      } else {
        sceneLineMap.set(path, new Position(lineNumber, 1))
      }
    }

    return $$({
      getPosition,
      setPosition,
      setLineNumber,
    })
  },
)
