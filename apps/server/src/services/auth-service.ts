import crypto from "node:crypto";

import type { AgentDatabase } from "@personal-ai/db";
import type {
  AuthResponse,
  AuthUser,
  LocalAccount,
  LoginRequest,
  RegisterRequest
} from "@personal-ai/shared";

const SESSION_TTL_HOURS = 12;

const normaliseEmail = (email: string) => email.trim().toLowerCase();

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const derivePasswordHash = (password: string, salt: string) =>
  crypto.scryptSync(password, salt, 64).toString("hex");

const sameHash = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export class AuthService {
  constructor(private readonly db: AgentDatabase) {}

  async register(payload: RegisterRequest): Promise<AuthResponse> {
    const email = normaliseEmail(payload.email);
    const existing = await this.db.getAccountByEmail(email);
    if (existing) {
      throw new Error("An account with this email already exists.");
    }

    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = derivePasswordHash(payload.password, passwordSalt);
    const { account } = await this.db.createAccount({
      displayName: payload.displayName.trim(),
      email,
      role: payload.role,
      passwordHash,
      passwordSalt
    });

    return this.createSessionResponse(account);
  }

  async login(payload: LoginRequest): Promise<AuthResponse> {
    const account = await this.db.getAccountByEmail(normaliseEmail(payload.email));
    if (!account) {
      throw new Error("Invalid email or password.");
    }

    const passwordHash = derivePasswordHash(payload.password, account.passwordSalt);
    if (!sameHash(passwordHash, account.passwordHash)) {
      throw new Error("Invalid email or password.");
    }

    if (payload.role && (account.role ?? "employee") !== payload.role) {
      throw new Error("This account is not registered for the selected role.");
    }

    await this.db.touchAccountLogin(account.id);
    const freshAccount = await this.db.getAccountById(account.id);
    return this.createSessionResponse(freshAccount ?? account);
  }

  async getUserFromToken(accessToken: string): Promise<AuthUser | null> {
    const session = await this.db.getAuthSessionByTokenHash(hashToken(accessToken));
    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await this.db.deleteAuthSessionByTokenHash(session.tokenHash);
      return null;
    }

    await this.db.touchAuthSession(session.id);
    const account = await this.db.getAccountById(session.accountId);
    if (!account) {
      return null;
    }

    return this.toAuthUser(account);
  }

  async logout(accessToken: string) {
    await this.db.deleteAuthSessionByTokenHash(hashToken(accessToken));
  }

  private async createSessionResponse(account: LocalAccount): Promise<AuthResponse> {
    const accessToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();

    await this.db.createAuthSession({
      accountId: account.id,
      profileId: account.profileId,
      tokenHash: hashToken(accessToken),
      expiresAt
    });

    return {
      accessToken,
      user: this.toAuthUser(account)
    };
  }

  private toAuthUser(account: LocalAccount): AuthUser {
    return {
      id: account.id,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      profileId: account.profileId,
      displayName: account.displayName,
      email: account.email,
      role: account.role ?? "employee"
    };
  }
}
