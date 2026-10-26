import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import jsQR from "jsqr";
import { Link, useNavigate } from "react-router-dom";
import { cameraErrorMessage, limenQrCode } from "../lib/qr";

export function Scanner() {
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const reader = useRef(new BrowserQRCodeReader(new Map([[DecodeHintType.TRY_HARDER, true]])));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState("");
  const release = useCallback(() => {
    generation.current++;
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
    controls.current?.stop(); controls.current = null;
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const stop = useCallback(() => { release(); setRunning(false); }, [release]);
  const openCode = (value: string) => {
    const code = limenQrCode(value, window.location.origin);
    if (!code) { setError("Unesi ispravan LIMEN QR link ili kod."); return; }
    stop(); navigate(`/c/${encodeURIComponent(code)}`);
  };
  const start = async () => {
    stop(); setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Kamera traži HTTPS i podržan preglednik. Koristi Safari na iPhoneu ili Chrome na Androidu, ili odaberi sliku QR koda.");
      return;
    }
    const current = generation.current;
    setRunning(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (current !== generation.current) { media.getTracks().forEach((t) => t.stop()); return; }
      stream.current = media;
      const scanner = await reader.current.decodeFromStream(media, video.current!, (result) => {
        if (result && current === generation.current) openCode(result.getText());
      });
      // Permission/decode may finish after Stop, navigation or a successful scan.
      if (current !== generation.current) scanner.stop();
      else {
        controls.current = scanner;
        // Independent decoder covers QR patterns the first reader can miss.
        const canvas = document.createElement("canvas");
        const scan = () => {
          if (current !== generation.current) return;
          const v = video.current;
          if (v && v.readyState >= 2 && v.videoWidth) {
            const scale = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(pixels.data, pixels.width, pixels.height);
            if (code) openCode(code.data);
          }
          if (current === generation.current) fallbackTimer.current = setTimeout(scan, 250);
        };
        fallbackTimer.current = setTimeout(scan, 250);
      }
    } catch (e) {
      if (current !== generation.current) return;
      stop(); setError(cameraErrorMessage(e));
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    stop(); setError("");
    const current = generation.current;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve(); image.onerror = () => reject(new Error("image"));
        image.src = url;
      });
      let result;
      try { result = await reader.current.decodeFromImageElement(image); }
      catch {
        // Dense QR screenshots can have a very narrow quiet zone. Retry with
        // a white border and bounded resizing instead of rejecting a valid QR.
        const scale = Math.min(2, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.naturalWidth * scale) + 64;
        canvas.height = Math.round(image.naturalHeight * scale) + 64;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 32, 32, canvas.width - 64, canvas.height - 64);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(pixels.data, pixels.width, pixels.height);
        result = decoded ? { getText: () => decoded.data } : reader.current.decodeFromCanvas(canvas);
      }
      if (current === generation.current) openCode(result.getText());
    } catch {
      if (current === generation.current) setError("Na slici nismo pronašli važeći LIMEN QR kod. Pokušaj sa PNG/JPG slikom ili snimkom ekrana.");
    } finally { URL.revokeObjectURL(url); }
  };
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); release(); };
  }, [release, stop]);
  return <div className="shell"><header className="topbar"><Link to="/" className="wordmark">LIMEN<small>mjesto gdje priče žive</small></Link><Link to="/prijava">Prijava</Link></header>
    <main className="page"><p className="visitor-kicker">ULAZ BEZ PROFILA</p><h1>Skeniraj LIMEN QR kod</h1>
      <p className="lead">Skeniranje samo otvara zahtjev. Vlasnik odlučuje ko može započeti razgovor.</p>
      <section className="scanner-frame"><video ref={video} muted playsInline autoPlay aria-label="Prikaz kamere za skeniranje" />{!running && <div className="scanner-placeholder">Kamera će se pokrenuti tek kada je uključiš.</div>}</section>
      <div className="stack"><button className="btn block" onClick={running ? stop : start}>{running ? "Zaustavi kameru" : "Uključi kameru"}</button>
        <label className="btn ghost block scanner-upload">Odaberi sliku QR koda<input type="file" accept="image/*" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      <form className="visitor-fallback" onSubmit={(e) => { e.preventDefault(); openCode(fallback); }}>
        <label className="field"><span>Zalijepi link ili upiši kod</span><input className="input" value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="LIMEN QR link ili kod" /></label>
        <button className="btn warm block">Nastavi</button>
      </form>
      {error && <div className="notice error" role="alert">{error}<p><a href="/skeniraj" target="_blank" rel="noopener noreferrer">Otvori skener u novoj kartici</a></p></div>}
      <p className="meta visitor-links"><Link to="/gost-razgovori">Nastavi gostujući razgovor</Link><span>·</span><Link to="/prijava">Prijava / registracija</Link></p>
      <p className="notice">Za nastavak koristi isti preglednik ili unaprijed sačuvan tajni ključ za oporavak.</p>
    </main>
  </div>;
}
