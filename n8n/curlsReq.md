**1. Simple JOIN**

```bash
curl -X POST "https://fomoha8938hutudns.app.n8n.cloud/webhook/f999a27b-b48b-44bf-bd72-1e9694872d07" -H "Content-Type: application/json" -d "{\"hostname\": \"sql12.freesqldatabase.com\", \"dbName\": \"sql12818282\", \"dbUser\": \"sql12818282\", \"pass\": \"7k9R8qUwFv\", \"port\": \"3306\", \"sessionId\": \"session_001\", \"chatInput\": \"Show me all employees with their department name and their managers name\", \"DatabaseType\": \"mysql\"}"
```

**2. Aggregation + JOIN**

```bash
curl -X POST "https://fomoha8938hutudns.app.n8n.cloud/webhook/f999a27b-b48b-44bf-bd72-1e9694872d07" -H "Content-Type: application/json" -d "{\"hostname\": \"sql12.freesqldatabase.com\", \"dbName\": \"sql12818282\", \"dbUser\": \"sql12818282\", \"pass\": \"7k9R8qUwFv\", \"port\": \"3306\", \"sessionId\": \"session_002\", \"chatInput\": \"Which customer has spent the most money across all their orders?\", \"DatabaseType\": \"mysql\"}"
```

**3. Multi-table JOIN**

```bash
curl -X POST "https://fomoha8938hutudns.app.n8n.cloud/webhook/f999a27b-b48b-44bf-bd72-1e9694872d07" -H "Content-Type: application/json" -d "{\"hostname\": \"sql12.freesqldatabase.com\", \"dbName\": \"sql12818282\", \"dbUser\": \"sql12818282\", \"pass\": \"7k9R8qUwFv\", \"port\": \"3306\", \"sessionId\": \"session_003\", \"chatInput\": \"Show me all delivered orders with the customer name, employee who processed it, and every product in that order\", \"DatabaseType\": \"mysql\"}"
```

**4. Subquery + Aggregation**

```bash
curl -X POST "https://fomoha8938hutudns.app.n8n.cloud/webhook/f999a27b-b48b-44bf-bd72-1e9694872d07" -H "Content-Type: application/json" -d "{\"hostname\": \"sql12.freesqldatabase.com\", \"dbName\": \"sql12818282\", \"dbUser\": \"sql12818282\", \"pass\": \"7k9R8qUwFv\", \"port\": \"3306\", \"sessionId\": \"session_004\", \"chatInput\": \"Which department has the highest average salary and how does each employee in that department compare to the average?\", \"DatabaseType\": \"mysql\"}"
```

**5. Business Insight**

````bash
curl -X POST "https://fomoha8938hutudns.app.n8n.cloud/webhook/f999a27b-b48b-44bf-bd72-1e9694872d07" -H "Content-Type: application/json" -d "{\"hostname\": \"sql12.freesqldatabase.com\", \"dbName\": \"sql12818282\", \"dbUser\": \"sql12818282\", \"pass\": \"7k9R8qUwFv\", \"port\": \"3306\", \"sessionId\": \"session_005\", \"chatInput\": \"Show me the top 3 best selling products by total quantity sold along with their total revenue generated\", \"DatabaseType\": \"mysql\"}"
```s
````
