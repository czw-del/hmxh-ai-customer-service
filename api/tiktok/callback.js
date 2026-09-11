export default async function handler(req, res) {
  try {
    const { code, error } = req.query;

    // 用户拒绝授权
    if (error) {
      return res.status(400).json({
        success: false,
        message: "TikTok authorization was denied."
      });
    }

    // 没收到授权码
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "No authorization code received."
      });
    }

    const appKey = process.env.TIKTOK_APP_KEY;
    const appSecret = process.env.TIKTOK_APP_SECRET;

    if (!appKey || !appSecret) {
      return res.status(500).json({
        success: false,
        message: "TikTok app credentials are not configured."
      });
    }

    // 用授权码换 Access Token
    const params = new URLSearchParams({
      app_key: appKey,
      app_secret: appSecret,
      auth_code: code,
      grant_type: "authorized_code"
    });

    const response = await fetch(
      `https://auth.tiktok-shops.com/api/v2/token/get?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }
    );

    const result = await response.json();

    if (!response.ok || result.code !== 0 || !result.data?.access_token) {
      return res.status(400).json({
        success: false,
        message: "Failed to obtain TikTok access token.",
        tiktok_code: result.code ?? null,
        tiktok_message: result.message ?? "Unknown error"
      });
    }

    // 注意：
    // 不把 access_token / refresh_token 返回到浏览器
    // 下一步我们会把 Token 安全存入数据库

    return res.status(200).json({
      success: true,
      message: "TikTok Shop authorization successful.",
      seller_name: result.data.seller_name ?? null,
      seller_base_region: result.data.seller_base_region ?? null,
      user_type: result.data.user_type ?? null,
      granted_scopes: result.data.granted_scopes ?? [],
      access_token_received: Boolean(result.data.access_token),
      refresh_token_received: Boolean(result.data.refresh_token)
    });

  } catch (err) {
    console.error("TikTok OAuth callback failed");

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}
