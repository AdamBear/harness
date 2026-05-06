Modules overview

- API Module: Receives external requests, handles routing, validation, auth checks; calls Core.
- Core Module: Business logic orchestrator; coordinates services and decides which adapters to call.
- Service Modules: Domain-specific services (e.g., billing, notifications) invoked by Core; can call adapters directly for side-effects.
- Data Layer: Logical data handling inside modules; actual persistence is via DB Adapter.
- UI/Client: Frontend or external clients that call the API Module.

See [[modules-and-adapters-diagram]] and [[adapters-overview]].
