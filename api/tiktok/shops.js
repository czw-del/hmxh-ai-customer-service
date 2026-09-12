import crypto from "crypto";

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

    if (!appKey || !appSecret || !accessToken) {
      return res.status(500).json({
        success: false,
        message: "TikTok credentials are not configured.",
        diagnostic: {
          app_key: Boolean(appKey),
          app_secret: Boolean(appSecret),
          access_token: Boolean(accessToken)
        }
      });
    }

   const path = "/authorization/202309/shops";
const timestamp = Math.floor(Date.now() / 1000);

const paramsToSign = {
  app_key: appKey,
  timestamp: String(timestamp)
};

const sortedKeys = Object.keys(paramsToSign).sort();

const parameterString = sortedKeys
  .map((key) => `${key}${paramsToSign[key]}`)
  .join("");

const signString =
  appSecret +
  path +
  parameterString +
  appSecret;

const sign = crypto
  .createHmac("sha256", appSecret)
  .update(signString)
  .digest("hex");

    const query = new URLSearchParams({
      app_key: appKey,
      timestamp: String(timestamp),
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
        message: "TikTok Get Authorized Shops failed.",
        tiktok_code: data?.code ?? null,
        tiktok_message: data?.message ?? "Unknown error",
        request_id: data?.request_id ?? null
      });
    }

    return res.status(200).json({
      success: true,
      message: "TikTok Open API connection successful.",
      shops: data?.data?.shops ?? [],
      request_id: data?.request_id ?? null
    });

  } catch (error) {
    console.error(
      "TikTok shops API error:",
      error?.message || "Unknown error"
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}
