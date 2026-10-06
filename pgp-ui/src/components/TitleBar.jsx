import { useEffect, useState } from "react";
// We try to import normally. If this fails (e.g. in browser), it catches.
import { getCurrentWindow } from '@tauri-apps/api/window'; 
import "./TitleBar.css";

export default function TitleBar() {
  const [appWindow, setAppWindow] = useState(null);

  useEffect(() => {
    // Safely get the window instance once on mount
    try {
      setAppWindow(getCurrentWindow());
    } catch (e) {
      console.log("Running in browser mode (non-Tauri)");
    }
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        Hermes Protocol
      </div>

      <div className="titlebar-controls">
        <button
          className="tb-btn"
          onClick={() => appWindow?.minimize()}
        >
          ─
        </button>
        <button
          className="tb-btn"
          onClick={() => appWindow?.toggleMaximize()}
        >
          ☐
        </button>
        <button
          className="tb-btn close"
          onClick={() => appWindow?.close()}
        >
          ✕
        </button>
      </div>
    </div>
  );
}