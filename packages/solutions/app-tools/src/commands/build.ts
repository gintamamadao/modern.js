import { Configuration, webpack } from 'webpack';
import { WebpackConfigTarget, getWebpackConfig } from '@modern-js/webpack';
import {
  useAppContext,
  useResolvedConfigContext,
  mountHook,
  ResolvedConfigContext,
  manager,
} from '@modern-js/core';
import {
  formatWebpackMessages,
  measureFileSizesBeforeBuild,
  printFileSizesAfterBuild,
  printBuildError,
  logger,
  isUseSSRBundle,
  emptyDir,
} from '@modern-js/utils';
import { generateRoutes } from '../utils/routes';
import type { BuildOptions } from '../utils/types';

// These sizes are pretty large. We'll warn for bundles exceeding them.
const WARN_AFTER_BUNDLE_GZIP_SIZE = 512 * 1024;
const WARN_AFTER_CHUNK_GZIP_SIZE = 1024 * 1024;

// eslint-disable-next-line max-statements
export const build = async (options?: BuildOptions) => {
  /* eslint-disable react-hooks/rules-of-hooks */
  const resolvedConfig = useResolvedConfigContext();
  const appContext = useAppContext();
  const { existSrc } = appContext;
  /* eslint-enable react-hooks/rules-of-hooks */

  if (!existSrc) {
    const { distDirectory } = appContext;
    await emptyDir(distDirectory);
    await (mountHook() as any).beforeBuild({
      webpackConfigs: [],
    });

    await generateRoutes(appContext);

    await (mountHook() as any).afterBuild();

    return;
  }

  const webpackBuild = async (webpackConfig: Configuration, type?: string) => {
    const compiler = webpack(webpackConfig);

    return new Promise((resolve, reject) => {
      let label = process.env.NODE_ENV || '';
      if (type && type !== 'legacy') {
        label += ` ${type}`;
      }
      logger.info(`Creating a ${label} build...`);

      compiler.run((err, stats) => {
        let messages: {
          errors: any;
          warnings: any;
        };
        if (!err) {
          messages = formatWebpackMessages(
            stats!.toJson({ all: false, warnings: true, errors: true }),
          );

          if (messages.errors.length === 0) {
            logger.info(`File sizes after ${label} build:\n`);
            printFileSizesAfterBuild(
              stats,
              previousFileSizes,
              distDirectory,
              WARN_AFTER_BUNDLE_GZIP_SIZE,
              WARN_AFTER_CHUNK_GZIP_SIZE,
            );
            logger.log();
          }
        }

        // When using run or watch, call close and wait for it to finish before calling run or watch again.
        // Concurrent compilations will corrupt the output files.
        compiler.close(closeErr => {
          if (closeErr) {
            logger.error(closeErr);
          }
          if (err) {
            reject(err);
          } else {
            if (messages.errors.length) {
              reject(new Error(messages.errors.join('\n\n')));
              return;
            }
            resolve({ warnings: messages.warnings });
          }
        });
      });
    });
  };

  manager.run(() => {
    ResolvedConfigContext.set({ ...resolvedConfig, cliOptions: options });
  });

  const { distDirectory } = appContext;
  const previousFileSizes = await measureFileSizesBeforeBuild(distDirectory);
  await emptyDir(distDirectory);

  const buildConfigs: Array<{ type: string; config: any }> = [];
  buildConfigs.push({
    type: 'legacy',
    config: getWebpackConfig(WebpackConfigTarget.CLIENT)!,
  });

  if (resolvedConfig.output.enableModernMode) {
    buildConfigs.push({
      type: 'modern',
      config: getWebpackConfig(WebpackConfigTarget.MODERN)!,
    });
  }

  if (isUseSSRBundle(resolvedConfig)) {
    buildConfigs.push({
      type: 'ssr',
      config: getWebpackConfig(WebpackConfigTarget.NODE)!,
    });
  }

  await (mountHook() as any).beforeBuild({
    webpackConfigs: buildConfigs.map(({ config }) => config),
  });

  for (const buildConfig of buildConfigs) {
    const { type: buildType, config } = buildConfig;
    try {
      await webpackBuild(config, buildType);
    } catch (error) {
      printBuildError(error as Error);
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    }
  }

  await generateRoutes(appContext);

  await (mountHook() as any).afterBuild();
};
