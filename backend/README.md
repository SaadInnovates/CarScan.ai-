# Car Damage Analyzer Backend

This is the backend service for the Car Damage Analyzer project. It provides RESTful APIs for user authentication, scan management, report generation, analytics, and real-time communication. The backend uses the Hugging Face Inference API for AI-powered car damage detection and integrates with a database for persistent storage.

## Features

- User authentication and authorization (JWT-based)
- Scan image upload and processing
- AI-powered car damage detection via Hugging Face Inference API (YOLOv8)
- Report generation and export
- Real-time chat and notifications (WebSocket)
- Admin and analytics endpoints
- Email notifications

## Tech Stack

- [Python 3.8+](https://www.python.org/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [SQLAlchemy](https://www.sqlalchemy.org/)
- [Pydantic](https://pydantic.dev/)
- [Uvicorn](https://www.uvicorn.org/)
- [YOLOv8](https://github.com/ultralytics/ultralytics) (served via Hugging Face)

## Getting Started

### Prerequisites

- Python 3.8 or higher
- pip

### Installation

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. (Optional) Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running the Server

```bash
uvicorn main:app --reload
```

The API will be available at [http://localhost:8000](http://localhost:8000) by default.

### Environment Variables

Create a `.env` file in the `backend` directory to configure environment variables (e.g., database URL, secret keys).

**Optional:** To increase Hugging Face API rate limits, add your Hugging Face token:

```
HF_API_TOKEN=your_huggingface_token
```

### Project Structure

```
backend/
  ├── main.py                # FastAPI entry point
  ├── auth.py                # Authentication logic
  ├── config.py              # Configuration and settings
  ├── database.py            # Database connection
  ├── inference.py           # Hugging Face API inference logic
  ├── middleware.py          # Custom middleware
  ├── schemas.py             # Pydantic models
  ├── utils.py               # Utility functions
  ├── models/                # Database models
  ├── routers/               # API route modules
  ├── services/              # Service layer
  ├── outputs/               # Output files
  ├── reports/               # Generated reports
  ├── uploads/               # Uploaded images
  └── requirements.txt       # Python dependencies
```

## API Documentation

Interactive API docs are available at [http://localhost:8000/docs](http://localhost:8000/docs) after starting the server.

## Notes

- The backend no longer requires any local YOLO model files. All inference is performed via the Hugging Face API for https://huggingface.co/SaadZubair/car-damage-yolo.
- For best performance and higher rate limits, set your Hugging Face API token in `.env` as `HF_API_TOKEN`.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](../LICENSE)

# Car Damage Analyzer Backend

This is the backend service for the Car Damage Analyzer project. It provides RESTful APIs for user authentication, scan management, report generation, analytics, and real-time communication. The backend also handles AI-powered damage detection and integrates with a database for persistent storage.

## Features

- User authentication and authorization (JWT-based)
- Scan image upload and processing
- AI-powered car damage detection (YOLOv8)
- Report generation and export
- Real-time chat and notifications (WebSocket)
- Admin and analytics endpoints
- Email notifications

## Tech Stack

- [Python 3.8+](https://www.python.org/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [SQLAlchemy](https://www.sqlalchemy.org/)
- [Pydantic](https://pydantic.dev/)
- [Uvicorn](https://www.uvicorn.org/)
- [YOLOv8](https://github.com/ultralytics/ultralytics)

## Getting Started

### Prerequisites

- Python 3.8 or higher
- pip

### Installation

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. (Optional) Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running the Server

```bash
uvicorn main:app --reload
```

The API will be available at [http://localhost:8000](http://localhost:8000) by default.

### Environment Variables

Create a `.env` file in the `backend` directory to configure environment variables (e.g., database URL, secret keys).

### Project Structure

```
backend/
  ├── main.py                # FastAPI entry point
  ├── auth.py                # Authentication logic
  ├── config.py              # Configuration and settings
  ├── database.py            # Database connection
  ├── inference.py           # AI inference logic
  ├── middleware.py          # Custom middleware
  ├── schemas.py             # Pydantic models
  ├── utils.py               # Utility functions
  ├── models/                # Database and ML models
  ├── routers/               # API route modules
  ├── services/              # Service layer
  ├── outputs/               # Output files
  ├── reports/               # Generated reports
  ├── uploads/               # Uploaded images
  └── requirements.txt       # Python dependencies
```

## API Documentation

Interactive API docs are available at [http://localhost:8000/docs](http://localhost:8000/docs) after starting the server.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](../LICENSE)
