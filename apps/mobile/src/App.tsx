import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { auth } from "./lib/auth";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CapturePage from "./pages/CapturePage";
import NotePage from "./pages/NotePage";
import LocationPage from "./pages/LocationPage";
import InboxPage from "./pages/InboxPage";
import MfaChallengePage from "./pages/MfaChallengePage";
import SettingsPage from "./pages/SettingsPage";
import SearchPage from "./pages/SearchPage";
import ItemDetailPage from "./pages/ItemDetailPage";
import SpotPage from "./pages/SpotPage";
import TeamPage from "./pages/TeamPage";
import InviteAcceptPage from "./pages/InviteAcceptPage";

function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "in" | "out">("checking");

  useEffect(() => {
    auth.isLoggedIn().then((loggedIn) => setStatus(loggedIn ? "in" : "out"));
  }, []);

  if (status === "checking") return null;
  if (status === "out") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/mfa" element={<MfaChallengePage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route
          path="/"
          element={
            <AuthGate>
              <HomePage />
            </AuthGate>
          }
        />
        <Route
          path="/capture"
          element={
            <AuthGate>
              <CapturePage />
            </AuthGate>
          }
        />
        <Route
          path="/note/new"
          element={
            <AuthGate>
              <NotePage />
            </AuthGate>
          }
        />
        <Route
          path="/inbox"
          element={
            <AuthGate>
              <InboxPage />
            </AuthGate>
          }
        />
        <Route
          path="/search"
          element={
            <AuthGate>
              <SearchPage />
            </AuthGate>
          }
        />
        <Route
          path="/items/:itemId"
          element={
            <AuthGate>
              <ItemDetailPage />
            </AuthGate>
          }
        />
        <Route
          path="/spots/:spotId"
          element={
            <AuthGate>
              <SpotPage />
            </AuthGate>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGate>
              <SettingsPage />
            </AuthGate>
          }
        />
        <Route
          path="/team"
          element={
            <AuthGate>
              <TeamPage />
            </AuthGate>
          }
        />
        <Route
          path="/locations/:locationId"
          element={
            <AuthGate>
              <LocationPage />
            </AuthGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
