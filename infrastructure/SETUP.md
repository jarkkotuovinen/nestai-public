# AWS CDK Deployment Setup Guide

## Prerequisites

1. **AWS Account** with admin access
2. **Domain name** registered (can use Route53 or external registrar)
3. **AWS CLI** configured
4. **Node.js 20+** installed

## Step-by-Step Deployment

### 1. Install Dependencies

```bash
cd infrastructure
npm install
```

### 2. Configure AWS Credentials

```bash
# If not already configured
aws configure

# Verify
aws sts get-caller-identity
```

### 3. Setup Domain in Route53

**Option A: Domain in Route53 already**
- Skip this step

**Option B: Domain elsewhere (GoDaddy, Namecheap, etc.)**

Create a hosted zone in Route53:
```bash
aws route53 create-hosted-zone --name yourapp.com --caller-reference $(date +%s)
```

Update your domain's nameservers to Route53's NS records (shown in the command output).

**Option C: No domain (testing only)**

You can skip custom domains and use CloudFront/API Gateway default URLs by modifying the stacks to remove:
- ACM certificates
- Custom domain mappings
- Route53 records

### 4. Update Configuration

Edit `bin/app.ts`:
```typescript
const config = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // Change if needed
  },
  domainName: 'yourapp.com', // <-- Change this to your domain
};
```

### 5. Bootstrap CDK (first time only)

```bash
cdk bootstrap
```

This creates an S3 bucket and other resources needed by CDK.

### 6. Build All Apps

```bash
# From project root
cd ..
pnpm turbo run build

# Verify dist folders exist
ls -la apps/map-remote/dist
ls -la apps/perf-remote/dist
ls -la apps/controls-remote/dist
ls -la apps/shell/dist
```

### 7. Preview Changes

```bash
cd infrastructure
cdk diff
```

This shows what will be created.

### 8. Deploy Everything

```bash
# Deploy all stacks
cdk deploy --all --require-approval never

# Or deploy one at a time
cdk deploy MapRemoteStack
cdk deploy PerfRemoteStack
cdk deploy ControlsRemoteStack
cdk deploy WebSocketStack
cdk deploy ShellStack
```

**This will take ~15-20 minutes** due to CloudFront distribution creation.

### 9. Wait for SSL Certificates

The first deployment will pause waiting for SSL certificate validation.

**Option A: Automatic DNS validation (if domain in Route53)**
- CDK creates DNS records automatically
- Wait 2-5 minutes for validation

**Option B: Manual DNS validation**
- Check AWS Certificate Manager console
- Add CNAME records to your DNS provider
- Wait for validation

### 10. Get Deployment URLs

```bash
# After deployment completes
cdk outputs

# Or check AWS Console:
# CloudFront > Distributions
# API Gateway > WebSocket APIs
```

You'll see URLs like:
```
MapRemoteStack.URL = https://map.yourapp.com
MapRemoteStack.RemoteEntryURL = https://map.yourapp.com/assets/remoteEntry.js
PerfRemoteStack.URL = https://perf.yourapp.com
ControlsRemoteStack.URL = https://controls.yourapp.com
WebSocketStack.WebSocketURL = wss://api.yourapp.com
ShellStack.URL = https://app.yourapp.com
```

### 11. Update Shell Environment

The remote URLs are already baked into the build, but if you want to update them:

Create `apps/shell/.env.production`:
```env
VITE_MAP_REMOTE_URL=https://map.yourapp.com/assets/remoteEntry.js
VITE_PERF_REMOTE_URL=https://perf.yourapp.com/assets/remoteEntry.js
VITE_CONTROLS_REMOTE_URL=https://controls.yourapp.com/assets/remoteEntry.js
```

Update `apps/shell/src/App.tsx` line 47:
```typescript
const ws = new WebSocket('wss://api.yourapp.com');
```

Rebuild and redeploy shell:
```bash
cd ../apps/shell
pnpm build
cd ../../infrastructure
cdk deploy ShellStack
```

### 12. Test the Deployment

Visit: `https://app.yourapp.com`

Open browser DevTools:
- **Network tab**: See 3 remoteEntry.js loads from different CloudFront distributions
- **Console**: Should see "Connected to WebSocket server"
- **Performance**: Should see 60 FPS with drone updates

## Updating After Initial Deployment

### Update a Single Remote

```bash
# Build the remote
cd apps/map-remote
pnpm build

# Deploy just that stack
cd ../../infrastructure
cdk deploy MapRemoteStack
```

CloudFront invalidation happens automatically via CDK.

### Update All Apps

```bash
# Build all
pnpm turbo run build

# Deploy all
cd infrastructure
cdk deploy --all
```

## Cost Optimization

### Development
- CloudFront: ~$1/month (minimal traffic)
- S3: ~$0.23/month (1GB storage)
- API Gateway: ~$1/month (1M messages)
- Lambda: Free tier covers most dev usage
- Route53: ~$0.50/month per hosted zone
- **Total: ~$5/month**

### Production Optimizations

1. **Enable CloudFront caching**
   - Already configured (1 year for assets, 5 min for remoteEntry.js)

2. **Use S3 lifecycle policies**
   ```typescript
   lifecycleRules: [{
     expiration: cdk.Duration.days(90),
     noncurrentVersionExpiration: cdk.Duration.days(30),
   }]
   ```

3. **Enable CloudFront compression**
   - Already enabled (Gzip + Brotli)

4. **Use Lambda@Edge for geo-routing** (advanced)

## Monitoring

### CloudWatch Logs

```bash
# WebSocket Lambda logs
aws logs tail /aws/lambda/WebSocketStack-WebSocketHandler --follow

# CloudFront logs (if enabled)
aws logs tail /aws/cloudfront/distribution/DIST_ID --follow
```

### CloudFront Metrics

```bash
# View CloudFront metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name Requests \
  --dimensions Name=DistributionId,Value=DIST_ID \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

## Troubleshooting

### Issue: SSL Certificate Stuck Pending

**Solution:**
```bash
# Check certificate status
aws acm list-certificates --region us-east-1

# If using external DNS, manually add CNAME records
# Check ACM console for validation records
```

### Issue: CloudFront Returns 403

**Solution:**
- Check S3 bucket has files
- Check CloudFront distribution is deployed
- Check CloudFront origin settings

```bash
# Verify files in S3
aws s3 ls s3://map-remote-ACCOUNT_ID/

# Check CloudFront status
aws cloudfront get-distribution --id DIST_ID
```

### Issue: WebSocket Connection Fails

**Solution:**
```bash
# Test WebSocket endpoint
wscat -c wss://api.yourapp.com

# Check Lambda logs
aws logs tail /aws/lambda/WebSocketStack-WebSocketHandler --follow

# Verify API Gateway stage
aws apigatewayv2 get-stages --api-id API_ID
```

### Issue: CORS Errors

**Solution:**
- Response headers policy is already configured
- Check browser console for specific CORS error
- Verify `Access-Control-Allow-Origin: *` in response headers

```bash
# Test CORS headers
curl -I https://map.yourapp.com/assets/remoteEntry.js
```

## Cleanup

To destroy all resources:

```bash
cdk destroy --all
```

**Warning:** This deletes:
- All S3 buckets (if configured with autoDeleteObjects)
- CloudFront distributions
- Lambda functions
- API Gateway WebSocket API
- Route53 records (but NOT the hosted zone)

SSL certificates must be manually deleted from ACM console.

## Security Best Practices

1. **Enable CloudFront logging**
```typescript
loggingConfig: {
  bucket: logBucket,
  prefix: 'cloudfront-logs/',
}
```

2. **Enable S3 versioning** (production)
```typescript
versioned: true,
```

3. **Add WAF rules** (production)
```typescript
webAclId: 'arn:aws:wafv2:...',
```

4. **Use secrets for sensitive config**
```typescript
environment: {
  API_KEY: secretsmanager.Secret.fromSecretNameV2(this, 'ApiKey', 'prod/api-key').secretValue,
}
```

5. **Enable CloudTrail** for audit logging

## Next Steps

- Setup CI/CD pipeline (GitHub Actions, CodePipeline)
- Add monitoring dashboards
- Configure auto-scaling for Lambda
- Add DynamoDB for WebSocket connection tracking
- Implement blue/green deployments
