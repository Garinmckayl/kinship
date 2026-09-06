#!/bin/bash
# Deploy ElderLove guardian to Bedrock AgentCore Runtime (us-west-2).
# Costs real money while the runtime exists. Run teardown below when done demoing.
set -e
export AWS_REGION=${AWS_REGION:-us-west-2}
export ACCOUNTID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO=${ECR_REPO:-elderlove-guardian}
export ROLE_ARN=${ROLE_ARN:-$(aws iam get-role --role-name BedrockAgentCoreRuntimeRole --query 'Role.Arn' --output text)}

aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION 2>/dev/null \
  || aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION

aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com

docker build -t $ECR_REPO ./agentcore
docker tag $ECR_REPO:latest $ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest
docker push $ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name elderlove_guardian \
  --agent-runtime-artifact containerConfiguration={containerUri=$ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest} \
  --role-arn $ROLE_ARN \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region $AWS_REGION
