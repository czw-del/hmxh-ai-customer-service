import crypto from "crypto";

/**
 * TikTok Shop Open API 签名
 *
 * TikTok 官方规则：
 * 1. 收集实际请求中的 Query 参数
 * 2. 排除 sign
 * 3. 排除 access_token
 * 4. 参数名按 ASCII 升序
 * 5. path + key/value 拼接
 * 6. 前后加入 App Secret
 * 7. 使用 App Secret 做 HMAC-SHA256
 */
function generateTikTokSign(path, params, appSecret) {
  const filtered = {};

  for (const [key, value] of Object.entries(params)) {
    if (
      key === "sign" ||
      key === "access_token" ||
      value === undefined ||
      value === null
    ) {
      continue;
    }

    filtered[key] = String(value);
  }

  const sortedKeys = Object.keys(filtered).sort();

  let signString = path;

  for (const key of sortedKeys) {
    signString += key + filtered[key];
  }

  signString =
    appSecret +
    signString +
    appSecret;

  return crypto
    .createHmac("sha256", appSecret)
    .update(signString, "utf8")
    .digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    // ==========================================
    // 1. Vercel 环境变量
    // ==========================================

    const appKey =
      (process.env.TIKTOK_APP_KEY || "").trim();

    const appSecret =
      (process.env.TIKTOK_APP_SECRET || "").trim();

    const accessToken =
      (process.env.TIKTOK_TEST_ACCESS_TOKEN || "").trim();

    const shopCipher =
      (process.env.TIKTOK_SHOP_CIPHER || "").trim();

    const shopId =
      (process.env.TIKTOK_SHOP_ID || "").trim();

    if (
      !appKey ||
      !appSecret ||
      !accessToken ||
      !shopCipher ||
      !shopId
    ) {
      return res.status(500).json({
        success: false,
        message: "TikTok credentials are not configured.",
        diagnostic: {
          app_key: Boolean(appKey),
          app_secret: Boolean(appSecret),
          access_token: Boolean(accessToken),
          shop_cipher: Boolean(shopCipher),
          shop_id: Boolean(shopId)
        }
      });
    }

    // ==========================================
    // 2. API Path
    // ==========================================

    const path =
      "/customer_service/202309/conversations";

    const timestamp =
      Math.floor(Date.now() / 1000);

    // ==========================================
    // 3. 严格复刻 TikTok API Testing Tool
    //
    // 注意：
    // 官方测试工具成功 cURL 中 locale 实际表现为：
    // locale=+vi-VN
    //
    // URL 中 + 表示空格，因此这里暂时保留前导空格。
    // 目的是先让我们的 sign 与官方工具完全一致。
    // ==========================================

    const queryParams = {
      access_token: accessToken,

      app_key: appKey,

      locale: " vi-VN",

      page_size: "10",

      shop_cipher: shopCipher,

      shop_id: shopId,

      timestamp: String(timestamp),

      version: "202309"
    };

    // ==========================================
    // 4. 生成 sign
    //
    // generateTikTokSign 会自动排除：
    // access_token
    // sign
    // ==========================================

    const sign = generateTikTokSign(
      path,
      queryParams,
      appSecret
    );

    // ==========================================
    // 5. 创建最终 URL
    // ==========================================

    const searchParams =
      new URLSearchParams();

    for (
      const [key, value]
      of Object.entries(queryParams)
    ) {
      searchParams.set(
        key,
        String(value)
      );
    }

    searchParams.set(
      "sign",
      sign
    );

    const url =
      `https://open-api.tiktokglobalshop.com${path}?${searchParams.toString()}`;

    // ==========================================
    // 6. 请求 TikTok
    // ==========================================

    const response = await fetch(
      url,
      {
        method: "GET",

        headers: {
          "Content-Type":
            "application/json",

          "x-tts-access-token":
            accessToken
        }
      }
    );

    const raw =
      await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        message:
          "TikTok returned a non-JSON response.",
        http_status:
          response.status
      });
    }

    // ==========================================
    // 7. TikTok API 错误
    // ==========================================

    if (
      !response.ok ||
      data?.code !== 0
    ) {
      return res.status(400).json({
        success: false,

        message:
          "TikTok Get Conversations failed.",

        tiktok_code:
          data?.code ?? null,

        tiktok_message:
          data?.message ??
          "Unknown TikTok error",

        request_id:
          data?.request_id ??
          null,

        // 只返回安全诊断信息
        diagnostic: {
          path,

          timestamp,

          app_key_length:
            appKey.length,

          sign_length:
            sign.length,

          locale_length:
            queryParams.locale.length,

          locale_has_leading_space:
            queryParams.locale.startsWith(" "),

          signed_parameters: [
            "app_key",
            "locale",
            "page_size",
            "shop_cipher",
            "shop_id",
            "timestamp",
            "version"
          ],

          excluded_from_signature: [
            "access_token",
            "sign"
          ],

          access_token_configured:
            Boolean(accessToken),

          shop_cipher_configured:
            Boolean(shopCipher),

          shop_id_configured:
            Boolean(shopId)
        }
      });
    }

    // ==========================================
    // 8. 成功
    // ==========================================

    const conversations =
      data?.data?.conversations ||
      [];

    return res.status(200).json({
      success: true,

      message:
        "TikTok conversations loaded successfully.",

      count:
        conversations.length,

      conversations,

      next_page_token:
        data?.data?.next_page_token ||
        "",

      request_id:
        data?.request_id ||
        null
    });

  } catch (error) {
    console.error(
      "TikTok Conversations Error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Internal server error.",

      error:
        error?.message ||
        "Unknown error"
    });
  }
}
