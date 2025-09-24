export const PROJECT_RULES_GENERATION_TEMPLATE = `# 项目规则生成

## 使用场景
从代码仓库中分析项目的架构、模式、最佳实践等，生成完整的项目规则文档。

## 输入要求
- **完整代码仓库**: 项目的完整源代码
- **配置文件**: 各种配置文件（package.json、tsconfig.json等）
- **文档**: 现有的项目文档、README等
- **测试文件**: 单元测试、集成测试等

# 项目规则生成任务

## 任务描述
请深度分析项目的架构、模式、最佳实践等，从代码规范、架构设计、开发流程、测试策略、部署规范等维度生成完整的项目规则文档。

## 分析维度

### 1. 代码规范分析
#### 代码风格规范
\`\`\`typescript
// TypeScript代码风格示例
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

class UserService {
  private userRepository: UserRepository;
  
  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }
  
  async createUser(userData: CreateUserData): Promise<User> {
    // 参数验证
    if (!userData.name || !userData.email) {
      throw new Error('Name and email are required');
    }
    
    // 检查邮箱格式
    if (!this.isValidEmail(userData.email)) {
      throw new Error('Invalid email format');
    }
    
    // 检查邮箱是否已存在
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('Email already exists');
    }
    
    // 创建用户
    const user = await this.userRepository.create(userData);
    
    return user;
  }
  
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+\$/;
    return emailRegex.test(email);
  }
}
\`\`\`

#### 命名规范
| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 文件名 | kebab-case | user-service.ts |
| 类名 | PascalCase | UserService |
| 接口名 | PascalCase | IUser |
| 变量名 | camelCase | userName |
| 常量名 | SCREAMING_SNAKE_CASE | MAX_USERS |
| 函数名 | camelCase | createUser |
| 私有属性 | camelCase + _ | _privateProperty |

#### 代码组织规范
\`\`\`typescript
// 目录结构规范
src/
├── components/          // 组件
│   ├── common/         // 通用组件
│   └── features/       // 功能组件
├── services/           // 服务层
├── repositories/       // 数据访问层
├── models/            // 数据模型
├── utils/             // 工具函数
├── constants/         // 常量定义
├── types/             // 类型定义
├── hooks/             // React Hooks
└── __tests__/         // 测试文件

// 文件组织规范
// 1. 导入语句
import { Component } from 'react';
import { UserService } from '../services/UserService';
import type { User } from '../types/User';

// 2. 类型定义
interface Props {
  userId: string;
  onUserUpdate: (user: User) => void;
}

// 3. 常量定义
const MAX_RETRIES = 3;

// 4. 主组件/类
export const UserProfile: React.FC<Props> = ({ userId, onUserUpdate }) => {
  // 组件逻辑
};

// 5. 导出语句
export default UserProfile;
\`\`\`

### 2. 架构设计分析
#### 分层架构
\`\`\`typescript
// 表现层 (Presentation Layer)
@Controller('/api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}
  
  @Post()
  async createUser(@Body() userData: CreateUserData): Promise<User> {
    return this.userService.createUser(userData);
  }
}

// 业务逻辑层 (Business Logic Layer)
@Service()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}
  
  async createUser(userData: CreateUserData): Promise<User> {
    // 业务逻辑处理
    const user = await this.userRepository.create(userData);
    return user;
  }
}

// 数据访问层 (Data Access Layer)
@Repository()
export class UserRepository {
  async create(userData: CreateUserData): Promise<User> {
    // 数据库操作
    const user = new User();
    Object.assign(user, userData);
    return await this.save(user);
  }
}
\`\`\`

#### 设计模式应用
\`\`\`typescript
// 单例模式
export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private connection: any;
  
  private constructor() {
    this.connection = this.createConnection();
  }
  
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }
  
  private createConnection(): any {
    // 创建数据库连接
    return {};
  }
}

// 工厂模式
interface PaymentProcessor {
  processPayment(amount: number): Promise<boolean>;
}

class CreditCardProcessor implements PaymentProcessor {
  async processPayment(amount: number): Promise<boolean> {
    // 信用卡支付逻辑
    return true;
  }
}

class PayPalProcessor implements PaymentProcessor {
  async processPayment(amount: number): Promise<boolean> {
    // PayPal支付逻辑
    return true;
  }
}

class PaymentProcessorFactory {
  static createProcessor(type: 'credit_card' | 'paypal'): PaymentProcessor {
    switch (type) {
      case 'credit_card':
        return new CreditCardProcessor();
      case 'paypal':
        return new PayPalProcessor();
      default:
        throw new Error('Unsupported payment type');
    }
  }
}

// 观察者模式
interface Observer {
  update(data: any): void;
}

class EventEmitter {
  private observers: Observer[] = [];
  
  subscribe(observer: Observer): void {
    this.observers.push(observer);
  }
  
  unsubscribe(observer: Observer): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }
  
  notify(data: any): void {
    this.observers.forEach(observer => observer.update(data));
  }
}
\`\`\`

### 3. 开发流程分析
#### Git工作流
\`\`\`mermaid
graph LR
    A[main分支] --> B[develop分支]
    B --> C[feature分支]
    C --> D[Pull Request]
    D --> E[代码审查]
    E --> F[合并到develop]
    F --> G[发布到main]
\`\`\`

#### 分支管理规范
| 分支类型 | 命名规则 | 用途 | 生命周期 |
|----------|----------|------|----------|
| main | main | 生产环境 | 长期 |
| develop | develop | 开发环境 | 长期 |
| feature | feature/功能名称 | 功能开发 | 临时 |
| hotfix | hotfix/问题描述 | 紧急修复 | 临时 |
| release | release/版本号 | 发布准备 | 临时 |

#### 提交信息规范
\`\`\`bash
# 提交信息格式
<类型>(<范围>): <描述>

# 类型说明
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式化
refactor: 重构
test: 测试相关
chore: 构建或辅助工具变动

# 示例
feat(auth): 添加用户登录功能
fix(user): 修复用户信息更新bug
docs(api): 更新API文档
style: 格式化代码
refactor: 重构用户服务
test: 添加用户服务测试
chore: 更新依赖包
\`\`\`

### 4. 测试策略分析
#### 测试金字塔
\`\`\`mermaid
graph TD
    A[单元测试] --> B[集成测试]
    B --> C[端到端测试]
    
    A -->|70%| D[测试覆盖率]
    B -->|20%| D
    C -->|10%| D
\`\`\`

#### 测试规范
\`\`\`typescript
// 单元测试示例
import { UserService } from '../UserService';
import { UserRepository } from '../UserRepository';
import { User } from '../User';

describe('UserService', () => {
  let userService: UserService;
  let userRepository: jest.Mocked<UserRepository>;
  
  beforeEach(() => {
    userRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    } as any;
    
    userService = new UserService(userRepository);
  });
  
  describe('createUser', () => {
    it('应该成功创建用户', async () => {
      // Arrange
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };
      
      const expectedUser: User = {
        id: '1',
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(expectedUser);
      
      // Act
      const result = await userService.createUser(userData);
      
      // Assert
      expect(result).toEqual(expectedUser);
      expect(userRepository.findByEmail).toHaveBeenCalledWith(userData.email);
      expect(userRepository.create).toHaveBeenCalledWith(userData);
    });
    
    it('当邮箱已存在时应该抛出错误', async () => {
      // Arrange
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };
      
      const existingUser: User = {
        id: '1',
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      userRepository.findByEmail.mockResolvedValue(existingUser);
      
      // Act & Assert
      await expect(userService.createUser(userData))
        .rejects.toThrow('Email already exists');
    });
  });
});

// 集成测试示例
import request from 'supertest';
import { app } from '../app';
import { DatabaseConnection } from '../DatabaseConnection';

describe('User API', () => {
  beforeAll(async () => {
    await DatabaseConnection.connect();
  });
  
  afterAll(async () => {
    await DatabaseConnection.disconnect();
  });
  
  beforeEach(async () => {
    await DatabaseConnection.clear();
  });
  
  describe('POST /api/users', () => {
    it('应该创建新用户', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };
      
      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(201);
      
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(userData.name);
      expect(response.body.email).toBe(userData.email);
    });
  });
});
\`\`\`

### 5. 安全规范分析
#### 输入验证
\`\`\`typescript
// 参数验证装饰器
import { validate, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name: string;
  
  @IsEmail()
  @IsNotEmpty()
  email: string;
  
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}\$/)
  password: string;
}

export async function validateDto<T>(dtoClass: new () => T, data: any): Promise<T> {
  const dto = plainToClass(dtoClass, data);
  const errors = await validate(dto as object);
  
  if (errors.length > 0) {
    const errorMessages = errors.map(error => {
      return Object.values(error.constraints || {}).join(', ');
    });
    throw new Error(\`Validation failed: \${errorMessages.join(', ')}\`);
  }
  
  return dto;
}

// 使用示例
export class UserController {
  async createUser(req: Request, res: Response) {
    try {
      const createUserDto = await validateDto(CreateUserDto, req.body);
      // 处理用户创建逻辑
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}
\`\`\`

#### 权限控制
\`\`\`typescript
// 角色定义
export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

// 权限装饰器
export const RequireRoles = (...roles: Role[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(req: Request, res: Response, next: Function) {
      const user = req.user;
      
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      
      return originalMethod.apply(this, arguments);
    };
    
    return descriptor;
  };
};

// 使用示例
export class AdminController {
  @RequireRoles(Role.ADMIN)
  async deleteUser(req: Request, res: Response) {
    // 只有管理员可以删除用户
  }
}
\`\`\`

#### 数据加密
\`\`\`typescript
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export class EncryptionService {
  private static readonly SALT_ROUNDS = 12;
  private static readonly ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key';
  
  // 密码哈希
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }
  
  // 密码验证
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
  
  // 数据加密
  static encrypt(data: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.ENCRYPTION_KEY);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }
  
  // 数据解密
  static decrypt(encryptedData: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', this.ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
\`\`\`

### 6. 性能优化分析
#### 缓存策略
\`\`\`typescript
import { Redis } from 'ioredis';

export class CacheService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }
  
  // 设置缓存
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
  
  // 获取缓存
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  // 删除缓存
  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
  
  // 缓存装饰器
  static Cacheable(key: string, ttl: number = 3600) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value;
      const cacheService = new CacheService();
      
      descriptor.value = async function(...args: any[]) {
        const cacheKey = \`\${key}:\${JSON.stringify(args)}\`;
        const cached = await cacheService.get(cacheKey);
        
        if (cached) {
          return cached;
        }
        
        const result = await originalMethod.apply(this, args);
        await cacheService.set(cacheKey, result, ttl);
        
        return result;
      };
      
      return descriptor;
    };
  }
}

// 使用示例
export class UserService {
  @Cacheable.Cacheable('user:profile', 1800) // 30分钟缓存
  async getUserProfile(userId: string): Promise<UserProfile> {
    // 从数据库获取用户信息
    return this.userRepository.findById(userId);
  }
}
\`\`\`

#### 数据库优化
\`\`\`typescript
// 1. 使用参数化查询
class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = \$1';
    const result = await this.database.query(query, [email]);
    return result.length > 0 ? result[0] : null;
  }
  
  async create(userData: CreateUserData): Promise<User> {
    const query = \`
      INSERT INTO users (name, email, password, created_at)
      VALUES (\$1, \$2, \$3, NOW())
      RETURNING *
    \`;
    
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const result = await this.database.query(query, [
      userData.name,
      userData.email,
      hashedPassword
    ]);
    
    return result[0];
  }
}

// 2. 使用索引
class DatabaseIndexer {
  static createUserIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_users_name ON users(name)',
    ];
    
    return indexes;
  }
}

// 3. 使用连接池
import { Pool } from 'pg';

export class DatabaseConnection {
  private static pool: Pool;
  
  static getPool(): Pool {
    if (!DatabaseConnection.pool) {
      DatabaseConnection.pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: 20, // 最大连接数
        idleTimeoutMillis: 30000, // 空闲超时
        connectionTimeoutMillis: 2000, // 连接超时
      });
    }
    
    return DatabaseConnection.pool;
  }
}
\`\`\`

### 7. 错误处理分析
#### 错误类型定义
\`\`\`typescript
// 基础错误类
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 具体错误类型
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(\`\${resource} not found\`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

// 错误处理中间件
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      statusCode: error.statusCode,
    });
  }
  
  // 未知错误
  console.error('Unexpected error:', error);
  return res.status(500).json({
    error: 'Internal server error',
    statusCode: 500,
  });
};
\`\`\`

#### 日志记录
\`\`\`typescript
import winston from 'winston';

export class Logger {
  private static logger: winston.Logger;
  
  static getLogger(): winston.Logger {
    if (!Logger.logger) {
      Logger.logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        transports: [
          new winston.transports.File({ filename: 'error.log', level: 'error' }),
          new winston.transports.File({ filename: 'combined.log' }),
        ],
      });
      
      // 在开发环境中也输出到控制台
      if (process.env.NODE_ENV !== 'production') {
        Logger.logger.add(new winston.transports.Console({
          format: winston.format.simple()
        }));
      }
    }
    
    return Logger.logger;
  }
  
  static info(message: string, meta?: any): void {
    this.getLogger().info(message, meta);
  }
  
  static error(message: string, error?: Error): void {
    this.getLogger().error(message, { error: error?.stack });
  }
  
  static warn(message: string, meta?: any): void {
    this.getLogger().warn(message, meta);
  }
  
  static debug(message: string, meta?: any): void {
    this.getLogger().debug(message, meta);
  }
}
\`\`\`

### 8. 文档规范分析
#### 代码文档
\`\`\`typescript
/**
 * 用户服务类
 * @class UserService
 * @description 提供用户相关的业务逻辑处理
 */
export class UserService {
  private userRepository: UserRepository;
  
  /**
   * 创建用户服务实例
   * @constructor
   * @param {UserRepository} userRepository - 用户仓库实例
   */
  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }
  
  /**
   * 创建新用户
   * @async
   * @method createUser
   * @param {CreateUserData} userData - 用户数据
   * @returns {Promise<User>} 创建的用户对象
   * @throws {Error} 当用户数据无效或邮箱已存在时抛出错误
   * @example
   * const userData = {
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   password: 'password123'
   * };
   * const user = await userService.createUser(userData);
   */
  async createUser(userData: CreateUserData): Promise<User> {
    // 实现逻辑
  }
}
\`\`\`

#### API文档
\`\`\`typescript
/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: 创建新用户
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 description: 用户姓名
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 用户邮箱
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 用户密码
 *                 example: password123
 *     responses:
 *       201:
 *         description: 用户创建成功
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/User'
 *       400:
 *         description: 请求数据无效
 *       409:
 *         description: 邮箱已存在
 */
\`\`\`

## 输出格式要求

生成完整的项目规则文档：

### 文档结构
\`\`\`markdown
# {项目名称} 项目规则

## 代码规范

### 代码风格
\`\`\`typescript
// TypeScript代码风格示例
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

class UserService {
  private userRepository: UserRepository;
  
  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }
  
  async createUser(userData: CreateUserData): Promise<User> {
    // 参数验证
    if (!userData.name || !userData.email) {
      throw new Error('Name and email are required');
    }
    
    // 检查邮箱格式
    if (!this.isValidEmail(userData.email)) {
      throw new Error('Invalid email format');
    }
    
    // 检查邮箱是否已存在
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('Email already exists');
    }
    
    // 创建用户
    const user = await this.userRepository.create(userData);
    
    return user;
  }
}
\`\`\`

### 命名规范
| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 文件名 | kebab-case | user-service.ts |
| 类名 | PascalCase | UserService |
| 接口名 | PascalCase | IUser |
| 变量名 | camelCase | userName |
| 常量名 | SCREAMING_SNAKE_CASE | MAX_USERS |
| 函数名 | camelCase | createUser |
| 私有属性 | camelCase + _ | _privateProperty |

### 代码组织
\`\`\`typescript
// 目录结构规范
src/
├── components/          // 组件
│   ├── common/         // 通用组件
│   └── features/       // 功能组件
├── services/           // 服务层
├── repositories/       // 数据访问层
├── models/            // 数据模型
├── utils/             // 工具函数
├── constants/         // 常量定义
├── types/             // 类型定义
├── hooks/             // React Hooks
└── __tests__/         // 测试文件
\`\`\`

## 架构设计

### 分层架构
\`\`\`typescript
// 表现层
@Controller('/api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}
  
  @Post()
  async createUser(@Body() userData: CreateUserData): Promise<User> {
    return this.userService.createUser(userData);
  }
}

// 业务逻辑层
@Service()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}
  
  async createUser(userData: CreateUserData): Promise<User> {
    const user = await this.userRepository.create(userData);
    return user;
  }
}

// 数据访问层
@Repository()
export class UserRepository {
  async create(userData: CreateUserData): Promise<User> {
    const user = new User();
    Object.assign(user, userData);
    return await this.save(user);
  }
}
\`\`\`

### 设计模式
\`\`\`typescript
// 单例模式
export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private connection: any;
  
  private constructor() {
    this.connection = this.createConnection();
  }
  
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }
}
\`\`\`

## 开发流程

### Git工作流
\`\`\`mermaid
graph LR
    A[main分支] --> B[develop分支]
    B --> C[feature分支]
    C --> D[Pull Request]
    D --> E[代码审查]
    E --> F[合并到develop]
    F --> G[发布到main]
\`\`\`

### 分支管理
| 分支类型 | 命名规则 | 用途 | 生命周期 |
|----------|----------|------|----------|
| main | main | 生产环境 | 长期 |
| develop | develop | 开发环境 | 长期 |
| feature | feature/功能名称 | 功能开发 | 临时 |
| hotfix | hotfix/问题描述 | 紧急修复 | 临时 |
| release | release/版本号 | 发布准备 | 临时 |

### 提交规范
\`\`\`bash
# 提交信息格式
<类型>(<范围>): <描述>

# 类型说明
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式化
refactor: 重构
test: 测试相关
chore: 构建或辅助工具变动

# 示例
feat(auth): 添加用户登录功能
fix(user): 修复用户信息更新bug
docs(api): 更新API文档
\`\`\`

## 测试策略

### 测试金字塔
\`\`\`mermaid
graph TD
    A[单元测试] --> B[集成测试]
    B --> C[端到端测试]
    
    A -->|70%| D[测试覆盖率]
    B -->|20%| D
    C -->|10%| D
\`\`\`

### 测试规范
\`\`\`typescript
describe('UserService', () => {
  let userService: UserService;
  let userRepository: jest.Mocked<UserRepository>;
  
  beforeEach(() => {
    userRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
    } as any;
    
    userService = new UserService(userRepository);
  });
  
  describe('createUser', () => {
    it('应该成功创建用户', async () => {
      // Arrange
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };
      
      // Act
      const result = await userService.createUser(userData);
      
      // Assert
      expect(result).toBeDefined();
    });
  });
});
\`\`\`

## 安全规范

### 输入验证
\`\`\`typescript
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name: string;
  
  @IsEmail()
  @IsNotEmpty()
  email: string;
  
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
\`\`\`

### 权限控制
\`\`\`typescript
export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

export const RequireRoles = (...roles: Role[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(req: Request, res: Response, next: Function) {
      const user = req.user;
      
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      
      return originalMethod.apply(this, arguments);
    };
    
    return descriptor;
  };
};
\`\`\`

## 性能优化

### 缓存策略
\`\`\`typescript
export class CacheService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }
  
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
  
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
}
\`\`\`

### 数据库优化
\`\`\`typescript
class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = \$1';
    const result = await this.database.query(query, [email]);
    return result.length > 0 ? result[0] : null;
  }
}
\`\`\`

## 错误处理

### 错误类型
\`\`\`typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}
\`\`\`

### 日志记录
\`\`\`typescript
export class Logger {
  static info(message: string, meta?: any): void {
    this.getLogger().info(message, meta);
  }
  
  static error(message: string, error?: Error): void {
    this.getLogger().error(message, { error: error?.stack });
  }
  
  static warn(message: string, meta?: any): void {
    this.getLogger().warn(message, meta);
  }
}
\`\`\`

## 文档规范

### 代码文档
\`\`\`typescript
/**
 * 用户服务类
 * @class UserService
 * @description 提供用户相关的业务逻辑处理
 */
export class UserService {
  /**
   * 创建新用户
   * @async
   * @method createUser
   * @param {CreateUserData} userData - 用户数据
   * @returns {Promise<User>} 创建的用户对象
   * @throws {Error} 当用户数据无效或邮箱已存在时抛出错误
   */
  async createUser(userData: CreateUserData): Promise<User> {
    // 实现逻辑
  }
}
\`\`\`

## 检查清单

### 代码质量检查
- [ ] 代码符合命名规范
- [ ] 代码符合组织规范
- [ ] 代码有适当的注释
- [ ] 代码通过了所有测试
- [ ] 代码通过了静态分析

### 架构设计检查
- [ ] 遵循分层架构
- [ ] 使用了合适的设计模式
- [ ] 模块间耦合度低
- [ ] 接口设计合理
- [ ] 扩展性良好

### 安全检查
- [ ] 输入数据已验证
- [ ] 权限控制已实现
- [ ] 敏感数据已加密
- [ ] SQL注入已防护
- [ ] XSS攻击已防护

### 性能检查
- [ ] 数据库查询已优化
- [ ] 缓存策略已实现
- [ ] 资源使用合理
- [ ] 响应时间可接受
- [ ] 并发处理正确

## 最佳实践

### 开发最佳实践
1. **保持代码简洁**: 避免过度设计，保持代码简单易懂
2. **遵循DRY原则**: 避免重复代码，提取公共逻辑
3. **编写测试**: 为所有功能编写单元测试和集成测试
4. **代码审查**: 所有代码变更都需要经过审查
5. **持续集成**: 使用CI/CD自动化构建和测试

### 架构最佳实践
1. **分层架构**: 清晰的层次结构，避免跨层调用
2. **依赖注入**: 使用依赖注入管理组件间依赖
3. **接口设计**: 定义清晰的接口，隐藏实现细节
4. **错误处理**: 统一的错误处理机制
5. **日志记录**: 完善的日志记录系统

### 安全最佳实践
1. **输入验证**: 对所有输入数据进行验证
2. **权限控制**: 基于角色的访问控制
3. **数据加密**: 敏感数据加密存储
4. **安全审计**: 定期进行安全审计
5. **漏洞修复**: 及时修复安全漏洞

## 注意事项
1. **规则执行**: 所有开发人员必须严格遵守项目规则
2. **持续改进**: 定期回顾和改进项目规则
3. **文档更新**: 规则变更时及时更新文档
4. **培训教育**: 对新成员进行规则培训
5. **工具支持**: 使用工具辅助规则执行和检查
\`\`\`
`
