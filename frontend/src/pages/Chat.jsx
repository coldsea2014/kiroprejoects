import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import Sidebar from '../components/Sidebar.jsx';
import ChatWindow from '../components/ChatWindow.jsx';

export default function Chat() {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');

  // Chargement des contacts
  useEffect(() => {
    const load = async () => {
      const { data } = await api.get('/users', { params: { q: search || undefined } });
      setContacts(data.users);
    };
    load();
  }, [search]);

  // Historique de conversation quand on selectionne un contact
  useEffect(() => {
    if (!selected) return;
    api.get(`/messages/${selected.id}`).then(({ data }) => setMessages(data.messages));
  }, [selected]);

  // Reception des messages en temps reel
  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      if (!selected) return;
      const isRelevant =
        (msg.sender === selected.id && msg.recipient === user.id) ||
        (msg.sender === user.id && msg.recipient === selected.id);
      if (isRelevant) setMessages((prev) => [...prev, msg]);
    };
    const onPresence = ({ userId, online }) => {
      setContacts((list) => list.map((c) => (c.id === userId ? { ...c, online } : c)));
    };
    socket.on('message:new', onNew);
    socket.on('presence:update', onPresence);
    return () => {
      socket.off('message:new', onNew);
      socket.off('presence:update', onPresence);
    };
  }, [socket, selected, user]);

  const sendMessage = (content) => {
    if (!socket || !selected) return;
    socket.emit('message:send', { recipient: selected.id, content });
  };

  return (
    <div className="h-screen flex bg-wa-bgDark text-white">
      <Sidebar
        me={user}
        contacts={contacts}
        selected={selected}
        onSelect={setSelected}
        onSearch={setSearch}
        search={search}
        onLogout={logout}
      />
      <ChatWindow contact={selected} messages={messages} me={user} onSend={sendMessage} />
    </div>
  );
}
