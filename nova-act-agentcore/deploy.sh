#!/bin/bash
# Deploy ElderLove Nova Act browser agent to Bedrock AgentCore Runtime.
# This is the SECOND AgentCore runtime (first is the guardian agent in agentcore/).
set -e
export AWS_REGION=${AWS_REGION:-us-east-1}
export ACCOUNTID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO=${ECR_REPO:-elderlove-nova-act}
export ROLE_ARN=${ROLE_ARN:-$(aws iam get-role --role-name BedrockAgentCoreRuntimeRole --query 'Role.Arn' --output text)}

echo "Deploying ElderLove Nova Act to AgentCore..."
echo "Account: $ACCOUNTID"
echo "Region: $AWS_REGION"
echo "ECR Repo: $ECR_REPO"

# Create ECR repo if needed
aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION 2>/dev/null \
  || aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push
docker build --platform linux/amd64 -t $ECR_REPO ./nova-act-agentcore
docker tag $ECR_REPO:latest $ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest
docker push $ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

# Create AgentCore runtime
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name elderlove_nova_act \
  --agent-runtime-artifact containerConfiguration={containerUri=$ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest} \
  --role-arn $ROLE_ARN \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region $AWS_REGION

echo "Deployment initiated. Check status:"
echo "aws bedrock-agentcore-control get-agent-runtime --agent-runtime-name elderlove_nova_act --region $AWS_REGION"
