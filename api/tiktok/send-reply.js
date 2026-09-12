import crypto from "node:crypto";

const API_ORIGIN = "https://open-api.tiktokglobalshop.com";

function requiredEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

// Exact port of the signing behavior in the supplied TikTok SDK v1.0.0.
function generateSign(path, query, body, appSecret) {
  const paramString = Object.keys(query)
    .filter((key) => key !== "sign" && key !== "access_token")
    .sort()
    .map((key) => `${key}${query[key]}`)
    .join("");
  const bodyString = body ? JSON.stringify(body) : "";
  return crypto
    .createHmac("sha256", appSecret)
    .update(`${appSecret}${path}${paramString}${bodyString}${appSecret}`)
    .digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      message: "Use POST to send a confirmed reply",
    });
  }

  try {
    const conversationId = String(req.body?.conversation_id || "").trim();
    const message = String(req.body?.message || "").trim();
    const confirmed = req.body?.confirm === true;

    if (!/^\d+$/.test(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "A numeric conversation_id is required",
      });
    }
    if (!message || message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "message must contain 1 to 2000 characters",
      });
    }
    if (!confirmed) {
      return res.status(400).json({
        success: false,
        message: "Set confirm to true after reviewing the reply",
      });
    }

    const appKey = requiredEnv("TIKTOK_APP_KEY");
    const appSecret = requiredEnv("TIKTOK_APP_SECRET");
    const accessToken = requiredEnv("TIKTOK_TEST_ACCESS_TOKEN");
    const shopCipher = requiredEnv("TIKTOK_SHOP_CIPHER");

    const path = `/customer_service/202309/conversations/${conversationId}/messages`;
    const query = {
      app_key: appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      shop_cipher: shopCipher,
    };
    const body = {
      type: "TEXT",
      content: JSON.stringify({ content: message }),
    };
    query.sign = generateSign(path, query, body, appSecret);

    const response = await fetch(
      `${API_ORIGIN}${path}?${new URLSearchParams(query).toString()}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "sdk_node/1.0.0",
          "x-tts-access-token": accessToken,
        },
        body: JSON.stringify(body),
      },
    );

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(502).json({
        success: false,
        message: "TikTok returned a non-JSON response",
        http_status: response.status,
      });
    }

    if (!response.ok || result?.code !== 0) {
      return res.status(response.ok ? 400 : 502).json({
        success: false,
        message: result?.message || "TikTok Send Message failed",
        tiktok_code: result?.code ?? null,
        request_id: result?.request_id ?? null,
      });
    }

    return res.status(200).json({
      success: true,
      sent: true,
      conversation_id: conversationId,
      data: result.data ?? {},
      request_id: result.request_id ?? null,
    });
  } catch (error) {
    console.error("TikTok Send Message failed", error);
    return res.status(500).json({
      success: false,
      message: String(error?.message || "").startsWith("Missing environment variable:")
        ? error.message
        : "Could not send the TikTok reply",
    });
  }
}
