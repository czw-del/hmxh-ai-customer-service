export default async function handler(req, res) {
  try {
    const {
      code,
      error,
      app_key: callbackAppKeyRaw
    } = req.query || {};

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

    // 从 Vercel 环境变量读取凭据
    const appKey = (process.env.TIKTOK_APP_KEY || "").trim();
    const appSecret = (process.env.TIKTOK_APP_SECRET || "").trim();
    const callbackAppKey = String(callbackAppKeyRaw || "").trim();

    // 环境变量没配置
    if (!appKey || !appSecret) {
      return res.status(500).json({
        success: false,
        message: "TikTok app credentials are not configured.",
        diagnostic: {
          app_key_configured: Boolean(appKey),
          app_secret_configured: Boolean(appSecret)
        }
      });
    }

    // TikTok Token 参数
    const params = new URLSearchParams();

    params.set("app_key", appKey);
    params.set("app_secret", appSecret);
    params.set("auth_code", String(code));
    params.set("grant_type", "authorized_code");

    const tokenUrl =
      "https://auth.tiktok-shops.com/api/v2/token/get?" +
      params.toString();

    const response = await fetch(tokenUrl, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const result = await response.json();

    // Token 获取失败
    if (
      !response.ok ||
      result?.code !== 0 ||
      !result?.data?.access_token
    ) {
      return res.status(400).json({
        success: false,
        message: "Failed to obtain TikTok access token.",
        tiktok_code: result?.code ?? null,
        tiktok_message: result?.message ?? "Unknown error",

        diagnostic: {
          app_key_configured: Boolean(appKey),
          app_secret_configured: Boolean(appSecret),

          env_app_key_length: appKey.length,
          callback_app_key_length: callbackAppKey.length,

          app_key_matches_callback:
            Boolean(
              appKey &&
              callbackAppKey &&
              appKey === callbackAppKey
            )
        }
      });
    }

    // 注意：不要输出真实 Token
    return res.status(200).json({
      success: true,
      message: "TikTok Shop authorization successful.",

      seller_name: result?.data?.seller_name ?? null,
      seller_base_region:
        result?.data?.seller_base_region ?? null,
      user_type: result?.data?.user_type ?? null,

      granted_scopes:
        result?.data?.granted_scopes ?? [],

      access_token_received:
        Boolean(result?.data?.access_token),

      refresh_token_received:
        Boolean(result?.data?.refresh_token)
    });

  } catch (err) {
    console.error(
      "TikTok OAuth callback error:",
      err?.message || "Unknown error"
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error_type: err?.name || "UnknownError"
    });
  }
}
