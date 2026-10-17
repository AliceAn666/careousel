// Cloudflare Workers Free: scheduler only, no database credentials required.
// Set CAREOUSEL_URL as a Worker variable and NOTIFICATION_CRON_SECRET as a secret.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const rawUrl = env.CAREOUSEL_URL;
      const token = env.NOTIFICATION_CRON_SECRET;
      if (!rawUrl || !token) throw new Error("Missing cron configuration");
      const url = new URL(rawUrl);
      if (url.protocol !== "https:") throw new Error("Expected HTTPS app URL");
      const endpoint = new URL("/api/internal/notifications/process", url);
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Careousel notification check failed: ${response.status}`);
    })());
  },
};
