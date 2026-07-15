FROM python:3.12-alpine
# Pure-Python SQL drivers (no build deps needed on musl/alpine).
RUN pip install --no-cache-dir pg8000==1.31.2 pymysql==1.1.1
COPY bridge.py /bridge.py
CMD ["python", "/bridge.py"]
