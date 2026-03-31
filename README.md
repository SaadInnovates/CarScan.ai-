# AI Vehicle Damage Analyzer

## Run Instructions

### Frontend

```bash
cd frontend
npm run dev
```

Runs at: http://localhost:5173

### Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

Runs at: http://localhost:8000

## Windows Backend Activation

```powershell
cd backend
.\venv\Scripts\activate
uvicorn main:app --reload
```

Deployed Model at Hugging Face: https://huggingface.co/spaces/SaadZubair/damage-detector
