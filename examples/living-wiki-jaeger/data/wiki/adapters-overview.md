Adapters overview

Adapters provide a uniform interface for modules to interact with external systems.

- DB Adapter: Handles persistence, connection pooling, transactions.
- Auth Adapter: Verifies tokens, manages sessions, talks to identity providers.
- Payments Adapter: Integrates with payment gateways and handles webhooks.
- Message Broker Adapter: Publishes/subscribes to queues (e.g., RabbitMQ, Kafka).
- External API Adapter: Fault-tolerant calls to third-party APIs with retries/circuit-breakers.
- Telemetry / Tracing Adapter: Exposes a consistent way for modules to emit traces and metrics (e.g., via OTLP). The adapter ships instrumentation/exporter configuration; to view traces in an external UI (Jaeger, Tempo, etc.) a collector or compatible backend must be running and reachable (see [[jaeger-tracing]]).

Adapters are called by Core or Service Modules. See [[modules-and-adapters-diagram]] and [[integration-flow]].
