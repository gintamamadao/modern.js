import { createPlugin, usePlugins, defineConfig } from '@modern-js/core';
import { i18n } from './locale';
import { newCli, deployCli, clearCli } from './cli';
import { getLocaleLanguage } from './utils/language';
import { lifecycle } from './hooks';

export { defineConfig };

// eslint-disable-next-line react-hooks/rules-of-hooks
usePlugins([require.resolve('@modern-js/plugin-changeset/cli')]);

export default createPlugin(
  () => {
    lifecycle();
    const locale = getLocaleLanguage();
    i18n.changeLanguage({ locale });

    return {
      commands({ program }: any) {
        clearCli(program);
        deployCli(program);
        newCli(program, locale);
      },
    };
  },
  { post: ['@modern-js/plugin-changeset'] },
) as any;
