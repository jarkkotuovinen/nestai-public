import type { RemoteManifest } from '@packages/contracts';

export const manifest: RemoteManifest = {
  name: 'perfRemote',
  version: '2.1.0',
  react: {
    minVersion: '19.0.0',
    maxVersion: '19.x',
  },
  maxBundleSize: 100_000, // 100KB
  maxLoadTime: 1000, // 1s
};
