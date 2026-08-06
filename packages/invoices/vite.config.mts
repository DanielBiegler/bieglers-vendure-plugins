import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { join, resolve, } from 'path';
import { pathToFileURL } from 'url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/dashboard',
  build: {
    outDir: join(__dirname, 'dev-server/dashboard'),
  },
  plugins: [
    vendureDashboardPlugin({
      vendureConfigPath: pathToFileURL('./dev-server/vendure-config.ts'),
      api: { host: 'http://localhost', port: 3000 },
      gqlOutputPath: './src/gql',
      useExperimentalBundle: true,
      pathAdapter: {
        sourceRoot: resolve(__dirname, '../..'),
        getCompiledConfigPath: ({ outputPath, configFileName }) => {
          // If this works, make a helper to extract the folder name (here invoices) so that we can copy paste this config
          return join(outputPath, 'packages/invoices/dev-server', configFileName);
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@/gql': resolve(__dirname, './src/gql/graphql.ts'),
    },
  },
});