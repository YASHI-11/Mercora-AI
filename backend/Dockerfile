FROM python:3.13-slim

WORKDIR /app

# Keep this list minimal -- only what building the pinned wheels in
# requirements.txt actually needs (scikit-learn/pandas ship prebuilt wheels
# for this image already, so no compiler toolchain is required).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# The platform (Railway/Render/Fly) injects $PORT at runtime; default to
# 8000 for `docker run` without one set (e.g. local testing).
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
