# Development Guide

This page is for developers and maintainers.

## Prerequisites

- Node.js 18+
- npm 9+

## Install

From the repository root:

npm install

This runs root `postinstall`, which installs both backend and frontend dependencies.

## Development Mode

Run both services:

npm run dev

Services:
- Backend: http://localhost:3001
- Frontend (Vite): http://localhost:5173

You can also run services separately:

npm run dev:backend
npm run dev:frontend

## Build

Build frontend assets:

npm run build

Output:
- frontend/dist

## Production-Style Local Run

npm run start:prod

This will:
- Install all dependencies
- Build frontend
- Start backend server
- Serve frontend from backend at http://localhost:3001

## Additional Commands

- npm run install:all
  Install backend and frontend dependencies

- npm run setup
  Install all dependencies and build frontend

- npm start
  Start backend server only (assumes frontend has already been built)

## Notes

- The backend proxies requests to store log endpoints.
- Multi-file download creates ZIP archives server-side.
- Download progress UI shows bytes received and elapsed time.
