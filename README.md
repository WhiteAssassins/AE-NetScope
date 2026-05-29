# AE NetScope

AE NetScope is a self-hosted web app for organizing LAN inventory data such as devices, IP addresses, MAC addresses, subnets, VLANs, services, hardware details, and technical notes.

## Run

```bash
docker compose up --build
```

Then open:

```text
http://localhost:5173
```

## Development

The current version contains the web dashboard foundation. Backend services and persistent inventory storage will be added as the project grows.

## Stack

- React
- TypeScript
- Vite
- Docker Compose
