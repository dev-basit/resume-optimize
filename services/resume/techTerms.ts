import { containsTerm, type TextIndex } from "./textMatching";

/**
 * Common technologies, tools, and platforms. Used to catch generated text that
 * mentions a technology the base resume never does. Ambiguous English words
 * ("Go", "Express", "Swift", "Spring", "R", "C") are intentionally excluded or
 * only listed in unambiguous forms to avoid false positives.
 */
export const TECH_TERMS = [
  // Languages
  "JavaScript", "TypeScript", "Python", "Java", "Kotlin", "Scala", "Golang", "Rust", "C++", "C#", "Ruby", "PHP",
  "Perl", "Elixir", "Erlang", "Haskell", "Clojure", "Dart", "Objective-C", "Lua", "Solidity", "PowerShell",
  "GraphQL", "Sass", "WebAssembly",
  // Frontend
  "React", "Next.js", "Vue", "Nuxt", "Angular", "AngularJS", "Svelte", "SvelteKit", "Remix", "Gatsby", "Redux",
  "MobX", "Zustand", "React Query", "Tailwind", "Material UI", "Chakra UI", "Storybook", "Webpack",
  "Vite", "Babel", "jQuery", "React Native", "Flutter", "Electron", "Three.js", "D3.js",
  // Backend & frameworks
  "Node.js", "Express.js", "NestJS", "Fastify", "Koa", "Hapi", "Deno", "Bun", "Django", "FastAPI", "Flask",
  "Celery", "Spring Boot", "Hibernate", "Quarkus", "Micronaut", "ASP.NET", ".NET", "Entity Framework", "Blazor",
  "Ruby on Rails", "Laravel", "Symfony", "Phoenix", "gRPC", "tRPC", "Socket.IO", "WebSockets", "Prisma",
  "TypeORM", "Sequelize", "Mongoose", "SQLAlchemy", "Drizzle",
  // Data
  "PostgreSQL", "MySQL", "MariaDB", "SQLite", "SQL Server", "Oracle", "MongoDB", "DynamoDB", "Cassandra",
  "CouchDB", "Firestore", "Firebase", "Supabase", "Redis", "Memcached", "Elasticsearch", "OpenSearch", "Solr",
  "Neo4j", "ClickHouse", "Snowflake", "BigQuery", "Redshift", "Databricks", "Kafka", "RabbitMQ", "ActiveMQ",
  "NATS", "Kinesis", "SQS", "SNS", "Pub/Sub", "Airflow", "dbt", "Hadoop", "Flink", "Pandas", "NumPy",
  "pgvector", "Pinecone", "Weaviate", "Qdrant", "Milvus", "Chroma", "FAISS",
  // Cloud & DevOps
  "AWS", "Azure", "GCP", "Google Cloud", "Heroku", "Vercel", "Netlify", "Cloudflare", "DigitalOcean", "EC2",
  "Lambda", "S3", "RDS", "ECS", "EKS", "Fargate", "CloudFormation", "CloudFront", "API Gateway", "Cognito",
  "CloudWatch", "CloudTrail", "IAM", "Route 53", "ElastiCache", "Aurora", "EventBridge", "Step Functions",
  "Secrets Manager", "KMS", "Elastic Beanstalk", "AppSync", "Amplify", "Cloud Run", "Cloud Functions", "GKE",
  "App Engine", "Cloud SQL", "AKS", "Azure Functions", "Azure DevOps", "Cosmos DB",
  "Docker", "Kubernetes", "Terraform", "Pulumi", "Ansible", "Chef", "Puppet", "Jenkins", "GitHub Actions",
  "GitLab CI", "CircleCI", "Travis CI", "Argo CD", "ArgoCD", "Spinnaker", "Nginx", "Istio", "Linkerd",
  "Consul", "Prometheus", "Grafana", "Datadog", "New Relic", "Sentry", "Splunk", "ELK", "Kibana",
  "Logstash", "OpenTelemetry", "Jaeger", "PagerDuty", "Git", "GitHub", "GitLab", "Bitbucket", "Jira",
  // Testing & tools
  "Jest", "Mocha", "Chai", "Vitest", "Cypress", "Playwright", "Selenium", "Puppeteer", "pytest", "unittest",
  "JUnit", "Mockito", "xUnit", "NUnit", "RSpec", "Postman", "Swagger", "OpenAPI", "SonarQube", "ESLint",
  "Prettier", "Figma",
  // Auth & security
  "OAuth", "OAuth2", "OIDC", "OpenID Connect", "SAML", "JWT", "Auth0", "Okta", "Keycloak",
  // AI / ML
  "OpenAI", "GPT-4", "ChatGPT", "Claude", "Anthropic", "Gemini", "Llama", "Mistral", "Hugging Face",
  "Transformers", "LangChain", "LangGraph", "LlamaIndex", "Semantic Kernel", "AutoGen", "CrewAI", "TensorFlow",
  "PyTorch", "Keras", "scikit-learn", "XGBoost", "MLflow", "Kubeflow", "SageMaker", "Vertex AI", "Bedrock",
  "Ollama", "vLLM", "n8n", "Zapier", "Make.com", "UiPath", "Power Automate",
  // Platforms
  "Stripe", "Twilio", "SendGrid", "Salesforce", "HubSpot", "Shopify", "Contentful", "Strapi", "WordPress",
  "Mixpanel", "Amplitude",
] as const;

function normalizeForMatch(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Whole-token pattern: "Scala" must not match "scalable", "Java" must not match "JavaScript". */
function termPattern(term: string): RegExp {
  const escaped = normalizeForMatch(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9+#])`, "i");
}

const TERM_PATTERNS = TECH_TERMS.map((term) => ({ term, pattern: termPattern(term) }));

/** Strict mention check for generated text. */
export function mentionsTerm(term: string, text: string): boolean {
  return termPattern(term).test(normalizeForMatch(text));
}

/**
 * Known technologies mentioned in `text` that the source resume never mentions.
 * Generated text is matched strictly (whole tokens); the source is matched
 * leniently (aliases, spacing/punctuation variants) so real experience counts.
 */
export function unsupportedTechnologies(text: string, sourceIndex: TextIndex): string[] {
  const normalized = normalizeForMatch(text);
  const found: string[] = [];
  for (const { term, pattern } of TERM_PATTERNS) {
    if (pattern.test(normalized) && !containsTerm(term, sourceIndex)) found.push(term);
  }
  // Report the most specific form only (e.g. "OAuth2" rather than also "OAuth").
  return found.filter(
    (t) => !found.some((other) => other !== t && other.toLowerCase().includes(t.toLowerCase())),
  );
}
