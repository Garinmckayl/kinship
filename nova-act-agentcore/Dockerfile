# Stage 1: Install pure-python deps on amd64 (fast)
FROM --platform=linux/amd64 public.ecr.aws/docker/library/python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -t /build/deps

# Stage 2: arm64 runtime for AgentCore
FROM --platform=linux/arm64 public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app

# Install ALL arch-specific packages from pre-downloaded arm64 wheels
COPY arm64-wheels/ /tmp/arm64-wheels/
RUN pip install --no-cache-dir --force-reinstall /tmp/arm64-wheels/*.whl && rm -rf /tmp/arm64-wheels

# Copy pure-python packages from amd64 builder (overwritten by arm64 wheels where needed)
COPY --from=builder /build/deps /usr/local/lib/python3.12/site-packages/

# Re-install arm64 wheels AGAIN to override any amd64 binaries that were copied
COPY arm64-wheels/ /tmp/arm64-wheels/
RUN pip install --no-cache-dir --force-reinstall /tmp/arm64-wheels/*.whl && rm -rf /tmp/arm64-wheels

COPY handler.py .

ENV AWS_REGION=us-east-1
ENV AWS_DEFAULT_REGION=us-east-1
ENV DOCKER_CONTAINER=1
ENV OTEL_SDK_DISABLED=true

RUN useradd -m -u 1000 bedrock_agentcore
USER bedrock_agentcore

EXPOSE 8080
CMD ["python", "-m", "handler"]
