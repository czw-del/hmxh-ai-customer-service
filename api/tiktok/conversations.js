import crypto from "crypto";

function generateTikTokSign(path, params, appSecret) {
  const filteredParams = Object.entries(params)
    .filter(([key, value]) =>
      key !== "sign" &&
      value !== undefined &&
      value !== null &&
      value !== ""
    )
    .sort(([a], [b]) => a.localeCompare(b));

  const parameterString = filteredParams
    .map(([key, value]) => `${key}${value}`)
    .join("");

  const signString =
    appSecret +
    path +
    parameterString +
    appSecret;

  return crypto
    .createHmac("sha256", appSecret)
    .update(signString)
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
    const appKey = (process.env.TIKTOK_APP_KEY || "").trim();
    const appSecret = (process.env.TIKTOK_APP_SECRET || "").trim();
    const accessToken = (
      process.env.TIKTOK_TEST_ACCESS_TOKEN || ""
    ).trim();

    const shopCipher = (
      process.env.TIKTOK_SHOP_CIPHER || ""
    ).trim();

    if (!appKey || !appSecret || !accessToken || !shopCipher) {
      return res.status(500).json({
        success: false,
        message: "TikTok credentials are not configured.",
        diagnostic: {
          app_key: Boolean(appKey),
          app_secret: Boolean(appSecret),
          access_token: Boolean(accessToken),
          shop_cipher: Boolean(shopCipher)
        }
      });
    }

    const path = "/customer_service/202309/conversations";
    const timestamp = Math.floor(Date.now() / 1000);

   const signParams = {
  app_key: appKey,
  timestamp: String(timestamp)
};

const sign = generateTikTokSign(
  path,
  signParams,
  appSecret
);

const params = {
  app_key: appKey,
  locale: "vi-VN",
  page_size: "10",
  shop_cipher: shopCipher,
  timestamp: String(timestamp)
};

    const query = new URLSearchParams({
      ...params,
      sign
    });

    const url =
      `https://open-api.tiktokglobalshop.com${path}?` +
      query.toString();

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-tts-access-token": accessToken
      }
    });

    const data = await response.json();

    if (!response.ok || data?.code !== 0) {
      return res.status(400).json({
        success: false,
        message: "TikTok Get Conversations failed.",
        tiktok_code: data?.code ?? null,
        tiktok_message: data?.message ?? "Unknown error",
        request_id: data?.request_id ?? null
      });
    }

    return res.status(200).json({
      success: true,
      message: "TikTok conversations loaded successfully.",
      data: data?.data ?? null,
      request_id: data?.request_id ?? null
    });

  } catch (error) {
    console.error(
      "TikTok conversations API error:",
      error?.message || "Unknown error"
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}
