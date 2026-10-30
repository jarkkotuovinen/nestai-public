import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export interface StaticSiteStackProps extends cdk.StackProps {
  appName: string;
  sourcePath: string;
}

export class StaticSiteStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StaticSiteStackProps) {
    super(scope, id, props);

    const { appName, sourcePath } = props;

    // S3 Bucket for static assets
    this.bucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `${appName}-${cdk.Aws.ACCOUNT_ID}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
      autoDeleteObjects: true, // Change to false for production
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // CloudFront Distribution (no custom domain)
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: new cloudfront.CachePolicy(this, 'CachePolicy', {
          cachePolicyName: `${appName}-cache-policy`,
          comment: `Cache policy for ${appName}`,
          defaultTtl: cdk.Duration.days(1),
          maxTtl: cdk.Duration.days(365),
          minTtl: cdk.Duration.seconds(0),
          headerBehavior: cloudfront.CacheHeaderBehavior.none(),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),
        responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
          responseHeadersPolicyName: `${appName}-headers`,
          comment: `CORS headers for ${appName}`,
          corsBehavior: {
            accessControlAllowCredentials: false,
            accessControlAllowHeaders: ['*'],
            accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
            accessControlAllowOrigins: ['*'],
            accessControlMaxAge: cdk.Duration.seconds(600),
            originOverride: true,
          },
          customHeadersBehavior: {
            customHeaders: [
              {
                header: 'Cache-Control',
                value: 'public, max-age=31536000, immutable',
                override: false,
              },
            ],
          },
        }),
      },
      // Special caching for remoteEntry.js (short cache)
      additionalBehaviors: {
        '/assets/remoteEntry.js': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'RemoteEntryCachePolicy', {
            cachePolicyName: `${appName}-remoteentry-cache`,
            comment: 'Short cache for remoteEntry.js',
            defaultTtl: cdk.Duration.minutes(5),
            maxTtl: cdk.Duration.minutes(10),
            minTtl: cdk.Duration.seconds(0),
          }),
          responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'RemoteEntryHeaders', {
            responseHeadersPolicyName: `${appName}-remoteentry-headers`,
            corsBehavior: {
              accessControlAllowCredentials: false,
              accessControlAllowHeaders: ['*'],
              accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
              accessControlAllowOrigins: ['*'],
              accessControlMaxAge: cdk.Duration.seconds(600),
              originOverride: true,
            },
            customHeadersBehavior: {
              customHeaders: [
                {
                  header: 'Cache-Control',
                  value: 'public, max-age=300',
                  override: true,
                },
              ],
            },
          }),
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // Deploy site contents to S3
    new s3deploy.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [s3deploy.Source.asset(sourcePath)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: `S3 Bucket for ${appName}`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: `CloudFront Distribution ID for ${appName}`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: `CloudFront Domain for ${appName}`,
    });

    new cdk.CfnOutput(this, 'URL', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: `URL for ${appName}`,
    });

    new cdk.CfnOutput(this, 'RemoteEntryURL', {
      value: `https://${this.distribution.distributionDomainName}/assets/remoteEntry.js`,
      description: `Remote Entry URL for ${appName}`,
      exportName: `${appName}-RemoteEntryURL`,
    });
  }
}
