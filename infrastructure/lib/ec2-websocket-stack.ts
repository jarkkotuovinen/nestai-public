import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

export interface EC2WebSocketStackProps extends cdk.StackProps {}

export class EC2WebSocketStack extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly publicIp: string;

  constructor(scope: Construct, id: string, props: EC2WebSocketStackProps) {
    super(scope, id, props);

    // Create VPC with public subnet
    const vpc = new ec2.Vpc(this, 'WebSocketVPC', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Security Group for WebSocket server
    const securityGroup = new ec2.SecurityGroup(this, 'WebSocketSG', {
      vpc,
      description: 'Allow WebSocket traffic on port 8080',
      allowAllOutbound: true,
    });

    // Allow HTTPS connections from anywhere (for WSS)
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS/WSS connections'
    );

    // Allow WebSocket connections from anywhere (HTTP - for testing)
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow WebSocket connections'
    );

    // Allow SSH for debugging (optional)
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
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

    // UserData script to setup and run WebSocket server
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      '',
      '# Update system',
      'yum update -y',
      '',
      '# Install Node.js 20',
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -',
      'yum install -y nodejs',
      '',
      '# Create app directory',
      'mkdir -p /home/ec2-user/websocket-server',
      'cd /home/ec2-user/websocket-server',
      '',
      '# Create package.json',
      `cat > package.json << 'PACKAGE_EOF'`,
      packageJson,
      'PACKAGE_EOF',
      '',
      '# Create server.js',
      `cat > websocket-server.js << 'SERVER_EOF'`,
      serverJs,
      'SERVER_EOF',
      '',
      '# Install dependencies',
      'npm install',
      '',
      '# Create systemd service',
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
      '# Set permissions',
      'chown -R ec2-user:ec2-user /home/ec2-user/websocket-server',
      '',
      '# Start service',
      'systemctl daemon-reload',
      'systemctl enable websocket',
      'systemctl start websocket',
      '',
      '# Log success',
      'echo "WebSocket server started successfully"',
      'systemctl status websocket',
      '',
      '# Setup nginx with SSL',
      'yum install -y nginx',
      '',
      '# Generate self-signed certificate',
      'mkdir -p /etc/nginx/ssl',
      'PUBLIC_IP=$(ec2-metadata --public-ipv4 | cut -d " " -f 2)',
      'openssl req -x509 -newkey rsa:2048 -keyout /etc/nginx/ssl/key.pem -out /etc/nginx/ssl/cert.pem -days 365 -nodes -subj "/C=FI/ST=Oulu/L=Oulu/O=NestAI/CN=${PUBLIC_IP}"',
      '',
      '# Configure nginx for WebSocket with SSL',
      'cat > /etc/nginx/conf.d/websocket.conf <<NGINXEOF',
      'map \\$http_upgrade \\$connection_upgrade {',
      '    default upgrade;',
      '    \\047\\047 close;',
      '}',
      '',
      'server {',
      '    listen 443 ssl;',
      '    server_name _;',
      '',
      '    ssl_certificate /etc/nginx/ssl/cert.pem;',
      '    ssl_certificate_key /etc/nginx/ssl/key.pem;',
      '    ssl_protocols TLSv1.2 TLSv1.3;',
      '',
      '    location / {',
      '        proxy_pass http://127.0.0.1:8080;',
      '        proxy_http_version 1.1;',
      '        proxy_set_header Upgrade \\$http_upgrade;',
      '        proxy_set_header Connection \\$connection_upgrade;',
      '        proxy_set_header Host \\$host;',
      '        proxy_set_header X-Real-IP \\$remote_addr;',
      '        proxy_read_timeout 3600s;',
      '        proxy_send_timeout 3600s;',
      '    }',
      '}',
      'NGINXEOF',
      '',
      '# Start and enable nginx',
      'systemctl enable nginx',
      'systemctl start nginx',
      '',
      '# Log nginx status',
      'echo "Nginx configuration:"',
      'cat /etc/nginx/conf.d/websocket.conf',
      'echo "Nginx status:"',
      'systemctl status nginx'
    );

    // Create EC2 instance (t3.micro for free tier, ARM-based for better price/performance)
    this.instance = new ec2.Instance(this, 'WebSocketInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      role,
      userData,
      userDataCausesReplacement: true,
    });

    // Allocate Elastic IP for stable public IP
    const eip = new ec2.CfnEIP(this, 'WebSocketEIP', {
      domain: 'vpc',
      instanceId: this.instance.instanceId,
    });

    this.publicIp = eip.ref;

    // Outputs
    new cdk.CfnOutput(this, 'InstanceId', {
      value: this.instance.instanceId,
      description: 'EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'PublicIP', {
      value: eip.ref,
      description: 'Public IP address',
      exportName: 'WebSocketPublicIP',
    });

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: `wss://${eip.ref}`,
      description: 'Secure WebSocket connection URL (wss://)',
      exportName: 'EC2WebSocketURL',
    });

    new cdk.CfnOutput(this, 'WebSocketURLInsecure', {
      value: `ws://${eip.ref}:8080`,
      description: 'Insecure WebSocket URL (for testing)',
    });

    new cdk.CfnOutput(this, 'SSHCommand', {
      value: `ssh -i <your-key.pem> ec2-user@${eip.ref}`,
      description: 'SSH command to connect to instance',
    });

    new cdk.CfnOutput(this, 'ServiceStatusCommand', {
      value: `ssh -i <your-key.pem> ec2-user@${eip.ref} 'sudo systemctl status websocket'`,
      description: 'Command to check WebSocket service status',
    });
  }
}
