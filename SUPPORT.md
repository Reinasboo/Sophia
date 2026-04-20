# Support

## Getting Help

### Questions & Discussions

- **GitHub Discussions**: [Sophia Discussions](https://github.com/Reinasboo/Sophia/discussions)
- **Expected response time**: 2–3 business days

### Bug Reports

- **GitHub Issues**: [Open a bug report](https://github.com/Reinasboo/Sophia/issues/new?template=bug_report.yml)
- **Expected assessment**: 5 business days

### Security Vulnerabilities

- **Email**: [security@sophia.dev](mailto:security@sophia.dev)
- **Expected acknowledgment**: 48 hours
- **See**: [SECURITY.md](SECURITY.md) for full vulnerability disclosure policy

> **Do not open public issues for security vulnerabilities.** Use responsible disclosure via email.

---

## Troubleshooting

### Common Issues

**`npm run lint` fails with "command not found"**

> Run `npm install` to ensure ESLint and its plugins are installed.

**Port 3001 already in use**

> Set a different port: `PORT=3002 npm run dev:backend` or kill the existing process.

**WebSocket connection refused**

> Check the `WS_PORT` environment variable and ensure your firewall allows the connection.

**`npm run build` fails with TypeScript errors**

> Ensure you're running Node.js 18+ and have run `npm install` in both the root and `apps/frontend/` directories.

**Frontend not loading at localhost:3000**

> Run `cd apps/frontend && npm install` separately, then `npm run dev:frontend`.

---

## Supported Versions

| Version          | Support Level | Security Updates |
| ---------------- | ------------- | ---------------- |
| Latest on `main` | Active        | Yes              |
| Previous minor   | Limited       | Critical only    |
| Older releases   | Unsupported   | No               |

---

## Contributing

If you'd like to help, please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

---

**Questions?** Open a [Discussion](https://github.com/Reinasboo/Sophia/discussions) or see [ARCHITECTURE.md](ARCHITECTURE.md) for technical details.
