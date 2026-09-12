import crypto from "node:crypto";

const API_ORIGIN = "https://open-api.tiktokglobalshop.com";
const API_VERSION = "202309";

function requiredEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

// Exact JavaScript port of utils/generate-sign.ts from the supplied SDK v1.0.0.
function generateSign(path, query, appSecret) {
  const paramString = Object.keys(query)
    .filter((key) => key !== "sign" && key !== "access_token")
    .sort()
    .map((key) => `${key}${query[key]}`)
    .join("");

  const signString = `${appSecret}${path}${paramString}${appSecret}`;
  return crypto
    .createHmac("sha256", appSecret)
    .update(signString)
    .digest("hex");
}

function one(value) {
  return Array.isArray(value) ? value[0] : value;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : fallback;
}

function addOptional(query, key, value) {
  if (value !== undefined && value !== null && String(value) !== "") {
    query[key] = String(value);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const appKey = requiredEnv("TIKTOK_APP_KEY");
    const appSecret = requiredEnv("TIKTOK_APP_SECRET");
    const accessToken = requiredEnv("TIKTOK_TEST_ACCESS_TOKEN");
    const shopCipher = requiredEnv("TIKTOK_SHOP_CIPHER");

    const conversationId = String(one(req.query.conversation_id) || "").trim();
    if (conversationId && !/^\d+$/.test(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "conversation_id must contain digits only",
      });
    }

    const isMessagesRequest = Boolean(conversationId);
    const path = isMessagesRequest
      ? `/customer_service/${API_VERSION}/conversations/${conversationId}/messages`
      : `/customer_service/${API_VERSION}/conversations`;

    const query = {
      app_key: appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      page_size: String(
        boundedInteger(
          one(req.query.page_size),
          10,
          1,
          isMessagesRequest ? 10 : 20,
        ),
      ),
      locale: String(one(req.query.locale) || "vi-VN"),
      shop_cipher: shopCipher,
    };

    addOptional(query, "page_token", one(req.query.page_token));

    if (isMessagesRequest) {
      addOptional(query, "sort_order", one(req.query.sort_order));
      addOptional(query, "sort_field", one(req.query.sort_field));
      addOptional(query, "need_data", one(req.query.need_data));
      addOptional(query, "need_plaintext", one(req.query.need_plaintext));
      addOptional(query, "time_zone", one(req.query.time_zone));
    } else {
      addOptional(query, "need_session_id", one(req.query.need_session_id));
      addOptional(query, "need_session_info", one(req.query.need_session_info));
    }

    // Sign exactly the same query object that is sent. Access token is header-only.
    query.sign = generateSign(path, query, appSecret);
    const url = `${API_ORIGIN}${path}?${new URLSearchParams(query).toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "sdk_node/1.0.0",
        "x-tts-access-token": accessToken,
      },
    });

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return res.status(502).json({
        success: false,
        message: "TikTok returned a non-JSON response",
        http_status: response.status,
      });
    }

    if (!response.ok || body?.code !== 0) {
      return res.status(response.ok ? 400 : 502).json({
        success: false,
        message: body?.message || "TikTok API request failed",
        tiktok_code: body?.code ?? null,
        request_id: body?.request_id ?? null,
        endpoint: isMessagesRequest ? "Get Conversation Messages" : "Get Conversations",
      });
    }

    return res.status(200).json({
      success: true,
      endpoint: isMessagesRequest ? "Get Conversation Messages" : "Get Conversations",
      data: body.data ?? {},
      request_id: body.request_id ?? null,
    });
  } catch (error) {
    console.error("TikTok customer service request failed", error);
    const configurationError = String(error?.message || "").startsWith(
      "Missing environment variable:",
    );
    return res.status(configurationError ? 500 : 502).json({
      success: false,
      message: configurationError
        ? error.message
        : "TikTok customer service request failed",
    });
  }
}
