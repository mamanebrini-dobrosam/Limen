import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./shell";
import { Login, Register, Forgot, Reset, Verify } from "./pages/Auth";
import { Home } from "./pages/Home";
import { Contacts } from "./pages/Contacts";
import { RoomView } from "./pages/Room";
import { RoomEditor } from "./pages/RoomEditor";
import { Settings } from "./pages/Settings";
import { Admin } from "./pages/Admin";
import { DirectChats, DirectConversation, DirectRequests } from "./pages/DirectChat";
import { GuestQr, GuestConversation, GuestConversations, OwnerGuestConversation } from "./pages/Visitor";
import { Scanner } from "./pages/Scanner";
import { RecoverGuest } from "./pages/GuestRecovery";
import { PaletteReview } from "./pages/PaletteReview";
import "./styles.css";
import "./visual/salon.css";
import { applyVisualSettings } from "./visual/applyVisualSettings";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to={`/prijava?dalje=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!user.emailVerified) return <Navigate to="/potvrda" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/prijava" element={<Login />} />
          <Route path="/registracija" element={<Register />} />
          <Route path="/zaboravljena-lozinka" element={<Forgot />} />
          <Route path="/nova-lozinka" element={<Reset />} />
          <Route path="/potvrda" element={<Verify />} />
          <Route path="/skeniraj" element={<Scanner />} />
          <Route path="/paleta" element={<PaletteReview />} />
          <Route path="/gost-razgovori" element={<GuestConversations />} />
          <Route path="/gost-oporavak" element={<RecoverGuest />} />
          <Route path="/gost/:id" element={<GuestConversation />} />
          <Route path="/c/:qrId" element={<GuestQr />} />
          <Route path="/" element={<Protected><Home /></Protected>} />
          <Route path="/kontakti" element={<Protected><Contacts /></Protected>} />
          <Route path="/gost-chat/:id" element={<Protected><OwnerGuestConversation /></Protected>} />
          <Route path="/chat" element={<Protected><DirectChats /></Protected>} />
          <Route path="/chat/zahtjevi" element={<Protected><DirectRequests /></Protected>} />
          <Route path="/chat/:id" element={<Protected><DirectConversation /></Protected>} />
          <Route path="/moja-soba" element={<Protected><RoomEditor /></Protected>} />
          <Route path="/sto/:sessionId" element={<Protected><RoomView /></Protected>} />
          <Route path="/postavke" element={<Protected><Settings /></Protected>} />
          <Route path="/admin" element={<Protected><Admin /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

applyVisualSettings();
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
