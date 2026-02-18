# AI Orchestration System

This directory contains the AI agent orchestration system for the Express + Prisma backend template.

## Structure

```
.orchestration/
├── agents/                    # Specialized AI agent roles
│   ├── API_ARCHITECT.md       # API design and endpoint architecture
│   ├── DATABASE_ARCHITECT.md  # Prisma schemas and data modeling
│   ├── BACKEND_DEVELOPER.md   # Service and business logic implementation
│   ├── SECURITY_ENGINEER.md   # Security audits and best practices
│   ├── TEST_ENGINEER.md       # Testing strategies and implementation
│   └── CODE_REVIEWER.md       # Code review standards
├── security/                  # Security documentation
│   ├── PROTOCOL.md            # Security protocols and standards
│   └── THREAT_MODEL.md        # Threat analysis and mitigation
├── ARCHITECTURE.md            # System architecture overview
├── DESIGN_PATTERNS.md         # Code patterns and conventions
├── API_STANDARDS.md           # API design standards
├── RULES.md                   # Development rules
└── TODO.md                    # Project tasks and roadmap
```

## How to Use

### 1. Agent Roles
Each agent file defines a specialized role with:
- **Responsibilities**: What this agent handles
- **Guidelines**: How to approach tasks
- **Tools**: Available tools and commands
- **Workflows**: Step-by-step processes

### 2. Invoking Agents
When working on a task, reference the appropriate agent:

```
@API_ARCHITECT - Design new API endpoints
@DATABASE_ARCHITECT - Modify Prisma schemas
@BACKEND_DEVELOPER - Implement business logic
@SECURITY_ENGINEER - Security audit or fix
@TEST_ENGINEER - Write tests
@CODE_REVIEWER - Review code changes
```

### 3. Security Protocols
Always consult `security/PROTOCOL.md` before:
- Adding authentication/authorization
- Handling user input
- Database operations
- External API integrations

### 4. Architecture
See `ARCHITECTURE.md` for:
- System overview
- Layer responsibilities
- Data flow
- Technology stack

## Workflow Example

```mermaid
graph LR
    A[Request] --> B[@API_ARCHITECT]
    B --> C[@DATABASE_ARCHITECT]
    C --> D[@BACKEND_DEVELOPER]
    D --> E[@TEST_ENGINEER]
    E --> F[@CODE_REVIEWER]
    F --> G[@SECURITY_ENGINEER]
    G --> H[Deploy]
```

## Best Practices

1. **Always start with the architect** - Design before implementing
2. **Security first** - Consult security agent for sensitive operations
3. **Test as you build** - Invoke test engineer after implementation
4. **Review before merge** - Always use code reviewer
5. **Zod-first validation** - Keep schemas in `util/validation/<model>Zod.ts` and use schema-inferred DTO types in controllers/services
6. **Prisma multi-file schema** - Keep Prisma schema in `prisma/schema/` with per-model files (e.g., `user.prisma`) plus shared `base.prisma`

## Current Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **ORM**: Prisma 6 (MongoDB)
- **Validation**: Zod
- **Auth**: JWT + bcrypt
- **Testing**: Jest + Supertest
- **Documentation**: Swagger/OpenAPI
