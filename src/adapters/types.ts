// Database adapter interfaces

export interface User {
  id: string;
  name: string;
  email: string;
  provider: string;
  providerId: string;
  hashedPassword: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Subdomain {
  id: string;
  name: string;
  description: string;
  record: string;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IDatabase {
  // Users
  findUserByProviderId(providerId: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;

  // Subdomains
  findAllSubdomains(): Promise<Subdomain[]>;
  findSubdomainById(id: string): Promise<Subdomain | undefined>;
  findSubdomainByName(name: string): Promise<Subdomain | undefined>;
  findSubdomainsByOwner(ownerId: string): Promise<Subdomain[]>;
  createSubdomain(sub: Omit<Subdomain, 'createdAt' | 'updatedAt'>): Promise<Subdomain>;
  updateSubdomain(
    name: string,
    data: Partial<Pick<Subdomain, 'description' | 'record'>>
  ): Promise<Subdomain | undefined>;
  deleteSubdomainByName(name: string): Promise<void>;
  deleteSubdomainById(id: string): Promise<void>;
  countSubdomainsByOwner(ownerId: string): Promise<number>;
}

// Key-value state store (for OAuth state)
export interface IStateStore {
  put(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

// Object storage (for hosting files)
export interface ObjectInfo {
  key: string;
  size: number;
  httpMetadata?: {
    contentType?: string;
    contentEncoding?: string;
    contentDisposition?: string;
  };
  httpEtag?: string;
}

export interface ObjectBody extends ObjectInfo {
  body: ReadableStream;
}

export interface ListResult {
  objects: ObjectInfo[];
  truncated: boolean;
  cursor?: string;
}

export interface IObjectStorage {
  get(key: string): Promise<ObjectBody | null>;
  put(
    key: string,
    data: ArrayBuffer | ReadableStream,
    options?: { contentType?: string }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<ListResult>;
  getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
}
