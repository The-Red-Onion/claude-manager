import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./layout/Layout.js";
import { Overview } from "./pages/Overview.js";
import { SessionView } from "./pages/SessionView.js";
import { TerminalPage } from "./pages/TerminalPage.js";
import { Containers } from "./pages/Containers.js";
import { Settings } from "./pages/Settings.js";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Overview /> },
      { path: "s/:id", element: <SessionView /> },
      { path: "terminal", element: <TerminalPage /> },
      { path: "containers", element: <Containers /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
