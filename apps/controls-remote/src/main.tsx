import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DemoControls from './DemoControls';
import type { HostAPI } from '@packages/contracts';

// Mock HostAPI for standalone development
const mockHostAPI: HostAPI = {
  eventBus: {
    subscribe: () => () => {},
    publish: () => {},
  },
  getDroneData: () => new Map(),
  reportError: (remote, error) => console.error(`[${remote}]`, error),
  reportMetric: (name, value) => console.log(`Metric: ${name} = ${value}`),
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoControls hostAPI={mockHostAPI} />
  </StrictMode>
);
