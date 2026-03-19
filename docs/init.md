# init-db.sh

init-db.sh 以及 docker-entrypoint-initdb.d 目录下的所有脚本，只会在 数据库第一次被创建时 执行一次。后续的 docker-compose up
不会再次触发它，原因如下：

1. 数据卷的持久化 (Persistence with Volumes):
    在您的 docker-compose.yaml 文件中，您将 postgres_data 这个命名卷 (named volume) 挂载到了 PostgreSQL 容器的
/var/lib/postgresql/data 目录下。这个目录是 PostgreSQL 存放其所有数据文件的地方。Docker 的 Volume
独立于容器的生命周期，即使容器被删除，Volume 中的数据也会被保留。

2. PostgreSQL 镜像的启动逻辑:
    官方的 postgres 镜像内置的启动脚本有一个核心的判断逻辑：
    * 当容器启动时，它会检查 /var/lib/postgresql/data 目录是否为空。
    * 如果目录为空，它会认为这是一个全新的、需要初始化的数据库。此时，它会执行数据库创建流程，并按字母顺序执行
        docker-entrypoint-initdb.d 目录下的所有 .sh 和 .sql 脚本。这就是您第一次 docker-compose up 时发生的情况。
    * 如果目录不为空，它会认为数据库已经存在，初始化过程会被完全跳过，直接启动 PostgreSQL 服务。

总结一下：

* 第一次 `up`：postgres_data 卷是空的 -> 容器数据目录 /var/lib/postgresql/data 是空的 -> 触发初始化 -> init-db.sh 被执行 ->
    数据库文件被创建并保存在 postgres_data 卷中。
* 第二次及以后的 `up`：容器启动 -> 发现 postgres_data 卷中已经有数据了 -> 容器数据目录 /var/lib/postgresql/data 不为空 ->
    跳过所有初始化步骤 -> init-db.sh 不会被执行。

这种设计确保了您的数据库只被初始化一次，后续的重启不会覆盖或尝试重新创建已经存在的数据库和表。
