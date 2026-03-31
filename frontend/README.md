# Car Damage Analyzer Frontend

This is the frontend application for the Car Damage Analyzer project. It provides a modern, responsive user interface for interacting with the backend API, visualizing scan results, managing user profiles, and accessing analytics and reports.

## Features

- User authentication and authorization
- Dashboard for managing scans and reports
- Real-time chat assistant and admin chatbot
- Analytics and data visualization
- Profile management
- Responsive design with Tailwind CSS

## Tech Stack

- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

## Getting Started

### Prerequisites

- Node.js (v16 or higher recommended)
- npm or yarn

### Installation

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

### Running the Development Server

```bash
npm run dev
# or
yarn dev
```

The app will be available at [http://localhost:5173](http://localhost:5173) by default.

### Building for Production

```bash
npm run build
# or
yarn build
```

### Linting and Formatting

```bash
npm run lint
```

## Project Structure

```
frontend/
  ├── public/                # Static assets
  ├── src/                   # Source code
  │   ├── assets/            # Images and icons
  │   ├── components/        # Reusable React components
  │   ├── context/           # React context providers
  │   ├── lib/               # Utility libraries
  │   ├── pages/             # Page components
  │   ├── App.jsx            # Main app component
  │   └── main.jsx           # Entry point
  ├── package.json           # Project metadata and scripts
  └── ...
```

## Environment Variables

Create a `.env` file in the `frontend` directory to configure environment variables (e.g., API endpoints).

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](../LICENSE)
