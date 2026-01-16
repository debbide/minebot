import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force "Obsidian" Dark Mode
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
