export default function handler(req, res) {
  const { auth_code, code, state } = req.query;

  return res.status(200).json({
    success: true,
    service: "HMXH AI Customer Service",
    message: "TikTok authorization callback is online.",
    authorization_received: Boolean(auth_code || code),
    state_received: Boolean(state),
  });
}
