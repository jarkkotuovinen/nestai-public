# Micro-Frontend Architecture

## Overview

This project demonstrates a production-ready micro-frontend architecture using **Module Federation** with Vite, showcasing patterns applicable to large-scale applications like NestAI's platform.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  SHELL (Host Application)                                   │
│  - http://localhost:5000                                    │
│  - Provides HostAPI to all remotes                          │
│  - Manages WebSocket connection                             │
│  - Event bus for cross-remote communication                 │
│  - Error boundaries & fallback handling                     │
└─────────────────────────────────────────────────────────────┘
           │
           ├──────────────────┬──────────────────┬─────────────────┐
           ▼                  ▼                  ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Map Remote   │  │ Perf Remote  │  │Controls      │  │Data Simulator│
    │ :5001        │  │ :5002        │  │Remote :5003  │  │:8080 (WS)    │
    └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
    - MapLibre        - FPS Monitor     - Sliders         - Binary data
    - Entity render   - Memory stats    - Keyboard help   - Drone sim
    - Click events    - Sparkline       - Settings        - 30 Hz updates
```

## Design Principles

### 1. Autonomy

Each remote can be developed, tested, and deployed independently:

```bash
# Team A deploys map remote
cd apps/map-remote
pnpm build
# Upload dist/ to CDN

# Shell doesn't need rebuild - just config change
remotes: {
  mapRemote: 'https://cdn.example.com/map/v1.2.4/remoteEntry.js'
}
```

### 2. Contracts Over Implementation

Shared `@packages/contracts` ensures type safety:

```typescript
// contracts/src/host-api.ts
export interface HostAPI {
  eventBus: EventBus;
  getDroneData(): Map<string, DroneData>;
  reportError(remote: string, error: Error): void;
  reportMetric(name: string, value: number): void;
}

// Every remote component receives this
export interface RemoteComponentProps {
  hostAPI: HostAPI;
}
```

**Benefits**:
- ✅ Breaking changes detected at compile time
- ✅ IntelliSense across all remotes
- ✅ Documentation via TypeScript types

### 3. Resilience

Failures are isolated:

```typescript
// ErrorBoundary per remote
<ErrorBoundary fallback={<MapFallback />}>
  <RemoteLoader config={{ scope: 'mapRemote' }} />
</ErrorBoundary>

// Performance monitor fails? Map keeps working
<ErrorBoundary>
  <RemoteLoader config={{ scope: 'perfRemote' }} />
</ErrorBoundary>
```

### 4. Performance

Runtime is shared (singleton React):

```typescript
// vite.config.ts
shared: {
  react: {
    singleton: true,          // ← Only ONE React instance
    requiredVersion: '^19.0.0'
  }
}
```

**Bundle sizes** (with sharing):
- Shell: ~150KB
- Map Remote: ~450KB (includes MapLibre)
- Perf Remote: ~80KB
- Controls Remote: ~50KB
- **Total**: ~730KB (vs ~2.5MB without sharing)

## Communication Patterns

### Event Bus (Recommended)

Decoupled, type-safe communication:

```typescript
// Map remote publishes
hostAPI.eventBus.publish<DroneSelectedEvent>('drone:selected', {
  type: 'drone:selected',
  payload: { droneId: 'DRONE-001' },
});

// Controls remote subscribes
useEffect(() => {
  const unsubscribe = hostAPI.eventBus.subscribe<DroneSelectedEvent>(
    'drone:selected',
    (event) => {
      console.log('Selected:', event.payload.droneId);
    }
  );
  return unsubscribe;
}, []);
```

### Direct API Calls (Anti-Pattern)

❌ **Don't do this**:
```typescript
// Bad: Direct import creates tight coupling
import { selectDrone } from 'mapRemote/actions';
```

✅ **Do this instead**:
```typescript
// Good: Event bus maintains independence
hostAPI.eventBus.publish('drone:selected', { droneId });
```

## Deployment Strategy

### Development

All apps run locally:
```bash
pnpm dev  # Starts all 5 apps in parallel
```

### Staging

Incremental deployment:
```bash
# Deploy only map remote
cd apps/map-remote
pnpm build
aws s3 sync dist/ s3://cdn-staging/map-remote/latest/

# Shell points to staging URL
VITE_MAP_REMOTE_URL=https://cdn-staging.example.com/map-remote/latest/remoteEntry.js
```

### Production

Versioned releases with canary:
```typescript
const REMOTE_URLS = {
  production: {
    mapRemote: shouldUseCanary()
      ? 'https://cdn.example.com/map-remote/v1.3.0-canary/remoteEntry.js'
      : 'https://cdn.example.com/map-remote/v1.2.3/remoteEntry.js',
  },
};

function shouldUseCanary(): boolean {
  return Math.random() < 0.1; // 10% canary
}
```

## Version Management

### Semantic Versioning

Each remote has independent versions:

| Remote | Version | Breaking Change? |
|--------|---------|------------------|
| mapRemote | v1.2.3 | No |
| perfRemote | v2.0.0 | Yes (HostAPI v2) |
| controlsRemote | v1.0.5 | No |

### Compatibility Checks

```typescript
// manifest.ts in each remote
export const manifest: RemoteManifest = {
  name: 'mapRemote',
  version: '1.2.3',
  react: {
    minVersion: '19.0.0',
    maxVersion: '19.x',
  },
  maxBundleSize: 500_000,
  maxLoadTime: 2000,
};

// Shell validates on load
async function validateRemote(remoteName: string) {
  const manifest = await import(`${remoteName}/manifest`);
  if (!isCompatible(manifest.react, SHELL_REACT_VERSION)) {
    throw new Error(`${remoteName} incompatible`);
  }
}
```

## Testing Strategy

### Unit Tests

Test remotes in isolation:
```typescript
// map-remote/__tests__/MapWidget.test.tsx
const mockHostAPI: HostAPI = {
  eventBus: createMockEventBus(),
  getDroneData: () => new Map(),
  reportError: vi.fn(),
  reportMetric: vi.fn(),
};

test('renders map with initial drones', () => {
  render(<MapWidget hostAPI={mockHostAPI} />);
  expect(screen.getByRole('region')).toBeInTheDocument();
});
```

### Integration Tests

Test cross-remote communication:
```typescript
test('selecting drone updates all remotes', async () => {
  const { getByTestId } = render(<Shell />);

  // Click drone in map
  fireEvent.click(getByTestId('drone-DRONE-001'));

  // Verify controls panel updated
  await waitFor(() => {
    expect(getByTestId('selected-drone-id')).toHaveTextContent('DRONE-001');
  });
});
```

### E2E Tests (Playwright)

Test full deployment:
```typescript
test('all remotes load successfully', async ({ page }) => {
  await page.goto('http://localhost:5000');

  // Verify map remote loaded
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();

  // Verify performance monitor loaded
  await expect(page.locator('text=FPS:')).toBeVisible();

  // Verify controls loaded
  await expect(page.locator('input[type="range"]')).toBeVisible();
});
```

## Performance Budgets

### Bundle Size Limits

```typescript
// enforced in CI
const BUNDLE_BUDGETS = {
  shell: 200_000,        // 200KB
  mapRemote: 500_000,    // 500KB (includes MapLibre)
  perfRemote: 100_000,   // 100KB
  controlsRemote: 50_000, // 50KB
};
```

### Load Time Targets

- Shell: < 1s
- Critical remotes (map): < 2s
- Non-critical remotes (perf, controls): < 1s

## Monitoring & Telemetry

### Error Tracking

```typescript
reportError(remote: string, error: Error) {
  // Production: Send to Sentry
  Sentry.captureException(error, {
    tags: { remote },
  });
}
```

### Performance Metrics

```typescript
reportMetric(name: string, value: number) {
  // Production: Send to DataDog
  datadogRum.addAction(name, { value });
}
```

### Usage Analytics

```typescript
// Track remote load times
const loadStart = performance.now();
await import('mapRemote');
const loadTime = performance.now() - loadStart;
hostAPI.reportMetric('remote.load_time.map', loadTime);
```

## Best Practices

### DO ✅

1. **Use shared contracts package** for type safety
2. **Communicate via event bus** for loose coupling
3. **Version remotes independently** for team autonomy
4. **Add error boundaries** for graceful degradation
5. **Implement fallbacks** for critical remotes
6. **Monitor load times** and bundle sizes
7. **Test remotes in isolation** first

### DON'T ❌

1. **Import directly from remotes** (breaks independence)
2. **Share mutable state** across remotes
3. **Skip error handling** (one failure shouldn't crash all)
4. **Deploy without manifest validation**
5. **Ignore bundle budgets** (breaks performance)
6. **Skip backward compatibility** checks

## Real-World Scenarios

### Scenario 1: Hotfix Map Remote

```bash
# 1. Fix critical bug in map remote
cd apps/map-remote
# ... make fix ...
pnpm build

# 2. Deploy ONLY map remote (v1.2.4)
aws s3 sync dist/ s3://cdn/map-remote/v1.2.4/

# 3. Update shell config (no rebuild needed)
VITE_MAP_REMOTE_URL=https://cdn.example.com/map-remote/v1.2.4/remoteEntry.js
```

**Result**: Map fix deployed in minutes, other remotes unaffected.

### Scenario 2: Performance Remote Down

```typescript
// Shell handles gracefully
<ErrorBoundary>
  <RemoteLoader
    config={{ scope: 'perfRemote' }}
    fallback={() => null} // Just hide it
  />
</ErrorBoundary>
```

**Result**: Map and controls keep working, users can still operate.

### Scenario 3: Upgrade React

```bash
# 1. Update shell to React 19.1
cd apps/shell
pnpm add react@19.1

# 2. Update remotes gradually
cd apps/map-remote
pnpm add react@19.1
# Deploy when ready

# 3. Old remotes still work (singleton shared)
```

**Result**: Gradual migration without big-bang deployment.

## Comparison: Monolith vs Micro-Frontends

| Aspect | Monolith | Micro-Frontends (This Project) |
|--------|----------|-------------------------------|
| **Deploy speed** | 10-30 min (full rebuild) | 2-5 min (single remote) |
| **Blast radius** | Entire app | Single remote |
| **Team autonomy** | Shared codebase | Independent repos |
| **Bundle size** | ~2.5MB | ~730KB (with sharing) |
| **Complexity** | Low | Medium |
| **Best for** | Small teams | Large orgs (NestAI) |

## Conclusion

This architecture demonstrates:

✅ **Production patterns** - Error boundaries, fallbacks, versioning
✅ **Performance** - Shared runtime, lazy loading, bundle budgets
✅ **Developer experience** - Type safety, hot reload, independence
✅ **Operational excellence** - Monitoring, gradual rollouts, quick hotfixes

Perfect fit for **NestAI's** multi-team, mission-critical platform.
