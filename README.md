# Xstore Log Viewer

Xstore Log Viewer is a React + Express app for browsing, filtering, viewing, and downloading store log files.

## Start Here (Production Use)

If you just want to run the app, use only these steps.

### 1. Prerequisites

- Node.js 18 or newer
- npm 9 or newer

### 2. Install

From the project root:

npm install

### 3. Start the app

From the project root:

npm run start:prod

### 4. Open in browser

- http://localhost:3001

## What `start:prod` does

- Installs all required dependencies
- Builds the frontend
- Starts the backend server
- Serves the app from backend on port 3001

## Developer Documentation

Technical/developer workflows are documented separately:

- [Development Guide](DEVELOPMENT.md)

## Download Feature Notes

- Use the checkboxes in the file list to select one or many files
- Select all chooses all listed files
- Download creates a ZIP file containing selected logs
- While downloading, bytes received and elapsed time are shown in-app
