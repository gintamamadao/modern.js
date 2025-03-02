/// <reference types='@modern-js/module-tools/type' />
/// <reference types='@modern-js/plugin-testing/type' />

declare module '@serverless/components' {
  async function runComponents(): Promise<void>;
  export = { runComponents };
}
