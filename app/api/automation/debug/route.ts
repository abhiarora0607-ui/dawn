// app/api/automation/debug/route.ts
// Diagnostic: shows exactly what Dawn sees when it looks at the account —
// posts found, comments per post, DM conversations, and any API errors.
// This turns "it's not working" into a precise picture of what's missing.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let igUserId: string | null = null;
  try {
    const { cookies } = await import("next/headers");
    igUserId = cookies().get("dawn_ig")?.value ?? null;
  } catch {}
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!igUserId || !url || !key) {
    return NextResponse.json({ error: "Connect Instagram first." }, { status: 400 });
  }

  const connRes = await fetch(`${url}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}&select=access_token&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
  });
  const conn = await connRes.json();
  const token = conn?.[0]?.access_token;
  if (!token) return NextResponse.json({ error: "No token found." }, { status: 400 });

  const report: any = { igUserId, posts: [], conversations: null, errors: [] };

  // Check permissions on the token
  try {
    const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username,account_type&access_token=${token}`, { cache: "no-store" });
    report.me = await meRes.json();
  } catch (e: any) { report.errors.push("me: " + e.message); }

  // Posts + comments
  try {
    const mediaRes = await fetch(`https://graph.instagram.com/me/media?fields=id,caption,timestamp&limit=5&access_token=${token}`, { cache: "no-store" });
    const media = await mediaRes.json();
    if (media.error) report.errors.push("media: " + JSON.stringify(media.error));
    for (const m of media?.data || []) {
      const cRes = await fetch(`https://graph.instagram.com/${m.id}/comments?fields=id,text,username,replies&access_token=${token}`, { cache: "no-store" });
      const comments = await cRes.json();
      report.posts.push({
        postId: m.id,
        caption: (m.caption || "").slice(0, 40),
        commentError: comments.error ? JSON.stringify(comments.error) : null,
        commentCount: comments?.data?.length || 0,
        comments: (comments?.data || []).map((c: any) => ({
          text: c.text, username: c.username, hasReplies: !!c.replies?.data?.length,
        })),
      });
    }
  } catch (e: any) { report.errors.push("posts: " + e.message); }

  // DM conversations
  try {
    const convRes = await fetch(`https://graph.instagram.com/me/conversations?fields=id,messages{id,message,from,created_time}&access_token=${token}`, { cache: "no-store" });
    const convs = await convRes.json();
    if (convs.error) {
      report.conversations = { error: JSON.stringify(convs.error) };
    } else {
      report.conversations = {
        count: convs?.data?.length || 0,
        items: (convs?.data || []).map((c: any) => ({
          id: c.id,
          messageCount: c.messages?.data?.length || 0,
          latestMessage: c.messages?.data?.[0]?.message,
          latestFrom: c.messages?.data?.[0]?.from,
        })),
      };
    }
  } catch (e: any) { report.errors.push("conversations: " + e.message); }

  return NextResponse.json(report);
}
