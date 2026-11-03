declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** version do package.json, definido no vite.config.ts. */
declare const __APP_VERSION__: string
