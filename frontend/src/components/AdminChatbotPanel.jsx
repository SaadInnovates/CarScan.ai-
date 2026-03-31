import api from "../lib/api";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

/* ══════════════════════════════════════════════════════
   MARKDOWN RENDERER — renders headings, lists, code, bold
   exactly like ChatGPT / Claude responses
══════════════════════════════════════════════════════ */
function MarkdownMessage({ text, isUser }) {
  return (
    <div className={`acb-prose ${isUser ? "acb-prose-user" : "acb-prose-bot"}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="acb-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="acb-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="acb-h3">{children}</h3>,
          p:  ({ children }) => <p  className="acb-p" >{children}</p>,
          ul: ({ children }) => <ul className="acb-ul">{children}</ul>,
          ol: ({ children }) => <ol className="acb-ol">{children}</ol>,
          li: ({ children }) => <li className="acb-li">{children}</li>,
          strong: ({ children }) => <strong className="acb-strong">{children}</strong>,
          em:     ({ children }) => <em className="acb-em">{children}</em>,
          code: ({ inline, children }) =>
            inline
              ? <code className="acb-code-inline">{children}</code>
              : <code className="acb-code-block">{children}</code>,
          pre: ({ children }) => <pre className="acb-pre">{children}</pre>,
          hr:  () => <hr className="acb-hr" />,
          blockquote: ({ children }) => <blockquote className="acb-blockquote">{children}</blockquote>,
          table: ({ children }) => (
            <div className="acb-table-wrap">
              <table className="acb-table">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="acb-th">{children}</th>,
          td: ({ children }) => <td className="acb-td">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SUGGESTION CHIPS
══════════════════════════════════════════════════════ */
const SUGGESTIONS = [
  { label: "Platform Overview",     query: "Give me a full platform overview with all key stats." },
  { label: "Top Users by Scans",    query: "Who are the top 10 users by scan count?" },
  { label: "Pending Subscriptions", query: "Show me all pending subscription requests." },
  { label: "Signups Last 7 Days",   query: "How many new users signed up in the last 7 days? Show the daily breakdown." },
  { label: "Severity Breakdown",    query: "Give me a breakdown of scans by severity level." },
  { label: "Growth Trends",         query: "Show month-over-month growth trends for the last 6 months." },
  { label: "Report Analytics",      query: "Analyse damage report generation — types and daily trends." },
];

/* ══════════════════════════════════════════════════════
   ICONS
══════════════════════════════════════════════════════ */
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none"/>
  </svg>
);

const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="8" width="18" height="12" rx="3" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    <circle cx="9" cy="14" r="1.2" fill="currentColor" />
    <circle cx="15" cy="14" r="1.2" fill="currentColor" />
    <path d="M9 18h6" />
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="7" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4h6v2" />
  </svg>
);

const DatabaseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

/* ══════════════════════════════════════════════════════
   TYPING DOTS
══════════════════════════════════════════════════════ */
function TypingDots() {
  return (
    <span className="inline-flex items-end gap-1 h-5 px-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="acb-dot"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

/* ══════════════════════════════════════════════════════
   TIMESTAMP
══════════════════════════════════════════════════════ */
const ts = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function AdminChatbotPanel() {
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "## Welcome, Admin 👋\n\nI'm your AI analytics assistant, connected directly to your platform database.\n\nAsk me anything — user stats, scan analytics, subscription requests, growth trends, or run a custom data query. Use the quick chips below to get started.",
      time: ts(),
    },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [showChips, setShowChips] = useState(true);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const textareaRef    = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [input]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { sender: "user", text: q, time: ts() }]);
    setLoading(true);
    setInput("");
    try {
      const res = await api.post("/admin/chatbot/ask", { question: q });
      setMessages((m) => [
        ...m,
        { sender: "bot", text: res.data.answer, time: ts() },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          sender: "bot",
          text: "⚠️ **Connection error.** Could not reach the assistant. Please check your network.",
          time: ts(),
        },
      ]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () =>
    setMessages([
      {
        sender: "bot",
        text: "Chat cleared. What would you like to know?",
        time: ts(),
      },
    ]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        /* ── Root container ──────────────────────────────── */
        .acb-root {
          font-family: 'Plus Jakarta Sans', sans-serif;
          display: flex;
          flex-direction: column;
          height: 680px;
          max-width: 780px;
          margin: 0 auto;
          border-radius: 20px;
          overflow: hidden;
          background: #0b1120;
          border: 1px solid rgba(96,165,250,0.14);
          box-shadow:
            0 0 0 1px rgba(96,165,250,0.06),
            0 32px 80px rgba(0,0,0,0.75),
            inset 0 1px 0 rgba(255,255,255,0.05);
          position: relative;
        }

        /* ── Subtle noise texture ────────────────────────── */
        .acb-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          border-radius: 20px;
        }

        /* ── Header ──────────────────────────────────────── */
        .acb-header {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: linear-gradient(135deg, #0d1729 0%, #091424 100%);
          border-bottom: 1px solid rgba(96,165,250,0.1);
          flex-shrink: 0;
        }

        .acb-header-left { display: flex; align-items: center; gap: 12px; }

        .acb-avatar {
          width: 38px; height: 38px;
          border-radius: 12px;
          background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
          border: 1px solid rgba(96,165,250,0.3);
          display: flex; align-items: center; justify-content: center;
          color: #93c5fd;
          flex-shrink: 0;
          box-shadow: 0 0 16px rgba(59,130,246,0.2);
        }

        .acb-title {
          font-size: 14px;
          font-weight: 700;
          color: #e0effe;
          letter-spacing: 0.02em;
        }
        .acb-subtitle {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: rgba(96,165,250,0.5);
          margin-top: 2px;
          display: flex; align-items: center; gap: 5px;
        }

        .acb-status-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #3b82f6;
          box-shadow: 0 0 8px #3b82f6;
          animation: acb-pulse 2.5s ease-in-out infinite;
        }

        .acb-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.12em;
          color: rgba(96,165,250,0.7);
          background: rgba(59,130,246,0.08);
          border: 1px solid rgba(59,130,246,0.18);
          padding: 4px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          display: flex; align-items: center; gap: 5px;
        }

        .acb-clear-btn {
          background: none; border: none; cursor: pointer;
          color: rgba(96,165,250,0.35);
          padding: 6px; border-radius: 8px;
          transition: all 0.15s;
          display: flex; align-items: center; justify-content: center;
        }
        .acb-clear-btn:hover {
          color: rgba(96,165,250,0.75);
          background: rgba(59,130,246,0.08);
        }

        .acb-header-actions { display: flex; align-items: center; gap: 8px; }

        /* ── Chip bar ─────────────────────────────────────── */
        .acb-chip-bar {
          position: relative; z-index: 10;
          padding: 10px 20px;
          background: rgba(9,20,36,0.6);
          border-bottom: 1px solid rgba(59,130,246,0.07);
          flex-shrink: 0;
          overflow: hidden;
        }

        .acb-chip-scroll {
          display: flex; gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 2px;
        }
        .acb-chip-scroll::-webkit-scrollbar { display: none; }

        .acb-chip {
          flex-shrink: 0;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 11px;
          font-weight: 500;
          padding: 5px 13px;
          border-radius: 20px;
          cursor: pointer;
          border: 1px solid rgba(59,130,246,0.2);
          background: rgba(59,130,246,0.07);
          color: rgba(147,197,253,0.8);
          transition: all 0.15s;
          white-space: nowrap;
        }
        .acb-chip:hover:not(:disabled) {
          background: rgba(59,130,246,0.16);
          border-color: rgba(59,130,246,0.4);
          color: #bfdbfe;
          transform: translateY(-1px);
        }
        .acb-chip:disabled { opacity: 0.4; cursor: not-allowed; }

        .acb-chip-toggle {
          display: flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 600;
          color: rgba(59,130,246,0.4);
          background: none; border: none; cursor: pointer;
          transition: color 0.15s;
          flex-shrink: 0;
          padding: 5px 4px;
        }
        .acb-chip-toggle:hover { color: rgba(96,165,250,0.7); }
        .acb-chip-toggle svg { transition: transform 0.2s; }
        .acb-chip-toggle.collapsed svg { transform: rotate(180deg); }

        /* ── Messages area ────────────────────────────────── */
        .acb-messages {
          position: relative; z-index: 10;
          flex: 1; overflow-y: auto;
          padding: 20px 20px 8px;
          display: flex; flex-direction: column; gap: 16px;
          scroll-behavior: smooth;
        }
        .acb-messages::-webkit-scrollbar { width: 4px; }
        .acb-messages::-webkit-scrollbar-track { background: transparent; }
        .acb-messages::-webkit-scrollbar-thumb { background: rgba(59,130,246,0.18); border-radius: 4px; }

        /* ── Message row ──────────────────────────────────── */
        .acb-row {
          display: flex; gap: 10px; align-items: flex-start;
          animation: acb-fade-up 0.2s ease-out;
        }
        .acb-row.user { flex-direction: row-reverse; }

        .acb-msg-avatar {
          width: 30px; height: 30px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 2px;
        }
        .acb-msg-avatar.bot {
          background: rgba(59,130,246,0.12);
          border: 1px solid rgba(59,130,246,0.2);
          color: #60a5fa;
        }
        .acb-msg-avatar.user {
          background: rgba(99,102,241,0.15);
          border: 1px solid rgba(99,102,241,0.2);
          color: #a5b4fc;
        }

        /* ── Bubbles ──────────────────────────────────────── */
        .acb-bubble {
          max-width: 78%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 13.5px;
          line-height: 1.6;
        }
        .acb-bubble.bot {
          background: linear-gradient(135deg,
            rgba(29,78,216,0.12) 0%,
            rgba(17,24,39,0.6) 100%);
          border: 1px solid rgba(59,130,246,0.15);
          border-top-left-radius: 4px;
          color: #dbeafe;
        }
        .acb-bubble.user {
          background: linear-gradient(135deg,
            rgba(79,70,229,0.25) 0%,
            rgba(55,48,163,0.15) 100%);
          border: 1px solid rgba(99,102,241,0.2);
          border-top-right-radius: 4px;
          color: #e0e7ff;
          text-align: left;
        }

        .acb-timestamp {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          opacity: 0.3;
          margin-top: 6px;
        }
        .acb-row.user .acb-timestamp { text-align: right; }

        /* ── Markdown prose styles ────────────────────────── */
        .acb-prose { width: 100%; }

        .acb-h1 {
          font-size: 15px; font-weight: 700; color: #bfdbfe;
          margin: 0 0 10px; padding-bottom: 6px;
          border-bottom: 1px solid rgba(59,130,246,0.15);
        }
        .acb-h2 {
          font-size: 13.5px; font-weight: 700; color: #bfdbfe;
          margin: 14px 0 6px;
        }
        .acb-h2:first-child { margin-top: 0; }
        .acb-h3 {
          font-size: 13px; font-weight: 600; color: #93c5fd;
          margin: 10px 0 4px;
        }
        .acb-p  { margin: 0 0 8px; color: #cbd5e1; font-size: 13.5px; }
        .acb-p:last-child { margin-bottom: 0; }

        .acb-ul, .acb-ol {
          margin: 4px 0 8px 0;
          padding-left: 20px;
          color: #cbd5e1;
        }
        .acb-li {
          margin-bottom: 3px;
          font-size: 13.5px;
          line-height: 1.55;
        }

        .acb-strong { color: #93c5fd; font-weight: 600; }
        .acb-em     { color: #a5b4fc; font-style: italic; }

        .acb-code-inline {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          background: rgba(17,24,39,0.7);
          border: 1px solid rgba(59,130,246,0.18);
          color: #60a5fa;
          padding: 1px 6px;
          border-radius: 5px;
        }
        .acb-pre {
          background: rgba(9,17,30,0.8);
          border: 1px solid rgba(59,130,246,0.15);
          border-radius: 10px;
          padding: 12px 14px;
          overflow-x: auto;
          margin: 6px 0 10px;
        }
        .acb-code-block {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: #7dd3fc;
          white-space: pre;
          display: block;
        }
        .acb-hr { border: none; border-top: 1px solid rgba(59,130,246,0.12); margin: 10px 0; }
        .acb-blockquote {
          border-left: 3px solid rgba(59,130,246,0.4);
          padding-left: 12px;
          color: rgba(147,197,253,0.7);
          font-style: italic;
          margin: 8px 0;
        }
        .acb-table-wrap { overflow-x: auto; margin: 8px 0; }
        .acb-table { border-collapse: collapse; font-size: 12px; width: 100%; }
        .acb-th {
          background: rgba(29,78,216,0.2);
          color: #93c5fd;
          font-weight: 600;
          padding: 6px 12px;
          border: 1px solid rgba(59,130,246,0.15);
          text-align: left;
          white-space: nowrap;
        }
        .acb-td {
          color: #cbd5e1;
          padding: 5px 12px;
          border: 1px solid rgba(59,130,246,0.08);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
        }

        /* User bubble prose overrides */
        .acb-prose-user .acb-p,
        .acb-prose-user .acb-li { color: #e0e7ff; }
        .acb-prose-user .acb-h1,
        .acb-prose-user .acb-h2,
        .acb-prose-user .acb-h3 { color: #c7d2fe; }
        .acb-prose-user .acb-strong { color: #a5b4fc; }

        /* ── Typing indicator ─────────────────────────────── */
        .acb-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #3b82f6;
          opacity: 0.7;
          animation: acb-bounce 1s ease-in-out infinite;
        }

        /* ── Input footer ─────────────────────────────────── */
        .acb-footer {
          position: relative; z-index: 10;
          padding: 12px 16px 14px;
          background: rgba(9,17,30,0.85);
          border-top: 1px solid rgba(59,130,246,0.08);
          flex-shrink: 0;
        }

        .acb-input-row {
          display: flex; gap: 10px; align-items: flex-end;
        }

        .acb-textarea {
          flex: 1;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 13.5px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(59,130,246,0.18);
          border-radius: 14px;
          color: #e0effe;
          padding: 11px 16px;
          resize: none;
          min-height: 44px;
          max-height: 140px;
          caret-color: #3b82f6;
          transition: border-color 0.2s, box-shadow 0.2s;
          line-height: 1.5;
        }
        .acb-textarea::placeholder { color: rgba(96,165,250,0.28); }
        .acb-textarea:focus {
          outline: none;
          border-color: rgba(59,130,246,0.45);
          box-shadow: 0 0 0 3px rgba(59,130,246,0.08);
        }
        .acb-textarea:disabled { opacity: 0.5; }

        .acb-send {
          width: 44px; height: 44px;
          border-radius: 13px;
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          box-shadow: 0 4px 16px rgba(37,99,235,0.35);
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .acb-send:hover:not(:disabled) {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          box-shadow: 0 6px 20px rgba(59,130,246,0.45);
          transform: translateY(-1px);
        }
        .acb-send:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }

        .acb-hint {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          color: rgba(59,130,246,0.25);
          text-align: center;
          margin-top: 8px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        /* ── Animations ───────────────────────────────────── */
        @keyframes acb-pulse {
          0%,100% { opacity:1; box-shadow: 0 0 8px #3b82f6; }
          50% { opacity:0.5; box-shadow: 0 0 14px #3b82f6; }
        }
        @keyframes acb-bounce {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes acb-fade-up {
          from { opacity:0; transform: translateY(10px); }
          to   { opacity:1; transform: translateY(0); }
        }
      `}</style>

      <div className="acb-root">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="acb-header">
          <div className="acb-header-left">
            <div className="acb-avatar">
              <BotIcon />
            </div>
            <div>
              <div className="acb-title">Admin Analytics Assistant</div>
              <div className="acb-subtitle">
                <span className="acb-status-dot" />
                SQL · Tool-Calling · Live DB
              </div>
            </div>
          </div>
          <div className="acb-header-actions">
            <div className="acb-badge">
              <DatabaseIcon />
              Connected
            </div>
            <button className="acb-clear-btn" onClick={clearChat} title="Clear conversation">
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* ── Suggestion chips ────────────────────────────── */}
        <div className="acb-chip-bar">
          <div className="acb-chip-scroll">
            <button
              className={`acb-chip-toggle ${!showChips ? "collapsed" : ""}`}
              onClick={() => setShowChips(v => !v)}
            >
              Quick ask <ChevronIcon />
            </button>
            {showChips && SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                className="acb-chip"
                onClick={() => send(s.query)}
                disabled={loading}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Message list ────────────────────────────────── */}
        <div className="acb-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`acb-row ${msg.sender}`}>
              <div className={`acb-msg-avatar ${msg.sender}`}>
                {msg.sender === "bot" ? <BotIcon /> : <UserIcon />}
              </div>
              <div className={`acb-bubble ${msg.sender}`}>
                <MarkdownMessage text={msg.text} isUser={msg.sender === "user"} />
                <div className="acb-timestamp">{msg.time}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="acb-row">
              <div className="acb-msg-avatar bot"><BotIcon /></div>
              <div className="acb-bubble bot">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input bar ───────────────────────────────────── */}
        <div className="acb-footer">
          <div className="acb-input-row">
            <textarea
              ref={(el) => { inputRef.current = el; textareaRef.current = el; }}
              className="acb-textarea"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your platform data…"
              disabled={loading}
            />
            <button
              className="acb-send"
              onClick={() => send()}
              disabled={loading || !input.trim()}
            >
              <SendIcon />
            </button>
          </div>
          <div className="acb-hint">Enter to send · Shift + Enter for new line</div>
        </div>

      </div>
    </>
  );
}