export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      service: "HMXH AI Customer Service",
      webhook: "online"
    });
  }

  if (req.method === "POST") {
    const event = req.body;

    console.log("TikTok Webhook Event:", JSON.stringify(event));

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
