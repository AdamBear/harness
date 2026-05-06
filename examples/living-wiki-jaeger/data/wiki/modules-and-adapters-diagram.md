Summary

A compact diagram showing how the system's modules and adapters interact. See linked pages for details: [[modules-overview]] • [[adapters-overview]] • [[integration-flow]]

Diagram (ASCII)

  [Client/UI]
      |
      v
  [API Module]
      |
      v
  [Core Module] <--> [Service Modules]
      |
      v
  [Adapter Layer]
   /   |    \    \
[DB] [Auth] [Payments] [External APIs]

Notes

- "Modules" are the high-level components (API, Core, Services).
- "Adapters" translate module requests to external systems (DB, Auth, Payments, External APIs).
- See [[integration-flow]] for request/response sequencing and [[modules-overview]] / [[adapters-overview]] for responsibilities.
