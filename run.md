# 1. Get Service Account key
# Firebase Console → Project Settings → Service Accounts
# → Generate new private key → save as firebase-credentials.json in project root

# 2. Setup env
cp .env.example .env
# Edit .env: set FIREBASE_PROJECT_ID=your-actual-project-id

# 3. Install
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Run
uvicorn main:app --reload --port 8000
# → http://localhost:8000/docs