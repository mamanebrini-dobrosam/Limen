import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { getSocket } from "../socket";
import { Shell, useAuth } from "../shell";

type Peer = { id: string; displayName: string };
type ChatMessage = { id: number; conversationId: string; senderId: string; body: string; createdAt: string };
type Conversation = {
  id: string; peer: Peer;
  lastMessage: null | { id: number; body: string; senderId: string; createdAt: string };
  lastMessageAt: string | null; createdAt: string; unreadCount: number;
};
type Request = {
  id: string; ownerId: string; requesterId: string; peer: Peer;
  status: "pending" | "approved" | "rejected"; direction: "incoming" | "outgoing";
  createdAt: string; decidedAt: string | null; retryAt: string | null;
};
type DirectEvent = { conversationId?: string };

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("bs-BA", { dateStyle: "medium", timeStyle: "short" }) : "Bez poruka";
}

function errorText(error: unknown) {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return "Ovaj razgovor više nije dostupan.";
  return error instanceof Error ? error.message : "Nešto nije u redu. Pokušaj ponovo.";
}

export function DirectChats() {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const expiredIds = useRef(new Set<string>());
  const load = useCallback(async () => {
    try {
      const result = await api.get<{ conversations: Conversation[] }>("/direct/conversations");
      setItems(result.conversations.filter((chat) => !expiredIds.current.has(chat.id)));
      setError("");
    } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => {
    load();
    const socket = getSocket();
    const reload = () => load();
    const expired = (event: { conversationId: string }) => {
      expiredIds.current.add(event.conversationId);
      setItems((current) => current?.filter((chat) => chat.id !== event.conversationId) ?? current);
      load();
    };
    socket.on("direct:changed", reload);
    socket.on("direct:expired", expired);
    socket.on("connect", reload);
    return () => { socket.off("direct:changed", reload); socket.off("direct:expired", expired); socket.off("connect", reload); };
  }, [load]);
  return <Shell>
    <h1>Razgovori</h1>
    <p className="lead">Privatni razgovori ostaju između vas dvoje. Razgovori se brišu nakon 30 dana bez nove poruke.</p>
    <div className="row" style={{ marginBottom: 16 }}>
      <Link className="btn warm" to="/chat/zahtjevi">Zahtjevi za razgovor</Link>
    </div>
    {error && <div className="notice error" role="alert">{error} <button className="btn small ghost" onClick={load}>Pokušaj ponovo</button></div>}
    {!items ? <div className="empty" aria-label="Učitavanje razgovora">Učitavanje razgovora…</div> : items.length === 0
      ? <div className="notice"><strong>Ovdje će biti tvoji razgovori.</strong><p className="meta">Samo osobe kojima odobriš zahtjev mogu ti pisati. Skeniraj QR kod osobe da pošalješ zahtjev.</p><Link to="/kontakti">Otvori kontakte</Link></div>
      : <ul className="list">{items.map((chat) => <li key={chat.id} className="direct-row" onClick={() => navigate(`/chat/${chat.id}`)} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/chat/${chat.id}`); }}>
        <div className="direct-avatar" aria-hidden="true">{chat.peer.displayName.trim().charAt(0).toLocaleUpperCase("bs-BA")}</div>
        <div className="direct-summary">
          <div className="direct-name">{chat.peer.displayName}</div>
          <div className="meta direct-preview">{chat.lastMessage?.body ?? "Započnite razgovor"}</div>
        </div>
        <div className="direct-trailing"><span className="meta">{formatDate(chat.lastMessageAt)}</span>{chat.unreadCount > 0 && <span className="badge">{chat.unreadCount}</span>}</div>
      </li>)}</ul>}
  </Shell>;
}

export function DirectRequests() {
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    try { setRequests((await api.get<{ requests: Request[] }>("/direct/requests")).requests); setError(""); }
    catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => {
    load();
    const socket = getSocket();
    const reload = () => load();
    socket.on("direct:changed", reload); socket.on("notification", reload); socket.on("connect", reload);
    return () => { socket.off("direct:changed", reload); socket.off("notification", reload); socket.off("connect", reload); };
  }, [load]);
  const decide = async (request: Request, action: "approve" | "reject") => {
    if (busy) return;
    setBusy(request.id); setError("");
    try {
      const result = await api.post<{ conversationId: string | null }>(`/direct/requests/${request.id}/${action}`);
      await load();
      if (action === "approve" && result.conversationId) navigate(`/chat/${result.conversationId}`);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(null); }
  };
  return <Shell>
    <p><Link to="/chat">← Razgovori</Link></p>
    <h1>Zahtjevi za razgovor</h1>
    <p className="lead">Ti odlučuješ ko može započeti privatni razgovor s tobom.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!requests ? <p className="empty">Učitavanje zahtjeva…</p> : requests.length === 0
      ? <p className="empty">Trenutno nema zahtjeva za razgovor.</p>
      : <ul className="list">{requests.map((request) => <li key={request.id}>
        <div><div>{request.peer.displayName}</div><div className="meta">{request.direction === "incoming" ? "Dolazni zahtjev" : "Poslan zahtjev"} · {formatDate(request.createdAt)}</div>
          {request.status === "rejected" && request.retryAt && request.direction === "outgoing" && <div className="meta">Novi zahtjev možeš poslati nakon {formatDate(request.retryAt)}.</div>}
          {request.status === "rejected" && <div className="meta">{request.direction === "incoming" ? "Zahtjev nije odobren." : "Zahtjev nije prihvaćen."}</div>}
          {request.status === "approved" && <div className="meta">Razgovor je odobren.</div>}
        </div>
        {request.status === "pending" && request.direction === "incoming" && <div className="row">
          <button className="btn small" disabled={busy !== null} onClick={() => decide(request, "approve")}>{busy === request.id ? "Obrada…" : "Odobri"}</button>
          <button className="btn small ghost" disabled={busy !== null} onClick={() => decide(request, "reject")}>Odbij</button>
        </div>}
        {request.status === "approved" && <Link className="btn small ghost" to="/chat">Razgovori</Link>}
      </li>)}</ul>}
  </Shell>;
}

export function DirectConversation() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const routeIdentity = useRef({ id, version: 0 });
  if (routeIdentity.current.id !== id) routeIdentity.current = { id, version: routeIdentity.current.version + 1 };
  const [conversation, setConversation] = useState<{ id: string; peer: Peer; createdAt: string; lastMessageAt: string | null } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const latestSequence = useRef(0);
  const expiredId = useRef<string | null>(null);
  const hasMoreRef = useRef(false);
  const historyCursor = useRef<number | null>(null);
  const readThrough = useRef<number | null>(null);
  const [readCandidate, setReadCandidate] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const loadLatest = useCallback(async (scroll = false) => {
    if (expiredId.current === id) return;
    const routeVersion = routeIdentity.current.version;
    const seq = ++latestSequence.current;
    try {
      const result = await api.get<{ conversation: NonNullable<typeof conversation>; messages: ChatMessage[]; hasMore: boolean }>(`/direct/conversations/${encodeURIComponent(id)}/messages`);
      if (routeIdentity.current.id !== id || routeIdentity.current.version !== routeVersion || latestSequence.current !== seq) return;
      setConversation(result.conversation);
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        result.messages.forEach((message) => byId.set(message.id, message));
        return [...byId.values()].sort((a, b) => a.id - b.id);
      });
      if (historyCursor.current === null) {
        historyCursor.current = result.messages[0]?.id ?? null;
        hasMoreRef.current = result.hasMore;
      }
      setHasMore(hasMoreRef.current);
      setError("");
      setUnavailable(false);
      setLoading(false);
      const incoming = result.messages.filter((m) => m.senderId !== user?.id);
      setReadCandidate(incoming.length ? Math.max(...incoming.map((m) => m.id)) : null);
      if (scroll) requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
    } catch (e) {
      if (routeIdentity.current.id !== id || routeIdentity.current.version !== routeVersion || latestSequence.current !== seq) return;
      setError(errorText(e)); setLoading(false);
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
        expiredId.current = id;
        setUnavailable(true);
        setConversation(null); setMessages([]); setHasMore(false); hasMoreRef.current = false;
        historyCursor.current = null; setReadCandidate(null);
      }
    }
  }, [id, user?.id]);
  useEffect(() => {
    latestSequence.current++;
    const alreadyExpired = expiredId.current === id;
    if (!alreadyExpired) expiredId.current = null;
    setLoading(!alreadyExpired); setOlderLoading(false); setBusy(false); setConversation(null); setMessages([]); setHasMore(false);
    hasMoreRef.current = false; historyCursor.current = null;
    setDraft(""); draftRef.current = ""; setError(alreadyExpired ? "Ovaj razgovor više nije dostupan. Možda je istekao ili je pristup promijenjen." : "");
    setUnavailable(alreadyExpired); readThrough.current = null; setReadCandidate(null);
    if (!alreadyExpired) loadLatest(true);
    const socket = getSocket();
    const changed = (event?: DirectEvent) => { if (!event?.conversationId || event.conversationId === id) loadLatest(); };
    const expired = (event: { conversationId: string }) => {
      if (event.conversationId !== id || routeIdentity.current.id !== id) return;
      latestSequence.current++;
      expiredId.current = id;
      setError("Ovaj razgovor više nije dostupan. Možda je istekao ili je pristup promijenjen.");
      setUnavailable(true); setLoading(false); setConversation(null); setMessages([]); setHasMore(false);
      hasMoreRef.current = false; historyCursor.current = null; setReadCandidate(null);
    };
    socket.on("direct:changed", changed); socket.on("direct:expired", expired); socket.on("connect", changed);
    return () => { latestSequence.current++; socket.off("direct:changed", changed); socket.off("direct:expired", expired); socket.off("connect", changed); };
  }, [id, loadLatest]);

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest || olderLoading || !hasMore) return;
    const routeVersion = routeIdentity.current.version;
    setOlderLoading(true);
    try {
      const result = await api.get<{ conversation: NonNullable<typeof conversation>; messages: ChatMessage[]; hasMore: boolean }>(`/direct/conversations/${encodeURIComponent(id)}/messages?before=${oldest.id}`);
      if (routeIdentity.current.id !== id || routeIdentity.current.version !== routeVersion || expiredId.current === id) return;
      setMessages((current) => {
        const ids = new Set(current.map((m) => m.id));
        return [...result.messages.filter((m) => !ids.has(m.id)), ...current];
      });
      if (result.messages.length) historyCursor.current = Math.min(historyCursor.current ?? oldest.id, result.messages[0].id);
      hasMoreRef.current = result.hasMore;
      setHasMore(result.hasMore); setError("");
    } catch (e) {
      if (routeIdentity.current.id === id && routeIdentity.current.version === routeVersion && expiredId.current !== id) {
        setError(errorText(e));
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          expiredId.current = id; setUnavailable(true); setConversation(null); setMessages([]); setHasMore(false);
          hasMoreRef.current = false; historyCursor.current = null; setReadCandidate(null);
        }
      }
    } finally {
      if (routeIdentity.current.id === id && routeIdentity.current.version === routeVersion) setOlderLoading(false);
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || body.length > 4000 || busy) return;
    const routeVersion = routeIdentity.current.version;
    setBusy(true); setError("");
    try {
      const result = await api.post<{ message: ChatMessage }>(`/direct/conversations/${encodeURIComponent(id)}/messages`, { body });
      if (routeIdentity.current.id !== id || routeIdentity.current.version !== routeVersion || expiredId.current === id) return;
      setMessages((current) => current.some((m) => m.id === result.message.id) ? current : [...current, result.message]);
      if (draftRef.current.trim() === body) { draftRef.current = ""; setDraft(""); }
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
    } catch (e2) {
      if (routeIdentity.current.id === id && routeIdentity.current.version === routeVersion && expiredId.current !== id) {
        setError(errorText(e2));
        if (e2 instanceof ApiError && (e2.status === 403 || e2.status === 404)) {
          expiredId.current = id; setUnavailable(true); setConversation(null); setMessages([]); setHasMore(false);
          hasMoreRef.current = false; historyCursor.current = null; setReadCandidate(null);
        }
      }
    } finally {
      if (routeIdentity.current.id === id && routeIdentity.current.version === routeVersion) setBusy(false);
    }
  };
  useEffect(() => {
    if (!conversation || readCandidate === null || document.visibilityState !== "visible" || readThrough.current === readCandidate || routeIdentity.current.id !== id) return;
    readThrough.current = readCandidate;
    api.post(`/direct/conversations/${encodeURIComponent(id)}/read`, { messageId: readCandidate })
      .catch((e) => {
        if (readThrough.current === readCandidate) readThrough.current = null;
        if (routeIdentity.current.id === id && e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          expiredId.current = id; setError(errorText(e)); setUnavailable(true); setLoading(false);
          setConversation(null); setMessages([]); setHasMore(false); hasMoreRef.current = false; historyCursor.current = null; setReadCandidate(null);
        }
      });
  }, [conversation, id, readCandidate]);
  useEffect(() => {
    const checkVisibility = () => {
      if (document.visibilityState !== "visible" || !conversation || readCandidate === null || readThrough.current === readCandidate || routeIdentity.current.id !== id) return;
      readThrough.current = readCandidate;
      api.post(`/direct/conversations/${encodeURIComponent(id)}/read`, { messageId: readCandidate })
        .catch((e) => {
          if (readThrough.current === readCandidate) readThrough.current = null;
          if (routeIdentity.current.id === id && e instanceof ApiError && (e.status === 403 || e.status === 404)) {
            expiredId.current = id; setError(errorText(e)); setUnavailable(true); setLoading(false);
            setConversation(null); setMessages([]); setHasMore(false); hasMoreRef.current = false; historyCursor.current = null; setReadCandidate(null);
          }
        });
    };
    document.addEventListener("visibilitychange", checkVisibility);
    return () => document.removeEventListener("visibilitychange", checkVisibility);
  }, [conversation, id, readCandidate]);

  return <Shell>
    <p><Link to="/chat">← Svi razgovori</Link></p>
    <h1>{conversation?.peer.displayName ?? "Privatni razgovor"}</h1>
    <p className="lead">Poruke su vidljive samo vama dvoma. Razgovor se briše nakon 30 dana bez nove poruke.</p>
    {error && <p className="notice error" role="alert">{error} {!unavailable && <button className="btn small ghost" onClick={() => loadLatest()}>Pokušaj ponovo</button>}</p>}
    <section className="direct-thread" aria-label="Poruke">
      {loading ? <div className="empty">Učitavanje razgovora…</div> : <>
        {hasMore && <button className="btn small ghost" disabled={olderLoading} onClick={loadOlder}>{olderLoading ? "Učitavanje…" : "Učitaj starije poruke"}</button>}
        {messages.length === 0 ? <p className="empty">Ovdje možete započeti razgovor.</p> : messages.map((message) => <article className={`direct-message${message.senderId === user?.id ? " mine" : ""}`} key={message.id}>
          <div className="meta">{message.senderId === user?.id ? "Ti" : conversation?.peer.displayName} · {formatDate(message.createdAt)}</div>
          <p>{message.body}</p>
        </article>)}
        <div ref={bottom} />
      </>}
    </section>
    <form className="direct-compose" onSubmit={send}>
      <label className="sr-only" htmlFor="direct-message">Poruka</label>
      <textarea id="direct-message" className="textarea" maxLength={4000} rows={2} value={draft} onChange={(e) => { draftRef.current = e.target.value; setDraft(e.target.value); }} placeholder="Napiši poruku…" disabled={loading || !!error || busy} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="meta">{draft.length}/4000</span>
        <button className="btn" disabled={loading || !!error || busy || !draft.trim() || draft.trim().length > 4000}>{busy ? "Šaljem…" : "Pošalji"}</button>
      </div>
    </form>
  </Shell>;
}
