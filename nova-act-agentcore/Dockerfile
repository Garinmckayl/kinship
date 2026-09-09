# Stage 1: Install pure-python deps on amd64 (fast, no emulation)
FROM --platform=linux/amd64 public.ecr.aws/docker/library/python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -t /build/deps
RUN pip install --no-cache-dir aws_opentelemetry_distro_genai_beta>=0.1.2 -t /build/deps
# Remove arch-specific compiled packages (will replace with arm64 wheels)
RUN rm -rf /build/deps/pydantic_core* /build/deps/pydantic_core*.dist-info

# Stage 2: arm64 runtime for AgentCore. NO pip install, NO QEMU compilation.
FROM --platform=linux/arm64 public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app

# Copy pre-downloaded arm64 wheels and install them (no compilation needed - prebuilt binary)
COPY pydantic_core-*.whl typing_extensions-*.whl /tmp/wheels/
RUN pip install --no-cache-dir /tmp/wheels/*.whl && rm -rf /tmp/wheels

# Copy pure-python packages from amd64 builder
COPY --from=builder /build/deps /usr/local/lib/python3.12/site-packages/

COPY handler.py .

ENV AWS_REGION=us-east-1
ENV AWS_DEFAULT_REGION=us-east-1
ENV DOCKER_CONTAINER=1
ENV OTEL_SDK_DISABLED=true

RUN useradd -m -u 1000 bedrock_agentcore
USER bedrock_agentcore

EXPOSE 8080
CMD ["opentelemetry-instrument", "python", "-m", "handler"]
