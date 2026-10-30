#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StaticSiteStack } from '../lib/static-site-stack-no-domain';
import { WebSocketStack } from '../lib/websocket-stack-no-domain';
import { EC2WebSocketStack } from '../lib/ec2-websocket-stack';

const app = new cdk.App();

// Configuration
const config = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
};

// Deploy map-remote
const mapRemoteStack = new StaticSiteStack(app, 'MapRemoteStack', {
  ...config,
  appName: 'map-remote',
  sourcePath: '../apps/map-remote/dist',
});

// Deploy perf-remote
const perfRemoteStack = new StaticSiteStack(app, 'PerfRemoteStack', {
  ...config,
  appName: 'perf-remote',
  sourcePath: '../apps/perf-remote/dist',
});

// Deploy controls-remote
const controlsRemoteStack = new StaticSiteStack(app, 'ControlsRemoteStack', {
  ...config,
  appName: 'controls-remote',
  sourcePath: '../apps/controls-remote/dist',
});

// Deploy WebSocket API (Lambda - optional, keeping for reference)
const webSocketStack = new WebSocketStack(app, 'WebSocketStack', config);

// Deploy EC2 WebSocket server (for real-time 30 Hz streaming)
const ec2WebSocketStack = new EC2WebSocketStack(app, 'EC2WebSocketStack', config);

// Deploy shell (depends on other stacks to get their URLs)
const shellStack = new StaticSiteStack(app, 'ShellStack', {
  ...config,
  appName: 'shell',
  sourcePath: '../apps/shell/dist',
});

// Add dependencies
shellStack.addDependency(mapRemoteStack);
shellStack.addDependency(perfRemoteStack);
shellStack.addDependency(controlsRemoteStack);
shellStack.addDependency(ec2WebSocketStack);

app.synth();
