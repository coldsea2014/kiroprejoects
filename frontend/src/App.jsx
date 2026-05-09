import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Chat from './pages/Chat.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Chargement...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <SocketProvider>{children}</SocketProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
