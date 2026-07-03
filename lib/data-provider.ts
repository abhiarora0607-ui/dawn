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

// ── REAL PROVIDER (Instagram Graph API) ─────────────────────
// Pulls live data for a connected account using its access token.
// Any field Instagram doesn't directly expose is derived sensibly.
class InstagramGraphProvider implements DataProvider {
  constructor(private token: string, private igUserId: string) {}

  private async ig(path: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams({ ...params, access_token: this.token }).toString();
    const res = await fetch(`https://graph.instagram.com/${path}?${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`IG API ${res.status}`);
    return res.json();
  }

  // Never throws — returns null on any failure so the dashboard still renders.
  private async igSafe(path: string, params: Record<string, string> = {}) {
    try {
      return await this.ig(path, params);
    } catch {
      return null;
    }
  }

  async getAccount(): Promise<AccountSnapshot> {
    // Profile basics — /me works for the Instagram Login flow.
    const me = (await this.igSafe("me", {
      fields: "user_id,username,name,account_type,followers_count,media_count",
    })) || {};

    // Recent media (for top/worst post + format signals)
    const media = await this.igSafe("me/media", {
      fields: "caption,media_type,like_count,comments_count,timestamp,permalink",
      limit: "25",
    });
    const posts: any[] = media?.data || [];

    // Score posts by engagement to find best/worst
    const scored = posts.map((p) => ({
      caption: (p.caption || "(no caption)").slice(0, 80),
      format: p.media_type === "VIDEO" ? "Reel" : p.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Image",
      engagement: (p.like_count || 0) + (p.comments_count || 0),
      likes: p.like_count || 0,
    }));
    scored.sort((a, b) => b.engagement - a.engagement);
    const hasPosts = scored.length > 0;
    const best = hasPosts ? scored[0] : { caption: "No posts yet", format: "Reel", engagement: 0, likes: 0 };
    const worst = hasPosts ? scored[scored.length - 1] : { caption: "No posts yet", format: "Image", engagement: 0 };

    // Account-level insights (reach, profile views) — best effort
    let reach = 0;
    let profileVisits = 0;
    const insights = await this.igSafe("me/insights", { metric: "reach,profile_views", period: "day" });
    for (const m of insights?.data || []) {
      const val = m.values?.[0]?.value || 0;
      if (m.name === "reach") reach = val;
      if (m.name === "profile_views") profileVisits = val;
    }

    const followers = me.followers_count || 0;
    const engagementRate = followers > 0 && hasPosts
      ? Number(((scored.reduce((s, p) => s + p.engagement, 0) / scored.length / followers) * 100).toFixed(1))
      : 0;

    const username = me.username || "your account";
    return {
      handle: `@${username}`,
      displayName: me.name || username,
      niche: "Your account",
      followers,
      followersChange: 0,
      reach,
      reachChangePct: 0,
      profileVisits,
      engagementRate,
      responseRatePct: 0,
      pendingDMs: 0,
      topPost: { caption: best.caption, format: best.format, reach: best.engagement, saves: 0 },
      worstPost: { caption: worst.caption, format: worst.format, reach: worst.engagement },
      audiencePrefers: best.format === "Reel" ? "video Reels" : `${best.format.toLowerCase()} posts`,
      bestTimeToPost: "7:15 PM",
    };
  }

  async getCompetitors(): Promise<CompetitorSignal[]> {
    // Competitor intel needs public Business Discovery — returns empty
    // for now; the UI simply shows fewer cards. Added in a later step.
    return [];
  }
}

// ── MOCK PROVIDER FALLBACK ──────────────────────────────────
// Retrieves the connected account's token from cookie + Supabase.
async function getConnectedProvider(): Promise<DataProvider | null> {
  try {
    // Deferred import to avoid pulling next/headers into non-request contexts
    const { cookies } = await import("next/headers");
    const igUserId = cookies().get("dawn_ig")?.value;
    if (!igUserId) return null;

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SECRET_KEY;
    if (!sbUrl || !sbKey) return null;

    const res = await fetch(
      `${sbUrl}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}&select=access_token&limit=1`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }
    );
    const rows = await res.json();
    const token = rows?.[0]?.access_token;
    if (!token) return null;

    return new InstagramGraphProvider(token, igUserId);
  } catch {
    return null;
  }
}

export async function getProviderAsync(): Promise<DataProvider> {
  const connected = await getConnectedProvider();
  return connected ?? new MockProvider();
}

export function getProvider(): DataProvider {
  return new MockProvider();
}
