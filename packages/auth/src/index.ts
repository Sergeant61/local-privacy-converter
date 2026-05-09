export interface AuthProfile {
  /** Uzak kimlik doğrulama bağlandığında doldurulacak kullanıcı betiği. */
  subject: string;
  email?: string;
}

export type SessionState =
  | { status: "signed-out"; reason?: "idle" | "expired" }
  | {
      status: "signed-in";
      /** Stub aşamasında bile tutarlı kalmak için alan saklanır. */
      profile: AuthProfile;
    };

export interface AuthClient {
  getSession(): Promise<SessionState>;
  /** Ağ gerektiren gerçek giriş ileride eklenecek. */
  signInInteractive(): Promise<SessionState>;
  signOut(): Promise<SessionState>;
}

/** Yerel/offline işlemlerde oturumu her zaman çıkışta tutar — uzak doğrulama yoktur. */
export function createStubAuthClient(): AuthClient {
  const signedOut: SessionState = { status: "signed-out", reason: "idle" };
  return {
    async getSession() {
      return signedOut;
    },
    async signInInteractive() {
      return signedOut;
    },
    async signOut() {
      return signedOut;
    }
  };
}
