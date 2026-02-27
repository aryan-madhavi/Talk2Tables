const express = require("express"); 
const router = express.Router();
const admin = require("../firebase");

// Login: verify Firebase token and create session cookie
router.post("/login", async (req, res) => {
  const { token } = req.body;

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    // For simplicity, we store Firebase token in HTTP-only cookie
    res.cookie("session", token, {
      httpOnly: true,
      secure: false,  // set true in production (HTTPS)
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax",
    });

    res.json({ message: "Logged in", user: decoded });
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
});

// Logout: clear cookie
router.post("/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ message: "Logged out" });
});

// Get current session users
router.get("/session", async (req, res) => {
  const sessionCookie = req.cookies.session;

  if (!sessionCookie) return res.status(401).json({ error: "No session" });

  try {
    const decoded = await admin.auth().verifyIdToken(sessionCookie);
    res.json({ user: decoded });
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
});

module.exports = router;