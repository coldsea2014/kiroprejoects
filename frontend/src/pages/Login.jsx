import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-wa-bgDark text-white px-4">
      <div className="w-full max-w-md bg-wa-panelDark rounded-lg p-8 shadow-lg">
        <h1 className="text-2xl font-bold mb-1 text-wa-green">CommuneChat</h1>
        <p className="text-sm text-gray-400 mb-6">Commune de Mohammedia</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email professionnel"
            className="w-full px-3 py-2 rounded bg-wa-bgDark border border-gray-700 focus:border-wa-green outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Mot de passe"
            className="w-full px-3 py-2 rounded bg-wa-bgDark border border-gray-700 focus:border-wa-green outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-wa-green hover:bg-emerald-600 disabled:opacity-50 text-white py-2 rounded font-medium"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
        <p className="text-sm text-gray-400 mt-4 text-center">
          Pas encore de compte ?{' '}
          <Link to="/register" className="text-wa-green hover:underline">
            Creer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
