# Publish Description: Write-Capable MCP Servers

This update expands the Check Point MCP servers from read-only analysis into controlled, write-capable security management workflows.

The Management, Threat Prevention, and HTTPS Inspection MCP servers now include write support for key configuration operations, including object and policy package management, access and NAT rule changes, threat-prevention profile and exception changes, HTTPS inspection rule changes, session publish/discard controls, and explicit policy installation support where applicable.

Write access is intentionally disabled by default. The new write tools are only exposed when the server configuration includes `ENABLE_WRITE` and the server is started with `ENABLE_WRITE=true` or `--enable-write`. This keeps existing deployments read-only unless write capabilities are explicitly enabled.

The release also strengthens safety around write operations. Mutation commands are validated and normalized, unsafe command paths are rejected, protected identity fields cannot be silently overridden through raw payloads, and publish/install actions remain explicit user-controlled steps rather than automatic side effects.

For R&D and product impact, this turns the MCP integration into a foundation for AI-assisted security operations, not just inspection and reporting. It enables guided configuration changes while preserving clear administrative control, safer defaults, and auditable operator intent.

The change includes updated package documentation, server configuration entries, shared write-safety utilities, and automated test coverage across the affected packages.
