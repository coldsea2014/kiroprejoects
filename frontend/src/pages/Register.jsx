import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const SERVICES = ['General', 'Etat civil', 'Urbanisme', 'RH', 'Finances', 'Informatique', 'Secretariat'];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', service: 'General' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Inscription impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-wa-bgDark text-white px-4">
      <div className="w-full max-w-md bg-wa-panelDark rounded-lg p-8 shadow-lg">
        <h1 className="text-2xl font-bold mb-1 text-wa-green">Creer un compte</h1>
        <p className="text-sm text-gray-400 mb-6">Reserve aux fonctionnaires de la commune</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            name="fullName"
            placeholder="Nom complet"
            className="w-full px-3 py-2 rounded bg-wa-bgDark border border-gray-700 focus:border-wa-green outline-none"
            value={form.fullName}
            onChange={onChange}
            required
          />
          <input
            name="email"
            type="email"
            placeholder="Email professionnel"
            className="w-full px-3 py-2 rounded bg-wa-bgDark border border-gray-700 focus:border-wa-green outline-none"
            value={form.email}
            onChange={onChange}
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Mot de passe (6+ caracteres)"
            className="w-full px-3 py-2 rounded bg-wa-bgDark border border-gray-700 focus:border-wa-green outline-none"
            value={form.password}
            onChange={onChange}
            minLength={6}
            required
          />
          <select
            name="service"
            className="w-full px-3 py-2 rounded bg-wa-bgDark border border-gray-700 focus:border-wa-green outline-none"
            value={form.service}
            onChange={onChange}
          >
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-wa-green hover:bg-emerald-600 disabled:opacity-50 text-white py-2 rounded font-medium"
          >
            {loading ? 'Inscription...' : "S'inscrire"}
          </button>
        </form>
        <p className="text-sm text-gray-400 mt-4 text-center">
          Deja un compte ?{' '}
          <Link to="/login" className="text-wa-green hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
