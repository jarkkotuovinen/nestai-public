import type { RemoteManifest } from '@packages/contracts';

export const manifest: RemoteManifest = {
  name: 'controlsRemote',
  version: '1.0.5',
  react: {
    minVersion: '19.0.0',
    maxVersion: '19.x',
  },
  maxBundleSize: 50_000, // 50KB
  maxLoadTime: 1000, // 1s
};
