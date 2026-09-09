# Single-stage arm64 build for AgentCore.
# pip install runs under QEMU emulation (slow but correct for native extensions).
FROM --platform=linux/arm64 public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app

# Install system deps for any native builds
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir aws_opentelemetry_distro_genai_beta>=0.1.2

COPY handler.py .

ENV AWS_REGION=us-east-1
ENV AWS_DEFAULT_REGION=us-east-1
ENV DOCKER_CONTAINER=1
ENV OTEL_SDK_DISABLED=true

RUN useradd -m -u 1000 bedrock_agentcore
USER bedrock_agentcore

EXPOSE 8080
CMD ["opentelemetry-instrument", "python", "-m", "handler"]
