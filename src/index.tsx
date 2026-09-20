import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { wlaczGlobalneNasluchy } from "./api/errors";

// ⚠️ Przed pierwszym renderem: inaczej błąd, który wywali się w trakcie
// montowania aplikacji, nie zostawi śladu — a to jest dokładnie ten błąd,
// który gasi całą stronę.
wlaczGlobalneNasluchy();

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    {/* Siatka pod całym drzewem. Bez niej wyjątek przy renderowaniu zostawia
        białą stronę — nie do odróżnienia od zepsutego internetu. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
