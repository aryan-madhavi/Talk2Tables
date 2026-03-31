# Talk2Tables Backend (On-Premise)

A FastAPI-powered SQL agent that allows natural language interaction with your local databases.

## 🚀 Features
- **Fully Local**: No data leaves your server when using Ollama.
- **On-Prem Auth**: JWT-based authentication with MongoDB.
- **Secure**: AES-256-GCM encryption for database credentials.
- **RBAC**: Role-based access control (Admin, DB Manager, Analyst).

## 🛠️ Setup

1.  **Environment**: Copy `.env.example` to `.env` and fill in your details.
2.  **Databases**: Ensure MongoDB and Redis are running.
3.  **Local AI**: Install [Ollama](https://ollama.com) and run `ollama pull qwen2.5-coder:3b-instruct-q4_K_M`.
4.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
5.  **Run**:
    ```bash
    uvicorn main:app --reload
    ```

## 📝 TODO
- [ ] **Data Hiding**: Implement logic to obfuscate internal strings and keys during the Nuitka build process.
- [ ] Add more database drivers.
- [ ] Expand LLM provider support.
