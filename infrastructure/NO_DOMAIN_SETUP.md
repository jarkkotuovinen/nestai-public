# AWS Deployment WITHOUT Custom Domain

Perfect for testing! No domain required - uses CloudFront and API Gateway default URLs.

## Quick Deploy (5 commands)

```bash
# 1. Build all apps
cd /Users/jarkko/Desktop/nestai
pnpm turbo run build

# 2. Install CDK dependencies
cd infrastructure
npm install

# 3. Bootstrap CDK (first time only)
cdk bootstrap

# 4. Deploy everything
cdk deploy --all --require-approval never

# 5. Get your URLs
cdk outputs
```

That's it! 🎉

## What You'll Get

After deployment (~20 minutes), you'll receive URLs like:

```
MapRemoteStack.URL = https://d1234abcd.cloudfront.net
MapRemoteStack.RemoteEntryURL = https://d1234abcd.cloudfront.net/assets/remoteEntry.js

PerfRemoteStack.URL = https://d5678efgh.cloudfront.net
PerfRemoteStack.RemoteEntryURL = https://d5678efgh.cloudfront.net/assets/remoteEntry.js

ControlsRemoteStack.URL = https://d9012ijkl.cloudfront.net
ControlsRemoteStack.RemoteEntryURL = https://d9012ijkl.cloudfront.net/assets/remoteEntry.js

WebSocketStack.WebSocketURL = wss://abc123xyz.execute-api.us-east-1.amazonaws.com/production

ShellStack.URL = https://d3456mnop.cloudfront.net
```

## Update Shell with CloudFront URLs

After the first deployment, you need to rebuild the shell with the actual CloudFront URLs:

### Manual Method

1. **Copy the URLs from `cdk outputs`**

2. **Update shell environment:**
   ```bash
   cd /Users/jarkko/Desktop/nestai/apps/shell
   ```

   Create `.env.production`:
   ```env
   VITE_MAP_REMOTE_URL=https://d1234abcd.cloudfront.net/assets/remoteEntry.js
   VITE_PERF_REMOTE_URL=https://d5678efgh.cloudfront.net/assets/remoteEntry.js
   VITE_CONTROLS_REMOTE_URL=https://d9012ijkl.cloudfront.net/assets/remoteEntry.js
   ```

3. **Update WebSocket URL in `src/App.tsx` line 47:**
   ```typescript
   const ws = new WebSocket('wss://abc123xyz.execute-api.us-east-1.amazonaws.com/production');
   ```

4. **Rebuild and redeploy shell:**
   ```bash
   pnpm build
   cd ../../infrastructure
   cdk deploy ShellStack
   ```

### Automated Method (Coming Soon)

We can create a script that automatically:
1. Reads CloudFormation outputs
2. Updates shell .env.production
3. Updates App.tsx
4. Rebuilds and redeploys

## Test Your Deployment

1. **Visit the Shell URL:**
   ```bash
   open https://d3456mnop.cloudfront.net
   ```

2. **Open DevTools:**
   - Network tab → See 3 remoteEntry.js loads from different CloudFront distributions
   - Console → Should see "Connected to WebSocket server"

3. **Test Module Federation:**
   ```bash
   # Check remote entry files are accessible
   curl https://d1234abcd.cloudfront.net/assets/remoteEntry.js | head -5

   # Check CORS headers
   curl -I https://d1234abcd.cloudfront.net/assets/remoteEntry.js | grep -i cors

   # Should see: Access-Control-Allow-Origin: *
   ```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AWS (No Custom Domain)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  CloudFront Distribution 1                                   │
│  └─ https://d1234abcd.cloudfront.net → S3 (map-remote)      │
│                                                               │
│  CloudFront Distribution 2                                   │
│  └─ https://d5678efgh.cloudfront.net → S3 (perf-remote)     │
│                                                               │
│  CloudFront Distribution 3                                   │
│  └─ https://d9012ijkl.cloudfront.net → S3 (controls-remote) │
│                                                               │
│  CloudFront Distribution 4                                   │
│  └─ https://d3456mnop.cloudfront.net → S3 (shell)           │
│                                                               │
│  API Gateway WebSocket + Lambda                              │
│  └─ wss://abc123xyz.execute-api.*.amazonaws.com/production  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Benefits

✅ **No domain needed** - Perfect for demos and testing
✅ **Free SSL** - CloudFront provides HTTPS automatically
✅ **Global CDN** - CloudFront edge locations worldwide
✅ **Same features** - CORS, caching, Module Federation all work
✅ **Cost-effective** - Same ~$5-10/month cost

## Updating Apps

### Update Single Remote

```bash
# 1. Build the remote
cd apps/map-remote
pnpm build

# 2. Deploy just that stack
cd ../../infrastructure
cdk deploy MapRemoteStack
```

CloudFront cache is automatically invalidated.

### Update All Apps

```bash
# 1. Build all
pnpm turbo run build

# 2. Deploy all
cd infrastructure
cdk deploy --all
```

## Cost

Same as custom domain setup:

- **CloudFront**: ~$1-5/month (data transfer)
- **S3**: ~$0.50/month (storage)
- **API Gateway**: ~$1/month (WebSocket)
- **Lambda**: ~$0.20/month (compute)
- **Total**: ~$5-10/month

## Cleanup

To delete everything:

```bash
cd infrastructure
cdk destroy --all
```

This removes:
- All S3 buckets (and their contents)
- All CloudFront distributions
- Lambda function
- API Gateway WebSocket API

## Troubleshooting

### CloudFront URLs not loading

**Wait 5-10 minutes** after deployment for CloudFront to fully propagate.

Check distribution status:
```bash
aws cloudfront list-distributions --query "DistributionList.Items[*].[Id,Status,DomainName]" --output table
```

Status should be "Deployed".

### WebSocket connection fails

Test the endpoint:
```bash
# Install wscat if needed
npm install -g wscat

# Test WebSocket
wscat -c wss://abc123xyz.execute-api.us-east-1.amazonaws.com/production
```

Should connect and start receiving drone data.

### Shell can't load remotes

If you see errors like "Failed to load remote", make sure you:

1. Updated the shell `.env.production` with CloudFront URLs
2. Rebuilt the shell: `pnpm build`
3. Redeployed: `cdk deploy ShellStack`

### CORS errors

Already configured! But if you see CORS errors:

```bash
# Verify CORS headers
curl -I https://YOUR-CLOUDFRONT-URL.cloudfront.net/assets/remoteEntry.js

# Should see:
# Access-Control-Allow-Origin: *
```

## Next Steps

1. **Test the deployment** - Visit your shell URL
2. **Share the URLs** - CloudFront URLs work from anywhere
3. **Add custom domain later** - Can always add one later if needed

## Want a Custom Domain?

To switch to custom domain later:

1. Update `cdk.json` to use `bin/app.ts` instead
2. Set `domainName` in `bin/app.ts`
3. Run `cdk deploy --all`

See `SETUP.md` for custom domain setup.

---

**Happy deploying without a domain! 🚀**

This is perfect for demos, testing, and showing off the Module Federation architecture!
