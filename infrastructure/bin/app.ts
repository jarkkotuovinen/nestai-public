#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StaticSiteStack } from '../lib/static-site-stack';
import { WebSocketStack } from '../lib/websocket-stack';

const app = new cdk.App();

// Configuration
const config = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  domainName: process.env.DOMAIN_NAME || 'example.com', // Change this!
};

// Deploy map-remote
new StaticSiteStack(app, 'MapRemoteStack', {
  ...config,
  appName: 'map-remote',
  subdomain: 'map',
  sourcePath: '../apps/map-remote/dist',
});

// Deploy perf-remote
new StaticSiteStack(app, 'PerfRemoteStack', {
  ...config,
  appName: 'perf-remote',
  subdomain: 'perf',
  sourcePath: '../apps/perf-remote/dist',
});

// Deploy controls-remote
new StaticSiteStack(app, 'ControlsRemoteStack', {
  ...config,
  appName: 'controls-remote',
  subdomain: 'controls',
  sourcePath: '../apps/controls-remote/dist',
});

// Deploy shell
new StaticSiteStack(app, 'ShellStack', {
  ...config,
  appName: 'shell',
  subdomain: 'app',
  sourcePath: '../apps/shell/dist',
});

// Deploy WebSocket API
new WebSocketStack(app, 'WebSocketStack', {
  ...config,
  subdomain: 'api',
});

app.synth();
