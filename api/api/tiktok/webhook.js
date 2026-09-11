export default async function handler(req, res) {
  // TikTok Webhook 健康检查
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      service: "HMXH AI Customer Service",
      webhook: "online"
    });
  }

  // 接收 TikTok 推送
  if (req.method === "POST") {
    const event = req.body;

    console.log("TikTok Webhook Event:", JSON.stringify(event));

    // 第一版只接收，不执行任何客服动作
    return res.status(200).json({
      success: true,
      received: true
    });
  }

  return res.status(405).json({
    success: false,
    message: "Method not allowed"
  });
}
