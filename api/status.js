let currentStatus = "offline";

export default function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ status: currentStatus });
  }
  if (req.method === "POST") {
    const { status } = req.body;
    if (status === "online" || status === "offline") currentStatus = status;
    return res.status(200).json({ success: true, status: currentStatus });
  }
  res.status(405).end();
}
