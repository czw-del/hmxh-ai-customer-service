export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "OPENAI_API_KEY is not configured."
      });
    }

    const {
      messages = [],
      product = null,
      order = null
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "messages is required."
      });
    }

    // 过滤 TikTok 系统/机器人消息
    const usefulMessages = messages
      .filter((m) =>
        m &&
        ["BUYER", "CUSTOMER_SERVICE", "SHOP"].includes(m.role) &&
        typeof m.content === "string" &&
        m.content.trim()
      )
      .map((m) => ({
        role: m.role,
        content: m.content.trim()
      }));

    const customerContext = JSON.stringify(
      {
        conversation: usefulMessages,
        product,
        order
      },
      null,
      2
    );

    const systemPrompt = `
你是一名负责 TikTok Shop 越南市场的资深本土电商客服。

核心目标：
1. 准确解决客户问题
2. 自然促进真实成交
3. 不欺骗、不虚构、不夸大
4. 客户感受到的是“帮助”，不是“被推销”

沟通要求：
- 最终回复使用自然越南语
- 简短、年轻、像真人客服
- 不机械，不重复固定模板
- 根据上下文理解客户真正意图
- 不重复询问客户已提供的信息
- 可以少量使用 nha / nhé / ạ
- 不要过度使用 emoji
- 一次只推进一步

销售原则：
- 内部目标可以是成交
- 外部表达必须是帮助客户做决定
- 不制造虚假库存、虚假销量、虚假活动、虚假紧迫感
- 不编造商品、订单、物流、退款信息
- 信息不足时明确表示需要确认
- 客户投诉、生气、退款、赔偿时停止促销

风险等级：
LOW：
普通商品、颜色、尺码、材质、价格、发货咨询。

MEDIUM：
普通退款、退货、物流延迟、商品不合适。

HIGH：
严重投诉、赔偿、法律威胁、异常退款、账号安全、
签收未收到、无法确认的重要信息。

购买阶段：
BROWSING
INTERESTED
COMPARING
HESITATING
HIGH_INTENT
READY_TO_BUY
AFTER_SALES
NOT_APPLICABLE

购买意向：
0-100。
非购买型会话可以为 0。

请严格返回结构化 JSON。
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          store: false,

          instructions: systemPrompt,

          input: `
请分析下面的 TikTok Shop 客服会话，并生成下一条客服建议回复。

上下文：
${customerContext}
`,

          text: {
            format: {
              type: "json_schema",
              name: "customer_service_analysis",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  intent: {
                    type: "string"
                  },
                  emotion: {
                    type: "string",
                    enum: [
                      "NORMAL",
                      "HESITANT",
                      "CONFUSED",
                      "IMPATIENT",
                      "ANGRY",
                      "VERY_ANGRY"
                    ]
                  },
                  purchase_stage: {
                    type: "string",
                    enum: [
                      "BROWSING",
                      "INTERESTED",
                      "COMPARING",
                      "HESITATING",
                      "HIGH_INTENT",
                      "READY_TO_BUY",
                      "AFTER_SALES",
                      "NOT_APPLICABLE"
                    ]
                  },
                  purchase_intent_score: {
                    type: "integer",
                    minimum: 0,
                    maximum: 100
                  },
                  barrier: {
                    type: "string"
                  },
                  risk: {
                    type: "string",
                    enum: ["LOW", "MEDIUM", "HIGH"]
                  },
                  sales_level: {
                    type: "string",
                    enum: ["L0", "L1", "L2", "L3"]
                  },
                  action: {
                    type: "string",
                    enum: [
                      "ANSWER",
                      "BUILD_TRUST",
                      "REMOVE_CONCERN",
                      "SIZE_DECISION",
                      "COLOR_DECISION",
                      "RECOMMEND",
                      "CLOSE_ORDER",
                      "SAVE_ORDER",
                      "AFTER_SALES",
                      "TRANSFER_HUMAN"
                    ]
                  },
                  should_transfer_human: {
                    type: "boolean"
                  },
                  reply_vi: {
                    type: "string"
                  },
                  internal_reason: {
                    type: "string"
                  }
                },
                required: [
                  "intent",
                  "emotion",
                  "purchase_stage",
                  "purchase_intent_score",
                  "barrier",
                  "risk",
                  "sales_level",
                  "action",
                  "should_transfer_human",
                  "reply_vi",
                  "internal_reason"
                ]
              }
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        message: "AI request failed.",
        detail: data?.error?.message || "Unknown error"
      });
    }

    // Responses API 原始 REST 返回在 output 数组中
    const text =
      data?.output
        ?.flatMap((item) => item?.content || [])
        ?.find((item) => item?.type === "output_text")
        ?.text;

    if (!text) {
      return res.status(500).json({
        success: false,
        message: "AI returned no usable result."
      });
    }

    const parsed = JSON.parse(text);

    return res.status(200).json({
      success: true,
      analysis: parsed
    });

  } catch (err) {
    console.error("AI reply error:", err?.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}
