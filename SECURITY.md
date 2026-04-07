# Security Policy

## Supported Versions

We actively support the following versions of AgentSync with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

The AgentSync team takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities via email to:

**security@pax8.com**

### What to Include in Your Report

To help us better understand and resolve the issue, please include the following information in your report:

- **Description**: A clear description of the vulnerability and its potential impact
- **Steps to Reproduce**: Detailed steps to reproduce the vulnerability, including:
  - Configuration details
  - Command sequences
  - Any relevant code snippets or proof-of-concept
- **Impact Assessment**: Your assessment of the vulnerability's severity and potential impact, including:
  - What data could be exposed
  - What systems could be compromised
  - Potential attack vectors
- **Environment Details**: Information about the environment where you discovered the issue (OS, Node.js version, AgentSync version, etc.)
- **Suggested Fix**: If you have recommendations for remediation, please include them

### Response Timeline

We are committed to working with security researchers to resolve vulnerabilities quickly and responsibly.

- **Acknowledgment**: You will receive an acknowledgment of your report within **48 hours**
- **Initial Assessment**: We will provide an initial assessment of the report within **7 days**, including:
  - Validation of the vulnerability
  - Severity classification
  - Estimated timeline for resolution
- **Progress Updates**: We will provide regular updates on our progress every **7 days** until the issue is resolved
- **Resolution**: We will notify you when the vulnerability has been fixed and deployed

## Disclosure Policy

We believe in coordinated disclosure to protect our users:

- **Coordinated Disclosure**: We request that you do not publicly disclose the vulnerability until we have released a fix and had adequate time to notify users
- **Public Disclosure**: Once a fix is available and deployed, we will work with you on the timing and content of public disclosure
- **Security Advisories**: We will publish security advisories for confirmed vulnerabilities through GitHub Security Advisories
- **Credit**: We are happy to give credit to security researchers who report valid vulnerabilities (unless you prefer to remain anonymous)

## Scope

### In Scope

The following are within scope for security vulnerability reports:

- The AgentSync codebase in this repository
- CLI commands and their implementation
- Core deployment and configuration services
- Authentication and authorization mechanisms
- MCP (Model Context Protocol) server implementation
- API endpoints and data handling
- Configuration file parsing and validation

### Out of Scope

The following are outside the scope of this security policy:

- **Third-Party Dependencies**: Vulnerabilities in third-party npm packages (please report these to the respective package maintainers)
- **Microsoft Dynamics 365 / Power Platform**: Issues with Microsoft's services themselves (report these to Microsoft Security Response Center)
- **Azure Services**: Security issues with Azure infrastructure (report these to Azure Security)
- **Social Engineering**: Attacks that rely on social engineering tactics
- **Denial of Service**: DoS or DDoS attacks
- **Physical Security**: Physical access to systems

## Credential and Configuration Safety

The following files contain or may contain real credentials and **must never be committed**:

- `.env`, `.env.sandbox`, `.env.local`, or any `.env.*` file (except `.env.example`)
- `config/tenants.yaml` or any tenant config with real tenant IDs, client secrets, or environment URLs
- `TEST_PLAN.md` or internal docs referencing real Azure AD infrastructure

Use the provided example files as templates:

- `.env.example` — placeholder credentials
- `config/tenants.example.yaml` — example tenant configuration

If you discover committed credentials or secrets in the repository (including git history), please report it immediately via the vulnerability reporting process above.

## Security Best Practices

When using AgentSync, we recommend following these security best practices:

1. **Credentials Management**: Store credentials securely using environment variables or secure credential management systems. Never hardcode secrets in source files.
2. **Access Control**: Follow the principle of least privilege when configuring GDAP relationships and service accounts
3. **Secret Rotation**: Rotate Azure AD client secrets regularly and immediately if exposed
4. **Updates**: Keep AgentSync and its dependencies up to date
5. **Audit Logging**: Enable and regularly review audit logs
6. **Network Security**: Use secure network connections and restrict access to deployment systems

## Contact

For general security questions or concerns that are not vulnerability reports, you can:

- Open a discussion in the GitHub Discussions section
- Contact us at security@pax8.com

Thank you for helping keep AgentSync and its users secure!
