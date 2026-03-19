# postgres.Dockerfile

# 使用官方的 postgres 镜像作为基础
FROM postgres:14-alpine

# 将本地的 migrations 文件夹中的所有 SQL 文件
# 复制到容器的初始化脚本目录中
COPY ./migrations /docker-entrypoint-initdb.d/

RUN ls -la /docker-entrypoint-initdb.d/