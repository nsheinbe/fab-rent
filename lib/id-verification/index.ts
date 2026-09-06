export interface IdVerificationResult {
  verified: boolean;
  method: string;
  checked_at: Date;
  reference: string;
}

/** Photo ID verification boundary — swap for a real provider (Persona, Onfido…). */
export interface IdVerificationProvider {
  readonly name: string;
  /** Starts a check for the user; resolves after the provider's decision. */
  verify(input: { userId: string; fullName: string; documentHint?: string }): Promise<IdVerificationResult>;
}

/** Mock: takes ~2 s and passes unless the name contains "mismatch". */
export class MockIdVerificationProvider implements IdVerificationProvider {
  readonly name = "mock";
  constructor(private readonly delayMs = 2000) {}
  async verify(input: { userId: string; fullName: string; documentHint?: string }): Promise<IdVerificationResult> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    const verified = !/mismatch/i.test(input.fullName);
    return { verified, method: input.documentHint ?? "driver's licence", checked_at: new Date(), reference: `mock_idv_${input.userId.slice(0, 8)}` };
  }
}

export function getIdVerificationProvider(): IdVerificationProvider {
  return new MockIdVerificationProvider(process.env.NODE_ENV === "test" ? 10 : 2000);
}
