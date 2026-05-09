import { useEffect, useRef, useState } from 'react';

export default function ChatWindow({ contact, messages, me, onSend }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!contact) {
    return (
      <main className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <h2 className="text-2xl text-wa-green mb-2">CommuneChat Mohammedia</h2>
          <p>Selectionnez un collegue pour commencer la discussion</p>
        </div>
      </main>
    );
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText('');
  };

  return (
    <main className="flex-1 flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 border-b border-gray-800 bg-wa-panelDark flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
          {contact.fullName?.[0]?.toUpperCase()}
        </div>
        <div>
          <div className="font-medium">{contact.fullName}</div>
          <div className="text-xs text-gray-400">
            {contact.online ? 'en ligne' : 'hors ligne'} . {contact.service}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-wa-bgDark">
        {messages.map((m) => {
          const mine = m.sender === me.id;
          return (
            <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${
                  mine ? 'bg-wa-bubbleOut' : 'bg-wa-bubbleIn'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div className="text-[10px] text-gray-300 text-right mt-1">
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-gray-800 bg-wa-panelDark flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ecrire un message..."
          className="flex-1 px-3 py-2 rounded-full bg-wa-bgDark border border-gray-700 focus:border-wa-green outline-none text-sm"
        />
        <button
          type="submit"
          className="bg-wa-green hover:bg-emerald-600 px-4 py-2 rounded-full text-sm font-medium"
        >
          Envoyer
        </button>
      </form>
    </main>
  );
}
