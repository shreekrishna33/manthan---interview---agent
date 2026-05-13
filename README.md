# Manthan - AI Interview Agent 🎙️🤖

An intelligent, full-stack AI Interview Coach designed to help users practice and perfect their interview skills. Manthan provides real-time, conversational feedback using advanced AI, complete with seamless voice interactions.

## 🚀 Key Features

- **Conversational AI Coaching**: Acts as a friendly, supportive interview coach to help you practice behavioral and technical questions.
- **Hands-Free Voice Mode**: 
  - **Speech-to-Text**: Answer questions verbally using the built-in microphone integration.
  - **Text-to-Speech**: The AI automatically reads its feedback and next questions out loud to you.
- **Real-Time Streaming**: AI responses stream in instantly, just like a real conversation.
- **Image & Resume Support**: Upload images or context for the AI to analyze during the interview.
- **Modern UI/UX**: Built with a sleek, responsive interface featuring Dark/Light mode support.

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS, shadcn/ui
- **Backend**: Node.js, Express
- **AI Integration**: Google Gemini API (or equivalent AI provider)
- **Database**: Drizzle ORM
- **Routing**: Wouter

## ⚙️ How to Run Locally

### 1. Install Dependencies
Make sure you have Node.js installed, then run:
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and add your API keys. You will need your AI provider API key (e.g., Gemini):
```env
GEMINI_API_KEY=your_api_key_here
```

### 3. Start the Development Server
Run the following command to start both the frontend and backend servers:
```bash
npm run dev
```

### 4. Open the App
The application will be available at `http://localhost:5000`. 
*(Note: For the microphone and Voice Assistant features to work properly, ensure you access the app via localhost or HTTPS on a supported browser like Chrome or Edge).*

## 🎯 Usage Instructions
1. Click the **Start Interview** button to begin.
2. Type your responses or click the **red 🎙️ microphone button** to speak your answers.
3. The AI will automatically read its responses out loud. You can stop the playback at any time by clicking the **Stop** button.

## 📝 License
This project is open-source and available for educational and personal use.
