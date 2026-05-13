import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'providers/s3/index': 'src/providers/s3/index.ts',
    'providers/r2/index': 'src/providers/r2/index.ts',
    'providers/gcs/index': 'src/providers/gcs/index.ts',
    'providers/azure/index': 'src/providers/azure/index.ts',
    'providers/spaces/index': 'src/providers/spaces/index.ts',
    'providers/b2/index': 'src/providers/b2/index.ts',
    'providers/minio/index': 'src/providers/minio/index.ts',
    'providers/supabase/index': 'src/providers/supabase/index.ts',
    'providers/firebase/index': 'src/providers/firebase/index.ts',
    'providers/appwrite/index': 'src/providers/appwrite/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: [
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@aws-sdk/lib-storage',
    '@google-cloud/storage',
    '@azure/storage-blob',
    '@supabase/supabase-js',
    'firebase-admin',
    'node-appwrite',
    'minio',
  ],
  esbuildOptions(options) {
    options.banner = {
      js: '"use strict";',
    };
  },
});
