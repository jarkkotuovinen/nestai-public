// Type declarations for remote modules
declare module 'mapRemote/MapWidget' {
  import { ComponentType } from 'react';
  import type { RemoteComponentProps } from '@packages/contracts';
  const MapWidget: ComponentType<RemoteComponentProps>;
  export default MapWidget;
}

declare module 'perfRemote/PerfMonitor' {
  import { ComponentType } from 'react';
  import type { RemoteComponentProps } from '@packages/contracts';
  const PerfMonitor: ComponentType<RemoteComponentProps>;
  export default PerfMonitor;
}

declare module 'controlsRemote/Controls' {
  import { ComponentType } from 'react';
  import type { RemoteComponentProps } from '@packages/contracts';
  const Controls: ComponentType<RemoteComponentProps>;
  export default Controls;
}
