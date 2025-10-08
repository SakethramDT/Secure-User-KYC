import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useState, useEffect, lazy, Suspense, useCallback } from "react";

// Code-split pages
const Home = lazy(() => import("./pages/Home"));
const KYCFlow = lazy(() => import("./pages/KYCFlow"));
const Login = lazy(() => import("./components/login"));

/* ----------------------------- Error Boundary ----------------------------- */
function ErrorBoundary({ children }) {
  const [error, setError] = useState(null);
  if (error) return <div>Something went wrong. Please reload.</div>;
  return <ErrorCatcher onError={setError}>{children}</ErrorCatcher>;
}
function ErrorCatcher({ children, onError }) {
  try {
    return children;
  } catch (e) {
    onError(e);
    return null;
  }
}

/* ---------------------------- Protected Route ----------------------------- */
function ProtectedRoute({ isAuthed, children }) {
  const location = useLocation();
  if (!isAuthed) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return children;
}

/* --------------------------- Route Persistor (opt) ------------------------- */
function RoutePersistor() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    localStorage.setItem("lastRoute", pathname + search);
  }, [pathname, search]);
  return null;
}

/* ------------------------------ Inner Shell ------------------------------- */
/* This component is INSIDE <BrowserRouter>, so it's safe to use useNavigate */
function AppInner() {
  // ✅ Hydrate auth synchronously so first render is authenticated if previously logged in
  const [loggedInUser, setLoggedInUser] = useState(() => {
    try {
      const raw = localStorage.getItem("loggedInUser");
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem("loggedInUser");
      return null;
    }
  });

  // Keep minimal (non-sensitive) session in storage
  useEffect(() => {
    if (loggedInUser) {
      localStorage.setItem(
        "loggedInUser",
        JSON.stringify({ id: loggedInUser.id })
      );
    } else {
      localStorage.removeItem("loggedInUser");
    }
  }, [loggedInUser]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "loggedInUser") {
        try {
          const next = e.newValue ? JSON.parse(e.newValue) : null;
          setLoggedInUser(next);
        } catch {
          setLoggedInUser(null);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Central logout
  const logout = useCallback(() => {
    // Optionally: await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    setLoggedInUser(null);
  }, []);

  // (Optional) Restore last route on first app load if authenticated
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const booted = sessionStorage.getItem("booted");
    if (!booted) {
      sessionStorage.setItem("booted", "1");
      const tokenLike = loggedInUser?.id; // replace with real token check if needed
      const last = localStorage.getItem("lastRoute");
      const here = location.pathname + location.search;
      if (tokenLike && last && last !== here) {
        navigate(last, { replace: true });
      }
    }
    // run only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <RoutePersistor />
      <Suspense fallback={<div>Loading…</div>}>
        <Routes>
          <Route
            path="/"
            element={<Login setLoggedInUser={setLoggedInUser} />}
          />
          <Route
            path="/home"
            element={
              <ProtectedRoute isAuthed={!!loggedInUser}>
                <Home loggedInUser={loggedInUser} onLogout={logout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kyc"
            element={
              <ProtectedRoute isAuthed={!!loggedInUser}>
                <KYCFlow loggedInUser={loggedInUser} onLogout={logout} />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

/* ---------------------------------- App ----------------------------------- */
/* App only creates the Router; it does NOT call useNavigate itself */
function App() {
  const basename = import.meta?.env?.BASE_URL || process.env.PUBLIC_URL || "/";
  return (
    <BrowserRouter basename={basename}>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
