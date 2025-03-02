import type Less from 'less';
import type { LoaderContext } from 'webpack';
import '@modern-js/core';

type Options = {
  lessOptions?: Less.Options;
  additionalData?:
    | string
    | ((content: string, loaderContext: LoaderContext<Options>) => string);
  sourceMap?: boolean;
  webpackImporter?: boolean;
  implementation?: boolean;
};

declare module '@modern-js/core' {
  interface ToolsConfig {
    less?: Options | ((options: Options) => Options | void);
  }
}
