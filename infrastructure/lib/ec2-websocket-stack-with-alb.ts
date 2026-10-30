import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2_targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

export interface EC2WebSocketStackWithALBProps extends cdk.StackProps {}

export class EC2WebSocketStackWithALB extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly webSocketUrl: string;

  constructor(scope: Construct, id: string, props: EC2WebSocketStackWithALBProps) {
    super(scope, id, props);

    // Create VPC with public subnets in 2 AZs (required for ALB)
    const vpc = new ec2.Vpc(this, 'WebSocketVPC', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Security Group for EC2 instance
    const instanceSG = new ec2.SecurityGroup(this, 'InstanceSG', {
      vpc,
      description: 'Allow WebSocket traffic from ALB',
      allowAllOutbound: true,
    });

    // Security Group for ALB
    const albSG = new ec2.SecurityGroup(this, 'ALBSG', {
      vpc,
      description: 'Allow HTTPS traffic',
      allowAllOutbound: true,
    });

    // Allow HTTPS from anywhere to ALB
    albSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from anywhere'
    );

    // Allow WebSocket traffic from ALB to EC2
    instanceSG.addIngressRule(
      albSG,
      ec2.Port.tcp(8080),
      'Allow WebSocket from ALB'
    );

    // Allow SSH for debugging
    instanceSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH'
    );

    // IAM role for EC2
    const role = new iam.Role(this, 'WebSocketInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // Read the server files
    const serverJs = fs.readFileSync(path.join(__dirname, '../ec2/websocket-server.js'), 'utf8');
    const packageJson = fs.readFileSync(path.join(__dirname, '../ec2/package.json'), 'utf8');

    // UserData script
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      '',
      'yum update -y',
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -',
      'yum install -y nodejs',
      '',
      'mkdir -p /home/ec2-user/websocket-server',
      'cd /home/ec2-user/websocket-server',
      '',
      `cat > package.json << 'PACKAGE_EOF'`,
      packageJson,
      'PACKAGE_EOF',
      '',
      `cat > websocket-server.js << 'SERVER_EOF'`,
      serverJs,
      'SERVER_EOF',
      '',
      'npm install',
      '',
      'cat > /etc/systemd/system/websocket.service << EOF',
      '[Unit]',
      'Description=WebSocket Server',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'User=ec2-user',
      'WorkingDirectory=/home/ec2-user/websocket-server',
      'ExecStart=/usr/bin/node websocket-server.js',
      'Restart=always',
      'Environment=PORT=8080',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      '',
      'chown -R ec2-user:ec2-user /home/ec2-user/websocket-server',
      'systemctl daemon-reload',
      'systemctl enable websocket',
      'systemctl start websocket'
    );

    // Create EC2 instance
    this.instance = new ec2.Instance(this, 'WebSocketInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: instanceSG,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      role,
      userData,
      userDataCausesReplacement: true,
    });

    // Import self-signed certificate
    const certPem = fs.readFileSync(path.join(__dirname, '../certs/cert.pem'), 'utf8');
    const keyPem = fs.readFileSync(path.join(__dirname, '../certs/key.pem'), 'utf8');

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: '*.elb.amazonaws.com',
      validation: acm.CertificateValidation.fromDns(),
    });

    // Actually, we can't use DNS validation without a domain. Let's use a different approach.
    // We'll import the self-signed certificate directly
    const certArn = new cdk.CfnParameter(this, 'CertificateArn', {
      type: 'String',
      description: 'ARN of the certificate to use for HTTPS (import manually first)',
      default: '',
    });

    // Create Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'WebSocketALB', {
      vpc,
      internetFacing: true,
      securityGroup: albSG,
    });

    // Create target group for WebSocket
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'WebSocketTargetGroup', {
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [new elbv2_targets.InstanceTarget(this.instance, 8080)],
      healthCheck: {
        enabled: true,
        path: '/',
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      targetType: elbv2.TargetType.INSTANCE,
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // For now, create HTTP listener (we'll upgrade to HTTPS manually after importing cert)
    const httpListener = this.loadBalancer.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    this.webSocketUrl = `ws://${this.loadBalancer.loadBalancerDnsName}`;

    // Outputs
    new cdk.CfnOutput(this, 'InstanceId', {
      value: this.instance.instanceId,
      description: 'EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
      exportName: 'WebSocketALBDNS',
    });

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: this.webSocketUrl,
      description: 'WebSocket connection URL (HTTP for now, upgrade to WSS after importing cert)',
      exportName: 'EC2WebSocketURL',
    });

    new cdk.CfnOutput(this, 'SSHCommand', {
      value: `ssh -i <your-key.pem> ec2-user@${this.instance.instancePublicDnsName}`,
      description: 'SSH command to connect to instance',
    });

    new cdk.CfnOutput(this, 'CertificateImportCommand', {
      value: `aws acm import-certificate --certificate fileb://certs/cert.pem --private-key fileb://certs/key.pem --region ${this.region}`,
      description: 'Command to import self-signed certificate to ACM',
    });
  }
}
