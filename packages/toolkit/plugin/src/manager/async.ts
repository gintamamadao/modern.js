import { runWithContainer, createContainer } from 'farrow-pipeline';
import {
  InitOptions,
  generateRunner,
  hasOwnProperty,
  DEFAULT_OPTIONS,
} from './sync';
import { useRunner } from './runner';
import type {
  HooksMap,
  PluginOptions,
  HooksToRunners,
  HooksToThreads,
} from './types';

export type AsyncSetup<O> = () => void | O | Promise<O | void>;

const ASYNC_PLUGIN_SYMBOL = 'ASYNC_PLUGIN_SYMBOL';

export type AsyncPlugin<O> = {
  setup: AsyncSetup<O>;
  ASYNC_PLUGIN_SYMBOL: typeof ASYNC_PLUGIN_SYMBOL;
} & Required<PluginOptions>;

export type IndexAsyncPlugin<O> = AsyncPlugin<O> & {
  index: number;
};

export type AsyncPlugins<O> = AsyncPlugin<O>[];
export type AsyncIndexPlugins<O> = IndexAsyncPlugin<O>[];

export type AsyncPluginFromAsyncManager<M extends AsyncManager<any, any>> =
  M extends AsyncManager<infer ExtraHooks, infer BaseHooks>
    ? AsyncPlugin<Partial<HooksToThreads<BaseHooks & ExtraHooks>>>
    : never;

export type PluginFromAsyncManager<M extends AsyncManager<any, any>> =
  M extends AsyncManager<infer ExtraHooks, infer BaseHooks>
    ? AsyncPlugin<Partial<HooksToThreads<BaseHooks & ExtraHooks>>>
    : never;

export type AsyncManager<
  ExtraHooks extends HooksMap,
  BaseHooks extends HooksMap | void = void,
> = {
  createPlugin: (
    setup: AsyncSetup<Partial<HooksToThreads<BaseHooks & ExtraHooks>>>,
    options?: PluginOptions,
  ) => AsyncPlugin<Partial<HooksToThreads<BaseHooks & ExtraHooks>>>;

  isPlugin: (
    input: Record<string, unknown>,
  ) => input is AsyncPlugin<Partial<HooksToThreads<BaseHooks & ExtraHooks>>>;

  usePlugin: (
    ...input: AsyncPlugins<Partial<HooksToThreads<BaseHooks & ExtraHooks>>>
  ) => AsyncManager<ExtraHooks, BaseHooks>;

  init: (
    options?: InitOptions,
  ) => Promise<HooksToRunners<BaseHooks & ExtraHooks>>;

  run: <O>(cb: () => O, options?: InitOptions) => O;

  registerHook: (newHooks: Partial<ExtraHooks>) => void;

  clone: () => AsyncManager<ExtraHooks, BaseHooks>;

  clear: () => void;

  useRunner: () => HooksToRunners<BaseHooks & ExtraHooks>;
};

export const createAsyncManager = <
  // eslint-disable-next-line @typescript-eslint/ban-types
  ExtraHooks extends Record<string, any> = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  BaseHooks extends HooksMap = {},
>(
  hooks: BaseHooks,
): AsyncManager<ExtraHooks, BaseHooks> => {
  let index = 0;
  const createPlugin: AsyncManager<ExtraHooks, BaseHooks>['createPlugin'] = (
    setup,
    options = {},
  ) => ({
    ...DEFAULT_OPTIONS,
    name: `No.${index++} plugin`,
    ...options,
    ASYNC_PLUGIN_SYMBOL,
    setup,
  });

  const isPlugin: AsyncManager<ExtraHooks, BaseHooks>['isPlugin'] = (
    input,
  ): input is AsyncPlugin<Partial<HooksToThreads<BaseHooks & ExtraHooks>>> =>
    hasOwnProperty(input, ASYNC_PLUGIN_SYMBOL) &&
    input[ASYNC_PLUGIN_SYMBOL] === ASYNC_PLUGIN_SYMBOL;

  const registerHook: AsyncManager<
    ExtraHooks,
    BaseHooks
  >['registerHook'] = extraHooks => {
    // eslint-disable-next-line no-param-reassign
    hooks = {
      ...extraHooks,
      ...hooks,
    } as any;
  };

  const clone = () => {
    let plugins: AsyncIndexPlugins<
      Partial<HooksToThreads<BaseHooks & ExtraHooks>>
    > = [];

    const usePlugin: AsyncManager<ExtraHooks, BaseHooks>['usePlugin'] = (
      ...input
    ) => {
      for (const plugin of input) {
        if (isPlugin(plugin)) {
          if (!includeAsyncPlugin(plugins, plugin)) {
            plugins.push({
              ...plugin,
              index: plugins.length,
            });
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          console.warn(`Unknown plugin: ${plugin.name}`);
        }
      }

      return manager;
    };

    const clear = () => {
      plugins = [];
    };

    const currentContainer = createContainer();

    const init: AsyncManager<ExtraHooks, BaseHooks>['init'] = async options => {
      const container = options?.container || currentContainer;

      const sortedPlugins = sortAsyncPlugins(plugins);

      checkAsyncPlugins(sortedPlugins);

      const hooksList = await Promise.all(
        sortedPlugins.map(plugin =>
          runWithContainer(() => plugin.setup(), container),
        ),
      );

      return generateRunner<ExtraHooks, BaseHooks>(hooksList, container, hooks);
    };

    const run: AsyncManager<ExtraHooks, BaseHooks>['run'] = (cb, options) => {
      const container = options?.container || currentContainer;

      return runWithContainer(cb, container);
    };

    const manager = {
      createPlugin,
      isPlugin,
      usePlugin,
      init,
      run,
      clear,
      clone,
      registerHook,
      useRunner,
    };

    return manager;
  };

  return clone();
};

const includeAsyncPlugin = <O>(
  plugins: AsyncPlugins<O>,
  input: AsyncPlugin<O>,
): boolean => {
  for (const plugin of plugins) {
    if (plugin.name === input.name) {
      return true;
    }
  }

  return false;
};

const sortAsyncPlugins = <O>(
  input: AsyncIndexPlugins<O>,
): AsyncIndexPlugins<O> => {
  let plugins = input.slice();

  for (let i = 0; i < plugins.length; i++) {
    const plugin = plugins[i];

    for (const pre of plugin.pre) {
      for (let j = i + 1; j < plugins.length; j++) {
        if (plugins[j].name === pre) {
          plugins = [
            ...plugins.slice(0, i),
            plugins[j],
            ...plugins.slice(i, j),
            ...plugins.slice(j + 1, plugins.length),
          ];
        }
      }
    }

    for (const post of plugin.post) {
      for (let j = 0; j < i; j++) {
        if (plugins[j].name === post) {
          plugins = [
            ...plugins.slice(0, j),
            ...plugins.slice(j + 1, i + 1),
            plugins[j],
            ...plugins.slice(i + 1, plugins.length),
          ];
        }
      }
    }
  }

  return plugins;
};

const checkAsyncPlugins = <O>(plugins: AsyncIndexPlugins<O>) => {
  for (const origin of plugins) {
    for (const rival of origin.rivals) {
      for (const plugin of plugins) {
        if (rival === plugin.name) {
          throw new Error(`${origin.name} has rival ${plugin.name}`);
        }
      }
    }

    for (const required of origin.required) {
      if (!plugins.some(plugin => plugin.name === required)) {
        throw new Error(
          `The plugin: ${required} is required when plugin: ${origin.name} is exist.`,
        );
      }
    }
  }
};
