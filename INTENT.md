# Intent — reusable web application class

Intent classification: CLASS / reusable web application profile.

Give the human–AI tandem a comprehensible web application foundation for CRM,
knowledge tools, management views and other domain services. A versioned class
provides shared identity/authentication, API, layout, translated UI primitives,
configuration boundaries and lifecycle conventions. A specialization supplies
its domain interfaces, policy and state. An instance binds identity, environment,
configuration and owned business data.

The selected profile uses an Express API, React/Vite Workspace, private MariaDB
and PM2 processes behind a local proxy. Other SHAPER compositions retain their
own runtime profile: a web-application mold is not a definition requiring every
service or logical space to be a copy of this repository.

The class supports development feedback through HMR/watch and a separate durable
production instance with explicit configuration. A profile chooses its physical
execution envelope; public source does not carry host secrets. Reusable defects
are repaired in their owner and versioned for consuming specializations.

## Behavioral contracts

Use translated, accessible shared controls; submit through explicit API actions;
provide inspectable errors and confirmation for the declared destructive effects.
Authentication proves identity; current per-resource policy and mandate govern
action. Each functional owner stores durable state in private MariaDB. Migrations
are owned, ordered and recoverable; applied migrations remain immutable.

The distinct univ-webapp-core-lab owns work and dialogue. Private customer/SaaS
implementations, configuration and data remain in their respective private sources.

## Shared source route and custody

The human–AI tandem carries intention and mandate. Read the [common composition](https://github.com/xavdp-pro/shaper-ecosystem/blob/main/chapters/10-COMPOSITION.md)
and [glossary](https://github.com/xavdp-pro/shaper-glossary/blob/main/TERMS.md) to distinguish component, generic stem cell, specialized
cell/service, logical space, class, specialization and instance. OS / Runtime /
Workspace are responsibilities across these scales; logical membership, authority
and physical placement are separate relations. Existing funit/univ/API/storage IDs
remain compatible while current prose uses component.

Each functional owner keeps durable application state in its private MariaDB.
Partitions follow workload, retention and access needs while preserving identity,
leases and uniqueness. Recovery coordinates consistent capture, restoration,
controlled activation and reconciliation; replication does not replace backup.
Private host/provider configuration and instance state stay outside generic source.
The distinct `univ-webapp-core-lab` companion owns work and source observations; raw dialogue,
private topology and commercial realization code never enter public mental sources.
