#!/bin/bash

# AWS CDK Deployment Script for NestAI Microfrontend Architecture
# Usage: ./deploy.sh [--skip-build] [--stack StackName]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
SKIP_BUILD=false
SPECIFIC_STACK=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --stack)
      SPECIFIC_STACK="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  NestAI AWS CDK Deployment${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Check prerequisites
echo -e "${YELLOW}→${NC} Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    echo -e "${RED}✗${NC} AWS CLI not found. Please install: https://aws.amazon.com/cli/"
    exit 1
fi

if ! command -v cdk &> /dev/null; then
    echo -e "${RED}✗${NC} AWS CDK not found. Please install: npm install -g aws-cdk"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}✗${NC} pnpm not found. Please install: npm install -g pnpm"
    exit 1
fi

# Verify AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}✗${NC} AWS credentials not configured. Run: aws configure"
    exit 1
fi

echo -e "${GREEN}✓${NC} All prerequisites met"
echo

# Get AWS account info
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

echo -e "${YELLOW}→${NC} Deploying to:"
echo "   Account: $AWS_ACCOUNT"
echo "   Region:  $AWS_REGION"
echo

# Build all apps
if [ "$SKIP_BUILD" = false ]; then
    echo -e "${YELLOW}→${NC} Building all applications..."
    cd ..
    pnpm turbo run build
    echo -e "${GREEN}✓${NC} Build complete"
    echo
    cd infrastructure
fi

# Install CDK dependencies
echo -e "${YELLOW}→${NC} Installing CDK dependencies..."
npm install --silent
echo -e "${GREEN}✓${NC} Dependencies installed"
echo

# Bootstrap CDK (if not already done)
echo -e "${YELLOW}→${NC} Checking CDK bootstrap..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit &> /dev/null; then
    echo -e "${YELLOW}→${NC} Bootstrapping CDK..."
    cdk bootstrap
    echo -e "${GREEN}✓${NC} CDK bootstrapped"
else
    echo -e "${GREEN}✓${NC} CDK already bootstrapped"
fi
echo

# Show what will be deployed
echo -e "${YELLOW}→${NC} Reviewing changes..."
if [ -n "$SPECIFIC_STACK" ]; then
    cdk diff "$SPECIFIC_STACK"
else
    cdk diff
fi
echo

# Confirm deployment
read -p "Deploy to AWS? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}✗${NC} Deployment cancelled"
    exit 1
fi

# Deploy
echo -e "${YELLOW}→${NC} Deploying stacks..."
echo

if [ -n "$SPECIFIC_STACK" ]; then
    cdk deploy "$SPECIFIC_STACK" --require-approval never
else
    cdk deploy --all --require-approval never
fi

echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Show outputs
echo -e "${YELLOW}→${NC} Deployment URLs:"
cdk outputs

echo
echo -e "${YELLOW}→${NC} Next steps:"
echo "   1. Wait 2-5 minutes for CloudFront to propagate"
echo "   2. Visit your shell URL to see the app"
echo "   3. Open DevTools Network tab to see Module Federation in action"
echo
echo -e "${GREEN}Happy deploying! 🚀${NC}"
