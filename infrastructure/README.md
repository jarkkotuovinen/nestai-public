# AWS CDK Infrastructure

This directory contains the AWS CDK setup for deploying the Module Federation microfrontend architecture.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AWS Architecture                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  CloudFront Distribution (map.yourapp.com)                  │
│  └─ S3 Bucket (map-remote build artifacts)                  │
│                                                               │
│  CloudFront Distribution (perf.yourapp.com)                 │
│  └─ S3 Bucket (perf-remote build artifacts)                 │
│                                                               │
│  CloudFront Distribution (controls.yourapp.com)             │
│  └─ S3 Bucket (controls-remote build artifacts)             │
│                                                               │
│  CloudFront Distribution (app.yourapp.com)                  │
│  └─ S3 Bucket (shell build artifacts)                       │
│                                                               │
│  API Gateway WebSocket (wss://api.yourapp.com)              │
│  └─ Lambda Function (data-simulator)                        │
│                                                               │
│  Route53 (DNS)                                               │
│  ACM (SSL Certificates)                                      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Cost Estimate

- S3: ~$0.50/month (storage + requests)
- CloudFront: ~$1-5/month (data transfer)
- API Gateway: ~$1/month (WebSocket)
- Lambda: ~$0.20/month (compute)
- Route53: ~$0.50/month per hosted zone
- ACM: Free
- **Total: ~$5-10/month**

## Prerequisites

```bash
# Install AWS CDK
npm install -g aws-cdk

# Configure AWS credentials
aws configure

# Verify credentials
aws sts get-caller-identity
```

## Quick Deploy - NO DOMAIN REQUIRED (5 minutes)

```bash
# 1. Build all apps
pnpm turbo run build

# 2. Install CDK dependencies
cd infrastructure
npm install

# 3. Bootstrap CDK (first time only)
cdk bootstrap

# 4. Deploy everything
cdk deploy --all --require-approval never

# 5. Update shell with CloudFront URLs
./update-shell-urls.sh

# 6. Get your URLs
cdk outputs
```

See [NO_DOMAIN_SETUP.md](./NO_DOMAIN_SETUP.md) for detailed guide.

### With Custom Domain

If you have a domain, see [SETUP.md](./SETUP.md) for custom domain setup.

## Manual Steps

See [SETUP.md](./SETUP.md) for detailed setup instructions.
