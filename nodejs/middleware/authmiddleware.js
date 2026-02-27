const admin = require("../firebase");

const verifySession = async (req, res, next) => {
  const sessionCookie = req.cookies.session;

  if (!sessionCookie) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(sessionCookie);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Session verification failed:", err);
    res.status(401).json({ error: "Unauthorized" });
  }
};

module.exports = verifySession;
