# Xstore Log Viewer

Xstore Log Viewer is a React + Express app for browsing, filtering, viewing, and downloading store log files.

## Prerequisites

- Node.js 18 or newer
- npm 9 or newer

## Install

From the project root:

npm install

What this does:
- Installs root dependencies
- Installs backend dependencies
- Installs frontend dependencies

## Run in Development

From the project root:

npm run dev

This starts:
- Backend API on port 3001
- Frontend Vite dev server on port 5173

Open in browser:
- http://localhost:5173

## Build Frontend

From the project root:

npm run build

This builds the frontend into frontend/dist.

## Run in Production-Style Mode

From the project root:

npm run start:prod

What this does:
- Installs all dependencies
- Builds frontend assets
- Starts backend server on port 3001
- Serves the built frontend from the backend

Open in browser:
- http://localhost:3001

## Useful Commands

- npm run install:all
  Install backend and frontend dependencies

- npm run setup
  Install all dependencies and build frontend

- npm run dev:backend
  Start only backend in dev mode

- npm run dev:frontend
  Start only frontend in dev mode

- npm start
  Start backend server only

## Download Feature Notes

- Use the checkboxes in the file list to select one or many files
- Select all chooses all listed files
- Download creates a ZIP file containing selected logs
- While downloading, bytes received and elapsed time are shown in-app
