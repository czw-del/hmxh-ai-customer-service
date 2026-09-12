import crypto from "crypto";

/**
 * TikTok Shop Open API 签名
 *
 * 规则：
 * 1. 排除 sign 和 access_token
 * 2. 其余实际发送的 Query 参数按参数名 ASCII 升序排列
 * 3. 拼接：path + key1 + value1 + key2 + value2 ...
 * 4. 前后加 appSecret
 * 5. 使用 appSecret 作为 HMAC-SHA256 key
 */
function generateTikTokSign(path, params, appSecret) {
  const entries = Object.entries(params)
    .filter(([key, value]) => {
      return (
        key !== "sign" &&
        key !== "access_token" &&
        value !== undefined &&
        value !== null &&
        value !== ""
      );
    })
    .sort(([keyA], [keyB]) => {
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });

  let signBase = path;

  for (const [key, value] of entries) {
    signBase += `${key}${String(value)}`;
  }

  signBase =
    appSecret +
    signBase +
    appSecret;

  return crypto
    .createHmac("sha256", appSecret)
    .update(signBase, "utf8")
    .digest("hex");
}

export default async function handler(req, res) {
  // 只允许 GET
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    // ==============================
    // 1. 读取 Vercel 环境变量
    // ==============================

    const appKey =
      (process.env.TIKTOK_APP_KEY || "").trim();

    const appSecret =
      (process.env.TIKTOK_APP_SECRET || "").trim();

    const accessToken =
      (process.env.TIKTOK_TEST_ACCESS_TOKEN || "").trim();

    const shopCipher =
      (process.env.TIKTOK_SHOP_CIPHER || "").trim();

    // ==============================
    // 2. 检查环境变量
    // ==============================

    if (
      !appKey ||
      !appSecret ||
      !accessToken ||
      !shopCipher
    ) {
      return res.status(500).json({
        success: false,
        message: "TikTok credentials are not configured.",
        diagnostic: {
          app_key_configured: Boolean(appKey),
          app_secret_configured: Boolean(appSecret),
          access_token_configured: Boolean(accessToken),
          shop_cipher_configured: Boolean(shopCipher)
        }
      });
    }

    // ==============================
    // 3. TikTok API Path
    // ==============================

    const path =
      "/customer_service/202309/conversations";

    const timestamp =
      Math.floor(Date.now() / 1000);

    // ==============================
    // 4. 构造最终 Query 参数
    //
    // 注意：
    // 这里放进去的参数，就是实际发送给 TikTok 的参数。
    // 同时这些参数也会参与签名。
    //
    // sign 本身除外。
    // ==============================

    const params = {
      app_key: appKey,

      timestamp: String(timestamp),

      shop_cipher: shopCipher,

      page_size: "10",

      locale: "vi-VN",

      need_session_id: "false",

      need_session_info: "false"
    };

    // ==============================
    // 5. 生成 TikTok sign
    // ==============================

    const sign = generateTikTokSign(
      path,
      params,
      appSecret
    );

    // ==============================
    // 6. 拼接 URL
    // ==============================

    const query = new URLSearchParams();

    // 为了确保“签名参数”和“实际请求参数”
    // 完全来自同一个 params 对象
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }

    query.set("sign", sign);

    const url =
      `https://open-api.tiktokglobalshop.com${path}?${query.toString()}`;

    // ==============================
    // 7. 请求 TikTok
    // ==============================

    const response = await fetch(url, {
      method: "GET",

      headers: {
        "Content-Type": "application/json",

        // TikTok 202309+ 正式使用 Header 传 Token
        "x-tts-access-token": accessToken
      }
    });

    // ==============================
    // 8. 解析 TikTok 返回
    // ==============================

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch (error) {
      return res.status(502).json({
        success: false,
        message: "TikTok returned non-JSON response.",
        http_status: response.status
      });
    }

    // ==============================
    // 9. TikTok 返回错误
    // ==============================

    if (!response.ok || data?.code !== 0) {
      return res.status(400).json({
        success: false,

        message:
          "TikTok Get Conversations failed.",

        tiktok_code:
          data?.code ?? null,

        tiktok_message:
          data?.message ?? "Unknown TikTok error",

        request_id:
          data?.request_id ?? null,

        // 安全诊断信息
        // 不泄露 App Secret / Token / shop_cipher
        diagnostic: {
          path,

          timestamp,

          app_key_length:
            appKey.length,

          app_key_suffix:
            appKey.slice(-4),

          sign_length:
            sign.length,

          signed_parameters: [
            "app_key",
            "locale",
            "need_session_id",
            "need_session_info",
            "page_size",
            "shop_cipher",
            "timestamp"
          ],

          access_token_configured:
            Boolean(accessToken),

          shop_cipher_configured:
            Boolean(shopCipher)
        }
      });
    }

    // ==============================
    // 10. 成功
    // ==============================

    const conversations =
      data?.data?.conversations || [];

    return res.status(200).json({
      success: true,

      message:
        "TikTok conversations loaded successfully.",

      count:
        conversations.length,

      conversations,

      next_page_token:
        data?.data?.next_page_token || "",

      request_id:
        data?.request_id || null
    });

  } catch (error) {
    console.error(
      "TikTok Conversations Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error:
        error?.message || "Unknown error"
    });
  }
}
