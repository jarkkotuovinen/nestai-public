import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import * as path from 'path';

export interface WebSocketStackProps extends cdk.StackProps {
  subdomain: string;
  domainName: string;
}

export class WebSocketStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;

  constructor(scope: Construct, id: string, props: WebSocketStackProps) {
    super(scope, id, props);

    const { subdomain, domainName } = props;
    const fullDomain = `${subdomain}.${domainName}`;

    // WebSocket handler Lambda
    const wsHandler = new lambdaNodejs.NodejsFunction(this, 'WebSocketHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/websocket-handler.ts'),
      timeout: cdk.Duration.minutes(1),
      memorySize: 512,
      environment: {
        NODE_ENV: 'production',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2020',
        externalModules: ['aws-sdk'],
      },
    });

    // WebSocket API
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'drone-data-websocket',
      description: 'WebSocket API for drone data streaming',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', wsHandler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', wsHandler),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('DefaultIntegration', wsHandler),
      },
    });

    // WebSocket Stage
    const stage = new apigatewayv2.WebSocketStage(this, 'ProductionStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    // SSL Certificate for custom domain
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: fullDomain,
      validation: acm.CertificateValidation.fromDns(),
    });

    // Custom domain
    const domain = new apigatewayv2.DomainName(this, 'CustomDomain', {
      domainName: fullDomain,
      certificate,
    });

    // API Mapping
    new apigatewayv2.ApiMapping(this, 'ApiMapping', {
      api: this.webSocketApi,
      domainName: domain,
      stage,
    });

    // DNS Record
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName,
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: subdomain,
      target: route53.RecordTarget.fromAlias({
        bind: () => ({
          dnsName: domain.regionalDomainName,
          hostedZoneId: domain.regionalHostedZoneId,
        }),
      }),
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: `wss://${fullDomain}`,
      description: 'WebSocket URL',
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID',
    });
  }
}
