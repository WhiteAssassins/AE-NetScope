# AE NetScope

AE NetScope is a self-hosted web app for organizing LAN inventory data such as devices, IP addresses, MAC addresses, subnets, VLANs, services, hardware details, and technical notes.

## Run

From the project root, run:

```bat
start-dev.cmd
```

Then open:

```text
http://127.0.0.1:5173
```

## Development

The current version contains the web dashboard foundation. Backend services and persistent inventory storage will be added as the project grows.

## Stack

- React
- TypeScript
- Vite
- FastAPI planned for the API
- PostgreSQL planned for production data
- Redis planned for cache, queues, and background jobs

## Configuration

Copy `.env.example` to `.env` for local configuration when backend services are added. Do not commit `.env`.
