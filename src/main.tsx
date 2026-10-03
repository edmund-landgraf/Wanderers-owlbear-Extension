import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Background from "./background";
import DiceOverlay from "./dice/DiceOverlay";
import "./styles.css";

const path = window.location.pathname;
const page = path.startsWith("/background")
  ? <Background />
  : path.startsWith("/dice-overlay")
    ? <DiceOverlay />
    : <App />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>
);
