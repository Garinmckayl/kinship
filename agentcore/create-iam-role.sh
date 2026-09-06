#!/bin/bash
# IAM execution role for Bedrock AgentCore Runtime (from Strands TS deploy guide).
set -e
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-west-2}
ROLE_NAME="BedrockAgentCoreRuntimeRole"
echo "Account: $ACCOUNT_ID Region: $REGION"

TRUST_POLICY=$(cat <<EOF
{  "Version": "2012-10-17",  "Statement": [    {      "Sid": "AssumeRolePolicy",      "Effect": "Allow",      "Principal": {        "Service": "bedrock-agentcore.amazonaws.com"      },      "Action": "sts:AssumeRole",      "Condition": {        "StringEquals": {          "aws:SourceAccount": "${ACCOUNT_ID}"        },        "ArnLike": {          "aws:SourceArn": "arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:*"        }      }    }  ]}
EOF)
PERMISSIONS_POLICY=$(cat <<EOF
{  "Version": "2012-10-17",  "Statement": [    {      "Sid": "ECRImageAccess",      "Effect": "Allow",      "Action": [        "ecr:BatchGetImage",        "ecr:GetDownloadUrlForLayer"      ],      "Resource": "arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/*"    },    {      "Sid": "ECRTokenAccess",      "Effect": "Allow",      "Action": "ecr:GetAuthorizationToken",      "Resource": "*"    },    {      "Effect": "Allow",      "Action": [        "logs:DescribeLogStreams",        "logs:CreateLogGroup"      ],      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/bedrock-agentcore/runtimes/*"    },    {      "Effect": "Allow",      "Action": "logs:DescribeLogGroups",      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:*"    },    {      "Effect": "Allow",      "Action": [        "logs:CreateLogStream",        "logs:PutLogEvents"      ],      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"    },    {      "Effect": "Allow",      "Action": [        "xray:PutTraceSegments",        "xray:PutTelemetryRecords",        "xray:GetSamplingRules",        "xray:GetSamplingTargets"      ],      "Resource": "*"    },    {      "Effect": "Allow",      "Action": "cloudwatch:PutMetricData",      "Resource": "*",      "Condition": {        "StringEquals": {          "cloudwatch:namespace": "bedrock-agentcore"        }      }    },    {      "Sid": "BedrockModelAccess",      "Effect": "Allow",      "Action": [        "bedrock:InvokeModel",        "bedrock:InvokeModelWithResponseStream"      ],      "Resource": [        "arn:aws:bedrock:*::foundation-model/*",        "arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:*"      ]    }  ]}
EOF)

if aws iam get-role --role-name ${ROLE_NAME} 2>/dev/null; then
  echo "Role exists."
else
  aws iam create-role --role-name ${ROLE_NAME} --assume-role-policy-document "${TRUST_POLICY}" \
    --description "Service role for AWS Bedrock AgentCore Runtime"
  aws iam put-role-policy --role-name ${ROLE_NAME} --policy-name AgentCoreRuntimeExecutionPolicy \
    --policy-document "${PERMISSIONS_POLICY}"
  echo "Role created."
fi
aws iam get-role --role-name ${ROLE_NAME} --query 'Role.Arn' --output text
