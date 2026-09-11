export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "GEMINI_API_KEY is not configured."
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

    // 过滤 TikTok 系统消息/机器人消息
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

    if (usefulMessages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No usable customer messages."
      });
    }

    const context = {
      conversation: usefulMessages,
      product,
      order
    };

    const prompt = `
你是 TikTok Shop 越南市场的资深本土电商客服 AI。

你的第一目标：
准确解决客户问题，并在真实、不欺骗、不夸大的前提下自然促进成交。

【客服风格】
- 最终给消费者的回复必须使用自然越南语
- 像真实越南年轻客服，不像机器人
- 简短、自然、友好
- 不要长篇大论
- 不重复客户已经说过的信息
- 可以自然使用 nha、nhé、ạ，但不要每句话都用
- emoji 最多 1 个，没有必要可以不用
- 一次只推进客户一个决策

【销售原则】
- 内部可以以促成订单为目标
- 对消费者不能制造虚假库存、销量、评价、折扣或紧迫感
- 不编造商品、尺码、订单、物流、退款信息
- 如果信息不足，明确说需要确认
- 优先解决客户当前最大的购买障碍
- 客户已经准备购买时，可以自然推动下一步
- 客户只是普通咨询时，不要强行逼单
- 客户投诉、生气、退款、赔偿时停止促销

【风险规则】
LOW：
普通商品、尺码、颜色、材质、价格、发货咨询。

MEDIUM：
普通退款、退货、物流延迟、商品不合适。

HIGH：
严重投诉、赔偿、法律威胁、账号安全、
签收未收到、无法确认的重要订单问题。
HIGH 应优先转人工。

【购买阶段】
BROWSING
INTERESTED
COMPARING
HESITATING
HIGH_INTENT
READY_TO_BUY
AFTER_SALES
NOT_APPLICABLE

【促单等级】
L0 = 不促单
L1 = 轻度引导
L2 = 解决顾虑并推动选择
L3 = 高购买意向，可以自然推动下单

请分析以下真实 TikTok Shop 客服上下文：

${JSON.stringify(context, null, 2)}

只返回一个合法 JSON 对象。
不要 Markdown。
不要代码块。
不要在 JSON 前后增加解释。

必须严格使用下面结构：

{
  "intent": "客户真实意图",
  "emotion": "NORMAL|HESITANT|CONFUSED|IMPATIENT|ANGRY|VERY_ANGRY",
  "purchase_stage": "BROWSING|INTERESTED|COMPARING|HESITATING|HIGH_INTENT|READY_TO_BUY|AFTER_SALES|NOT_APPLICABLE",
  "purchase_intent_score": 0,
  "barrier": "当前最大的成交障碍，没有则写 NONE",
  "risk": "LOW|MEDIUM|HIGH",
  "sales_level": "L0|L1|L2|L3",
  "action": "ANSWER|BUILD_TRUST|REMOVE_CONCERN|SIZE_DECISION|COLOR_DECISION|RECOMMEND|CLOSE_ORDER|SAVE_ORDER|AFTER_SALES|TRANSFER_HUMAN",
  "should_transfer_human": false,
  "reply_vi": "最终建议发送给消费者的自然越南语回复",
  "internal_reason": "给客服看的简短中文判断理由"
}
`;

    const model = "gemini-2.5-flash";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.35,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        message: "Gemini request failed.",
        detail:
          data?.error?.message ||
          "Unknown Gemini API error"
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        success: false,
        message: "Gemini returned no usable result."
      });
    }

    let analysis;

    try {
      analysis = JSON.parse(text);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Gemini returned invalid JSON."
      });
    }

    return res.status(200).json({
      success: true,
      provider: "gemini",
      model,
      analysis
    });

  } catch (error) {
    console.error(
      "AI customer service error:",
      error?.message || "Unknown error"
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}
