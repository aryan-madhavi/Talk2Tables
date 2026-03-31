# Talk2Tables Test Databases

This folder contains a local environment setup for MySQL and PostgreSQL. This allows you to test the Talk2Tables AI agent against real data on your own machine.

## Prerequisites
- **Docker** and **Docker Compose** installed on your Arch Linux machine.

## Setup Instructions

1.  **Open a terminal** in this `test_db` folder.
2.  **Start the databases**:
    ```bash
    docker-compose up -d
    ```
    OR 
    ```bash 
    podman-compose up -d
    ```
3.  **Wait ~10 seconds** for the containers to initialize.

---

## Connection Details for Talk2Tables UI

Use these exact values when adding a new connection in the **Admin Panel**.

### 1. MySQL (Factory Database)
- **Type**: `MySQL`
- **Name**: `Local Factory DB`
- **Host**: `localhost` (or `127.0.0.1`)
- **Port**: `3307`
- **Database Name**: `factory_db`
- **Username**: `t2t_user`
- **Password**: `t2t_password`

### 2. PostgreSQL (Logistics Database)
- **Type**: `PostgreSQL`
- **Name**: `Local Logistics DB`
- **Host**: `localhost` (or `127.0.0.1`)
- **Port**: `5433`
- **Database Name**: `logistics_db`
- **Username**: `t2t_user`
- **Password**: `t2t_password`

---

## Stopping the Databases
When you are finished testing, run:
```bash
docker-compose down
```
