import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Shell, useAuth } from "../shell";

type Report = { id: string; createdAt: string; reason: string; status: string; hasMessage: boolean };
type Detail = { report: Report; message: { kind: string; body: string | null; mediaId: string | null } | null; people: { id: string; displayName: string; email: string }[] };

export function Admin() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"open" | "reviewed" | "dismissed">("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const load = useCallback(() => api.get<{ reports: Report[] }>(`/admin/reports?status=${status}`).then((r) => setReports(r.reports)).catch(() => {}), [status]);
  useEffect(() => { load(); }, [load]);
  if (!user?.isAdmin) return <Shell><p className="notice error">Nemaš pristup ovoj stranici.</p></Shell>;

  return (
    <Shell wide>
      <h1>Prijave zloupotrebe</h1>
      <p className="lead">Svaki pregled prijave se bilježi. Sadržaj poruke vidiš samo kroz konkretnu prijavu.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        {(["open", "reviewed", "dismissed"] as const).map((s) => (
          <button key={s} className={`btn small ${status === s ? "" : "ghost"}`} onClick={() => { setStatus(s); setDetail(null); }}>
            {{ open: "Otvorene", reviewed: "Pregledane", dismissed: "Odbačene" }[s]}
          </button>
        ))}
      </div>
      {reports.length === 0 ? <p className="empty">Nema prijava u ovoj grupi.</p> : (
        <ul className="list">
          {reports.map((r) => (
            <li key={r.id}>
              <div><div>{r.reason}</div><div className="meta">{new Date(r.createdAt).toLocaleString("bs-BA")}{r.hasMessage ? ", uz poruku" : ""}</div></div>
              <button className="btn small ghost" onClick={() => api.get<Detail>(`/admin/reports/${r.id}`).then(setDetail)}>Otvori</button>
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <section className="notice" style={{ marginTop: 18 }}>
          <p><b>Razlog:</b> {detail.report.reason}</p>
          {detail.people.map((p) => <p key={p.id} className="meta">{p.displayName} ({p.email})</p>)}
          {detail.message && <p><b>Poruka:</b> {detail.message.kind === "image" ? "fotografija" : detail.message.body}</p>}
          <div className="row">
            <button className="btn small" onClick={() => api.post(`/admin/reports/${detail.report.id}/status`, { status: "reviewed" }).then(() => { setDetail(null); load(); })}>Označi kao pregledano</button>
            <button className="btn small ghost" onClick={() => api.post(`/admin/reports/${detail.report.id}/status`, { status: "dismissed" }).then(() => { setDetail(null); load(); })}>Odbaci</button>
          </div>
        </section>
      )}
    </Shell>
  );
}
