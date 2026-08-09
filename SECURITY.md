# Security policy

## Reporting a vulnerability

Please do not open a public issue for vulnerabilities that could expose Codex credentials, project source, command output, or filesystem access.

Use GitHub's private vulnerability reporting for this repository. Include the affected version, reproduction steps, impact, and any suggested mitigation. You should receive an acknowledgement within seven days.

## Supported versions

Until the first stable release, security fixes are applied to the latest version on the default branch.

## Deployment guidance

WatchingCodex is a high-trust local developer tool. It can start Codex in the selected workspace, display source diffs and command output, and answer approval requests.

- Keep it bound to `127.0.0.1`.
- Do not expose it directly through port forwarding, a public reverse proxy, or a tunnel.
- If remote access is required, place strong authentication and encrypted transport in front of it and restrict access at the network layer.
- Install from a reviewed commit or trusted release. A malicious fork or package could access the same local data available to Codex.
- Keep Codex itself updated and preserve its sandbox and approval policy.

The dashboard intentionally does not provide a configuration switch for non-loopback listening.
