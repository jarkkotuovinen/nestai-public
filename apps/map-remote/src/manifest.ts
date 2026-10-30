import type { RemoteManifest } from '@packages/contracts';

export const manifest: RemoteManifest = {
  name: 'mapRemote',
  version: '1.2.3',
  react: {
    minVersion: '19.0.0',
    maxVersion: '19.x',
  },
  maxBundleSize: 500_000, // 500KB
  maxLoadTime: 2000, // 2s
};
