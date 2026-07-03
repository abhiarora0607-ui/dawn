// lib/data-provider.ts
// ────────────────────────────────────────────────────────────
// THE SWAP LAYER.
// Every piece of Instagram data flows through this interface.
// Today it returns realistic mock data (zero cost, no API needed).
// After Meta App Review, we implement InstagramGraphProvider with
// the same shape and flip ONE line in getProvider(). Nothing else
// in the app changes. This is what lets us build the full product
// before spending a rupee or waiting on Meta.
// ────────────────────────────────────────────────────────────

export type AccountSnapshot = {
  handle: string;
  displayName: string;
  niche: string;
  followers: number;
  followersChange: number;      // vs yesterday
  reach: number;
  reachChangePct: number;       // vs previous period
  profileVisits: number;
  engagementRate: number;       // %
  responseRatePct: number;      // % of DMs replied
  pendingDMs: number;
  topPost: { caption: string; format: string; reach: number; saves: number };
  worstPost: { caption: string; format: string; reach: number };
  audiencePrefers: string;      // detected content preference
  bestTimeToPost: string;
};

export type CompetitorSignal = {
  handle: string;
  postsLast7d: number;
  topFormat: string;
  standoutPost: string;         // public caption/hook
  standoutReach: number;        // public/estimated
  note: string;
};

export interface DataProvider {
  getAccount(): Promise<AccountSnapshot>;
  getCompetitors(): Promise<CompetitorSignal[]>;
}

// ── MOCK PROVIDER (active now) ──────────────────────────────
class MockProvider implements DataProvider {
  async getAccount(): Promise<AccountSnapshot> {
    return {
      handle: "@brewhaus.coffee",
      displayName: "Brewhaus Coffee",
      niche: "Cafe / D2C coffee",
      followers: 14382,
      followersChange: -18,
      reach: 52140,
      reachChangePct: 22,
      profileVisits: 3120,
      engagementRate: 4.7,
      responseRatePct: 61,
      pendingDMs: 11,
      topPost: {
        caption: "POV: the first pour-over of the morning ☕",
        format: "Reel",
        reach: 301400,
        saves: 2840,
      },
      worstPost: {
        caption: "New store hours this week",
        format: "Image",
        reach: 1120,
      },
      audiencePrefers: "educational + behind-the-scenes Reels",
      bestTimeToPost: "7:15 PM",
    };
  }

  async getCompetitors(): Promise<CompetitorSignal[]> {
    return [
      {
        handle: "@rostercoffee",
        postsLast7d: 4,
        topFormat: "Reel",
        standoutPost: "3 signs your beans are stale (and the fix)",
        standoutReach: 300000,
        note: "Their educational Reels are outperforming — same angle works for your audience.",
      },
      {
        handle: "@themorningco",
        postsLast7d: 2,
        topFormat: "Carousel",
        standoutPost: "Our new cold brew, ranked by you",
        standoutReach: 42000,
        note: "Running a community-vote campaign. Consider a similar poll-driven post.",
      },
    ];
  }
}

// ── REAL PROVIDER (implement after Meta App Review) ─────────
// class InstagramGraphProvider implements DataProvider {
//   async getAccount() { /* call Meta Graph API */ }
//   async getCompetitors() { /* Business Discovery public data */ }
// }

export function getProvider(): DataProvider {
  // Flip this one line when real API is live:
  // return new InstagramGraphProvider();
  return new MockProvider();
}
