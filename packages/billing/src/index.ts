export type BillingInterval = "monthly" | "yearly";

/** Ödeme katmanına konacak ticari SKU betimleyicisi. */
export type PlanSlug = "free" | "pro";

export interface EntitlementSummary {
  planSlug: PlanSlug;
  /** Gerçek abonelik sağlaması olmadığında hep false döner. */
  hasActivePaidPlan: boolean;
  renewsAt?: string;
}

export interface BillingPortal {
  getEntitlements(): Promise<EntitlementSummary>;
}

export function createStubBillingPortal(): BillingPortal {
  return new StubBillingPortal();
}

class StubBillingPortal implements BillingPortal {
  async getEntitlements(): Promise<EntitlementSummary> {
    return {
      planSlug: "free",
      hasActivePaidPlan: false
    };
  }
}
