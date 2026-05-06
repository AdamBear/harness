Integration flow

1. Client sends request to API Module.
  - API validates request, extracts auth token, and routes to Core.

2. Core orchestrates business logic.
  - Core may call Service Modules for domain-specific tasks (e.g., billing).
  - Core uses Adapters to interact with external systems (DB, Auth, Payments).

3. Adapters perform external operations and return standardized responses.
  - Adapters handle retries, error normalization, and metrics.

4. Core aggregates responses, applies business rules, and returns to API.

5. API formats response and sends it back to Client. Async work is published via Message Broker Adapter for background processing.

Examples

- Create Order
  - API -> Core.createOrder -> Core calls DB Adapter to create order, Payments Adapter to charge card, Notification Service Module to send email, Message Broker Adapter to publish order.created event.

- Authenticate
  - API -> Auth Adapter to validate token -> Core to build session info -> API returns session.

See [[modules-and-adapters-diagram]] for visual layout and [[adapters-overview]] / [[modules-overview]] for responsibilities.