import { createRoot } from "react-dom/client";
import "./index.css";
import "./themes.css";
import { applyTheme, loadTheme } from "./themes";
import App from "./App.jsx";

// Apply the saved theme before the first render so the app never flashes
// the default palette.
applyTheme(loadTheme());

createRoot(document.getElementById("root")).render(
  <App />
);
