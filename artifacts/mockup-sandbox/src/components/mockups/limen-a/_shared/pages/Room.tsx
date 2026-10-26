import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "../routing";
import { api, type Message, type RoomSection, type SessionState, type Seat } from "../api";
import { getSocket } from "../socket";
import { useAuth } from "../shell";
import { createRoomPaletteStyle } from "../visual/tokens";
import { ROOM_PALETTES, paletteBackground } from "../../shared/room-palettes";

type Role = "host" | "guest";
type Invitation = { id: string; userId: string; displayName: string; status: string };
type EntryRequest = { id: string; userId: string; displayName: string };
type Contact = { userId: string; displayName: string };

// Šest mjesta oko stola: domaćin na čelu, gosti u smjeru kazaljke.
const POS: [number, number][] = [[50, 6], [90, 28], [90, 72], [50, 94], [10, 72], [10, 28]];

const CLOSED_TEXT: Record<string, string> = {
  host_closed: "Domaćin je zatvorio sobu.",
  host_exit: "Domaćin je završio druženje.",
  host_timeout: "Domaćin se nije vratio. Druženje je završeno.",
  account_deleted: "Druženje je završeno.",
};
const LEFT_TEXT: Record<string, string> = {
  left: "Napustio/la si sto.",
  removed: "Domaćin te uklonio sa stola.",
  disconnect: "Veza je bila prekinuta duže od 30 sekundi, pa je tvoje mjesto oslobođeno. Možeš ponovo zatražiti ulazak preko poziva.",
  blocked: "Više ne sjediš za ovim stolom.",
};

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>{title}</h2><button className="btn small ghost" onClick={onClose}>Zatvori</button></div>
        <div className="sheet-body">{children}</div>
        {footer}
      </div>
    </div>
  );
}

export function RoomView() {
  const { sessionId = "" } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [state, setState] = useState<SessionState | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sections, setSections] = useState<RoomSection[]>([]);
  const [theme, setTheme] = useState("orah");
  const [ended, setEnded] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [sheet, setSheet] = useState<null | "chat" | "invite" | { section: RoomSection } | { seat: Seat }>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<EntryRequest[]>([]);
  const convRef = useRef<string | null>(null);

  const me = user!.id;
  const mySeat = state?.seats.find((s) => s.userId === me);
  const muted = role === "guest" && !!mySeat?.muted;
  const hostAway = !!state?.hostAway;

  const loadMessages = useCallback(async (conv: string) => {
    const r = await api.get<{ messages: Message[] }>(`/conversations/${conv}/messages`);
    setMessages(r.messages);
  }, []);

  const loadRequests = useCallback(async () => {
    const r = await api.get<{ entryRequests: EntryRequest[] }>(`/sessions/${sessionId}/invitations`);
    setRequests(r.entryRequests);
  }, [sessionId]);

  // Ulazak u sto preko websocketa (server provjerava pravo).
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit("session:join", { sessionId }, (r: { ok: boolean; role?: Role; state?: SessionState }) => {
      if (!r.ok || !r.state || !r.role) { setDenied(true); return; }
      setRole(r.role); setState(r.state);
      if (convRef.current !== r.state.conversationId) { convRef.current = r.state.conversationId; }
      loadMessages(r.state.conversationId).catch(() => {});
      api.get<{ sections: RoomSection[]; theme: string }>(`/sessions/${sessionId}/room`).then((x) => { setSections(x.sections); setTheme(x.theme); }).catch(() => {});
      if (r.role === "host") loadRequests().catch(() => {});
    });
    if (s.connected) join();
    s.on("connect", join);
    const onState = (st: SessionState) => { if (st.id === sessionId) setState(st); };
    const onMsg = (m: Message) => { if (m.sessionId === sessionId) setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]); };
    const onClosed = (x: { sessionId: string; reason: string }) => { if (x.sessionId === sessionId) setEnded(CLOSED_TEXT[x.reason] ?? "Druženje je završeno."); };
    const onLeft = (x: { sessionId: string; reason: string }) => { if (x.sessionId === sessionId) setEnded(LEFT_TEXT[x.reason] ?? "Više ne sjediš za ovim stolom."); };
    const onNote = (n: { type: string }) => { if (n.type === "entry_request") loadRequests().catch(() => {}); };
    s.on("session:state", onState); s.on("message", onMsg); s.on("session:closed", onClosed); s.on("session:left", onLeft); s.on("notification", onNote);
    return () => {
      s.off("connect", join); s.off("session:state", onState); s.off("message", onMsg);
      s.off("session:closed", onClosed); s.off("session:left", onLeft); s.off("notification", onNote);
    };
  }, [sessionId, loadMessages, loadRequests]);

  const seatsByPos = useMemo(() => {
    const arr: (Seat | null)[] = [null, null, null, null, null];
    for (const s of state?.seats ?? []) arr[s.seatNo - 1] = s;
    return arr;
  }, [state]);

  if (denied) {
    return (
      <div className="room" data-theme="orah" style={{ placeItems: "center", display: "grid", textAlign: "center", padding: 24 }}>
        <div>
          <p style={{ fontSize: 18 }}>Ovaj sto ti nije otvoren.</p>
          <p style={{ opacity: 0.8 }}>U sobu se ulazi samo na poziv domaćina i uz njegovo odobrenje.</p>
          <Link className="btn" style={{ background: "var(--krem)", color: "var(--noc)" }} to="/">Na početnu</Link>
        </div>
      </div>
    );
  }
  if (ended) {
    return (
      <div className="room" data-theme={theme} style={{ ...createRoomPaletteStyle(theme), display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
        <div>
          <p style={{ fontSize: 19, maxWidth: "30ch", margin: "0 auto 20px" }}>{ended}</p>
          <button className="btn" style={{ background: "var(--krem)", color: "var(--noc)" }} onClick={() => nav("/")}>Na početnu</button>
        </div>
      </div>
    );
  }
  if (!state || !role) return <div className="room" />;

  const last = messages.slice(-4);
  const act = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError((e as Error).message); } };

  return (
    <div className="room" data-theme={theme} style={createRoomPaletteStyle(theme)}>
      <header className="room-top">
        <div className="title">
          <img className="room-logo" src="/__mockup/images/limen/slonovaca.png" alt="limen" />
          <span className="room-heading-label">
            <span>{role === "host" ? "Tvoja soba" : `Soba: ${state.host.displayName}`}</span>
            <small>{state.seats.length} od 5 gostiju za stolom</small>
          </span>
        </div>
        {role === "host"
          ? <button className="btn small ghost" onClick={() => setConfirmExit(true)}>Izađi</button>
          : <button className="btn small ghost" onClick={() => act(() => api.post(`/sessions/${sessionId}/leave`))}>Napusti sto</button>}
      </header>

      <main className="room-main">
        <nav className="walls" aria-label="Zidovi sobe">
          <div className="walls-caption"><span className="eyebrow">Sadržaj sobe</span><span>03</span></div>
          {sections.map((sec) => {
            const img = sec.items.find((i) => i.kind === "image");
            const txt = sec.items.find((i) => i.kind !== "image");
            return (
              <button key={sec.id} className="frame" onClick={() => setSheet({ section: sec })}>
                <b>{sec.title}</b>
                {img?.mediaId ? <img className="thumb" src={`/api/media/${img.mediaId}`} alt="" /> : txt ? <p>{txt.text}</p> : <p style={{ opacity: 0.6 }}>Prazno</p>}
                <span className="frame-open">Otvori sadržaj <span aria-hidden>↗</span></span>
              </button>
            );
          })}
        </nav>

        <div className="table-wrap">
          <div className="table-kicker"><span>ZA STOLOM</span><span>HOST + 5 MJESTA</span></div>
          <div className="table-scene">
            <button className="table" onClick={() => setSheet("chat")} aria-label="Otvori razgovor za stolom">
              <div className="table-chat">
                {last.length === 0 && <div className="hint">Sto je postavljen. Napiši prvu poruku.</div>}
                {last.map((m) => (
                  <div className="line" key={m.id}><b>{m.author.displayName}</b>{m.kind === "image" ? "poslao/la je fotografiju" : m.body}</div>
                ))}
                {last.length > 0 && <div className="hint">Dodirni sto za cijeli razgovor</div>}
              </div>
            </button>
            <SeatView pos={POS[0]} label={state.host.displayName} sub="domaćin" cls="taken host" />
            {seatsByPos.map((s, i) => s ? (
              <SeatView key={i} pos={POS[i + 1]} name={s.displayName} label={s.userId === me ? "Ti" : s.displayName}
                sub={s.muted ? "utišan/a" : s.present ? "za stolom" : "odsutan/na"}
                cls={`taken ${s.present ? "" : "absent"}`}
                onClick={s.userId !== me ? () => setSheet({ seat: s }) : undefined} />
            ) : (
              <SeatView key={i} pos={POS[i + 1]} label="Slobodno" cls="" onClick={role === "host" ? () => setSheet("invite") : undefined} />
            ))}
          </div>
          <p className="table-caption">Poruke i mjesta pripadaju ovom razgovoru.</p>
        </div>
      </main>

      {error && <p className="room-note" role="alert">{error}</p>}
      {muted && <p className="room-note">Domaćin te utišao. Možeš čitati, ali ne i pisati.</p>}

      {role === "host" && (
        <div className="host-bar">
          <button className="btn small light" onClick={() => setSheet("invite")}>Pozovi goste</button>
          {requests.length > 0 && <button className="btn small light" onClick={() => setSheet("invite")}>Zahtjevi za ulazak ({requests.length})</button>}
          <Link className="btn small ghost" to="/__mockup/preview/limen-a/Room">Uredi sobu</Link>
          <button className="btn small ghost" onClick={() => setShowAppearance(true)}>Izgled sobe · prototip</button>
        </div>
      )}

      <Composer sessionId={sessionId} disabled={muted || (role === "guest" && hostAway)} onError={setError} />

      {sheet === "chat" && (
        <Sheet title="Razgovor za stolom" onClose={() => setSheet(null)}
          footer={<Composer sessionId={sessionId} disabled={muted || (role === "guest" && hostAway)} onError={setError} light />}>
          <ChatList messages={messages} me={me} sessionId={sessionId} />
        </Sheet>
      )}
      {sheet === "invite" && role === "host" && (
        <Sheet title="Pozovi goste" onClose={() => setSheet(null)}>
          <InvitePanel sessionId={sessionId} requests={requests} reloadRequests={loadRequests} />
        </Sheet>
      )}
      {sheet && typeof sheet === "object" && "section" in sheet && (
        <Sheet title={sheet.section.title} onClose={() => setSheet(null)}>
          {sheet.section.items.length === 0 ? <p className="empty">{role === "host" ? "Gosti ovdje još ništa ne vide. Dodaj sadržaj i označi ga kao vidljiv gostima." : "Domaćin ovdje još ništa nije podijelio."}</p> : (
            <div className="stack">
              {sheet.section.items.map((i) => i.kind === "image" && i.mediaId
                ? <figure key={i.id} style={{ margin: 0 }}><img className="display-img" src={`/api/media/${i.mediaId}`} alt={i.text ?? ""} />{i.text && <figcaption className="meta">{i.text}</figcaption>}</figure>
                : <p key={i.id} style={i.kind === "quote" ? { fontStyle: "italic", fontSize: 18 } : undefined}>{i.kind === "quote" ? `„${i.text}“` : i.text}</p>)}
            </div>
          )}
          {role === "host" && <p className="meta" style={{ marginTop: 16, color: "var(--tekst-blag)" }}>Ovo je pogled koji vide svi gosti. Privatni sadržaj ostaje skriven.</p>}
        </Sheet>
      )}
      {sheet && typeof sheet === "object" && "seat" in sheet && (
        <Sheet title={sheet.seat.displayName} onClose={() => setSheet(null)}>
          <div className="stack">
            {role === "host" && (
              <>
                <button className="btn block" onClick={() => act(async () => { await api.post(`/sessions/${sessionId}/mute`, { userId: sheet.seat.userId, muted: !sheet.seat.muted }); setSheet(null); })}>
                  {sheet.seat.muted ? "Ukini utišavanje" : "Utišaj (može čitati, ne i pisati)"}
                </button>
                <button className="btn ghost block" onClick={() => act(async () => { await api.post(`/sessions/${sessionId}/remove`, { userId: sheet.seat.userId }); setSheet(null); })}>Ukloni sa stola</button>
              </>
            )}
            <ReportBlock userId={sheet.seat.userId} name={sheet.seat.displayName} sessionId={sessionId} onDone={() => setSheet(null)} />
          </div>
        </Sheet>
      )}

      {showAppearance && role === "host" && (
        <div className="dialog appearance-dialog" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
          <div className="dialog-box appearance-box">
            <div className="appearance-heading">
              <div>
                <p className="eyebrow">Samo lokalni pregled</p>
                <h2 id="appearance-title">Boja ambijenta</h2>
                <p>Izbor mijenja samo ovu vizuelnu probu. Nije sačuvan u postavkama.</p>
              </div>
              <img className="appearance-logo" src="/__mockup/images/limen/slonovaca.png" alt="limen" />
            </div>
            <div className="appearance-grid">
              {ROOM_PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  className={`appearance-choice ${theme === palette.id ? "selected" : ""}`}
                  onClick={() => setTheme(palette.id)}
                  aria-pressed={theme === palette.id}
                >
                  <span className="appearance-swatch" style={{ background: paletteBackground(palette) }}>
                    <span className={`appearance-swatch-dot ${palette.tone}`} />
                  </span>
                  <span className="appearance-label">{palette.label}</span>
                </button>
              ))}
            </div>
            <div className="appearance-footer">
              <span>12 boja · sto i sadržaj ostaju neutralni</span>
              <button className="btn small" onClick={() => setShowAppearance(false)}>Gotovo</button>
            </div>
          </div>
        </div>
      )}

      {role === "guest" && hostAway && (
        <div className="waiting" role="status" aria-live="polite"><div><div className="lamp" /><p>Čekamo povratak domaćina…</p></div></div>
      )}

      {confirmExit && (
        <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="exit-q">
          <div className="dialog-box">
            <p id="exit-q">Da li zaista želiš napustiti sobu? Time ćeš završiti druženje za sve učesnike.</p>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setConfirmExit(false)}>Odustani</button>
              <button className="btn warm" onClick={() => act(async () => { await api.post(`/sessions/${sessionId}/exit`, { confirm: true }); setConfirmExit(false); })}>Završi druženje</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeatView({ pos, label, sub, cls, onClick, name }: { pos: [number, number]; label: string; sub?: string; cls: string; onClick?: () => void; name?: string }) {
  const initial = label === "Slobodno" ? "+" : (name ?? label).slice(0, 1).toUpperCase();
  return (
    <button className={`seat ${cls} ${onClick ? "clickable" : ""}`} style={{ left: `${pos[0]}%`, top: `${pos[1]}%` }}
      onClick={onClick} disabled={!onClick} aria-label={sub ? `${label}, ${sub}` : label}>
      <span className="chair" aria-hidden>{initial}</span>
      <span className="who">{label}</span>
      {sub && <span className="state">{sub}</span>}
    </button>
  );
}

function Composer({ sessionId, disabled, onError, light }: { sessionId: string; disabled: boolean; onError: (s: string | null) => void; light?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); onError(null);
    try { await api.post(`/sessions/${sessionId}/messages`, { body: text }); setText(""); } catch (err) { onError((err as Error).message); }
    setBusy(false);
  };
  const sendImage = async (f: File) => {
    setBusy(true); onError(null);
    try { await api.upload(`/sessions/${sessionId}/images`, f); } catch (err) { onError((err as Error).message); }
    setBusy(false);
    if (file.current) file.current.value = "";
  };
  return (
    <form className="composer" onSubmit={send} style={light ? { background: "transparent", padding: "10px 0 0" } : undefined}>
      <button type="button" className="icon-btn" disabled={disabled || busy} onClick={() => file.current?.click()} aria-label="Pošalji fotografiju iz galerije" style={light ? { color: "var(--noc)", borderColor: "#cdbba3" } : undefined}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 8" /></svg>
      </button>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && sendImage(e.target.files[0])} />
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={disabled ? "Pisanje trenutno nije moguće" : "Napiši poruku…"} disabled={disabled} maxLength={4000} aria-label="Poruka" />
      <button className="btn warm" disabled={disabled || busy || !text.trim()}>Pošalji</button>
    </form>
  );
}

function ChatList({ messages, me, sessionId }: { messages: Message[]; me: string; sessionId: string }) {
  const end = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  if (messages.length === 0) return <p className="empty">Još nema poruka.</p>;
  return (
    <div className="chat-full">
      {note && <p className="notice ok">{note}</p>}
      {messages.map((m) => {
        const mine = m.author.id === me;
        return (
          <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
            {!mine && <div className="by">{m.author.displayName}</div>}
            {m.kind === "image" && m.mediaId ? <img src={`/api/media/${m.mediaId}`} alt="Fotografija iz razgovora" loading="lazy" /> : <div className="bubble">{m.body}</div>}
            <div className="actions">
              {new Date(m.createdAt).toLocaleTimeString("bs-BA", { hour: "2-digit", minute: "2-digit" })}
              {m.kind === "image" && <button onClick={() => api.post(`/messages/${m.id}/save-to-gallery`).then(() => setNote("Fotografija je spremljena u tvoju privatnu galeriju.")).catch((e) => setNote(e.message))}>Spremi u moju galeriju</button>}
              {!mine && !m.author.deleted && <button onClick={() => { const reason = prompt("Šta želiš prijaviti?"); if (reason && reason.trim().length >= 3) api.post("/reports", { messageId: m.id, sessionId, reason }).then(() => setNote("Prijava je poslana.")).catch((e) => setNote(e.message)); }}>Prijavi</button>}
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

function ReportBlock({ userId, name, sessionId, onDone }: { userId: string; name: string; sessionId: string; onDone: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      {msg && <p className="notice ok">{msg}</p>}
      <button className="btn ghost block" onClick={() => {
        const reason = prompt(`Zašto prijavljuješ osobu ${name}?`);
        if (reason && reason.trim().length >= 3) api.post("/reports", { targetUserId: userId, sessionId, reason }).then(() => setMsg("Prijava je poslana.")).catch((e) => setMsg(e.message));
      }}>Prijavi zloupotrebu</button>
      <button className="btn danger block" onClick={() => {
        if (confirm(`Blokirati osobu ${name}? Od sljedećeg druženja ne možete sjediti za istim stolom.`)) api.post("/blocks", { userId }).then(onDone).catch((e) => setMsg(e.message));
      }}>Blokiraj</button>
    </>
  );
}

function InvitePanel({ sessionId, requests, reloadRequests }: { sessionId: string; requests: EntryRequest[]; reloadRequests: () => Promise<void> }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [c, i] = await Promise.all([
      api.get<{ contacts: Contact[] }>("/contacts"),
      api.get<{ invitations: Invitation[] }>(`/sessions/${sessionId}/invitations`),
    ]);
    setContacts(c.contacts); setInvites(i.invitations);
    await reloadRequests();
  }, [sessionId, reloadRequests]);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const act = (fn: () => Promise<unknown>) => { setError(null); fn().then(load).catch((e) => setError(e.message)); };
  const statusText: Record<string, string> = { pending: "pozvan/a", missed: "propušten poziv", declined: "odbio/la", revoked: "poziv povučen", expired: "isteklo" };

  return (
    <div>
      {error && <p className="notice error">{error}</p>}
      {requests.length > 0 && (
        <>
          <h2 style={{ marginTop: 0 }}>Traže ulazak</h2>
          <ul className="list">
            {requests.map((r) => (
              <li key={r.id}>
                <span>{r.displayName}</span>
                <div className="row">
                  <button className="btn small" onClick={() => act(() => api.post(`/entry-requests/${r.id}/approve`))}>Odobri</button>
                  <button className="btn small ghost" onClick={() => act(() => api.post(`/entry-requests/${r.id}/reject`))}>Odbij</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 style={requests.length ? undefined : { marginTop: 0 }}>Kontakti</h2>
      <p className="lead" style={{ fontSize: 14 }}>Poziv ne zauzima mjesto. Mjesto se zauzima kad odobriš ulazak ili postaviš odsutnog gosta za sto.</p>
      {contacts.length === 0 ? <p className="empty">Nemaš aktivnih kontakata. Dodaj ih preko QR koda.</p> : (
        <ul className="list">
          {contacts.map((c) => {
            const inv = invites.find((i) => i.userId === c.userId);
            const active = inv && ["pending", "missed"].includes(inv.status);
            return (
              <li key={c.userId}>
                <div>
                  <div>{c.displayName}</div>
                  {inv && <div className="meta">{statusText[inv.status] ?? inv.status}</div>}
                </div>
                <div className="row">
                  {!active && <button className="btn small" onClick={() => act(() => api.post(`/sessions/${sessionId}/invitations`, { userId: c.userId }))}>Pozovi</button>}
                  {active && <button className="btn small" onClick={() => act(() => api.post(`/sessions/${sessionId}/place`, { userId: c.userId }))}>Postavi za sto</button>}
                  {active && <button className="btn small ghost" onClick={() => act(() => api.del(`/sessions/${sessionId}/invitations/${c.userId}`))}>Povuci</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
