# Getting Started

## Prerequisites

Make sure you have the following installed:

- **Node.js** >= 20 ([Download](https://nodejs.org/))
- **pnpm** >= 9 ([Install](https://pnpm.io/installation))

Verify installation:
```bash
node --version  # Should be v20+
pnpm --version  # Should be 9+
```

## Installation

1. **Clone or navigate to the project**:
   ```bash
   cd /Users/jarkko/Desktop/nestai
   ```

2. **Install all dependencies**:
   ```bash
   pnpm install
   ```

   This will install dependencies for all 7 workspace packages:
   - Root workspace
   - `@packages/contracts`
   - `@apps/shell`
   - `@apps/map-remote`
   - `@apps/perf-remote`
   - `@apps/controls-remote`
   - `@apps/data-simulator`

3. **Build shared packages**:
   ```bash
   pnpm --filter @packages/contracts build
   ```

## Running the Application

### Option 1: Start Everything (Recommended)

Run all apps in parallel with Turborepo:

```bash
pnpm dev
```

This starts:
- **Shell** (host): http://localhost:5000
- **Map Remote**: http://localhost:5001
- **Perf Remote**: http://localhost:5002
- **Controls Remote**: http://localhost:5003
- **WebSocket Simulator**: ws://localhost:8080

Open **http://localhost:5000** in your browser to see the full application.

### Option 2: Start Apps Individually

Useful for debugging specific remotes:

```bash
# Terminal 1: Data simulator (required)
cd apps/data-simulator
pnpm dev

# Terminal 2: Map remote
cd apps/map-remote
pnpm dev

# Terminal 3: Performance remote
cd apps/perf-remote
pnpm dev

# Terminal 4: Controls remote
cd apps/controls-remote
pnpm dev

# Terminal 5: Shell (loads all remotes)
cd apps/shell
pnpm dev
```

### Option 3: Standalone Remote Development

Develop a remote in isolation:

```bash
cd apps/map-remote
pnpm dev
# Visit http://localhost:5001
```

Each remote has a `main.tsx` with mock `HostAPI` for standalone development.

## Verifying the Setup

Once everything is running:

1. **Open http://localhost:5000**
2. You should see:
   - 🗺️ A map centered on Helsinki
   - 📊 Performance monitor (top-right) showing FPS
   - 🎛️ Controls panel (bottom-left) with sliders
   - ✈️ Animated drone markers on the map

3. **Check the console** for:
   ```
   ✅ Connected to WebSocket server
   🗺️  MapLibre initialized
   📊 Metric: map.entities = 100
   ```

4. **Test interactions**:
   - Drag the "Drone Count" slider → map updates
   - Click a drone → selection event logged
   - Pan/zoom the map → smooth 60 FPS

## Troubleshooting

### Port Already in Use

If you get `EADDRINUSE` errors:

```bash
# Kill processes on ports
lsof -ti:5000 | xargs kill  # Shell
lsof -ti:5001 | xargs kill  # Map
lsof -ti:5002 | xargs kill  # Perf
lsof -ti:5003 | xargs kill  # Controls
lsof -ti:8080 | xargs kill  # Simulator

# Then restart
pnpm dev
```

### Module Not Found Errors

If you see import errors:

```bash
# Rebuild contracts package
pnpm --filter @packages/contracts build

# Clear node_modules and reinstall
pnpm clean
rm -rf node_modules
pnpm install
```

### MapLibre Not Rendering

If the map is blank:

1. **Check browser console** for errors
2. **Verify WebSocket connection**: Should see "Connected to WebSocket server"
3. **Check remotes loaded**: In DevTools Network tab, look for `remoteEntry.js` files
4. **Try standalone map remote**:
   ```bash
   cd apps/map-remote
   pnpm dev
   # Visit http://localhost:5001
   ```

### TypeScript Errors

If you see type errors:

```bash
# Run type check to see details
pnpm typecheck

# Or check specific app
cd apps/shell
pnpm typecheck
```

## Development Workflow

### Making Changes

1. **Edit a file** (e.g., `apps/map-remote/src/MapWidget.tsx`)
2. **Hot reload** automatically updates the browser
3. **Only that remote rebuilds** (thanks to Module Federation)

### Adding a New Remote

1. **Create app structure**:
   ```bash
   mkdir -p apps/my-remote/src
   cd apps/my-remote
   ```

2. **Copy package.json** from an existing remote and update:
   ```json
   {
     "name": "@apps/my-remote",
     "version": "1.0.0",
     "scripts": {
       "dev": "vite --port 5004 --strictPort"
     }
   }
   ```

3. **Set up Module Federation** in `vite.config.ts`:
   ```typescript
   federation({
     name: 'myRemote',
     filename: 'remoteEntry.js',
     exposes: {
       './MyWidget': './src/MyWidget.tsx',
     },
     shared: { /* ... */ },
   })
   ```

4. **Add to shell** (`apps/shell/vite.config.ts`):
   ```typescript
   remotes: {
     myRemote: 'http://localhost:5004/assets/remoteEntry.js',
   }
   ```

5. **Load in shell** (`apps/shell/src/App.tsx`):
   ```tsx
   <RemoteLoader
     config={{ scope: 'myRemote', module: 'MyWidget' }}
     hostAPI={hostAPI}
   />
   ```

### Building for Production

```bash
# Build all apps
pnpm build

# Or build specific app
pnpm --filter @apps/map-remote build

# Preview production build
cd apps/shell
pnpm preview
```

## Next Steps

- 📖 Read [Micro-Frontend Architecture](./micro-frontend-architecture.md)
- 🎯 Check [Performance Guide](./performance.md)
- 🧪 Learn [Testing Patterns](./testing.md)
- 🚀 See [Deployment Guide](./deployment.md)

## Quick Reference

### Common Commands

```bash
pnpm dev              # Start all apps
pnpm dev:shell        # Start shell only
pnpm dev:remotes      # Start all remotes only
pnpm build            # Build all apps
pnpm typecheck        # Type check all apps
pnpm clean            # Clean build artifacts
pnpm test             # Run tests (when added)
```

### URLs

- Shell: http://localhost:5000
- Map Remote: http://localhost:5001
- Perf Remote: http://localhost:5002
- Controls Remote: http://localhost:5003
- WebSocket: ws://localhost:8080

### Project Structure

```
apps/
├── shell/              # Host application
├── map-remote/         # Map widget
├── perf-remote/        # Performance monitor
├── controls-remote/    # Controls panel
└── data-simulator/     # WebSocket server

packages/
└── contracts/          # Shared types
```

---

**Need help?** Check the README.md or open an issue.
