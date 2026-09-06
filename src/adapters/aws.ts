import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  IDatabase,
  IStateStore,
  IObjectStorage,
  User,
  Subdomain,
  ObjectBody,
  ListResult,
} from './types';

// --- DynamoDB Database ---

export class DynamoDatabase implements IDatabase {
  private client: DynamoDBDocumentClient;
  private usersTable: string;
  private subdomainsTable: string;

  constructor(region: string, usersTable: string, subdomainsTable: string) {
    const raw = new DynamoDBClient({ region });
    this.client = DynamoDBDocumentClient.from(raw);
    this.usersTable = usersTable;
    this.subdomainsTable = subdomainsTable;
  }

  async findUserByProviderId(providerId: string): Promise<User | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.usersTable,
        IndexName: 'provider-index',
        KeyConditionExpression: 'providerId = :pid',
        ExpressionAttributeValues: { ':pid': providerId },
        Limit: 1,
      })
    );
    return result.Items?.[0] as User | undefined;
  }

  async findUserById(id: string): Promise<User | undefined> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.usersTable, Key: { id } })
    );
    return result.Item as User | undefined;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.usersTable,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :e',
        ExpressionAttributeValues: { ':e': email },
        Limit: 1,
      })
    );
    return result.Items?.[0] as User | undefined;
  }

  async createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const now = new Date().toISOString();
    const item: User = { ...user, createdAt: now, updatedAt: now };
    await this.client.send(new PutCommand({ TableName: this.usersTable, Item: item }));
    return item;
  }

  async findAllSubdomains(): Promise<Subdomain[]> {
    const items: Subdomain[] = [];
    let lastKey: Record<string, any> | undefined;
    do {
      const result = await this.client.send(
        new ScanCommand({
          TableName: this.subdomainsTable,
          ExclusiveStartKey: lastKey,
        })
      );
      items.push(...((result.Items as Subdomain[]) || []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return items;
  }

  async findSubdomainById(id: string): Promise<Subdomain | undefined> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.subdomainsTable, Key: { id } })
    );
    return result.Item as Subdomain | undefined;
  }

  async findSubdomainByName(name: string): Promise<Subdomain | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.subdomainsTable,
        IndexName: 'name-index',
        KeyConditionExpression: 'nameLower = :n',
        ExpressionAttributeValues: { ':n': name.toLowerCase() },
        Limit: 1,
      })
    );
    return result.Items?.[0] as Subdomain | undefined;
  }

  async findSubdomainsByOwner(ownerId: string): Promise<Subdomain[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.subdomainsTable,
        IndexName: 'owner-index',
        KeyConditionExpression: 'ownerId = :o',
        ExpressionAttributeValues: { ':o': ownerId },
      })
    );
    return (result.Items as Subdomain[]) || [];
  }

  async createSubdomain(sub: Omit<Subdomain, 'createdAt' | 'updatedAt'>): Promise<Subdomain> {
    const now = new Date().toISOString();
    const item: Subdomain & { nameLower: string } = {
      ...sub,
      nameLower: sub.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    await this.client.send(new PutCommand({ TableName: this.subdomainsTable, Item: item }));
    return item;
  }

  async updateSubdomain(
    name: string,
    data: Partial<Pick<Subdomain, 'description' | 'record'>>
  ): Promise<Subdomain | undefined> {
    const existing = await this.findSubdomainByName(name);
    if (!existing) return undefined;

    const updates: string[] = ['#updatedAt = :now'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':now': new Date().toISOString() };

    if (data.description !== undefined) {
      updates.push('#desc = :desc');
      names['#desc'] = 'description';
      values[':desc'] = data.description;
    }
    if (data.record !== undefined) {
      updates.push('#rec = :rec');
      names['#rec'] = 'record';
      values[':rec'] = data.record;
    }

    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.subdomainsTable,
        Key: { id: existing.id },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );
    return result.Attributes as Subdomain | undefined;
  }

  async deleteSubdomainByName(name: string): Promise<void> {
    const existing = await this.findSubdomainByName(name);
    if (existing) {
      await this.client.send(
        new DeleteCommand({ TableName: this.subdomainsTable, Key: { id: existing.id } })
      );
    }
  }

  async deleteSubdomainById(id: string): Promise<void> {
    await this.client.send(new DeleteCommand({ TableName: this.subdomainsTable, Key: { id } }));
  }

  async countSubdomainsByOwner(ownerId: string): Promise<number> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.subdomainsTable,
        IndexName: 'owner-index',
        KeyConditionExpression: 'ownerId = :o',
        ExpressionAttributeValues: { ':o': ownerId },
        Select: 'COUNT',
      })
    );
    return result.Count || 0;
  }
}

// --- DynamoDB State Store ---

export class DynamoStateStore implements IStateStore {
  private client: DynamoDBDocumentClient;
  private table: string;

  constructor(region: string, table: string) {
    const raw = new DynamoDBClient({ region });
    this.client = DynamoDBDocumentClient.from(raw);
    this.table = table;
  }

  async put(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void> {
    const item: Record<string, any> = { stateKey: key, value };
    if (options?.ttlSeconds) {
      item.ttl = Math.floor(Date.now() / 1000) + options.ttlSeconds;
    }
    await this.client.send(new PutCommand({ TableName: this.table, Item: item }));
  }

  async get(key: string): Promise<string | null> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.table, Key: { stateKey: key } })
    );
    if (!result.Item) return null;
    // Check TTL manually (DynamoDB TTL deletion is eventually consistent)
    if (result.Item.ttl && result.Item.ttl < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return result.Item.value as string;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteCommand({ TableName: this.table, Key: { stateKey: key } }));
  }
}

// --- S3 Object Storage ---

export class S3ObjectStorage implements IObjectStorage {
  private client: S3Client;
  private bucket: string;

  constructor(region: string, bucket: string) {
    this.client = new S3Client({ region });
    this.bucket = bucket;
  }

  async get(key: string): Promise<ObjectBody | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      if (!result.Body) return null;
      return {
        key,
        size: result.ContentLength || 0,
        body: result.Body.transformToWebStream(),
        httpMetadata: {
          contentType: result.ContentType,
          contentEncoding: result.ContentEncoding,
          contentDisposition: result.ContentDisposition,
        },
        httpEtag: result.ETag,
      };
    } catch (e: any) {
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async put(
    key: string,
    data: ArrayBuffer | ReadableStream,
    options?: { contentType?: string }
  ): Promise<void> {
    const body = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body as any,
        ContentType: options?.contentType,
      })
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async list(options: { prefix: string; cursor?: string }): Promise<ListResult> {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: options.prefix,
        ContinuationToken: options.cursor,
      })
    );
    return {
      objects: (result.Contents || []).map((obj) => ({
        key: obj.Key!,
        size: obj.Size || 0,
      })),
      truncated: result.IsTruncated || false,
      cursor: result.NextContinuationToken,
    };
  }

  async getPresignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}
