<!-- srcbook:{"language":"typescript","tsconfig.json":{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","resolveJsonModule":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src/**/*"],"exclude":["node_modules"]}} -->

# Diagramming Srcbook's Architecture

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "tsx": "latest",
    "typescript": "latest",
    "@types/node": "latest"
  }
}
```

This Srcbook demonstrates [Mermaid diagrams](https://mermaid.js.org/intro/getting-started.html) by using them to showcase Srcbook's high-level architecture.

### Core Components

```mermaid
graph TD
    A[Client] -->|WebSocket| B[WebSocket Server]
    A -->|HTTP| C[HTTP Server]
    B --> D[Session Management]
    C --> D
    C --> E[AI Integration]
    C --> F[Dependency Management]
```

### WebSockets Data Flow

Manages real-time communication for
- updating cell statuses
- broadcasting messages
- handling execution outputs.

```mermaid
sequenceDiagram
    participant Client
    participant WebSocketServer
    participant SessionManagement
    participant CodeExecution

    Client->>WebSocketServer: Request to execute code
    WebSocketServer->>SessionManagement: Update cell status to 'running'
    WebSocketServer->>CodeExecution: Start code execution process
    CodeExecution-->>WebSocketServer: Return execution output
    WebSocketServer->>Client: Send execution output
    WebSocketServer->>SessionManagement: Update cell status to 'idle'
```

### Http Communication

Handles various RESTful API endpoints for session management, AI generation, and configuration.

```mermaid
sequenceDiagram
    participant Client
    participant HTTPServer
    participant SessionManagement
    participant AIIntegration
    participant DependencyManagement

    Client->>HTTPServer: Create/Retrieve session
    HTTPServer->>SessionManagement: Handle session data
    SessionManagement-->>HTTPServer: Return session data
    HTTPServer-->>Client: Send session data

    Client->>HTTPServer: Request AI code generation
    HTTPServer->>AIIntegration: Process AI request
    AIIntegration-->>HTTPServer: Return generated code
    HTTPServer-->>Client: Send generated code

    Client->>HTTPServer: Check dependencies
    HTTPServer->>DependencyManagement: Validate dependencies
    DependencyManagement-->>HTTPServer: Return validation result
    HTTPServer-->>Client: Send validation result
```

### Data Flow

##### Client Interaction:
- Uses WebSocket for real-time updates.
- Uses HTTP for session management, AI requests, and configuration.

##### Session Management:
- HTTP requests to create/retrieve sessions.
- Manages session data on the server.

##### Code Execution:
- Client requests code execution.
- Server runs code and updates status via WebSocket.

##### AI Code Generation:
- Client requests AI-generated code.
- Server processes and returns generated code.

##### Dependency Management:
- Server checks and installs missing dependencies.
- Updates client on dependency status.

```mermaid
flowchart TB
    A[Client] -->|HTTP| B[Session Management]
    A -->|WebSocket| C[Code Execution]
    A -->|HTTP| D[AI Integration]
    A -->|HTTP| E[Dependency Management]

    B --> F[Session Data Storage]
    C --> G[Child Process Execution]
    D --> H[AI Code Generation]
    E --> I[Dependency Validation]

    F -->|Session Data| A
    G -->|Execution Output| A
    H -->|Generated Code| A
    I -->|Validation Result| A
```

## Architecture diagrams (bonus)

There is a large set of icons for describing services available in the [architecture diagrams documentation](https://mermaid.js.org/syntax/architecture.html).

Here is one example:

```mermaid
architecture-beta
    group aws(cloud)[AWS]
    
    group vpc(cloud)[VPC] in aws
    
    service ec2_instance(server)[EC2 Instance] in vpc
    service rds(database)[RDS] in vpc
    service s3_bucket(disk)[S3 Bucket] in vpc
    service lambda_function(server)[Lambda] in vpc
    service api_gateway(internet)[API Gateway] in vpc
    service cloudfront(internet)[CloudFront] in vpc

    group client_side(cloud)[Client Side]

    service browser(internet)[Browser] in client_side

    browser:R --> L:cloudfront
    cloudfront:R --> L:api_gateway
    api_gateway:R --> T:ec2_instance
    api_gateway:R --> T:lambda_function

    ec2_instance:R --> L:rds
    ec2_instance:R --> L:s3_bucket

    lambda_function:L --> R:rds
    lambda_function:L --> R:s3_bucket
```