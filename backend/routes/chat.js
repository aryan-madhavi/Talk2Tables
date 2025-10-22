const express = require("express"); 
const router = express.Router();
const fetch = require("node-fetch");


router.post("/chat", async (req, res) => {
    const { userMessage, connectionId, chatId } = req.body;

    if (!connectionId || !userMessage) 
        return res.status(400).json({ error: "Invalid connection info" });
    
    try {
        const n8nResponse = await fetch(process.env.N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                connection_id: connectionId,
                query: userMessage,
                chat_id: chatId
            }),

        })

        
        const data = await n8nResponse.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Query processing failed" });
    }
    
})

module.exports = router;