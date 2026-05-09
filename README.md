# CommuneChat Mohammedia

Application de messagerie en temps réel (style WhatsApp) pour les fonctionnaires de la Commune de Mohammedia.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + Socket.IO client
- **Backend**: Node.js + Express + Socket.IO + Mongoose (MongoDB)
- **Auth**: JWT + bcrypt

## Structure

```
kiroprejoects/
├── backend/          # API Express + serveur Socket.IO
│   ├── src/
│   │   ├── models/       # Mongoose models (User, Message, Conversation)
│   │   ├── routes/       # REST endpoints (auth, users, messages)
│   │   ├── middleware/   # Auth middleware
│   │   ├── socket/       # Gestion des événements temps réel
│   │   └── server.js
│   ├── .env.example
│   └── package.json
└── frontend/         # Interface React
    ├── src/
    │   ├── components/   # Sidebar, ChatWindow, MessageBubble...
    │   ├── pages/        # Login, Register, Chat
    │   ├── context/      # AuthContext, SocketContext
    │   ├── api/          # Client axios
    │   └── App.jsx
    └── package.json
```

## Lancement en local

### 1. Backend

```bash
cd backend
cp .env.example .env      # puis editer MONGO_URI et JWT_SECRET
npm install
npm run dev               # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

## Fonctionnalites (MVP)

- [x] Inscription / connexion des fonctionnaires (email + service)
- [x] Liste de contacts (autres fonctionnaires)
- [x] Chat 1-a-1 en temps reel (Socket.IO)
- [x] Historique des messages persiste (MongoDB)
- [x] Statut en ligne / hors ligne
- [ ] Groupes par service (roadmap)
- [ ] Envoi de fichiers (roadmap)
- [ ] Accuses de lecture (roadmap)

## Variables d'environnement (backend/.env)

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/communechat
JWT_SECRET=change-me-in-production
CLIENT_URL=http://localhost:5173
```
