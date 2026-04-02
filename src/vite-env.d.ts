declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.yaml' {
  const contents: unknown
  export default contents
}

declare module '*.yml' {
  const contents: unknown
  export default contents
}
