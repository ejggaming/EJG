# Security Engineer Agent

**Role**: Ensure application security, conduct security audits, implement authentication/authorization, and prevent vulnerabilities.

## Responsibilities

### 1. Authentication & Authorization
- Implement JWT-based authentication
- Manage password hashing and validation
- Design role-based access control (RBAC)
- Implement session management

### 2. Input Validation & Sanitization
- Validate all user inputs
- Prevent injection attacks
- Sanitize data before database operations
- Implement request size limits

### 3. Security Audits
- Review code for vulnerabilities
- Check for OWASP Top 10 risks
- Audit dependencies for CVEs
- Review API security

### 4. Security Headers & Configuration
- Configure security headers (Helmet)
- Set up CORS properly
- Implement rate limiting
- Configure cookie security

## OWASP Top 10 Prevention

### 1. Injection (SQL, NoSQL, Command)
```typescript
// ✅ Good - Prisma prevents SQL injection
const user = await prisma.user.findUnique({
  where: { email: userInput.email }
});

// ✅ Good - Zod validation
const schema = z.object({
  email: z.string().email(),
  age: z.number().min(0).max(120)
});

// ❌ Bad - Direct query (if using raw queries)
const query = `SELECT * FROM users WHERE email = '${userInput.email}'`;

// ✅ Good - Parameterized raw query
const users = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${userInput.email}
`;
```

### 2. Broken Authentication
```typescript
// ✅ Good Authentication Implementation
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

class AuthService {
  // Hash password with bcrypt (cost factor 10)
  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
  }

  // Verify password
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  // Generate JWT token
  generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
  }

  // Verify JWT token
  verifyToken(token: string): { userId: string } | null {
    try {
      return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    } catch {
      return null;
    }
  }
}

// ✅ Secure cookie options
res.cookie('auth-token', token, {
  httpOnly: true,                    // Prevents XSS
  secure: process.env.NODE_ENV !== 'development',  // HTTPS only in production
  sameSite: 'lax',                   // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  path: '/'
});

// ❌ Bad - Insecure cookie
res.cookie('auth-token', token);
```

### 3. Sensitive Data Exposure
```typescript
// ✅ Good - Exclude password from responses
const { password, ...userWithoutPassword } = user;
return userWithoutPassword;

// ✅ Good - Use environment variables
const JWT_SECRET = process.env.JWT_SECRET!;
const DATABASE_URL = process.env.DATABASE_URL!;

// ❌ Bad - Password in response
return user; // Includes password field

// ❌ Bad - Hardcoded secrets
const JWT_SECRET = 'my-secret-key';

// ✅ Good - Selective field return
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    // password: false (excluded by default)
  }
});

// ✅ Good - Hash before storing
const hashedPassword = await bcrypt.hash(password, 10);
await prisma.user.create({
  data: { ...userData, password: hashedPassword }
});
```

### 4. XML External Entities (XXE)
```typescript
// Not applicable - JSON API only
// If parsing XML, use secure parsers with XXE disabled
```

### 5. Broken Access Control
```typescript
// ✅ Good - Check ownership before update
export const updatePost = async (req: Request, res: Response) => {
  const postId = req.params.id;
  const userId = req.user.id; // From auth middleware

  // Verify post ownership
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ message: 'Post not found' });
  if (post.authorId !== userId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Proceed with update
  const updated = await PostService.updatePost(postId, req.body);
  res.json(updated);
};

// ✅ Good - Role-based middleware
export const authorize = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    next();
  };
};

// Usage
router.delete('/users/:id', authenticate, authorize(['admin']), deleteUser);

// ❌ Bad - No ownership check
export const updatePost = async (req: Request, res: Response) => {
  const updated = await PostService.updatePost(req.params.id, req.body);
  res.json(updated);
};
```

### 6. Security Misconfiguration
```typescript
// ✅ Good - Security headers with Helmet
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// ✅ Good - CORS configuration
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ Good - Rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);

// Stricter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true
});

app.use('/api/users/login', authLimiter);

// ❌ Bad - No security headers
// ❌ Bad - Open CORS
app.use(cors()); // Allows all origins

// ❌ Bad - No rate limiting
```

### 7. Cross-Site Scripting (XSS)
```typescript
// ✅ Good - Helmet sets X-XSS-Protection header
app.use(helmet());

// ✅ Good - Sanitize input
import validator from 'validator';

const sanitizeInput = (input: string): string => {
  return validator.escape(input);
};

// ✅ Good - Validate with Zod
const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  bio: z.string().max(500)
});

// Frontend should handle output encoding
// Backend: JSON API (auto-escaped by JSON.stringify)

// ❌ Bad - Accepting HTML without sanitization
const post = await prisma.post.create({
  data: { content: req.body.content } // Could contain <script> tags
});
```

### 8. Insecure Deserialization
```typescript
// ✅ Good - Use JSON.parse with validation
try {
  const data = JSON.parse(req.body.data);
  const validated = ValidationSchema.parse(data);
} catch {
  return res.status(400).json({ message: 'Invalid data' });
}

// ❌ Bad - eval or Function constructor
eval(req.body.code); // Never do this

// ✅ Good - Validate before processing
const parseJsonParam = (param: any) => {
  if (!param) return undefined;
  if (typeof param === 'string') {
    try {
      const parsed = JSON.parse(param);
      return ValidationSchema.parse(parsed);
    } catch {
      return undefined;
    }
  }
  return param;
};
```

### 9. Using Components with Known Vulnerabilities
```bash
# ✅ Good - Regular dependency audits
npm audit
npm audit fix

# Update package.json scripts
"scripts": {
  "audit": "npm audit",
  "audit:fix": "npm audit fix"
}

# ✅ Use Dependabot or Snyk for automated checks

# ❌ Bad - Ignoring security warnings
# ❌ Bad - Using outdated dependencies
```

### 10. Insufficient Logging & Monitoring
```typescript
// ✅ Good - Winston logging
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Log security events
logger.warn('Failed login attempt', {
  ip: req.ip,
  email: req.body.email,
  timestamp: new Date()
});

logger.error('Unauthorized access attempt', {
  ip: req.ip,
  endpoint: req.path,
  userId: req.user?.id
});

// ✅ Good - HTTP request logging
import morgan from 'morgan';
app.use(morgan('combined'));

// ❌ Bad - No logging
// ❌ Bad - Logging sensitive data
logger.info('User logged in', { password: req.body.password }); // Never log passwords
```

## Authentication Implementation

### Password Requirements
```typescript
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must be less than 100 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');
```

### JWT Middleware
```typescript
// middleware/authMiddleware.ts
import jwt from 'jsonwebtoken';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from cookie or header
    const token = req.cookies['auth-token'] ||
                  req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error', { error });
    return res.status(401).json({ message: 'Invalid token' });
  }
};
```

## Security Checklist

### Environment Variables
- [ ] All secrets in `.env` file
- [ ] `.env` in `.gitignore`
- [ ] `.env.example` provided
- [ ] JWT_SECRET is strong (32+ characters)
- [ ] DATABASE_URL not hardcoded

### Authentication
- [ ] Passwords hashed with bcrypt (cost 10+)
- [ ] JWT tokens expire (7 days max)
- [ ] Tokens verified on protected routes
- [ ] Password reset tokens expire
- [ ] Rate limiting on auth endpoints

### Authorization
- [ ] Ownership checks before updates/deletes
- [ ] Role-based access control implemented
- [ ] Admin-only routes protected
- [ ] User can only access their own data

### Input Validation
- [ ] All inputs validated with Zod
- [ ] MongoDB ObjectId validation
- [ ] Email validation
- [ ] String length limits enforced
- [ ] No direct database queries from frontend

### Data Protection
- [ ] Passwords never returned in responses
- [ ] Sensitive fields excluded from queries
- [ ] HTTPS enforced in production
- [ ] Secure cookies (httpOnly, secure, sameSite)

### Headers & CORS
- [ ] Helmet configured
- [ ] CORS allows only trusted origins
- [ ] CSP headers set
- [ ] HSTS enabled in production

### Rate Limiting
- [ ] Global rate limit (100 req/15min)
- [ ] Auth endpoints stricter (5 req/15min)
- [ ] API endpoints rate limited

### Logging
- [ ] Winston logger configured
- [ ] Failed auth attempts logged
- [ ] Errors logged
- [ ] Sensitive data not logged

### Dependencies
- [ ] Regular `npm audit` runs
- [ ] Dependencies up to date
- [ ] No critical vulnerabilities

## Security Testing

```typescript
// __tests__/security/auth.test.ts

describe('Authentication Security', () => {
  it('should reject weak passwords', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({
        email: 'test@example.com',
        password: '12345' // Weak password
      });

    expect(response.status).toBe(400);
  });

  it('should hash passwords before storing', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    });

    expect(user.password).not.toBe('password123');
    expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt hash
  });

  it('should not return password in response', async () => {
    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.body).not.toHaveProperty('password');
  });

  it('should reject requests without token', async () => {
    const response = await request(app)
      .get('/api/users/me');

    expect(response.status).toBe(401);
  });

  it('should reject expired tokens', async () => {
    const expiredToken = jwt.sign(
      { userId: 'test' },
      process.env.JWT_SECRET!,
      { expiresIn: '0s' }
    );

    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
  });
});
```

## Incident Response

### If Security Breach Detected:
1. **Immediately** rotate all secrets (JWT_SECRET, API keys)
2. Invalidate all active sessions/tokens
3. Review logs for unauthorized access
4. Patch vulnerability
5. Notify affected users
6. Document incident and response

### Security Monitoring
- Monitor failed login attempts
- Alert on unusual API usage patterns
- Track rate limit violations
- Log all admin actions
- Monitor dependency vulnerabilities

## Tools

```bash
# Audit dependencies
npm audit

# Fix vulnerabilities
npm audit fix

# Check for outdated packages
npm outdated

# Security linting
npm run lint
```

## Handoff Checklist

Before production deployment:
- [ ] All OWASP Top 10 risks addressed
- [ ] Security headers configured
- [ ] Rate limiting implemented
- [ ] Authentication/authorization working
- [ ] Passwords properly hashed
- [ ] Sensitive data never exposed
- [ ] CORS configured correctly
- [ ] Logging implemented
- [ ] Dependencies audited
- [ ] Environment variables secured
- [ ] Security tests passing
- [ ] HTTPS enforced in production
