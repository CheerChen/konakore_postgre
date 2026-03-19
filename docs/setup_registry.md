# Setting Up a Private Registry

本指南概述了在私有网络上共享 Docker 镜像的必要先决条件，以及构建、推送和部署自定义镜像的步骤。

---

## 第一部分：先决条件

在构建镜像并将其发布到您的 NAS 之前，必须设置一个私有 Docker 注册表。这是关键的第一步。

### 1.1. Docker 注册表与 Portainer 的作用区别

一个常见的困惑是 Portainer 的作用。

- **Portainer** 是 Docker 环境的管理界面。它允许您启动、停止和管理容器。
- **Docker 注册表** 是 Docker 镜像的存储和分发系统。

要在开发机器和 NAS 之间共享镜像，您需要一个中央注册表。然后 Portainer 可以从此注册表拉取镜像来部署它们。

### 1.2. 步骤 1：在 NAS 上运行注册表服务

运行私有注册表的最佳位置是在 NAS 本身上。您可以使用 Portainer 轻松部署它。

1. 登录您的 Portainer 实例：`http://192.168.0.110:9000/`。
2. 导航到正确的 Docker 环境（端点）。
3. 从左侧菜单中选择 **Stacks**，然后点击 **Add stack**。
4. 给堆栈命名，例如 `private-registry`。
5. 在 Web 编辑器中，粘贴以下配置：

```yaml
version: '3'

services:
  registry:
    image: registry:2
    restart: always
    ports:
      # 将注册表的端口 5000 映射到主机的端口 5000
      - "5000:5000"
    volumes:
      # 将注册表的数据持久化到 NAS 上的路径。
      # 重要提示：在部署之前确保此目录在您的 NAS 上存在。
      - /mnt/nas/docker-registry:/var/lib/registry
```

1. 点击 **Deploy the stack**。完成后，您的私有注册表将运行并可通过 `192.168.0.110:5000` 访问。

### 1.3. 步骤 2：配置 Docker 信任私有注册表

默认情况下，Docker 客户端要求注册表使用安全的 HTTPS 连接。由于我们的私有注册表使用 HTTP，它被认为是"不安全的"。您必须在**所有**将要访问此注册表的机器（例如您的开发机器和 NAS 本身）上配置 Docker 守护进程以信任它。

1. 在您的开发机器上，打开 Docker Desktop。
2. 转到 **Settings** > **Docker Engine**。
3. 在 JSON 配置编辑器中，添加 `insecure-registries` 键：

```json
{
  "insecure-registries": ["192.168.0.110:5000"]
}
```

4. 点击 **Apply & Restart**。

>对于基于 Linux 的 NAS，您需要编辑 `/etc/docker/daemon.json` 文件并添加相同的内容，然后使用 `sudo systemctl restart docker` 重启 Docker 服务。

### 1.4. 验证配置是否生效：

```bash
docker info | grep -A 10 "Insecure Registries"
```
