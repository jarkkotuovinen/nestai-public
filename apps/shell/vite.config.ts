import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      federation({
        name: 'shell',
        remotes: {
          mapRemote: env.VITE_MAP_REMOTE_URL || 'http://localhost:5001/assets/remoteEntry.js',
          perfRemote: env.VITE_PERF_REMOTE_URL || 'http://localhost:5002/assets/remoteEntry.js',
          controlsRemote: env.VITE_CONTROLS_REMOTE_URL || 'http://localhost:5003/assets/remoteEntry.js',
        },
        shared: {
          react: {
            singleton: true,
            requiredVersion: '^19.0.0',
          },
          'react-dom': {
            singleton: true,
            requiredVersion: '^19.0.0',
          },
        },
      }),
    ],
    build: {
      target: 'esnext',
    },
    server: {
      port: 5000,
      strictPort: true,
    },
  };
});
