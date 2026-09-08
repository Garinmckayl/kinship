# Build dependencies on amd64 (fast, no emulation)
FROM --platform=linux/amd64 public.ecr.aws/docker/library/python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt -t /app/deps
RUN python -m pip install --no-cache-dir aws_opentelemetry_distro_genai_beta>=0.1.2 -t /app/deps
COPY handler.py .

# Runtime must be arm64 for AgentCore. No RUN steps (no emulation needed).
# Python packages are arch-independent for these deps (pure Python).
FROM --platform=linux/arm64 public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app
COPY --from=builder /app/deps /usr/local/lib/python3.12/site-packages/
COPY --from=builder /app/handler.py .

ENV AWS_REGION=us-east-1
ENV AWS_DEFAULT_REGION=us-east-1
ENV DOCKER_CONTAINER=1
ENV OTEL_SDK_DISABLED=true
ENV PYTHONPATH=/usr/local/lib/python3.12/site-packages

EXPOSE 8080
CMD ["python", "-m", "handler"]
