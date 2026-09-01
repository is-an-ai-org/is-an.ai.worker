### Manual

#### Deploy

```shell
    bunx wrangler deploy --env production
```

#### Env Setting (Production)
```shell
    bunx wrangler secret put <ENV> --env production
```

#### DB Generate schema
```shell
    bunx drizzle-kit generate 
```
```shell
    # Production
    bunx drizzle-kit generate 
```

#### Migration file apply 
```shell
    # Local
    bunx wrangler d1 migrations apply is-an-ai-db-prod --local
```
```shell
    # Production
    bunx wrangler d1 migrations apply is-an-ai-db-prod --remote
```

#### DB in local
```shell 
bunx wrangler d1 execute is-an-ai-db-prod --local --command="DELETE FROM subdomains WHERE subdomain_name IN ('invalid.test', 'test-subdomain.test');"
```